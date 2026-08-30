export type AuthUser = { id: string; username: string; role: "admin" | "cajero" | "taller"; mustChangePassword: boolean };
export type AuthSession = { access_token: string; user: AuthUser };

const AUTH_KEY = "northbike-pos-auth-v1";

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const secureRaw = window.pos?.loadAuthSessionSync?.();
    if (secureRaw) return JSON.parse(secureRaw) as AuthSession;
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    // Migrate the existing browser storage entry once the Electron secure
    // store is available, then remove the plaintext copy.
    if (window.pos?.saveAuthSession) {
      void window.pos.saveAuthSession(JSON.stringify(session));
      localStorage.removeItem(AUTH_KEY);
    }
    return session;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (typeof window !== "undefined" && window.pos?.saveAuthSession) {
    void window.pos.saveAuthSession(JSON.stringify(session));
    return;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  if (typeof window !== "undefined" && window.pos?.clearAuthSession) {
    void window.pos.clearAuthSession();
  }
  localStorage.removeItem(AUTH_KEY);
}

export function getAccessToken() {
  return getAuthSession()?.access_token ?? null;
}
