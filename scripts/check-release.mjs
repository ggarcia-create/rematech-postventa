import { readFileSync } from "node:fs";
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (process.env.VITE_CLOUD_MODE !== "true" || !url || !key)
  throw Error(
    "No se puede distribuir como producción sin configurar la conexión compartida.",
  );
const parsed = new URL(url);
if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co"))
  throw Error("Usa la URL HTTPS del proyecto Supabase.");
if (key.startsWith("sb_secret_"))
  throw Error("Nunca se incluye una clave secreta en el instalador.");
if (!key.startsWith("sb_publishable_")) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
  } catch {}
  if (claims?.role !== "anon")
    throw Error("Solo se admite una clave pública publishable o anon.");
}
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
for (const file of ["workflow.js", "utils.js", "catalog.js"]) {
  if (
    readFileSync(`src/js/${file}`, "utf8") !==
    readFileSync(`supabase/functions/rematech/shared/${file}`, "utf8")
  )
    throw Error(
      `Reglas de servidor desactualizadas: ${file}. Ejecuta node scripts/sync-server-rules.mjs antes de publicar.`,
    );
}
if (config.bundle.windows?.webviewInstallMode?.type !== "offlineInstaller")
  throw Error("Falta incluir WebView2 en Windows.");
console.log(
  "Configuración de empaquetado válida. Falta validar el servicio desplegado antes de distribuir.",
);
