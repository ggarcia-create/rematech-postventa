import { CLOUD_MODE } from "./config.js";
import { cloudCases } from "./cloud.js";
import { encodeImage, decodeImage } from "./image-storage.js";
import { createCase, applyAction, normalizeRecord } from "./workflow.js";
// Atomic IndexedDB repository. Replace this boundary for shared/server storage.
const decodeRecord = (record) =>
  record
    ? { ...normalizeRecord(record), evidence: record.evidence.map(decodeImage) }
    : record;
let connection;
function database() {
  return (connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("rematech-workflow", 1);
    request.onupgradeneeded = () => {
      const cases = request.result.createObjectStore("cases", {
        keyPath: "id",
      });
      cases.createIndex("folioKey", "folioKey", { unique: true });
      const users = request.result.createObjectStore("users", {
        keyPath: "id",
      });
      users.createIndex("email", "email", { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function transact(store, mode, work) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result, error;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () =>
      reject(error || tx.error || new Error("No se pudo guardar."));
    tx.onabort = () =>
      reject(error || tx.error || new Error("No se pudo guardar."));
    const fail = (reason) => {
      error = reason;
      tx.abort();
    };
    try {
      work(
        tx.objectStore(store),
        (value) => {
          result = value;
        },
        fail,
      );
    } catch (err) {
      fail(err);
    }
  });
}
export const localCases = {
  createSuggestion(title, body, user) {
    const key = "rematech.suggestions.v1";
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const suggestion = {
      id: crypto.randomUUID(),
      title,
      body,
      author_name: user.name,
      status: "pendiente",
      created_at: new Date().toISOString(),
    };
    list.unshift(suggestion);
    localStorage.setItem(key, JSON.stringify(list));
    return Promise.resolve(suggestion);
  },
  suggestions() {
    return Promise.resolve(
      JSON.parse(localStorage.getItem("rematech.suggestions.v1") || "[]"),
    );
  },
  updateSuggestion(id, status) {
    const key = "rematech.suggestions.v1",
      list = JSON.parse(localStorage.getItem(key) || "[]");
    const item = list.find((s) => s.id === id);
    if (item) item.status = status;
    localStorage.setItem(key, JSON.stringify(list));
    return Promise.resolve(item);
  },
  notifications(user) {
    if (!user) return Promise.resolve([]);
    return transact("cases", "readonly", (store, done) => {
      const q = store.getAll();
      q.onsuccess = () =>
        done(
          q.result
            .flatMap((r) =>
              (r.notifications || [])
                .filter((n) => n.targets.includes(user.role))
                .map((n) => ({
                  ...n,
                  caseId: r.id,
                  folio: r.intake.folio,
                  unread: !n.readBy.includes(user.id),
                })),
            )
            .sort((a, b) => b.at.localeCompare(a.at)),
        );
    });
  },
  markNotificationRead(caseId, notificationId, user) {
    if (!user) throw new Error("Inicia sesión para ver tus notificaciones.");
    return transact("cases", "readwrite", (store, done, fail) => {
      const q = store.get(caseId);
      q.onsuccess = () => {
        const r = q.result;
        const note = r?.notifications?.find((n) => n.id === notificationId);
        if (!note || !note.targets.includes(user.role))
          return fail(new Error("No se encontró la notificación de tu área."));
        if (!note.readBy.includes(user.id)) {
          note.readBy.push(user.id);
          store.put(r);
        }
        done();
      };
    });
  },
  list() {
    return transact("cases", "readonly", (store, done) => {
      const q = store.getAll();
      q.onsuccess = () =>
        done(
          q.result
            .map(decodeRecord)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
    });
  },
  get(id) {
    return transact("cases", "readonly", (store, done) => {
      const q = store.get(id);
      q.onsuccess = () => done(decodeRecord(q.result));
    });
  },
  async register(intake, images, user) {
    const record = createCase(intake, images, user);
    record.evidence = await Promise.all(images.map(encodeImage));
    return transact("cases", "readwrite", (store, done, fail) => {
      const exists = store.index("folioKey").get(record.folioKey);
      exists.onsuccess = () => {
        if (exists.result)
          return fail(
            new Error(
              "Este folio ya está registrado. Consúltalo en Consulta y recepciones o genera un folio nuevo.",
            ),
          );
        store.add(record);
        done(decodeRecord(record));
      };
    });
  },
  act(id, revision, action, payload, user) {
    return transact("cases", "readwrite", (store, done, fail) => {
      const q = store.get(id);
      q.onsuccess = () => {
        try {
          if (!q.result) throw new Error("No se encontró el expediente.");
          if (q.result.revision !== revision)
            throw new Error(
              "Otro usuario actualizó el expediente. Vuelve a abrirlo antes de guardar.",
            );
          const next = applyAction(q.result, action, payload, user);
          store.put(next);
          done(decodeRecord(next));
        } catch (error) {
          fail(error);
        }
      };
    });
  },
};

export const cases = CLOUD_MODE ? cloudCases : localCases;
