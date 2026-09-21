// Read-only release QA: use the production updater to download and verify the signed
// package. Never installs, restarts, signs in, or reads application records.
use tauri_plugin_updater::UpdaterExt;
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result = async {
                    let updater = handle.updater_builder()
                        .version_comparator(|_, _| true)
                        .build()?;
                    let update = updater.check().await?
                        .ok_or_else(|| tauri_plugin_updater::Error::Io(std::io::Error::other("No published release")))?;
                    println!("Release {}: downloading with native signature verification", update.version);
                    let bytes = update.download(|_, _| {}, || {}).await?;
                    println!("Verified {} bytes. No installation performed.", bytes.len());
                    Ok::<(), tauri_plugin_updater::Error>(())
                }.await;
                let code = if let Err(error) = result { eprintln!("Release verification failed: {error}"); 1 } else { 0 };
                handle.exit(code);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start release verification");
}
