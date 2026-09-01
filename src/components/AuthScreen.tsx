import { useState, type FormEvent } from "react";
import { login } from "@/lib/catalog/api";
import { saveAuthSession, type AuthSession } from "@/lib/auth";

export function AuthScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(username, password);
      saveAuthSession(session);
      onLogin(session);
    } catch (err) {
      setError((err as Error).message === "Failed to fetch" ? "No se pudo conectar con el servidor." : "Usuario o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-north-dark px-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-white/10 bg-white p-7 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <img src="/public/brand/logo.png" alt="North Bike" className="h-14 w-14 object-contain" />
          <div><h1 className="font-display text-xl font-bold uppercase tracking-[0.08em]">North Bike POS</h1><p className="text-xs text-north-muted">Inicia sesión para continuar</p></div>
        </div>
        <label className="block text-sm font-medium">Usuario<input autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="username" /></label>
        <label className="mt-4 block text-sm font-medium">Contraseña<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="current-password" /></label>
        {error && <p className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="mt-6 h-11 w-full bg-north-primary text-sm font-semibold text-white disabled:opacity-50">{loading ? "Validando..." : "Entrar"}</button>
      </form>
    </main>
  );
}
