import { useState } from 'react';
import { useSesion } from '../contexto/Sesion';
import { Campo } from '../componentes/ui';

export default function Ingreso() {
  const { entrar, aviso } = useSesion();
  const [f, setF] = useState({ usuario: '', clave: '' });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async e => {
    e.preventDefault();
    if (!f.usuario.trim() || !f.clave) return setError('Escribe tu usuario y tu contraseña.');
    setOcupado(true); setError('');
    try { await entrar(f.usuario.trim(), f.clave); }
    catch (err) { setError(err.message); setOcupado(false); }
  };
  return (
    <div className="ingreso">
      <form className="ingreso-caja" onSubmit={enviar} noValidate>
        <svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true"><rect x="2" y="9" width="14" height="14" rx="3.5" className="mk-a" /><rect x="16" y="9" width="14" height="14" rx="3.5" className="mk-b" /><path d="M19.5 16.2l2.4 2.4 4.6-4.8" className="mk-c" /></svg>
        <h1>Traza Educativa</h1>
        <p className="sub">Gestión de instituciones, rutas y reintegros de la Secretaría de Educación de Medellín.</p>
        {(aviso || error) && <p className="msg-error" role="alert"><span aria-hidden="true">✕</span>{error || aviso}</p>}
        <Campo etiqueta="Usuario" requerido>{p => <input {...p} autoComplete="username" value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} autoFocus />}</Campo>
        <Campo etiqueta="Contraseña" requerido>{p => <input {...p} type="password" autoComplete="current-password" value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} />}</Campo>
        <button type="submit" className="btn pri ancho" disabled={ocupado}>{ocupado ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
