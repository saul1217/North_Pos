import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { PosLayout } from "@/layouts/PosLayout";
import Venta from "@/pages/pos/Venta";
import Inventario from "@/pages/pos/Inventario";
import Productos from "@/pages/pos/Productos";
import Ventas from "@/pages/pos/Ventas";
import Apartados from "@/pages/pos/Apartados";
import Cotizaciones from "@/pages/pos/Cotizaciones";
import Taller from "@/pages/pos/Taller";
import Analiticas from "@/pages/pos/Analiticas";
import Usuarios from "@/pages/pos/Usuarios";
import Respaldo from "@/pages/pos/Respaldo";
import CodigosBarras from "@/pages/pos/CodigosBarras";

// Standalone POS app. Routes stay under /pos/* so the sidebar (which links
// to /pos/venta, /pos/productos, …) works unchanged. Anything else redirects
// to the sale screen.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/pos" element={<PosLayout />}>
          <Route index element={<Navigate to="/pos/venta" replace />} />
          <Route path="venta" element={<Venta />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="productos" element={<Productos />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="apartados" element={<Apartados />} />
          <Route path="cotizaciones" element={<Cotizaciones />} />
          <Route path="taller" element={<Taller />} />
          <Route path="analiticas" element={<Analiticas />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="respaldo" element={<Respaldo />} />
          <Route path="codigos-barras" element={<CodigosBarras />} />
        </Route>
        <Route path="*" element={<Navigate to="/pos/venta" replace />} />
      </Routes>
    </HashRouter>
  );
}
