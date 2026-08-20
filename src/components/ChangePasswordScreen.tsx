import { useState, type FormEvent } from "react";
import { changePassword } from "@/lib/catalog/api";
import type { AuthSession } from "@/lib/auth";

export function ChangePasswordScreen({ session, onChanged }: { session: AuthSession; onChanged: (session: AuthSession) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      const next = { ...session, user: { ...session.user, mustChangePassword: false } };
      localStorage.setItem("northbike-pos-auth-v1", JSON.stringify(next));
      onChanged(next);
    } catch { setError("No se pudo cambiar la contraseña. Verifica la contraseña temporal."); }
    finally { setSaving(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-north-dark px-4"><form onSubmit={submit} className="w-full max-w-sm bg-white p-7 shadow-2xl"><h1 className="font-display text-xl font-bold uppercase">Cambia tu contraseña</h1><p className="mt-2 text-sm text-north-muted">La contraseña temporal debe cambiarse antes de usar el POS.</p><label className="mt-6 block text-sm font-medium">Contraseña actual<input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" /></label><label className="mt-4 block text-sm font-medium">Nueva contraseña<input required minLength={12} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 h-11 w-full border border-north-border px-3" /></label>{error && <p className="mt-4 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<button disabled={saving} className="mt-6 h-11 w-full bg-north-primary text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : "Actualizar contraseña"}</button></form></main>;
}
