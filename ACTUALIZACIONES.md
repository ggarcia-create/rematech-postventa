# Actualizaciones de Rematech Postventa

La versión 1.6.0 introduce el actualizador. Las versiones 1.5.x necesitan instalar esta versión manualmente una vez. A partir de ella, el programa consulta al abrirse y cada cuatro horas un manifiesto HTTPS y muestra «Actualización disponible». También permite consultar desde «Actualizaciones». Nunca instala sin pulsar «Instalar y reiniciar»; conviene guardar el expediente antes. La captura local y los registros compartidos se conservan.

El repositorio privado conserva el código. El repositorio `ggarcia-create/rematech-postventa-releases` se destina exclusivamente a instaladores y manifiestos públicos, sin credenciales ni expedientes. La aplicación verifica la firma del paquete antes de instalar. Esta firma del actualizador es independiente de los certificados comerciales de Windows y la notarización de Apple, que aún no se incluyen.

## Publicar una versión

1. Cambiar la versión en package.json/package-lock.json, Cargo.toml/Cargo.lock y tauri.conf.json. Probar los cambios y subirlos al repositorio privado.
2. Ejecutar GitHub Actions «Instaladores Rematech». La clave privada de firma reside en el secreto `TAURI_SIGNING_PRIVATE_KEY`; no se incluye en el instalador. Conservar una copia privada segura de `entrega/Privado/rematech-updater.key`. No regenerarla: las instalaciones existentes confían en su clave pública.
3. Exigir que ambos trabajos pasen, incluidas las pruebas de instalación Windows y las verificaciones Mac. Descargar ambos artefactos a una carpeta nueva.
4. Ejecutar `node scripts/prepare-update-release.mjs CARPETA_ARTEFACTOS CARPETA_PUBLICA`. Revisar versión y notas en latest.json.
5. Crear una release borrador `vVERSION` en el repositorio de distribución. Adjuntar únicamente Rematech-Windows.exe, Rematech-Mac.dmg, Rematech-Mac.app.tar.gz y latest.json. Verificar los cuatro archivos antes de publicar el borrador como latest.
6. Comprobar la URL pública de latest.json. Ejecutar `cargo run --manifest-path src-tauri/Cargo.toml --example verify_update` para descargar y verificar el paquete con el actualizador nativo, sin instalar. Probar también una actualización desde la versión previa. Los usuarios verán el aviso al consultar de nuevo.

No publicar solo el manifiesto antes de los binarios. Cada versión usa URLs inmutables con etiqueta; no reemplazar los archivos de una versión publicada. Si surge un fallo, publicar una versión superior corregida. No se incluyen tokens de GitHub en las computadoras de los usuarios.

Los cambios en funciones y base de datos compartidas se despliegan por separado y deben ser compatibles con los clientes que todavía no actualizaron. Cambiar el código o hacer un commit no publica automáticamente una release.
