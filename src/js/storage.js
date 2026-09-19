import { encodeImage, decodeImage } from "./image-storage.js";
// Repository boundary: replace this adapter with a remote implementation later.
const KEY = "rematech.draft.v1";
let database;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("rematech-postventa", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("evidence");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
async function transact(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("evidence", mode);
    const req = action(tx.objectStore("evidence"));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () =>
      reject(tx.error || new Error("No se pudo guardar la evidencia."));
    tx.onabort = () =>
      reject(tx.error || new Error("Almacenamiento cancelado"));
  });
}
export const storage = {
  loadDraft() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.version !== 1 || !Array.isArray(d.components))
      throw new Error("Borrador incompatible");
    return { intakeType: "Servicio", ...d };
  },
  saveDraft(draft) {
    localStorage.setItem(KEY, JSON.stringify(draft));
  },
  loadEvidence() {
    return Promise.all(
      [0, 1].map((i) =>
        transact("readonly", (s) => s.get(i)).then(decodeImage),
      ),
    );
  },
  async saveEvidence(index, blob) {
    const data = await encodeImage(blob);
    return transact("readwrite", (s) =>
      data ? s.put(data, index) : s.delete(index),
    );
  },
  async clear() {
    await transact("readwrite", (s) => s.clear());
    localStorage.removeItem(KEY);
  },
};
