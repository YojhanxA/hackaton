/* Mapa interactivo (OpenStreetMap) con instituciones y un recorrido de varias paradas
   desde la Secretaría de Educación. */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleMarker, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import { api, qs } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { urlApi } from '../config';
import { Cargando, MensajeError } from '../componentes/ui';
import { AjustarVista, MapaBase, iconoDestino, iconoSecretaria, useConfiguracion } from '../componentes/Mapa';
import { km, minutos, num } from '../formato';

const MAX_INSTITUCIONES_RUTA = 12;
const COLOR_RECOGIDA = '#1f3a5f';
const radio = i => (i.n_reintegros > 0 ? 5 + Math.min(10, Math.sqrt(i.n_reintegros) * 1.7) : 4);
const relleno = i => (i.n_pendientes > 0 ? '#e09c00' : i.n_reintegros > 0 ? '#5a43c9' : i.sector === 'oficial' ? '#334155' : '#94a3b8');

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tarjeta flotante con la foto y los datos de la institución (cursor encima o toque en pantallas táctiles). */
function TarjetaInstitucion({ t, seleccionada, puedeAgregar, alAlternar, alEntrar, alSalir, alCerrar }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: t.x + 14, top: t.y + 14 });
  useEffect(() => {
    const el = ref.current, caja = el && el.parentElement.getBoundingClientRect();
    if (!el || !caja) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = t.x + 14, top = t.y + 14;
    if (left + w > caja.width - 8) left = t.x - w - 14;
    if (top + h > caja.height - 8) top = Math.max(8, t.y - h - 14);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [t.x, t.y, t.inst.id]);
  const i = t.inst;
  const lugar = i.direccion || [i.barrio, i.comuna].filter(Boolean).join(', ') || 'Sin dirección registrada';
  return (
    <div ref={ref} className="tarjeta-flotante" style={pos} onMouseEnter={alEntrar} onMouseLeave={alSalir} role="dialog" aria-label={i.nombre}>
      {t.fijo && <button type="button" className="cerrar" onClick={alCerrar} aria-label="Cerrar">×</button>}
      {i.imagen_principal
        ? <img src={urlApi(i.imagen_principal)} alt={`Fotografía de ${i.nombre}`} loading="eager" decoding="async" />
        : <div className="sin-foto" role="img" aria-label="Sin imagen registrada"><span aria-hidden="true">▧</span>Sin imagen registrada</div>}
      <div className="tf-cuerpo">
        <b>{i.nombre}</b>
        {i.institucion && <small>{i.institucion}</small>}
        <span>{lugar}</span>
        <span className="m">{i.municipio}, {i.departamento}{i.n_imagenes > 1 ? ` · ${num(i.n_imagenes)} fotos` : ''}</span>
        <span className="tf-rein">{i.n_reintegros > 0
          ? <><b>{num(i.n_reintegros)}</b> reintegros · <b>{num(i.elementos)}</b> elementos ({num(i.mobiliario)} mobiliario, {num(i.electrico)} eléctrico){i.n_pendientes > 0 && <><br /><span className="tf-pend">{num(i.n_pendientes)} pendientes por recoger · {num(i.elementos_pendientes)} elementos</span></>}</>
          : 'Sin reintegros registrados'}</span>
        <div className="tf-acciones">
          <Link to={'/instituciones/' + i.id} className="btn xs">Ver ficha completa</Link>
          {i.n_reintegros > 0 && <Link to={'/reintegros?institucion_id=' + i.id} className="btn xs">Ver reintegros</Link>}
          <button type="button" className={'btn xs' + (seleccionada ? '' : ' pri')} onClick={alAlternar} disabled={!seleccionada && !puedeAgregar}>
            {seleccionada ? 'Quitar de la ruta' : puedeAgregar ? 'Agregar a la ruta' : `Máximo ${MAX_INSTITUCIONES_RUTA}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventosMapa({ alMover }) { useMapEvents({ movestart: alMover, zoomstart: alMover }); return null; }

export default function MapaRutas() {
  const { config, error: errorConfig } = useConfiguracion();
  const { datos, cargando, error, recargar } = useDatos('/instituciones/mapa');
  const [params, setParams] = useSearchParams();
  const [sel, setSel] = useState(() => (params.get('destinos') || '').split(',').map(Number).filter(n => n > 0).slice(0, MAX_INSTITUCIONES_RUTA));
  const [encuadre, setEncuadre] = useState(0);
  const [hover, setHover] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [sector, setSector] = useState('');
  const [mostrarSedes, setMostrarSedes] = useState('todas');
  const [orden, setOrden] = useState('nombre');
  const [regreso, setRegreso] = useState(true);
  const [recogida, setRecogida] = useState(null);
  const [planificando, setPlanificando] = useState(false);
  const [errorRec, setErrorRec] = useState(null);
  const salirT = useRef(null);
  const autoCalculado = useRef(false);
  const solicitudRecorrido = useRef(0);

  const lista = datos ? datos.datos : [];
  const porId = useMemo(() => new Map(lista.map(i => [i.id, i])), [lista]);
  const filtradas = useMemo(() => {
    const q = norm(buscar);
    return lista.filter(i => (!sector || i.sector === sector) && (mostrarSedes === 'todas' || (mostrarSedes === 'con' ? i.n_reintegros > 0 : i.n_pendientes > 0)) && (!q || norm(`${i.nombre} ${i.codigo} ${i.institucion || ''} ${i.barrio || ''} ${i.comuna || ''}`).includes(q)))
      .sort((a, b) => orden === 'nombre'
        ? a.nombre.localeCompare(b.nombre)
        : Number(b[orden] || 0) - Number(a[orden] || 0) || a.nombre.localeCompare(b.nombre));
  }, [lista, buscar, sector, mostrarSedes, orden]);
  const pendientes = useMemo(() => lista.filter(i => i.n_pendientes > 0).sort((a, b) => b.elementos_pendientes - a.elementos_pendientes || a.nombre.localeCompare(b.nombre)), [lista]);
  const totalPend = useMemo(() => pendientes.reduce((s, i) => s + Number(i.elementos_pendientes), 0), [pendientes]);
  const colorDe = id => sel.includes(id) ? COLOR_RECOGIDA : null;

  useEffect(() => { setParams(sel.length ? { destinos: sel.join(',') } : {}, { replace: true }); }, [sel, setParams]);

  const alternar = id => {
    solicitudRecorrido.current += 1;
    setPlanificando(false);
    setRecogida(null);
    setErrorRec(null);
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= MAX_INSTITUCIONES_RUTA ? s : [...s, id]));
  };
  const planificar = async () => {
    if (!sel.length) return;
    const solicitud = ++solicitudRecorrido.current;
    const destinos = [...sel];
    setPlanificando(true); setErrorRec(null); setRecogida(null); setHover(null);
    try {
      const r = await api.get('/rutas/optima' + qs({ destinos, regreso: regreso ? 'si' : 'no' }));
      if (solicitudRecorrido.current === solicitud) { setRecogida(r); setEncuadre(k => k + 1); }
    } catch (e) { if (solicitudRecorrido.current === solicitud) setErrorRec(e); }
    finally { if (solicitudRecorrido.current === solicitud) setPlanificando(false); }
  };
  const limpiar = () => { solicitudRecorrido.current += 1; setPlanificando(false); setSel([]); setRecogida(null); setErrorRec(null); };

  // Si se llega con ?destinos=… (desde la ficha), se calcula el recorrido óptimo de inmediato.
  useEffect(() => { if (!autoCalculado.current && datos && config && sel.length) { autoCalculado.current = true; planificar(); } }, [datos, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostrar = (inst, e, fijo) => { clearTimeout(salirT.current); setHover(h => (h && h.fijo && !fijo ? h : { inst, x: e.containerPoint.x, y: e.containerPoint.y, fijo })); };
  const ocultar = () => { salirT.current = setTimeout(() => setHover(h => (h && h.fijo ? h : null)), 220); };

  const puntosEncuadre = useMemo(() => {
    if (!config) return [];
    const p = [[config.origen.latitud, config.origen.longitud]];
    const geos = recogida ? [recogida.geometria] : [];
    for (const g of geos) { for (let k = 0; k < g.length; k += Math.max(1, Math.floor(g.length / 40))) p.push(g[k]); p.push(g[g.length - 1]); }
    return p;
  }, [config, recogida]);

  if (errorConfig) return <MensajeError error={errorConfig} />;
  return (
    <div className="mapa-rutas">
      <aside className="panel-rutas" aria-label="Selección de instituciones y rutas">
        <div className="pr-cabeza">
          <p className="antetitulo">Mapa y rutas</p>
          <h1>Rutas desde la Secretaría</h1>
          {config && <p className="origen"><span className="pin-mini" aria-hidden="true">SE</span><span><b>{config.origen.nombre}</b><small>{config.origen.direccion}</small></span></p>}
        </div>

        <section className="pr-bloque">
          <div className="pr-fila"><h2>Instituciones</h2><span className="m">{num(sel.length)} de {MAX_INSTITUCIONES_RUTA} seleccionadas</span></div>
          <p className="m">{num(pendientes.length)} sedes con pendientes · {num(totalPend)} elementos pendientes en el mapa.</p>
          {datos && !pendientes.length && <p className="m">No hay reintegros pendientes en las sedes ubicadas. Puedes seleccionar cualquier institución para incluirla en el recorrido.</p>}
          {sel.length > 0 && (
            <ul className="chips-sel">
              {sel.map((id, k) => { const i = porId.get(id); return (
                <li key={id}><span className="num-ruta" style={{ background: COLOR_RECOGIDA }}>{k + 1}</span><span className="chip-nombre">{i ? i.nombre : `#${id}`}</span>
                  <button type="button" onClick={() => alternar(id)} aria-label={`Quitar ${i ? i.nombre : id}`}>×</button></li>); })}
            </ul>
          )}
          <p className="m">Selecciona hasta {MAX_INSTITUCIONES_RUTA} sedes, tengan o no reintegros pendientes. Se ordenarán en un solo recorrido.</p>
          <div className="pr-acciones">
            <button type="button" className="btn pri" disabled={!sel.length || planificando} onClick={planificar}>{planificando ? 'Calculando recorrido…' : recogida ? 'Volver a calcular recorrido' : `Calcular recorrido óptimo (${num(sel.length)})`}</button>
            <button type="button" className="btn" disabled={!sel.length && !recogida} onClick={limpiar}>Limpiar</button>
          </div>
          <label className="interruptor"><input type="checkbox" checked={regreso} onChange={e => { setRegreso(e.target.checked); setRecogida(null); }} /><span>Regresar a la Secretaría al final</span></label>
          <MensajeError error={errorRec} alReintentar={planificar} />
          <div className="pr-filtros">
            <input type="search" placeholder="Buscar institución, código o barrio" value={buscar} onChange={e => setBuscar(e.target.value)} aria-label="Buscar institución" />
            <select value={sector} onChange={e => setSector(e.target.value)} aria-label="Sector"><option value="">Todos</option><option value="oficial">Oficiales</option><option value="no_oficial">No oficiales</option></select>
            <select value={mostrarSedes} onChange={e => setMostrarSedes(e.target.value)} aria-label="Mostrar sedes"><option value="todas">Todas las sedes</option><option value="con">Con reintegros</option><option value="pendientes">Con pendientes</option></select>
            <select value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar instituciones">
              <option value="nombre">Ordenar: nombre</option><option value="elementos">Ordenar: total elementos</option><option value="mobiliario">Ordenar: mobiliario</option><option value="electrico">Ordenar: eléctricos</option>
            </select>
          </div>
          {cargando && !datos ? <Cargando /> : error ? <MensajeError error={error} alReintentar={recargar} /> : (
            <>
              <ul className="lista-inst">
                {filtradas.slice(0, 80).map(i => { const marcada = sel.includes(i.id); return (
                  <li key={i.id}>
                    <label className={marcada ? 'marcada' : ''}>
                      <input type="checkbox" checked={marcada} disabled={!marcada && sel.length >= MAX_INSTITUCIONES_RUTA} onChange={() => alternar(i.id)} />
                      <span><b>{i.nombre}</b><small>{[i.codigo, i.barrio, i.comuna, `${num(i.elementos)} elementos`, `${num(i.mobiliario)} mobiliario`, `${num(i.electrico)} eléctricos`, i.n_pendientes > 0 ? `${num(i.elementos_pendientes)} pendientes` : null].filter(Boolean).join(' · ')}</small></span>
                    </label>
                  </li>); })}
              </ul>
              <p className="m">{filtradas.length > 80 ? `Se muestran 80 de ${num(filtradas.length)}. Escribe para afinar la búsqueda.` : `${num(filtradas.length)} instituciones con coordenadas.`}</p>
            </>
          )}
        </section>

        {recogida && (
          <section className="pr-bloque" aria-live="polite">
            <div className="pr-fila"><h2>Recorrido calculado</h2><button type="button" className="btn xs" onClick={() => setEncuadre(k => k + 1)}>Ajustar vista</button></div>
            <p className="rec-total"><b>{km(recogida.distancia_m)}</b> · <b>{minutos(recogida.duracion_s)}</b> aprox. · {num(recogida.paradas.length)} paradas · {num(recogida.elementos)} elementos pendientes en la ruta</p>
            <ol className="rutas paradas">
              <li><div className="ruta-cab"><span className="pin-mini" aria-hidden="true">SE</span><span className="ruta-nombre"><b>Salida: {recogida.origen.nombre}</b></span></div></li>
              {recogida.paradas.map(p => (
                <li key={p.id}><div className="ruta-cab">
                  <span className="num-ruta" style={{ background: COLOR_RECOGIDA }}>{p.parada}</span>
                  <span className="ruta-nombre"><b>{p.nombre}</b><small>{km(p.llegada_distancia_m)} · {minutos(p.llegada_duracion_s)} desde la parada anterior · {num(p.elementos_pendientes)} elementos pendientes</small></span>
                </div></li>
              ))}
              {recogida.regreso_tramo && <li><div className="ruta-cab"><span className="pin-mini" aria-hidden="true">SE</span><span className="ruta-nombre"><b>Regreso a la Secretaría</b><small>{km(recogida.regreso_tramo.distancia_m)} · {minutos(recogida.regreso_tramo.duracion_s)}</small></span></div></li>}
            </ol>
            {recogida.omitidas.length > 0 && <p className="m err">No fue posible incluir: {recogida.omitidas.map(o => `${o.nombre || '#' + o.institucion_id} (${o.motivo})`).join('; ')}</p>}
            <details><summary>Indicaciones ({num(recogida.pasos.length)})</summary>
              <ol className="pasos">{recogida.pasos.map((p, k) => <li key={k}><span>{p.instruccion}</span>{p.distancia_m > 0 && <small>{km(p.distancia_m)}</small>}</li>)}</ol>
            </details>
            <p className="m nota-fuente">OSRM ordena las paradas para reducir el recorrido por la red vial de OpenStreetMap; es una aproximación y no garantiza un óptimo matemático global. Tiempos sin tráfico.</p>
          </section>
        )}
      </aside>

      <div className="mapa-caja" onMouseLeave={() => !hover?.fijo && setHover(null)}>
        {config && (
          <MapaBase centro={[config.origen.latitud, config.origen.longitud]} zoom={13}>
            <EventosMapa alMover={() => setHover(h => (h ? null : h))} />
            {lista.filter(i => mostrarSedes === 'todas' || (mostrarSedes === 'con' ? i.n_reintegros > 0 : i.n_pendientes > 0)).map(i => {
              const c = colorDe(i.id);
              return (
                <CircleMarker key={i.id} center={[i.latitud, i.longitud]} radius={c ? Math.max(8, radio(i)) : radio(i)}
                  pathOptions={{ color: '#ffffff', weight: c ? 2.5 : 1.2, fillColor: c || relleno(i), fillOpacity: 0.92 }}
                  eventHandlers={{ mouseover: e => mostrar(i, e, false), mouseout: ocultar, click: e => mostrar(i, e, true) }} />
              );
            })}
            {recogida && (
              <Fragment key="recogida">
                <Polyline positions={recogida.geometria} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }} />
                <Polyline positions={recogida.geometria} pathOptions={{ color: COLOR_RECOGIDA, weight: 5, opacity: 0.95 }}>
                  <Tooltip sticky>Recogida óptima · {km(recogida.distancia_m)} · {minutos(recogida.duracion_s)}</Tooltip>
                </Polyline>
                {recogida.paradas.map(p => (
                  <Marker key={'p' + p.id} position={[p.latitud, p.longitud]} icon={iconoDestino(p.parada, COLOR_RECOGIDA)} zIndexOffset={600}
                    eventHandlers={{ mouseover: e => { const i = porId.get(Number(p.id)) || porId.get(p.id); if (i) mostrar(i, e, false); }, mouseout: ocultar, click: e => { const i = porId.get(Number(p.id)) || porId.get(p.id); if (i) mostrar(i, e, true); } }}>
                    <Tooltip direction="right">{p.parada}. {p.nombre} · {num(p.elementos_pendientes)} elementos</Tooltip>
                  </Marker>
                ))}
              </Fragment>
            )}
            <Marker position={[config.origen.latitud, config.origen.longitud]} icon={iconoSecretaria} zIndexOffset={1000}>
              <Tooltip key={recogida ? 'fija' : 'hover'} direction="right" permanent={!!recogida} className="etq-origen">Inicio: {config.origen.nombre}</Tooltip>
            </Marker>
            <AjustarVista clave={encuadre} puntos={puntosEncuadre} relleno={50} />
          </MapaBase>
        )}
        {hover && <TarjetaInstitucion t={hover} seleccionada={sel.includes(hover.inst.id)} puedeAgregar={sel.length < MAX_INSTITUCIONES_RUTA}
          alAlternar={() => alternar(hover.inst.id)} alEntrar={() => clearTimeout(salirT.current)} alSalir={ocultar} alCerrar={() => setHover(null)} />}
        <div className="leyenda-mapa" aria-label="Leyenda">
          <span><i className="pin-mini" aria-hidden="true">SE</i>Secretaría (origen)</span>
          <span><i className="pt" style={{ background: '#334155' }} />Sede oficial</span>
          <span><i className="pt" style={{ background: '#94a3b8' }} />No oficial</span>
          <span><i className="pt" style={{ background: '#5a43c9' }} />Con reintegros</span>
          <span><i className="pt" style={{ background: '#e09c00' }} />Con pendientes por recoger</span>
          <span className="m">Tamaño = cantidad de reintegros</span>
          <span><i className="pt sel" />Seleccionada</span>
        </div>
      </div>
    </div>
  );
}
