import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
let session = null,
  current = null,
  pending = null;
const headers = () => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_KEY,
});
async function authRequest(path, body, token) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      ...headers(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!response.ok)
    throw new Error(
      data.msg || data.error_description || "No se pudo iniciar sesión.",
    );
  return data;
}
export async function cloudCall(action, values = {}) {
  if (!session) throw new Error("Inicia sesión para continuar.");
  if (session.expires_at * 1000 < Date.now() + 60000)
    session = await authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rematech`, {
    method: "POST",
    headers: { ...headers(), Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ ...values, action }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "No se pudo conectar con Rematech.");
  return data;
}
export const cloudAuth = {
  user: () => current,
  hasUsers: async () => true,
  async login(email, password) {
    current = null;
    pending = null;
    session = null;
    session = await authRequest("token?grant_type=password", {
      email: email.trim(),
      password,
    });
    try {
      const user = await cloudCall("profile");
      if (user.mustChangePassword) pending = user;
      else current = user;
      return user;
    } catch (error) {
      session = null;
      throw error;
    }
  },
  logout() {
    const token = session?.access_token;
    session = null;
    current = null;
    pending = null;
    if (token) authRequest("logout?scope=local", {}, token).catch(() => {});
  },
  async changeTemporaryPassword(password, confirmation) {
    if (!pending) throw new Error("Inicia sesión con tu contraseña temporal.");
    const email = pending.email;
    await cloudCall("change-password", { password, confirmation });
    return this.login(email, password);
  },
  create: (values) => cloudCall("create-user", values),
  setRole: (id, role) => cloudCall("set-role", { id, role }),
  setPermissions: (id, permissions) =>
    cloudCall("set-permissions", { id, permissions }),
  resetUserPassword: (id, password) =>
    cloudCall("reset-user-password", { id, password }),
  users: () => cloudCall("users"),
  createSuggestion: (title, body) =>
    cloudCall("suggestion-create", { title, body }),
  suggestions: () => cloudCall("suggestions"),
  updateSuggestion: (id, status) =>
    cloudCall("suggestion-update", { id, status }),
  async resetPassword() {
    throw new Error(
      "Solicita al administrador el restablecimiento de tu cuenta compartida.",
    );
  },
};
async function imageData(blob) {
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { type: blob.type, base64: btoa(text) };
}
async function getCase(id) {
  const record = await cloudCall("get", { id });
  record.evidence = await Promise.all(
    record.evidence.map(async (url) => {
      if (!url) return null;
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("No se pudo cargar la evidencia.");
      return r.blob();
    }),
  );
  return record;
}
export const cloudCases = {
  list: () => cloudCall("list"),
  createSuggestion: (title, body) => cloudCall("suggestion-create", { title, body }),
  suggestions: () => cloudCall("suggestions"),
  updateSuggestion: (id, status) => cloudCall("suggestion-update", { id, status }),
  async importLocal(record) {
    return cloudCall("import-local", {
      record: { ...record, evidence: [] },
      evidence: await Promise.all(record.evidence.map(imageData)),
    });
  },
  get: getCase,
  async register(intake, evidence) {
    return cloudCall("register", {
      intake,
      evidence: await Promise.all(evidence.map(imageData)),
    });
  },
  async act(id, revision, operation, payload) {
    await cloudCall("act", { id, revision, operation, payload });
    return getCase(id);
  },
  notifications: () => cloudCall("notifications"),
  markNotificationRead: (id, notificationId) =>
    cloudCall("read", { id, notificationId }),
};
