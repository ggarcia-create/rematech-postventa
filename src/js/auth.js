import { CLOUD_MODE } from "./config.js";
import { cloudAuth } from "./cloud.js";
import { authorizeRecovery } from "./recovery.js";
import { transact } from "./case-storage.js";
import { ROLES, requireRole, normalize } from "./workflow.js";
import { validEmail } from "./utils.js";
let currentUser = null;
let pendingUser = null;
const ITERATIONS = 310000;
const publicUser = ({ id, name, email, role, mustChangePassword = false, permissions = [] }) => ({
  id,
  name,
  email,
  role,
  mustChangePassword,
  permissions,
});
async function derive(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits));
}
function listUsers() {
  return transact("users", "readonly", (store, done) => {
    const q = store.getAll();
    q.onsuccess = () => done(q.result);
  });
}
const localAuth = {
  user: () => currentUser,
  async hasUsers() {
    return (await listUsers()).length > 0;
  },
  async login(email, password) {
    currentUser = null;
    pendingUser = null;
    const user = (await listUsers()).find((u) => u.email === normalize(email));
    if (!user) throw new Error("Correo o contraseña incorrectos.");
    const hash = await derive(password, user.salt);
    if (hash.reduce((diff, value, i) => diff | (value ^ user.hash[i]), 0) !== 0)
      throw new Error("Correo o contraseña incorrectos.");
    if (user.mustChangePassword) {
      pendingUser = user;
      return publicUser(user);
    }
    currentUser = publicUser(user);
    return currentUser;
  },
  logout() {
    pendingUser = null;
    currentUser = null;
  },
  async create(
    { name, email, password, role, permissions = [], temporary = false },
    first = false,
  ) {
    if (!first) requireRole(currentUser, "admin");
    if (!name.trim()) throw new Error("Escribe el nombre del usuario.");
    if (!validEmail(email.trim())) throw new Error("Escribe un correo válido.");
    if (password.length < 10)
      throw new Error("Utiliza una contraseña de al menos 10 caracteres.");
    if (!ROLES[role]) throw new Error("Selecciona un área válida.");
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(password, salt);
    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalize(email),
      role: first ? "admin" : role,
      mustChangePassword: !first && temporary,
      permissions: first ? ["dashboard", "ingresos", "reparacion", "calidad", "settings"] : permissions,
      salt,
      hash,
    };
    await transact("users", "readwrite", (store, done, fail) => {
      const q = store.count();
      q.onsuccess = () => {
        if (first && q.result !== 0)
          return fail(new Error("Ya existe un administrador. Inicia sesión."));
        const exists = store.index("email").get(user.email);
        exists.onsuccess = () => {
          if (exists.result)
            return fail(new Error("Este correo ya tiene una cuenta."));
          store.add(user);
          done(publicUser(user));
        };
      };
    });
    if (first) currentUser = publicUser(user);
    return publicUser(user);
  },
  async changeTemporaryPassword(password, confirmation) {
    const user = pendingUser;
    if (!user) throw new Error("Inicia sesión con tu contraseña temporal.");
    if (password.length < 10)
      throw new Error("Utiliza al menos 10 caracteres.");
    if (password !== confirmation)
      throw new Error("Las contraseñas no coinciden.");
    const previous = await derive(password, user.salt);
    if (previous.every((value, i) => value === user.hash[i]))
      throw new Error("La nueva contraseña debe ser diferente a la temporal.");
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(password, salt);
    const updated = await transact(
      "users",
      "readwrite",
      (store, done, fail) => {
        const q = store.get(user.id);
        q.onsuccess = () => {
          const saved = q.result;
          if (
            !saved ||
            !saved.mustChangePassword ||
            !saved.hash.every((v, i) => v === user.hash[i]) ||
            pendingUser !== user
          )
            return fail(
              new Error("La cuenta cambió. Vuelve a iniciar sesión."),
            );
          const next = { ...saved, salt, hash, mustChangePassword: false };
          store.put(next);
          done(publicUser(next));
        };
      },
    );
    pendingUser = null;
    currentUser = updated;
    return updated;
  },
  async setRole(id, role) {
    requireRole(currentUser, "admin");
    if (!ROLES[role]) throw new Error("Selecciona un rol válido.");
    if (id === currentUser.id)
      throw new Error("No puedes cambiar tu propio rol.");
    return transact("users", "readwrite", (store, done, fail) => {
      const q = store.get(id);
      q.onsuccess = () => {
        if (!q.result) return fail(new Error("Usuario no encontrado."));
        store.put({ ...q.result, role });
        done();
      };
    });
  },
  async resetPassword(email, password, confirmation, code) {
    if (password.length < 10)
      throw new Error("Utiliza una contraseña de al menos 10 caracteres.");
    if (password !== confirmation)
      throw new Error("Las contraseñas no coinciden.");
    if (!code.trim()) throw new Error("Escribe el código de recuperación.");
    const user = (await listUsers()).find((u) => u.email === normalize(email));
    if (!user) throw new Error("No existe una cuenta local con ese correo.");
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(password, salt);
    await authorizeRecovery(user.email, code.trim());
    try {
      await transact("users", "readwrite", (store, done, fail) => {
        const request = store.get(user.id);
        request.onsuccess = () => {
          if (!request.result || request.result.email !== user.email)
            return fail(
              new Error("La cuenta cambió. Solicita un código nuevo."),
            );
          store.put({
            ...request.result,
            salt,
            hash,
            mustChangePassword: false,
          });
          done();
        };
      });
    } catch {
      throw new Error(
        "No se pudo guardar la contraseña. Tu contraseña anterior sigue vigente; solicita un código nuevo para reintentar.",
      );
    }
    currentUser = null;
  },
  async users() {
    requireRole(currentUser, "admin");
    return (await listUsers()).map(publicUser);
  },
};

export const auth = CLOUD_MODE ? cloudAuth : localAuth;
