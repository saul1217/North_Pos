import { useState, type FormEvent } from "react";
import { confirmPasswordReset, login, requestPasswordReset } from "@/lib/catalog/api";
import { saveAuthSession, type AuthSession } from "@/lib/auth";
import { logoSrc } from "@/lib/brand";

export function AuthScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<"email" | "code">("email");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null); setLoading(true);
    try {
      if (recoveryStep === "email") {
        await requestPasswordReset(recoveryEmail.trim());
        setNotice("Si el correo está registrado, recibirás un código de recuperación.");
        setRecoveryStep("code");
      } else {
        await confirmPasswordReset(recoveryEmail.trim(), recoveryCode.trim(), newPassword);
        setRecovery(false); setRecoveryStep("email"); setNotice("Contraseña actualizada. Ya puedes iniciar sesión.");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la recuperación."); }
    finally { setLoading(false); }
  }

  if (recovery) return <main className="flex min-h-screen items-center justify-center bg-north-dark px-4"><form onSubmit={submitRecovery} className="w-full max-w-sm border border-white/10 bg-white p-7 shadow-2xl"><div className="mb-7 flex items-center gap-3"><img src={logoSrc} alt="North Bike" className="h-14 w-14 object-contain" /><div><h1 className="font-display text-xl font-bold uppercase tracking-[0.08em]">North Bike POS</h1><p className="text-xs text-north-muted">Recuperación de cuenta</p></div></div><h2 className="font-display text-xl font-bold uppercase">Nueva contraseña</h2><p className="mt-2 text-sm text-north-muted">{recoveryStep === "email" ? "Escribe el correo confirmado de tu cuenta." : "Revisa tu correo y escribe el código recibido."}</p><label className="mt-6 block text-sm font-medium">Correo electrónico<input required type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="email" /></label>{recoveryStep === "code" && <><label className="mt-4 block text-sm font-medium">Código<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3 tracking-[0.35em]" /></label><label className="mt-4 block text-sm font-medium">Nueva contraseña<input required minLength={8} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="new-password" /></label></>}{notice && <p className="mt-4 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}{error && <p className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<button disabled={loading} className="mt-6 h-11 w-full bg-north-primary text-sm font-semibold text-white disabled:opacity-50">{loading ? "Procesando..." : recoveryStep === "email" ? "Enviar código" : "Guardar contraseña"}</button><button type="button" onClick={() => { setRecovery(false); setError(null); setNotice(null); }} className="mt-3 w-full text-sm text-north-muted">Volver al inicio de sesión</button></form></main>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-north-dark px-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-white/10 bg-white p-7 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <img src={logoSrc} alt="North Bike" className="h-14 w-14 object-contain" />
          <div><h1 className="font-display text-xl font-bold uppercase tracking-[0.08em]">North Bike POS</h1><p className="text-xs text-north-muted">Inicia sesión para continuar</p></div>
        </div>
        <label className="block text-sm font-medium">Usuario<input autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="username" /></label>
        <label className="mt-4 block text-sm font-medium">Contraseña<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="current-password" /></label>
        {error && <p className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mt-4 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
        <button disabled={loading} className="mt-6 h-11 w-full bg-north-primary text-sm font-semibold text-white disabled:opacity-50">{loading ? "Validando..." : "Entrar"}</button>
        <button type="button" onClick={() => { setRecovery(true); setError(null); setNotice(null); }} className="mt-4 w-full text-sm text-north-primary">¿Olvidaste tu contraseña?</button>
      </form>
    </main>
  );
}
