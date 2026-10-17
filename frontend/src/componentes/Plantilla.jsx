import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSesion } from '../contexto/Sesion';

const MENU = [
  { a: '/', t: 'Panel', ic: '◧', fin: true },
  { a: '/instituciones', t: 'Instituciones', ic: '▤' },
  { a: '/mapa', t: 'Mapa y rutas', ic: '⌖' },
  { a: '/reintegros', t: 'Reintegros', ic: '⇄' },
  { a: '/informes', t: 'Informes', ic: '▦' },
  { a: '/trazabilidad', t: 'Trazabilidad', ic: '⛓' },
  { a: '/analisis', t: 'Análisis territorial', ic: '◍' },
  { a: '/configuracion', t: 'Configuración', ic: '⚙' }
];
const ROLES = { admin: 'Administrador', editor: 'Editor', lector: 'Solo lectura' };

export default function Plantilla() {
  const { usuario, salir } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]); // cada módulo abre desde arriba
  return (
    <div className="app">
      <header className="barra">
        <button type="button" className="hamburguesa" aria-label="Abrir menú" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>☰</button>
        <NavLink to="/" className="marca" onClick={() => setAbierto(false)}>
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="2" y="9" width="14" height="14" rx="3.5" className="mk-a" /><rect x="16" y="9" width="14" height="14" rx="3.5" className="mk-b" /><path d="M19.5 16.2l2.4 2.4 4.6-4.8" className="mk-c" /></svg>
          <span><b>Traza Educativa</b><small>Secretaría de Educación de Medellín</small></span>
        </NavLink>
        <div className="usuario">
          <span><b>{usuario.nombre}</b><small>{ROLES[usuario.rol]}</small></span>
          <button type="button" className="btn sm" onClick={() => salir()}>Salir</button>
        </div>
      </header>
      <nav className={'menu' + (abierto ? ' abierto' : '')} aria-label="Módulos">
        {MENU.map(m => (
          <NavLink key={m.a} to={m.a} end={m.fin} onClick={() => setAbierto(false)}>
            <span className="ic" aria-hidden="true">{m.ic}</span>{m.t}
          </NavLink>
        ))}
      </nav>
      <main className={'contenido' + (loc.pathname === '/mapa' ? ' ancho' : '')}><Outlet /></main>
    </div>
  );
}
