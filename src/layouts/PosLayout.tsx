import { Outlet } from "react-router-dom";
import { PosProvider } from "@/context/PosContext";
import { PosSidebar } from "@/components/pos/PosSidebar";
import { SyncBar } from "@/components/SyncBar";
import "@/styles/pos.css";

export function PosLayout() {
  return (
    <PosProvider>
      <div className="pos-shell flex h-screen overflow-hidden bg-north-background">
        <PosSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <SyncBar />
          <Outlet />
        </div>
      </div>
    </PosProvider>
  );
}
