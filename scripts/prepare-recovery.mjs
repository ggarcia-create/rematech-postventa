// Run locally by the computer's administrator. Never accepts a new password.
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Uso: npm run recovery:prepare -- correo@rematech.mx");
  process.exit(1);
}
const system = platform();
const root =
  system === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : system === "win32"
      ? process.env.APPDATA
      : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
if (!root)
  throw new Error("No se encontró la carpeta de datos de la aplicación.");
const dir = join(root, "mx.rematech.postventa");
const code = randomBytes(24).toString("base64url");
const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
await mkdir(dir, { recursive: true, mode: 0o700 });
const target = join(dir, "account-recovery.json");
const temp = join(dir, `.recovery-${randomBytes(8).toString("hex")}.tmp`);
await writeFile(
  temp,
  JSON.stringify({
    email,
    codeHash: createHash("sha256").update(code).digest("hex"),
    expiresAt,
  }),
  { mode: 0o600, flag: "wx" },
);
await rename(temp, target);
console.log(
  `Recuperación preparada para ${email}.\nCódigo de un solo uso: ${code}\nVence: ${new Date(expiresAt * 1000).toLocaleString("es-MX")}\nEn la app, pulsa «Olvidé mi contraseña». Escribe tú la contraseña nueva.\nLos usuarios y expedientes se conservan.`,
);
