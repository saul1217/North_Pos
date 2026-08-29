import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { PosProvider } from "@/context/PosContext";
import { PosSidebar } from "@/components/pos/PosSidebar";
import { SyncBar } from "@/components/SyncBar";
import "@/styles/pos.css";
import { AuthScreen } from "@/components/AuthScreen";
import { ChangePasswordScreen } from "@/components/ChangePasswordScreen";
import { clearAuthSession, getAuthSession, type AuthSession } from "@/lib/auth";
import { usePos } from "@/context/PosContext";
import { canAccess, defaultPath } from "@/lib/permissions";

export function PosLayout() {
  return (
    <PosProvider>
      <AuthenticatedPosLayout />
    </PosProvider>
  );
}

function AuthenticatedPosLayout() {
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession());
  const { refreshCatalog } = usePos();
  const pathname = useLocation().pathname;

  useEffect(() => {
    const handleAuthExpired = () => setSession(null);
    window.addEventListener("northbike-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("northbike-auth-expired", handleAuthExpired);
  }, []);

  if (!session) {
    return <AuthScreen onLogin={(next) => { setSession(next); void refreshCatalog(); }} />;
  }
  if (session.user.mustChangePassword) return <ChangePasswordScreen session={session} onChanged={setSession} />;

  if (!canAccess(session.user.role, pathname, session.user.modules)) return <Navigate to={defaultPath(session.user.role, session.user.modules)} replace />;

  function logout() {
    clearAuthSession();
    setSession(null);
  }

  return (
    <div className="pos-shell flex h-screen overflow-hidden bg-north-background">
      <PosSidebar onLogout={logout} username={session.user.username} role={session.user.role} modules={session.user.modules} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SyncBar />
        <Outlet />
      </div>
    </div>
  );
}
