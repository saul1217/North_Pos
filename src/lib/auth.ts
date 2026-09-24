export type AuthUser = {
  id: string;
  username: string;
  role: "admin" | "cajero" | "taller";
  mustChangePassword: boolean;
  email: string | null;
  emailVerified: boolean;
};
export type AuthSession = { access_token: string; user: AuthUser };

const AUTH_KEY = "northbike-pos-auth-v1";
let backgroundAdminToken: string | null = null;

function persistLocalSession(session: AuthSession) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

function trySecureSave(sessionJson: string) {
  if (!window.pos?.saveAuthSession) return;
  void window.pos
    .saveAuthSession(sessionJson)
    .then(() => {
      // Prefer the secure store once it actually persisted.
      localStorage.removeItem(AUTH_KEY);
    })
    .catch((err) => {
      console.warn(
        "[auth] secure store unavailable, keeping localStorage session",
        err,
      );
    });
}

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const secureRaw = window.pos?.loadAuthSessionSync?.();
    if (secureRaw) return JSON.parse(secureRaw) as AuthSession;
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    // Migrate plaintext → secure store when available; keep localStorage
    // until the IPC save resolves successfully.
    trySecureSave(raw);
    return session;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (session.user.role === "admin") backgroundAdminToken = session.access_token;
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(session);
  // Always keep a readable copy so getAccessToken()/refreshCatalog work even
  // when Electron safeStorage is unavailable (Linux QA / locked-down hosts).
  persistLocalSession(session);
  trySecureSave(payload);
}

// Permite que la cola del POS termine operaciones del administrador mientras
// se cambia a caja, sin persistir ni exponer otra sesión en la interfaz.
export function getBackgroundAccessToken() {
  const session = getAuthSession();
  return session?.user.role === "admin" ? session.access_token : backgroundAdminToken;
}

export function clearAuthSession() {
  if (typeof window !== "undefined" && window.pos?.clearAuthSession) {
    void window.pos.clearAuthSession();
  }
  if (typeof window !== "undefined") localStorage.removeItem(AUTH_KEY);
  backgroundAdminToken = null;
}

export function getAccessToken() {
  return getAuthSession()?.access_token ?? backgroundAdminToken;
}
