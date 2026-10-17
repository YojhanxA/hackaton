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

function SelectorInstitucionConReintegros({ institucionId, institucionTexto, alCambiar }) {
  const { datos } = useDatos('/informes/instituciones');
  const lista = useMemo(() => (datos ? datos.datos : []), [datos]);
  const listaId = useId();
  const opcion = useMemo(() => {
    if (!institucionId && !institucionTexto) return null;
    return lista.find(i => institucionId
      ? Number(i.id) === Number(institucionId)
      : !i.id && i.nombre === institucionTexto);
  }, [lista, institucionId, institucionTexto]);
  const [texto, setTexto] = useState('');
  const etiqueta = i => i.codigo ? `${i.nombre} (${i.codigo})` : i.nombre;
  const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  useEffect(() => { setTexto(opcion ? etiqueta(opcion) : ''); }, [opcion]);
  const cambiar = t => {
    setTexto(t);
    const valor = normalizar(t);
    const candidatas = lista.filter(i => normalizar(etiqueta(i)) === valor || normalizar(i.nombre) === valor);
    const encontrado = candidatas.length === 1 ? candidatas[0] : null;
    if (encontrado) alCambiar(encontrado.id ? { id: encontrado.id, texto: '' } : { id: '', texto: encontrado.nombre });
    else alCambiar({ id: '', texto: '' });
  };
  return (
    <>
      <input list={listaId} value={texto} onChange={e => cambiar(e.target.value)} placeholder={datos ? 'Busca una institución con reintegros…' : 'Cargando instituciones…'} autoComplete="off" />
      <datalist id={listaId}>{lista.map((i, n) => <option key={`${i.id || i.nombre}-${n}`} value={etiqueta(i)}>{i.municipio || `${i.registros} registros · ${i.elementos} elementos`}</option>)}</datalist>
    </>
  );
}

function DesplegableInstitucionesConReintegros({ institucionId, institucionTexto, alCambiar }) {
  const { datos, cargando, error } = useDatos('/informes/instituciones');
  const lista = useMemo(() => (datos ? datos.datos : []), [datos]);
  const valorActual = institucionId
    ? `id:${institucionId}`
    : institucionTexto ? `texto:${institucionTexto}` : '';
  const cambiar = valor => {
    if (valor.startsWith('id:')) alCambiar({ id: valor.slice(3), texto: '' });
    else if (valor.startsWith('texto:')) alCambiar({ id: '', texto: valor.slice(6) });
    else alCambiar({ id: '', texto: '' });
  };
  return (
    <>
      <select value={valorActual} onChange={e => cambiar(e.target.value)} disabled={cargando || !!error}>
        <option value="">{cargando ? 'Cargando instituciones…' : error ? 'No se pudieron cargar' : 'Todas las instituciones'}</option>
        {lista.map((i, n) => {
          const value = i.id ? `id:${i.id}` : `texto:${i.nombre}`;
          const detalle = `${Number(i.registros).toLocaleString('es-CO')} reintegros · ${Number(i.elementos).toLocaleString('es-CO')} elementos`;
          return <option key={`${value}:${n}`} value={value}>{i.nombre}{i.codigo ? ` (${i.codigo})` : ''} · {detalle}</option>;
        })}
      </select>
      {error && <small className="err" role="alert">Error al cargar las instituciones con reintegros.</small>}
    </>
  );
}

export const FILTROS_VACIOS = { desde: '', hasta: '', estado: [], institucion_id: '', institucion_texto: '', municipio: '', categoria: '', articulo: '', q: '' };

/** Filtros de reintegros: los mismos en la consulta, las estadísticas y el Excel. */
export function FiltrosReintegros({ valor, alCambiar, alLimpiar, usarDesplegableReintegros = false }) {
  const { datos: op } = useDatos('/instituciones/filtros');
  const [q, setQ] = useState(valor.q);
  useEffect(() => { const t = setTimeout(() => { if (q !== valor.q) alCambiar({ ...valor, q }); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(valor.q); }, [valor.q]);
  const set = (k, v) => alCambiar({ ...valor, [k]: v });
  const setInstitucion = i => alCambiar({ ...valor, institucion_id: i.id, institucion_texto: i.texto });
  const alternarEstado = e => set('estado', valor.estado.includes(e) ? valor.estado.filter(x => x !== e) : [...valor.estado, e]);
  const errorFechas = valor.desde && valor.hasta && valor.desde > valor.hasta;
  return (
    <section className="tarjeta filtros" aria-label="Filtros de reintegros">
      <label className="filtro"><span>Fecha inicial</span><input type="date" value={valor.desde} max={valor.hasta || undefined} onChange={e => set('desde', e.target.value)} /></label>
      <label className="filtro"><span>Fecha final</span><input type="date" value={valor.hasta} min={valor.desde || undefined} onChange={e => set('hasta', e.target.value)} /></label>
      <div className="filtro ancho-2"><span id="et-inst">Institución</span>{usarDesplegableReintegros
        ? <DesplegableInstitucionesConReintegros institucionId={valor.institucion_id} institucionTexto={valor.institucion_texto} alCambiar={setInstitucion} />
        : <SelectorInstitucionConReintegros institucionId={valor.institucion_id} institucionTexto={valor.institucion_texto} alCambiar={setInstitucion} />}</div>
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
