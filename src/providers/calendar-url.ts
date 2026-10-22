import https from "node:https";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export const MAX_CALENDAR_BYTES = 2_000_000;
export const CALENDAR_TIMEOUT_MS = 10_000;
export class CalendarFetchError extends Error {
  constructor(
    message = "Kalender konnte nicht sicher abgerufen werden. Link, Freigabe und Netzwerk prüfen.",
  ) {
    super(message);
    this.name = "CalendarFetchError";
  }
}
function allowedHosts() {
  return (process.env.CALENDAR_ALLOWED_HOSTS ?? "my.uni-bayreuth.de")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}
export function validateCalendarUrl(
  input: string,
  hosts = allowedHosts(),
): URL {
  try {
    if (
      input.length > 4096 ||
      input !== input.trim() ||
      /[\s\\\u0000-\u001f\u007f]/.test(input)
    )
      throw new Error();
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.port ||
      isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
      !hosts.includes(url.hostname) ||
      url.hostname.endsWith(".")
    )
      throw new Error();
    return url;
  } catch {
    throw new CalendarFetchError(
      "Nur HTTPS-Kalenderlinks auf ausdrücklich freigegebenen Hosts und Port 443 sind erlaubt.",
    );
  }
}
export function isPublicAddress(address: string) {
  try {
    if (!isIP(address) || address.includes("%")) return false;
    const parsed = ipaddr.parse(address);
    if (parsed.range() !== "unicast") return false;
    // IPv6: only global unicast. Excludes mapped IPv4, NAT64, local and transition ranges.
    if (parsed.kind() === "ipv6")
      return parsed.match(ipaddr.parse("2000::"), 3);
    return true;
  } catch {
    return false;
  }
}
async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        new CalendarFetchError(
          "Kalenderabruf hat das Zeitlimit überschritten.",
        ),
      );
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function resolveCalendarAddress(
  url: URL,
  signal: AbortSignal,
): Promise<LookupAddress> {
  const addresses = await abortable(
    lookup(url.hostname, { all: true, verbatim: true }),
    signal,
  );
  if (
    !addresses.length ||
    addresses.some(
      (a) => !isPublicAddress(a.address) || (a.family !== 4 && a.family !== 6),
    )
  )
    throw new CalendarFetchError(
      "Kalenderhost löst nicht ausschließlich auf öffentliche IP-Adressen auf.",
    );
  return addresses[0];
}
// The connection uses exactly the already checked address, without a second DNS resolution.
export function pinnedLookup(address: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}
export async function readCalendarResponse(
  response: IncomingMessage,
): Promise<string> {
  try {
    if (response.statusCode !== 200)
      throw new CalendarFetchError(
        "Kalenderserver hat den Abruf abgelehnt. Weiterleitungen werden aus Sicherheitsgründen nicht verfolgt.",
      );
    const encoding = response.headers["content-encoding"];
    if (encoding && encoding.toLowerCase() !== "identity")
      throw new CalendarFetchError(
        "Komprimierte Kalenderantworten werden nicht unterstützt.",
      );
    const type = response.headers["content-type"]
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (
      type &&
      ![
        "text/calendar",
        "application/ics",
        "text/plain",
        "application/octet-stream",
      ].includes(type)
    )
      throw new CalendarFetchError("Der Server liefert keine Kalenderdatei.");
    const length = response.headers["content-length"];
    if (
      length &&
      (!/^\d+$/.test(length) || Number(length) > MAX_CALENDAR_BYTES)
    )
      throw new CalendarFetchError(
        "Kalenderdatei überschreitet das Größenlimit von 2 MB.",
      );
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of response) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_CALENDAR_BYTES)
        throw new CalendarFetchError(
          "Kalenderdatei überschreitet das Größenlimit von 2 MB.",
        );
      chunks.push(bytes);
    }
    const body = Buffer.concat(chunks)
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim();
    if (
      !/^BEGIN:VCALENDAR\r?\n/.test(body) ||
      !/(?:\r?\n)END:VCALENDAR$/.test(body)
    )
      throw new CalendarFetchError(
        "Der Server liefert keinen vollständigen ICS-Kalender.",
      );
    return body;
  } finally {
    response.destroy();
  }
}
export function requestCalendar(
  url: URL,
  address: LookupAddress,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Native HTTPS does not follow redirects or use HTTP_PROXY environment variables.
    const request = https.request(
      {
        hostname: url.hostname,
        servername: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "GET",
        agent: false,
        lookup: pinnedLookup(address),
        signal,
        rejectUnauthorized: true,
        maxHeaderSize: 16_384,
        headers: {
          Accept: "text/calendar",
          "Accept-Encoding": "identity",
          "User-Agent": "StudyHub/0.1",
        },
      },
      (response) => {
        readCalendarResponse(response).then(resolve, reject);
      },
    );
    request.on("error", () => reject(new CalendarFetchError()));
    request.end();
  });
}
export type CalendarNetwork = {
  resolve: typeof resolveCalendarAddress;
  request: typeof requestCalendar;
};
export async function fetchCalendarUrl(
  input: string,
  network: CalendarNetwork = {
    resolve: resolveCalendarAddress,
    request: requestCalendar,
  },
): Promise<string> {
  const url = validateCalendarUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALENDAR_TIMEOUT_MS);
  try {
    const address = await abortable(
      network.resolve(url, controller.signal),
      controller.signal,
    );
    // Also validate the resolved address at the trust boundary before opening any socket.
    if (!isPublicAddress(address.address)) throw new CalendarFetchError();
    return await abortable(
      network.request(url, address, controller.signal),
      controller.signal,
    );
  } catch (error) {
    if (error instanceof CalendarFetchError) throw error;
    // Never propagate Node/DNS/TLS errors: they may contain the URL or response content.
    throw new CalendarFetchError();
  } finally {
    clearTimeout(timer);
  }
}
