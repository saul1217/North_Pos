import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
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

  if (!session) {
    return <AuthScreen onLogin={(next) => { setSession(next); void refreshCatalog(); }} />;
  }
  if (session.user.mustChangePassword) return <ChangePasswordScreen session={session} onChanged={setSession} />;

  if (!canAccess(session.user.role, pathname)) return <Navigate to={defaultPath(session.user.role)} replace />;

  function logout() {
    clearAuthSession();
    setSession(null);
  }

  return (
    <div className="pos-shell flex h-screen overflow-hidden bg-north-background">
      <PosSidebar onLogout={logout} username={session.user.username} role={session.user.role} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SyncBar />
        <Outlet />
      </div>
    </div>
  );
}
