/* Componentes reutilizables de interfaz: estados de carga, errores, tablas, formularios y diálogos. */
import { useEffect, useId, useRef } from 'react';
import { ESTADOS_REINTEGRO } from '../config';
import { num } from '../formato';

export const Cargando = ({ texto = 'Cargando…' }) => <div className="cargando" role="status"><span className="giro" aria-hidden="true" />{texto}</div>;

export function MensajeError({ error, alReintentar }) {
  if (!error) return null;
  return (
    <div className="msg-error" role="alert">
      <span aria-hidden="true">✕</span>
      <div><b>{error.message || String(error)}</b>{alReintentar && <button type="button" className="btn sm" onClick={alReintentar}>Intentar de nuevo</button>}</div>
    </div>
  );
}

export const Vacio = ({ titulo, children }) => <div className="vacio"><b>{titulo}</b>{children && <p>{children}</p>}</div>;

export function Paginacion({ pagina, porPagina, total, alCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return <p className="pag-info">{num(total)} {total === 1 ? 'registro' : 'registros'}</p>;
  return (
    <nav className="paginacion" aria-label="Paginación">
      <button type="button" className="btn sm" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>← Anterior</button>
      <span>Página {num(pagina)} de {num(paginas)} · {num(total)} registros</span>
      <button type="button" className="btn sm" disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>Siguiente →</button>
    </nav>
  );
}

/** Tabla genérica. columnas: [{ k, t, render?(fila), clase? }] */
export function Tabla({ columnas, filas, alClic, claveFila = f => f.id, vacio = 'No hay registros con estos filtros.' }) {
  if (!filas.length) return <Vacio titulo={vacio} />;
  return (
    <div className="tabla-envoltura">
      <table>
        <thead><tr>{columnas.map(c => <th key={c.k} scope="col" className={c.clase}>{c.t}</th>)}</tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={claveFila(f)} className={alClic ? 'clic' : ''} onClick={alClic ? () => alClic(f) : undefined}
              tabIndex={alClic ? 0 : undefined} onKeyDown={alClic ? e => { if (e.key === 'Enter') alClic(f); } : undefined}>
              {columnas.map(c => <td key={c.k} className={c.clase}>{c.render ? c.render(f) : f[c.k] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Campo de formulario con etiqueta, ayuda y error asociados para lectores de pantalla. */
export function Campo({ etiqueta, error, ayuda, children, requerido, ancho }) {
  const id = useId();
  const hijo = typeof children === 'function' ? children({ id, 'aria-invalid': !!error, 'aria-describedby': error ? id + '-e' : ayuda ? id + '-a' : undefined }) : children;
  return (
    <div className={'campo' + (ancho ? ' ' + ancho : '') + (error ? ' con-error' : '')}>
      <label htmlFor={id}>{etiqueta}{requerido && <span className="req" aria-label="obligatorio"> *</span>}</label>
      {hijo}
      {ayuda && !error && <small id={id + '-a'}>{ayuda}</small>}
      {error && <small id={id + '-e'} className="err">{error}</small>}
    </div>
  );
}

export function Modal({ titulo, abierto, alCerrar, children, ancho = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog ref={ref} className={'modal ' + ancho} onCancel={e => { e.preventDefault(); alCerrar(); }} aria-labelledby="modal-titulo">
      {abierto && <>
        <header><h2 id="modal-titulo">{titulo}</h2><button type="button" className="cerrar" onClick={alCerrar} aria-label="Cerrar">×</button></header>
        <div className="modal-cuerpo">{children}</div>
      </>}
    </dialog>
  );
}

export function Confirmar({ abierto, titulo, texto, accion = 'Confirmar', peligro, alConfirmar, alCerrar, ocupado }) {
  return (
    <Modal titulo={titulo} abierto={abierto} alCerrar={alCerrar} ancho="sm">
      <p>{texto}</p>
      <div className="acciones">
        <button type="button" className="btn" onClick={alCerrar} disabled={ocupado}>Cancelar</button>
        <button type="button" className={'btn ' + (peligro ? 'peligro' : 'pri')} onClick={alConfirmar} disabled={ocupado}>{ocupado ? 'Procesando…' : accion}</button>
      </div>
    </Modal>
  );
}

export function EstadoReintegro({ estado }) {
  const e = ESTADOS_REINTEGRO[estado] || { t: estado, ic: '?', clase: 'neutro' };
  return <span className={'insignia ' + e.clase}><i aria-hidden="true">{e.ic}</i>{e.t}</span>;
}
export const EstadoInstitucion = ({ estado }) => (
  <span className={'insignia ' + (estado === 'activo' ? 'ok' : 'neutro')}><i aria-hidden="true">{estado === 'activo' ? '✓' : '–'}</i>{estado === 'activo' ? 'Activa' : 'Inactiva'}</span>
);

export function KPI({ titulo, valor, detalle, tono }) {
  return (
    <div className={'kpi' + (tono ? ' ' + tono : '')}>
      <span className="kpi-t">{titulo}</span>
      <span className="kpi-v">{valor}</span>
      {detalle && <span className="kpi-d">{detalle}</span>}
    </div>
  );
}

export const Encabezado = ({ antetitulo, titulo, children }) => (
  <div className="encabezado">
    <div>{antetitulo && <p className="antetitulo">{antetitulo}</p>}<h1>{titulo}</h1></div>
    {children && <div className="enc-acciones">{children}</div>}
  </div>
);
