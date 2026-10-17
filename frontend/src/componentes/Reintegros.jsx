/* Piezas compartidas por los módulos de reintegros e informes. */
import { useEffect, useId, useMemo, useState } from 'react';
import { useDatos } from '../api/useDatos';
import { ESTADOS_REINTEGRO } from '../config';

/** Selector de institución con búsqueda (lista de todas las instituciones registradas). */
export function SelectorInstitucion({ valor, alCambiar, id, permitirVacio = true, ...resto }) {
  const { datos } = useDatos('/instituciones/opciones');
  const lista = useMemo(() => (datos ? datos.datos : []), [datos]);
  const listaId = useId();
  const etiqueta = i => `${i.nombre} (${i.codigo})`;
  const actual = useMemo(() => lista.find(i => i.id === Number(valor)), [lista, valor]);
  const [texto, setTexto] = useState('');
  useEffect(() => { setTexto(actual ? etiqueta(actual) : ''); }, [actual]);
  const buscar = t => { const m = t.match(/\(([^()]+)\)\s*$/); return m && lista.find(i => i.codigo === m[1]); };
  const cambiar = t => {
    setTexto(t);
    const enc = buscar(t);
    if (enc) alCambiar(enc.id);
    else if (!t.trim() && permitirVacio) alCambiar('');
  };
  // Si se escribió antes de que terminara de cargar la lista, se resuelve al llegar
  useEffect(() => { if (lista.length && texto && !valor) { const enc = buscar(texto); if (enc) alCambiar(enc.id); } }, [lista]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <input id={id} list={listaId} value={texto} onChange={e => cambiar(e.target.value)} placeholder={datos ? 'Escribe para buscar…' : 'Cargando instituciones…'} autoComplete="off" {...resto} />
      <datalist id={listaId}>{lista.map(i => <option key={i.id} value={etiqueta(i)}>{i.municipio}{i.estado === 'inactivo' ? ' · inactiva' : ''}</option>)}</datalist>
    </>
  );
}

export const FILTROS_VACIOS = { desde: '', hasta: '', estado: [], institucion_id: '', municipio: '', categoria: '', articulo: '', q: '' };

/** Filtros de reintegros: los mismos en la consulta, las estadísticas y el Excel. */
export function FiltrosReintegros({ valor, alCambiar, alLimpiar }) {
  const { datos: op } = useDatos('/instituciones/filtros');
  const [q, setQ] = useState(valor.q);
  useEffect(() => { const t = setTimeout(() => { if (q !== valor.q) alCambiar({ ...valor, q }); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(valor.q); }, [valor.q]);
  const set = (k, v) => alCambiar({ ...valor, [k]: v });
  const alternarEstado = e => set('estado', valor.estado.includes(e) ? valor.estado.filter(x => x !== e) : [...valor.estado, e]);
  const errorFechas = valor.desde && valor.hasta && valor.desde > valor.hasta;
  return (
    <section className="tarjeta filtros" aria-label="Filtros de reintegros">
      <label className="filtro"><span>Fecha inicial</span><input type="date" value={valor.desde} max={valor.hasta || undefined} onChange={e => set('desde', e.target.value)} /></label>
      <label className="filtro"><span>Fecha final</span><input type="date" value={valor.hasta} min={valor.desde || undefined} onChange={e => set('hasta', e.target.value)} /></label>
      <div className="filtro ancho-2"><span id="et-inst">Institución</span><SelectorInstitucion aria-labelledby="et-inst" valor={valor.institucion_id} alCambiar={v => set('institucion_id', v)} /></div>
      <label className="filtro"><span>Municipio</span><select value={valor.municipio} onChange={e => set('municipio', e.target.value)}><option value="">Todos</option>{(op?.municipios || []).map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="filtro"><span>Categoría</span><select value={valor.categoria || ''} onChange={e => set('categoria', e.target.value)}><option value="">Todas</option><option value="mobiliario">Mobiliario</option><option value="electrico">Eléctrico</option></select></label>
      <label className="filtro ancho-2"><span>Buscar</span><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Código, placa, elemento o soporte" /></label>
      <fieldset className="filtro estados"><legend>Estado</legend>
        {Object.entries(ESTADOS_REINTEGRO).map(([k, e]) => (
          <label key={k} className={'chip-estado ' + e.clase + (valor.estado.includes(k) ? ' activo' : '')}>
            <input type="checkbox" checked={valor.estado.includes(k)} onChange={() => alternarEstado(k)} /><i aria-hidden="true">{e.ic}</i>{e.t}
          </label>
        ))}
      </fieldset>
      {valor.articulo && <span className="chip-filtro">Objeto: <b>{valor.articulo}</b><button type="button" onClick={() => set('articulo', '')} aria-label="Quitar filtro de objeto">×</button></span>}
      <button type="button" className="btn sm" onClick={alLimpiar}>Limpiar filtros</button>
      {errorFechas && <p className="err ancho-total" role="alert">La fecha inicial no puede ser posterior a la final.</p>}
    </section>
  );
}
