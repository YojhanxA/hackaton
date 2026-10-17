import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './estilos.css';
import { ProveedorSesion, useSesion } from './contexto/Sesion';
import { ProveedorAvisos } from './contexto/Avisos';
import Plantilla from './componentes/Plantilla';
import { Cargando } from './componentes/ui';
import Ingreso from './paginas/Ingreso';

// Cada módulo se carga solo cuando se abre
const Panel = lazy(() => import('./paginas/Panel'));
const Instituciones = lazy(() => import('./paginas/Instituciones'));
const InstitucionFormulario = lazy(() => import('./paginas/InstitucionFormulario'));
const InstitucionFicha = lazy(() => import('./paginas/InstitucionFicha'));
const MapaRutas = lazy(() => import('./paginas/MapaRutas'));
const Reintegros = lazy(() => import('./paginas/Reintegros'));
const Informes = lazy(() => import('./paginas/Informes'));
const Trazabilidad = lazy(() => import('./paginas/Trazabilidad'));
const Analisis = lazy(() => import('./paginas/Analisis'));
const Configuracion = lazy(() => import('./paginas/Configuracion'));

function Protegido({ children }) {
  const { usuario } = useSesion();
  return usuario ? children : <Navigate to="/ingreso" replace />;
}

function App() {
  const { usuario } = useSesion();
  return (
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route path="/ingreso" element={usuario ? <Navigate to="/" replace /> : <Ingreso />} />
        <Route element={<Protegido><Plantilla /></Protegido>}>
          <Route index element={<Panel />} />
          <Route path="instituciones" element={<Instituciones />} />
          <Route path="instituciones/nueva" element={<InstitucionFormulario />} />
          <Route path="instituciones/:id" element={<InstitucionFicha />} />
          <Route path="instituciones/:id/editar" element={<InstitucionFormulario />} />
          <Route path="mapa" element={<MapaRutas />} />
          <Route path="reintegros" element={<Reintegros />} />
          <Route path="informes" element={<Informes />} />
          <Route path="trazabilidad" element={<Trazabilidad />} />
          <Route path="analisis" element={<Analisis />} />
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('raiz')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProveedorAvisos>
        <ProveedorSesion><App /></ProveedorSesion>
      </ProveedorAvisos>
    </HashRouter>
  </React.StrictMode>
);
