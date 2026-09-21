import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export function initializeUpdater() {
  if (!isTauri()) return;
  const trigger = document.querySelector('#check-updates');
  const dialog = document.querySelector('#update-dialog');
  const status = document.querySelector('#update-status');
  const notes = document.querySelector('#update-notes');
  const install = document.querySelector('#install-update');
  const close = document.querySelector('#close-update');
  const progress = document.querySelector('#update-progress');
  let update = null, busy = false, installed = false;
  trigger.hidden = false;
  close.onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  async function inspect(show = false) {
    if (busy || installed) { if (show) dialog.showModal(); return; }
    busy = true;
    install.hidden = true;
    notes.textContent = '';
    status.textContent = 'Buscando actualizaciones…';
    if (show && !dialog.open) dialog.showModal();
    try {
      if (update) await update.close();
      update = null;
      const version = await getVersion();
      update = await check({ timeout: 20000 });
      status.textContent = update ? `Versión ${update.version} disponible. Tienes la ${version}.` : `Tienes la versión más reciente: ${version}.`;
      notes.textContent = update?.body || '';
      install.hidden = !update;
      trigger.textContent = update ? 'Actualización disponible' : 'Actualizaciones';
      trigger.classList.toggle('update-available', !!update);
    } catch {
      status.textContent = 'No se pudo consultar la actualización. Revisa tu conexión e inténtalo de nuevo.';
    } finally { busy = false; }
  }
  trigger.onclick = () => inspect(true);
  install.onclick = async () => {
    if (busy || (!update && !installed)) return;
    busy = true;
    install.disabled = true;
    close.disabled = true;
    try {
      if (!installed) {
        progress.hidden = false;
        progress.removeAttribute('value');
        let downloaded = 0, total = 0;
        status.textContent = 'Descargando actualización…';
        await update.downloadAndInstall(event => {
          if (event.event === 'Started') total = event.data.contentLength || 0;
          if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            if (total) { progress.max = total; progress.value = downloaded; }
          }
          if (event.event === 'Finished') status.textContent = 'Verificando firma e instalando…';
        });
        installed = true;
      }
      status.textContent = 'Actualización instalada. Reiniciando…';
      await relaunch();
    } catch {
      status.textContent = installed
        ? 'La actualización está instalada. Cierra y vuelve a abrir el programa, o pulsa Reiniciar.'
        : 'No se pudo instalar la actualización. Tu versión actual sigue disponible. Inténtalo de nuevo.';
      if (installed) install.textContent = 'Reiniciar';
    } finally {
      progress.hidden = true;
      busy = false;
      install.disabled = false;
      close.disabled = false;
    }
  };
  // Checks are silent; installing always requires pressing the explicit action.
  inspect();
  setInterval(() => { if (!dialog.open) inspect(); }, 4 * 60 * 60 * 1000);
}
