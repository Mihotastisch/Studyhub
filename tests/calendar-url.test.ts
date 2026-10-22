import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ClientRequest } from "node:http";
import https, { type RequestOptions } from "node:https";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import {
  CALENDAR_TIMEOUT_MS,
  MAX_CALENDAR_BYTES,
  fetchCalendarUrl,
  isPublicAddress,
  pinnedLookup,
  readCalendarResponse,
  requestCalendar,
  resolveCalendarAddress,
  validateCalendarUrl,
} from "../src/providers/calendar-url";
import {
  calendarUrlHash,
  decryptCalendarUrl,
  encryptCalendarUrl,
} from "../src/lib/calendar-secrets";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ default: { request: vi.fn() } }));
const url = "https://my.uni-bayreuth.de/calendar.ics?token=TEST_ONLY";
const body = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
const publicIp = { address: "8.8.8.8", family: 4 };
const mockedLookup = vi.mocked(
  lookup as (
    hostname: string,
    options: { all: true; verbatim: true },
  ) => Promise<LookupAddress[]>,
);
function response(
  chunks: Buffer[] = [Buffer.from(body)],
  headers: IncomingMessage["headers"] = { "content-type": "text/calendar" },
  statusCode = 200,
) {
  const stream = Readable.from(chunks) as IncomingMessage;
  stream.headers = headers;
  stream.statusCode = statusCode;
  return stream;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("HTTPS-Kalenderabruf und SSRF", () => {
  it("erlaubt ausschließlich exakte HTTPS-Hosts ohne Zugangsdaten oder Sonderports", () => {
    expect(validateCalendarUrl(url).hostname).toBe("my.uni-bayreuth.de");
    for (const input of [
      "http://my.uni-bayreuth.de/feed",
      "webcal://my.uni-bayreuth.de/feed",
      "https://my.uni-bayreuth.de.attacker.test/feed",
      "https://sub.my.uni-bayreuth.de/feed",
      "https://my.uni-bayreuth.de./feed",
      "https://user:password@my.uni-bayreuth.de/feed",
      "https://my.uni-bayreuth.de:8443/feed",
      "https://my.uni-bayreuth.de/feed#fragment",
      "https://127.0.0.1/feed",
      "https://2130706433/feed",
      "https://[::1]/feed",
      "https://my.uni-bayreuth.de\\@127.0.0.1/feed",
      " " + url,
    ])
      expect(() => validateCalendarUrl(input)).toThrow();
    expect(() =>
      validateCalendarUrl("https://127.0.0.1/feed", ["127.0.0.1"]),
    ).toThrow();
  });
  it("liest ausschließlich die serverseitige Host-Allowlist", () => {
    vi.stubEnv("CALENDAR_ALLOWED_HOSTS", "calendar.example.org");
    expect(
      validateCalendarUrl("https://calendar.example.org/feed").hostname,
    ).toBe("calendar.example.org");
    expect(() => validateCalendarUrl(url)).toThrow();
  });
  it("sperrt lokale, private, reservierte und gemappte IP-Adressen", () => {
    for (const ip of [
      "127.0.0.1",
      "0.0.0.0",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:8.8.8.8",
      "64:ff9b::808:808",
      "2001:db8::1",
      "fe80::1%eth0",
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("prüft alle DNS-Antworten und verwirft gemischte öffentliche/private Antworten", async () => {
    mockedLookup.mockResolvedValue([
      publicIp,
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(
      resolveCalendarAddress(new URL(url), new AbortController().signal),
    ).rejects.toThrow();
    mockedLookup.mockResolvedValue([]);
    await expect(
      resolveCalendarAddress(new URL(url), new AbortController().signal),
    ).rejects.toThrow();
    mockedLookup.mockResolvedValue([publicIp]);
    await expect(
      resolveCalendarAddress(new URL(url), new AbortController().signal),
    ).resolves.toEqual(publicIp);
  });
  it("bindet die TLS-Verbindung an die geprüfte IP und behält den ursprünglichen Host", async () => {
    let options: RequestOptions | undefined;
    vi.mocked(https.request).mockImplementation(((
      config: RequestOptions,
      callback: (r: IncomingMessage) => void,
    ) => {
      options = config;
      const request = new EventEmitter() as ClientRequest;
      request.end = (() => {
        queueMicrotask(() => callback(response()));
        return request;
      }) as ClientRequest["end"];
      return request;
    }) as typeof https.request);
    expect(
      await requestCalendar(
        new URL(url),
        publicIp,
        new AbortController().signal,
      ),
    ).toBe(body);
    expect(options).toMatchObject({
      hostname: "my.uni-bayreuth.de",
      servername: "my.uni-bayreuth.de",
      port: 443,
      rejectUnauthorized: true,
      agent: false,
      path: "/calendar.ics?token=TEST_ONLY",
      maxHeaderSize: 16384,
    });
    const callback = vi.fn();
    options!.lookup!("ignored.example", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [publicIp]);
    pinnedLookup(publicIp)("ignored.example", {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, "8.8.8.8", 4);
  });
  it("folgt keinerlei Redirects und akzeptiert keine Fehler- oder Loginseiten", async () => {
    for (const code of [301, 302, 303, 307, 308, 401, 403, 500])
      await expect(
        readCalendarResponse(
          response([], { location: "https://127.0.0.1/secret" }, code),
        ),
      ).rejects.toThrow();
    await expect(
      readCalendarResponse(
        response([Buffer.from("<html>Login</html>")], {
          "content-type": "text/html",
        }),
      ),
    ).rejects.toThrow();
    await expect(
      readCalendarResponse(
        response([Buffer.from("BEGIN:VCALENDAR\nVERSION:2.0")]),
      ),
    ).rejects.toThrow();
  });
  it("begrenzt angekündigte und gestreamte Antwortgrößen sowie Kompression", async () => {
    const declared = response([], {
      "content-length": String(MAX_CALENDAR_BYTES + 1),
    });
    await expect(readCalendarResponse(declared)).rejects.toThrow("2 MB");
    expect(declared.destroyed).toBe(true);
    const streamed = response([
      Buffer.alloc(MAX_CALENDAR_BYTES),
      Buffer.from("x"),
    ]);
    await expect(readCalendarResponse(streamed)).rejects.toThrow("2 MB");
    expect(streamed.destroyed).toBe(true);
    await expect(
      readCalendarResponse(response([], { "content-encoding": "gzip" })),
    ).rejects.toThrow("Komprimierte");
  });
  it("bricht auch einen hängenden DNS-Abruf nach dem Gesamtzeitlimit ab", async () => {
    vi.useFakeTimers();
    const resolve = vi.fn(() => new Promise<typeof publicIp>(() => {})),
      request = vi.fn();
    const fetch = fetchCalendarUrl(url, { resolve, request });
    const assertion = expect(fetch).rejects.toThrow("Zeitlimit");
    await vi.advanceTimersByTimeAsync(CALENDAR_TIMEOUT_MS + 1);
    await assertion;
    expect(request).not.toHaveBeenCalled();
  });
  it("bricht hängende Downloads ab und reicht das Abbruchsignal an den Transport durch", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    const request = vi.fn(
      (_url: URL, _address: typeof publicIp, signal: AbortSignal) => {
        receivedSignal = signal;
        return new Promise<string>(() => {});
      },
    );
    const fetch = fetchCalendarUrl(url, {
      resolve: async () => publicIp,
      request,
    });
    const assertion = expect(fetch).rejects.toThrow("Zeitlimit");
    await vi.advanceTimersByTimeAsync(CALENDAR_TIMEOUT_MS + 1);
    await assertion;
    expect(receivedSignal?.aborted).toBe(true);
  });
  it("gibt URL oder Netzwerkfehlermeldungen nicht nach außen weiter", async () => {
    const request = vi.fn(async () => {
      throw new Error(url);
    });
    await expect(
      fetchCalendarUrl(url, { resolve: async () => publicIp, request }),
    ).rejects.not.toThrow("TEST_ONLY");
    const blocked = vi.fn();
    await expect(
      fetchCalendarUrl("https://evil.test/feed", { resolve: blocked, request }),
    ).rejects.toThrow();
    expect(blocked).not.toHaveBeenCalled();
  });
});
describe("Kalenderlink-Verschlüsselung", () => {
  it("verschlüsselt authentifiziert mit zufälligem Nonce und stabiler HMAC-Kennung", () => {
    vi.stubEnv("CALENDAR_URL_KEY", Buffer.alloc(32, 7).toString("base64"));
    const encrypted = encryptCalendarUrl(url);
    expect(encrypted).not.toContain("TEST_ONLY");
    expect(encryptCalendarUrl(url)).not.toBe(encrypted);
    expect(decryptCalendarUrl(encrypted)).toBe(url);
    expect(calendarUrlHash(url)).toBe(calendarUrlHash(url));
    expect(calendarUrlHash(url + "x")).not.toBe(calendarUrlHash(url));
    expect(() => decryptCalendarUrl(encrypted.slice(0, -4) + "AAAA")).toThrow();
    vi.stubEnv("CALENDAR_URL_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(() => decryptCalendarUrl(encrypted)).toThrow();
  });
  it("verweigert Klartextspeicherung bei fehlendem Schlüssel", () => {
    vi.stubEnv("CALENDAR_URL_KEY", "");
    expect(() => encryptCalendarUrl(url)).toThrow();
  });
});
