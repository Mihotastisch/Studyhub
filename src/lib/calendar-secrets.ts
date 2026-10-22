import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

// This module is imported by server actions/services only. Never return its values to the client.
function key() {
  const value = process.env.CALENDAR_URL_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error(
      "Kalender-Verschlüsselung nicht eingerichtet. Bitte npm run setup ausführen.",
    );
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("Ungültiger Kalender-Schlüssel.");
  return decoded;
}
export function encryptCalendarUrl(url: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("studyhub-calendar-url-v1"));
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function decryptCalendarUrl(value: string) {
  try {
    const [version, iv, tag, content, ...extra] = value.split(".");
    if (version !== "v1" || !iv || !tag || !content || extra.length)
      throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(Buffer.from("studyhub-calendar-url-v1"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(content, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Kalenderlink konnte nicht entschlüsselt werden. Lokalen Schlüssel prüfen.",
    );
  }
}
export function calendarUrlHash(url: string) {
  return createHmac("sha256", key())
    .update("studyhub-calendar-identity-v1\0")
    .update(url)
    .digest("hex");
}
