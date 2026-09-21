import { test, expect } from '@playwright/test';
import { setup } from './helpers.js';
async function prepare(page, failure = '') {
  await page.addInitScript(({ failure }) => {
    window.isTauri = true;
    window.updateCalls = [];
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command) => {
        window.updateCalls.push(command);
        if (command === 'plugin:app|version') return '1.6.0';
        if (command === 'plugin:updater|check') {
          if (failure === 'check') throw new Error('offline');
          if (failure === 'current') return null;
          return { rid: 1, currentVersion: '1.6.0', version: '1.6.1', body: '<script>unsafe</script> Nueva versión' };
        }
        if (command === 'plugin:updater|download_and_install' && failure === 'signature') throw new Error('invalid signature');
        if (command === 'plugin:process|restart' && failure === 'restart') throw new Error('restart failed');
      }
    };
  }, { failure });
  await setup(page);
  await page.locator('#check-updates').click();
}
test('requires explicit install and renders release notes as text', async ({ page }) => {
  await prepare(page);
  await expect(page.locator('#update-status')).toContainText('1.6.1');
  await expect(page.locator('#update-notes')).toHaveText('<script>unsafe</script> Nueva versión');
  expect(await page.evaluate(() => window.updateCalls.includes('plugin:updater|download_and_install'))).toBe(false);
  await page.locator('#close-update').click();
  await expect(page.locator('#update-dialog')).not.toBeVisible();
  await page.locator('#check-updates').click();
  await page.locator('#install-update').click();
  await expect.poll(() => page.evaluate(() => window.updateCalls.includes('plugin:process|restart'))).toBe(true);
});
test('failed verification never restarts and permits retry', async ({ page }) => {
  await prepare(page, 'signature');
  await page.locator('#install-update').click();
  await expect(page.locator('#update-status')).toContainText('No se pudo instalar');
  await expect(page.locator('#install-update')).toBeEnabled();
  expect(await page.evaluate(() => window.updateCalls.includes('plugin:process|restart'))).toBe(false);
});
test('check failure and current version do not offer installation', async ({ page }) => {
  await prepare(page, 'check');
  await expect(page.locator('#update-status')).toContainText('No se pudo consultar');
  await expect(page.locator('#install-update')).toBeHidden();
});
test('restart failure retries restart without reinstalling', async ({ page }) => {
  await prepare(page, 'restart');
  await page.locator('#install-update').click();
  await expect(page.locator('#install-update')).toHaveText('Reiniciar');
  await page.locator('#install-update').click();
  expect(await page.evaluate(() => window.updateCalls.filter(c => c === 'plugin:updater|download_and_install').length)).toBe(1);
});
