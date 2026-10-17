/* Mapa interactivo (OpenStreetMap) con las instituciones, el visor de reintegros y rutas reales
   desde la Secretaría de Educación.
   - Rutas individuales: cada institución seleccionada tiene su propia ruta desde el origen común, con su color.
   - Recogida óptima: un solo recorrido que pasa por varias sedes con reintegros pendientes en el mejor orden. */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleMarker, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import { api, qs } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { COLORES_RUTA, MAX_RUTAS, urlApi } from '../config';
import { Cargando, MensajeError } from '../componentes/ui';
import { AjustarVista, MapaBase, iconoDestino, iconoSecretaria, useConfiguracion } from '../componentes/Mapa';
import { km, minutos, num } from '../formato';

const MAX_RECOGIDA = 12;
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
            {seleccionada ? 'Quitar de la ruta' : puedeAgregar ? 'Agregar a la ruta' : `Máximo ${MAX_RUTAS}`}
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
  const [sel, setSel] = useState(() => (params.get('destinos') || '').split(',').map(Number).filter(n => n > 0).slice(0, MAX_RUTAS));
  const [rutas, setRutas] = useState([]);
  const [visibles, setVisibles] = useState({});
  const [calculando, setCalculando] = useState(false);
  const [errorRutas, setErrorRutas] = useState(null);
  const [encuadre, setEncuadre] = useState(0);
  const [hover, setHover] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [sector, setSector] = useState('');
  const [mostrarSedes, setMostrarSedes] = useState('todas');
  const [selRec, setSelRec] = useState(null); // null = aún sin inicializar
  const [regreso, setRegreso] = useState(true);
  const [recogida, setRecogida] = useState(null);
  const [planificando, setPlanificando] = useState(false);
  const [errorRec, setErrorRec] = useState(null);
  const salirT = useRef(null);
  const autoCalculado = useRef(false);

  const lista = datos ? datos.datos : [];
  const porId = useMemo(() => new Map(lista.map(i => [i.id, i])), [lista]);
  const filtradas = useMemo(() => {
    const q = norm(buscar);
    return lista.filter(i => (!sector || i.sector === sector) && (mostrarSedes === 'todas' || (mostrarSedes === 'con' ? i.n_reintegros > 0 : i.n_pendientes > 0)) && (!q || norm(`${i.nombre} ${i.codigo} ${i.institucion || ''} ${i.barrio || ''} ${i.comuna || ''}`).includes(q)));
  }, [lista, buscar, sector, mostrarSedes]);
  const pendientes = useMemo(() => lista.filter(i => i.n_pendientes > 0).sort((a, b) => b.elementos_pendientes - a.elementos_pendientes || a.nombre.localeCompare(b.nombre)), [lista]);
  const totalPend = useMemo(() => pendientes.reduce((s, i) => s + Number(i.elementos_pendientes), 0), [pendientes]);
  // Por defecto se proponen las 8 sedes con más elementos pendientes
  useEffect(() => { if (selRec === null && datos) setSelRec(pendientes.slice(0, 8).map(i => i.id)); }, [datos, pendientes, selRec]);
  const marcarRec = id => setSelRec(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= MAX_RECOGIDA ? s : [...s, id]));
  const colorDe = id => { const k = sel.indexOf(id); return k >= 0 ? COLORES_RUTA[k % COLORES_RUTA.length] : null; };

  useEffect(() => { setParams(sel.length ? { destinos: sel.join(',') } : {}, { replace: true }); }, [sel, setParams]);

  const alternar = id => {
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= MAX_RUTAS ? s : [...s, id]));
  };
  const planificar = async () => {
    if (!selRec || !selRec.length) return;
    setPlanificando(true); setErrorRec(null); setRutas([]); setVisibles({}); setHover(null);
    try {
      const r = await api.get('/rutas/optima' + qs({ destinos: selRec, regreso: regreso ? 'si' : 'no' }));
      setRecogida(r); setEncuadre(k => k + 1);
    } catch (e) { setErrorRec(e); }
    finally { setPlanificando(false); }
  };
  const trazar = async (ids = sel) => {
    if (!ids.length) return;
    setCalculando(true); setErrorRutas(null); setRecogida(null);
    try {
      const r = await api.get('/rutas' + qs({ destinos: ids }));
      setRutas(r.rutas.map(x => ({ ...x, color: COLORES_RUTA[ids.indexOf(x.institucion_id) % COLORES_RUTA.length], numero: ids.indexOf(x.institucion_id) + 1 })));
      setVisibles(Object.fromEntries(r.rutas.map(x => [x.institucion_id, true])));
      setEncuadre(k => k + 1);
    } catch (e) { setErrorRutas(e); }
    finally { setCalculando(false); }
  };
  const limpiar = () => { setRutas([]); setVisibles({}); setSel([]); setErrorRutas(null); };

  // Si se llega con ?destinos=… (desde la ficha), se trazan de inmediato
  useEffect(() => { if (!autoCalculado.current && datos && config && sel.length) { autoCalculado.current = true; trazar(sel); } }, [datos, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostrar = (inst, e, fijo) => { clearTimeout(salirT.current); setHover(h => (h && h.fijo && !fijo ? h : { inst, x: e.containerPoint.x, y: e.containerPoint.y, fijo })); };
  const ocultar = () => { salirT.current = setTimeout(() => setHover(h => (h && h.fijo ? h : null)), 220); };

  const rutasOk = rutas.filter(r => r.ok && visibles[r.institucion_id]);
  const puntosEncuadre = useMemo(() => {
    if (!config) return [];
    const p = [[config.origen.latitud, config.origen.longitud]];
    const geos = rutasOk.map(r => r.geometria).concat(recogida ? [recogida.geometria] : []);
    for (const g of geos) { for (let k = 0; k < g.length; k += Math.max(1, Math.floor(g.length / 40))) p.push(g[k]); p.push(g[g.length - 1]); }
    return p;
  }, [rutasOk, config, recogida]);
  const totales = rutas.filter(r => r.ok);

  if (errorConfig) return <MensajeError error={errorConfig} />;
  return (
    <div className="mapa-rutas">
      <aside className="panel-rutas" aria-label="Selección de instituciones y rutas">
        <div className="pr-cabeza">
          <p className="antetitulo">Mapa y rutas</p>
          <h1>Rutas desde la Secretaría</h1>
          {config && <p className="origen"><span className="pin-mini" aria-hidden="true">SE</span><span><b>{config.origen.nombre}</b><small>{config.origen.direccion}</small></span></p>}
        </div>

        <section className="pr-bloque recogida">
          <div className="pr-fila"><h2>Recogida de reintegros</h2><span className="m">{num(pendientes.length)} sedes · {num(totalPend)} elementos pendientes</span></div>
          {datos && !pendientes.length && <p className="m">No hay reintegros pendientes con sede ubicada en el mapa. Registra o importa reintegros con estado “Pendiente”.</p>}
          {pendientes.length > 0 && selRec && (
            <>
              <p className="m">Elige hasta {MAX_RECOGIDA} sedes. Se calcula el recorrido que las visita todas en el orden más corto saliendo de la Secretaría.</p>
              <ul className="lista-inst lista-rec">
                {pendientes.slice(0, 40).map(i => { const m = selRec.includes(i.id); return (
                  <li key={i.id}><label className={m ? 'marcada' : ''}>
                    <input type="checkbox" checked={m} disabled={!m && selRec.length >= MAX_RECOGIDA} onChange={() => marcarRec(i.id)} />
                    <span><b>{i.nombre}</b><small>{num(i.n_pendientes)} pendientes · {num(i.elementos_pendientes)} elementos{i.comuna ? ' · ' + i.comuna : ''}</small></span>
                  </label></li>); })}
              </ul>
              <label className="interruptor"><input type="checkbox" checked={regreso} onChange={e => setRegreso(e.target.checked)} /><span>Regresar a la Secretaría al final</span></label>
              <div className="pr-acciones">
                <button type="button" className="btn pri" disabled={!selRec.length || planificando} onClick={planificar}>{planificando ? 'Calculando recorrido…' : `Planificar recogida óptima (${num(selRec.length)})`}</button>
                {recogida && <button type="button" className="btn" onClick={() => setRecogida(null)}>Quitar</button>}
              </div>
              <MensajeError error={errorRec} alReintentar={planificar} />
            </>
          )}
          {recogida && (
            <div className="resultado-rec" aria-live="polite">
              <p className="rec-total"><b>{km(recogida.distancia_m)}</b> · <b>{minutos(recogida.duracion_s)}</b> aprox. · {num(recogida.paradas.length)} paradas · {num(recogida.elementos)} elementos por recoger</p>
              <ol className="rutas paradas">
                <li><div className="ruta-cab"><span className="pin-mini" aria-hidden="true">SE</span><span className="ruta-nombre"><b>Salida: {recogida.origen.nombre}</b></span></div></li>
                {recogida.paradas.map(p => (
                  <li key={p.id}><div className="ruta-cab">
                    <span className="num-ruta" style={{ background: COLOR_RECOGIDA }}>{p.parada}</span>
                    <span className="ruta-nombre"><b>{p.nombre}</b><small>{km(p.llegada_distancia_m)} · {minutos(p.llegada_duracion_s)} desde la parada anterior · {num(p.elementos_pendientes)} elementos</small></span>
                  </div></li>
                ))}
                {recogida.regreso_tramo && <li><div className="ruta-cab"><span className="pin-mini" aria-hidden="true">SE</span><span className="ruta-nombre"><b>Regreso a la Secretaría</b><small>{km(recogida.regreso_tramo.distancia_m)} · {minutos(recogida.regreso_tramo.duracion_s)}</small></span></div></li>}
              </ol>
              {recogida.omitidas.length > 0 && <p className="m err">Sin incluir: {recogida.omitidas.map(o => `${o.nombre || '#' + o.institucion_id} (${o.motivo})`).join('; ')}</p>}
              <details><summary>Indicaciones ({num(recogida.pasos.length)})</summary>
                <ol className="pasos">{recogida.pasos.map((p, k) => <li key={k}><span>{p.instruccion}</span>{p.distancia_m > 0 && <small>{km(p.distancia_m)}</small>}</li>)}</ol>
              </details>
              <p className="m nota-fuente">Orden calculado con el servicio “trip” de OSRM (problema del viajante sobre la red vial de OpenStreetMap). Tiempos sin tráfico.</p>
            </div>
          )}
        </section>

        <section className="pr-bloque">
          <div className="pr-fila"><h2>Instituciones</h2><span className="m">{num(sel.length)} de {MAX_RUTAS} seleccionadas</span></div>
          {sel.length > 0 && (
            <ul className="chips-sel">
              {sel.map((id, k) => { const i = porId.get(id); return (
                <li key={id}><span className="num-ruta" style={{ background: COLORES_RUTA[k] }}>{k + 1}</span><span className="chip-nombre">{i ? i.nombre : `#${id}`}</span>
                  <button type="button" onClick={() => alternar(id)} aria-label={`Quitar ${i ? i.nombre : id}`}>×</button></li>); })}
            </ul>
          )}
          <div className="pr-acciones">
            <button type="button" className="btn pri" disabled={!sel.length || calculando} onClick={() => trazar()}>{calculando ? 'Calculando rutas…' : rutas.length ? 'Volver a calcular' : `Trazar ${sel.length > 1 ? sel.length + ' rutas' : 'ruta'}`}</button>
            <button type="button" className="btn" disabled={!sel.length && !rutas.length} onClick={limpiar}>Limpiar</button>
          </div>
          <MensajeError error={errorRutas} alReintentar={() => trazar()} />
          <div className="pr-filtros">
            <input type="search" placeholder="Buscar institución, código o barrio" value={buscar} onChange={e => setBuscar(e.target.value)} aria-label="Buscar institución" />
            <select value={sector} onChange={e => setSector(e.target.value)} aria-label="Sector"><option value="">Todos</option><option value="oficial">Oficiales</option><option value="no_oficial">No oficiales</option></select>
            <select value={mostrarSedes} onChange={e => setMostrarSedes(e.target.value)} aria-label="Mostrar sedes"><option value="todas">Todas las sedes</option><option value="con">Con reintegros</option><option value="pendientes">Con pendientes</option></select>
          </div>
          {cargando && !datos ? <Cargando /> : error ? <MensajeError error={error} alReintentar={recargar} /> : (
            <>
              <ul className="lista-inst">
                {filtradas.slice(0, 80).map(i => { const marcada = sel.includes(i.id); return (
                  <li key={i.id}>
                    <label className={marcada ? 'marcada' : ''}>
                      <input type="checkbox" checked={marcada} disabled={!marcada && sel.length >= MAX_RUTAS} onChange={() => alternar(i.id)} />
                      <span><b>{i.nombre}</b><small>{[i.codigo, i.barrio, i.comuna, i.n_reintegros > 0 ? `${num(i.n_reintegros)} reintegros` : null].filter(Boolean).join(' · ')}</small></span>
                    </label>
                  </li>); })}
              </ul>
              <p className="m">{filtradas.length > 80 ? `Se muestran 80 de ${num(filtradas.length)}. Escribe para afinar la búsqueda.` : `${num(filtradas.length)} instituciones con coordenadas.`}</p>
            </>
          )}
        </section>

        {rutas.length > 0 && (
          <section className="pr-bloque" aria-live="polite">
            <div className="pr-fila"><h2>Rutas calculadas</h2><button type="button" className="btn xs" onClick={() => setEncuadre(k => k + 1)}>Ajustar vista</button></div>
            {totales.length > 1 && <p className="m">{num(totales.length)} rutas · {km(totales.reduce((s, r) => s + r.distancia_m, 0))} en total</p>}
            <ol className="rutas">
              {rutas.map(r => (
                <li key={r.institucion_id} className={r.ok ? '' : 'con-error'}>
                  <div className="ruta-cab">
                    <span className="num-ruta" style={{ background: r.color }}>{r.numero}</span>
                    <span className="ruta-nombre"><b>{r.institucion ? r.institucion.nombre : `Institución #${r.institucion_id}`}</b>
                      {r.ok ? <small>{km(r.distancia_m)} · {minutos(r.duracion_s)} aprox.</small> : <small className="err">✕ {r.error}</small>}</span>
                    {r.ok && <label className="interruptor"><input type="checkbox" checked={!!visibles[r.institucion_id]} onChange={e => setVisibles(v => ({ ...v, [r.institucion_id]: e.target.checked }))} /><span>Visible</span></label>}
                  </div>
                  {r.ok && (
                    <details>
                      <summary>Indicaciones ({num(r.pasos.length)})</summary>
                      <ol className="pasos">{r.pasos.map((p, k) => <li key={k}><span>{p.instruccion}</span>{p.distancia_m > 0 && <small>{km(p.distancia_m)}</small>}</li>)}</ol>
                    </details>
                  )}
                </li>
              ))}
            </ol>
            <p className="m nota-fuente">Recorridos por la red vial de OpenStreetMap calculados con {config && config.rutas.servidor_publico ? 'el servidor público de OSRM (solo para demostración)' : 'OSRM'}. Tiempos sin tráfico.</p>
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
            {rutasOk.map(r => (
              <Fragment key={'r' + r.institucion_id}>
                <Polyline positions={r.geometria} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }} />
                <Polyline positions={r.geometria} pathOptions={{ color: r.color, weight: 5, opacity: 0.95 }}>
                  <Tooltip sticky>{r.numero}. {r.institucion.nombre} · {km(r.distancia_m)} · {minutos(r.duracion_s)}</Tooltip>
                </Polyline>
                <Marker position={r.geometria[r.geometria.length - 1]} icon={iconoDestino(r.numero, r.color)} zIndexOffset={500}>
                  <Tooltip permanent direction="right" className="etq-destino">{r.institucion.nombre}</Tooltip>
                </Marker>
              </Fragment>
            ))}
            {recogida && (
              <Fragment key="recogida">
                <Polyline positions={recogida.geometria} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }} />
                <Polyline positions={recogida.geometria} pathOptions={{ color: COLOR_RECOGIDA, weight: 5, opacity: 0.95 }}>
                  <Tooltip sticky>Recogida óptima · {km(recogida.distancia_m)} · {minutos(recogida.duracion_s)}</Tooltip>
                </Polyline>
                {recogida.paradas.map(p => (
                  <Marker key={'p' + p.id} position={[p.latitud, p.longitud]} icon={iconoDestino(p.parada, COLOR_RECOGIDA)} zIndexOffset={600}>
                    <Tooltip direction="right">{p.parada}. {p.nombre} · {num(p.elementos_pendientes)} elementos</Tooltip>
                  </Marker>
                ))}
              </Fragment>
            )}
            <Marker position={[config.origen.latitud, config.origen.longitud]} icon={iconoSecretaria} zIndexOffset={1000}>
              <Tooltip key={rutasOk.length > 0 || recogida ? 'fija' : 'hover'} direction="right" permanent={rutasOk.length > 0 || !!recogida} className="etq-origen">Inicio: {config.origen.nombre}</Tooltip>
            </Marker>
            <AjustarVista clave={encuadre} puntos={puntosEncuadre} relleno={50} />
          </MapaBase>
        )}
        {hover && <TarjetaInstitucion t={hover} seleccionada={sel.includes(hover.inst.id)} puedeAgregar={sel.length < MAX_RUTAS}
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
