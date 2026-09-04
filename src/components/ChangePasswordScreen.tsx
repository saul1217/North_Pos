import { useState, type FormEvent } from "react";
import { requestEmailVerification, setInitialPassword, verifyEmail } from "@/lib/catalog/api";
import { clearAuthSession, saveAuthSession, type AuthSession } from "@/lib/auth";
import { logoSrc } from "@/lib/brand";

type Step = "email" | "email-code" | "password";

export function ChangePasswordScreen({ session, onChanged }: { session: AuthSession; onChanged: (session: AuthSession | null) => void }) {
  const [step, setStep] = useState<Step>(session.user.emailVerified ? "password" : "email");
  const [email, setEmail] = useState(session.user.email ?? "");
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submitEmail(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (email.trim().toLowerCase() !== emailConfirmation.trim().toLowerCase()) { setError("Los correos no coinciden."); return; }
    setSaving(true);
    try { await requestEmailVerification(email.trim()); setMessage("Te enviamos un código de confirmación al correo."); setStep("email-code"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo enviar el código."); }
    finally { setSaving(false); }
  }

  async function submitEmailCode(event: FormEvent) {
    event.preventDefault(); setError(null); setSaving(true);
    try { const result = await verifyEmail(emailCode.trim()); const next = { ...session, user: { ...session.user, email: result.email, emailVerified: true } }; saveAuthSession(next); setMessage("Correo confirmado. Ahora crea tu nueva contraseña."); setStep("password"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "El código no es válido."); }
    finally { setSaving(false); }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (newPassword !== passwordConfirmation) { setError("Las contraseñas no coinciden."); return; }
    setSaving(true);
    try { await setInitialPassword(newPassword); clearAuthSession(); onChanged(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cambiar la contraseña."); }
    finally { setSaving(false); }
  }

  const isEmailStep = step === "email" || step === "email-code";
  const title = isEmailStep ? "Confirma tu correo" : "Cambia tu contraseña";
  const description = step === "email" ? "Antes de continuar necesitamos un correo para proteger y recuperar tu cuenta." : step === "email-code" ? "Escribe el código de 6 dígitos que recibiste." : "Tu correo quedó confirmado. Crea y confirma tu nueva contraseña.";
  const submit = step === "email" ? submitEmail : step === "email-code" ? submitEmailCode : submitPassword;
  const button = step === "email" ? "Enviar código" : step === "email-code" ? "Confirmar correo" : "Guardar contraseña";

  return <main className="flex min-h-screen items-center justify-center bg-north-dark px-4"><form onSubmit={submit} className="w-full max-w-sm border border-white/10 bg-white p-7 shadow-2xl"><div className="mb-7 flex items-center gap-3"><img src={logoSrc} alt="North Bike" className="h-14 w-14 object-contain" /><div><h1 className="font-display text-xl font-bold uppercase tracking-[0.08em]">North Bike POS</h1><p className="text-xs text-north-muted">Primer acceso de {session.user.username}</p></div></div><h2 className="font-display text-xl font-bold uppercase">{title}</h2><p className="mt-2 text-sm text-north-muted">{description}</p>{step === "email" && <><label className="mt-6 block text-sm font-medium">Correo electrónico<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="email" /></label><label className="mt-4 block text-sm font-medium">Confirmar correo<input required type="email" value={emailConfirmation} onChange={(e) => setEmailConfirmation(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="email" /></label></>}{step === "email-code" && <label className="mt-6 block text-sm font-medium">Código de correo<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3 tracking-[0.35em]" autoFocus /></label>}{step === "password" && <><label className="mt-6 block text-sm font-medium">Nueva contraseña<input required minLength={8} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="new-password" /></label><label className="mt-4 block text-sm font-medium">Confirmar contraseña<input required minLength={8} type="password" value={passwordConfirmation} onChange={(e) => setPasswordConfirmation(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" autoComplete="new-password" /></label></>}{message && <p className="mt-4 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}{error && <p className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{step === "email-code" && <button type="button" onClick={() => { setStep("email"); setEmailCode(""); setError(null); setMessage(null); }} className="mt-4 w-full text-sm text-north-muted underline">Volver y corregir correo</button>}<button disabled={saving} className="mt-6 h-11 w-full bg-north-primary text-sm font-semibold text-white disabled:opacity-50">{saving ? "Procesando..." : button}</button></form></main>;
}
