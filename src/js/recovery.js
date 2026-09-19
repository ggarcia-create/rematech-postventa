import { invoke, isTauri } from "@tauri-apps/api/core";
export async function authorizeRecovery(email, code) {
  if (!isTauri())
    throw new Error(
      "La recuperación de cuentas locales se realiza desde la aplicación de escritorio.",
    );
  try {
    await invoke("consume_account_recovery", { email, code });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : error.message);
  }
}
