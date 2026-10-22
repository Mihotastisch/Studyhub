import { access, copyFile, open, readFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
// Do not overwrite an existing environment file or database.
try {
  await access(".env");
} catch {
  await copyFile(".env.example", ".env");
}
const file = await open("prisma/studyhub.db", "a");
await file.close();
// Append a generated secret locally; never print it or overwrite an existing key.
const environment = await readFile(".env", "utf8");
if (!/^\s*CALENDAR_URL_KEY\s*=/m.test(environment)) {
  await appendFile(
    ".env",
    `\nCALENDAR_URL_KEY="${randomBytes(32).toString("base64")}"\n`,
    { mode: 0o600 },
  );
}
