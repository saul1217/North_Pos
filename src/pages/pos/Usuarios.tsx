import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { createUser, fetchUsers, updateUser, type ManagedUser } from "@/lib/catalog/api";

const roleLabels = { admin: "Administrador", cajero: "Cajero", taller: "Taller" } as const;

export default function Usuarios() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ManagedUser["role"]>("cajero");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setUsers(await fetchUsers()); setMessage(null); } catch { setMessage("No se pudo cargar la lista de usuarios."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await createUser({ username, temporaryPassword: password, role });
      setUsername(""); setPassword(""); setRole("cajero"); setMessage("Usuario creado. Entrega la contraseña temporal de forma segura."); await load();
    } catch (error) { setMessage((error as Error).message || "No se pudo crear el usuario."); }
  }

  async function toggle(user: ManagedUser) {
    try { await updateUser(user.id, { active: !user.active }); await load(); } catch { setMessage("No se pudo actualizar el usuario."); }
  }

  return <div className="flex min-h-0 flex-1 flex-col"><header className="border-b border-north-border bg-white px-4 py-5 md:px-6"><div className="flex items-start justify-between"><div><h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">Usuarios</h1><p className="mt-1 text-sm text-north-muted">Administra accesos de caja y taller</p></div><button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 border border-north-border px-3 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button></div></header><div className="min-h-0 flex-1 overflow-auto p-4 md:p-6"><div className="grid gap-6 lg:grid-cols-[360px_1fr]"><form onSubmit={addUser} className="border border-north-border bg-white p-5"><h2 className="font-display text-lg font-bold uppercase">Nueva cuenta</h2><label className="mt-4 block text-sm font-medium">Usuario<input required value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 h-10 w-full border border-north-border px-3" /></label><label className="mt-4 block text-sm font-medium">Contraseña temporal<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-10 w-full border border-north-border px-3" /></label><label className="mt-4 block text-sm font-medium">Rol<select value={role} onChange={(e) => setRole(e.target.value as ManagedUser["role"])} className="mt-1 h-10 w-full border border-north-border bg-white px-3"><option value="cajero">Cajero</option><option value="taller">Taller</option><option value="admin">Administrador</option></select></label><button className="mt-5 inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Crear cuenta</button></form><div className="overflow-hidden border border-north-border bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-north-border"><td className="px-4 py-3 font-medium">{user.username}</td><td className="px-4 py-3">{roleLabels[user.role]}</td><td className="px-4 py-3">{user.active ? "Activo" : "Inactivo"}{user.mustChangePassword && <span className="ml-2 text-xs text-amber-700">Cambio pendiente</span>}</td><td className="px-4 py-3"><button onClick={() => void toggle(user)} className="text-xs font-semibold text-north-primary">{user.active ? "Desactivar" : "Activar"}</button></td></tr>)}</tbody></table></div></div>{message && <p className="mt-4 border border-north-border bg-white px-3 py-2 text-sm text-north-muted">{message}</p>}</div></div>;
}
