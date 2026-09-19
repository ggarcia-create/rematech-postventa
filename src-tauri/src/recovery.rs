use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{fs, path::Path, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;

static RECOVERY_LOCK: Mutex<()> = Mutex::new(());
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Authorization { email: String, code_hash: String, expires_at: u64 }

fn consume(path: &Path, email: &str, code: &str, now: u64) -> Result<(), String> {
    let _guard = RECOVERY_LOCK.lock().map_err(|_| "No se pudo verificar el código.")?;
    let raw = fs::read_to_string(path).map_err(|_| "No hay una recuperación preparada en esta computadora. Solicita un código al administrador del equipo.")?;
    let authorization: Authorization = serde_json::from_str(&raw).map_err(|_| "El archivo de recuperación no es válido.")?;
    let digest = format!("{:x}", Sha256::digest(code.trim().as_bytes()));
    let mismatch = digest.bytes().zip(authorization.code_hash.bytes()).fold(0u8, |diff, (a,b)| diff | (a ^ b));
    if authorization.email != email.trim().to_lowercase() || authorization.code_hash.len() != digest.len() || mismatch != 0 {
        return Err("Correo o código de recuperación incorrectos.".into());
    }
    if now >= authorization.expires_at { return Err("El código caducó. Solicita uno nuevo.".into()); }
    // The lock and removal make this authorization single-use within the app.
    fs::remove_file(path).map_err(|_| "No se pudo consumir el código. Revisa los permisos de almacenamiento.")?;
    Ok(())
}

#[tauri::command]
pub fn consume_account_recovery(app: tauri::AppHandle, window: tauri::WebviewWindow, email: String, code: String) -> Result<(), String> {
    if window.label() != "main" { return Err("Ventana no autorizada.".into()); }
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("account-recovery.json");
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
    consume(&path, &email, &code, now)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authorization_is_scoped_expires_and_is_consumed_once() {
        let path = std::env::temp_dir().join(format!("rematech-recovery-test-{}.json", std::process::id()));
        let hash = format!("{:x}", Sha256::digest(b"test-code"));
        fs::write(&path, format!(r#"{{"email":"admin@example.test","codeHash":"{}","expiresAt":200}}"#,hash)).unwrap();
        assert!(consume(&path,"other@example.test","test-code",100).is_err());
        assert!(consume(&path,"admin@example.test","wrong-code",100).is_err());
        assert!(consume(&path,"admin@example.test","test-code",200).is_err());
        assert!(path.exists());
        assert!(consume(&path,"admin@example.test","test-code",100).is_ok());
        assert!(!path.exists());
        assert!(consume(&path,"admin@example.test","test-code",100).is_err());
    }
}
