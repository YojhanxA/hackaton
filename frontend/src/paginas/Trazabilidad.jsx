import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { useAvisos } from '../contexto/Avisos';
import { useSesion } from '../contexto/Sesion';
import { Cargando, Encabezado, MensajeError, Paginacion } from '../componentes/ui';
import * as BC from '../blockchain/contrato';
import { corto, fechaHora, num } from '../formato';

const ENTIDADES = { '': 'Todas', institucion: 'Instituciones', reintegro: 'Reintegros', configuracion: 'Configuración', usuario: 'Usuarios', anclaje: 'Anclajes' };

function Verificacion({ v, cargando, alVerificar }) {
  if (!v) return <Cargando texto="Verificando la cadena…" />;
  return (
    <div className={'estado-cadena ' + (v.ok ? 'ok' : 'crit')}>
      <i aria-hidden="true">{v.ok ? '✓' : '✕'}</i>
      <div>
        <b>{v.ok ? 'La bitácora está íntegra' : 'La bitácora fue alterada'}</b>
        <p>{v.ok ? `Se recalcularon las huellas de ${num(v.total)} eventos en ${num(v.ms)} ms: cada uno coincide con su contenido y con el anterior.`
          : `${num(v.n_errores)} problemas encontrados. Un evento cambió después de registrarse, o falta en la secuencia.`}</p>
        {!v.ok && <ul className="errores-cadena">{v.errores.slice(0, 6).map((e, k) => <li key={k}>Evento #{e.n}: {e.mensaje}</li>)}</ul>}
        <p className="m">Raíz Merkle del historial: <code className="hash">{corto(v.raiz)}</code></p>
      </div>
      <button type="button" className="btn" onClick={alVerificar} disabled={cargando}>{cargando ? 'Verificando…' : 'Verificar ahora'}</button>
    </div>
  );
}

function Anclaje({ verificacion, alAnclar }) {
  const avisar = useAvisos();
  const { puede } = useSesion();
  const { datos: lista, recargar } = useDatos('/auditoria/anclajes');
  const [cuenta, setCuenta] = useState(null);
  const [autorizada, setAutorizada] = useState(null);
  const [dir, setDir] = useState(BC.direccionContrato());
  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [enRed, setEnRed] = useState({});

  useEffect(() => {
    const w = BC.billetera(); if (!w) return;
    w.request({ method: 'eth_accounts' }).then(a => a[0] && setCuenta(a[0])).catch(() => {});
    const cambio = a => setCuenta(a[0] || null);
    w.on && w.on('accountsChanged', cambio);
    return () => w.removeListener && w.removeListener('accountsChanged', cambio);
  }, []);
  useEffect(() => { if (cuenta && dir) BC.contrato.autorizado(cuenta).then(setAutorizada).catch(() => setAutorizada(null)); }, [cuenta, dir]);
  // Comprueba en la red cada anclaje registrado
  useEffect(() => {
    if (!lista || !dir) return;
    let vivo = true;
    (async () => {
      for (const a of lista.datos) {
        try { const c = await BC.contrato.consultar(a.raiz); if (vivo) setEnRed(x => ({ ...x, [a.id]: c.cuando ? { ok: true, cuando: c.cuando } : { ok: false } })); }
        catch (e) { if (vivo) setEnRed(x => ({ ...x, [a.id]: { error: BC.mensajeError(e) } })); }
      }
    })();
    return () => { vivo = false; };
  }, [lista, dir]);

  const ejecutar = async (fn) => { setOcupado(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ t: BC.mensajeError(e), err: true }); } finally { setOcupado(false); } };
  const conectar = () => ejecutar(async () => { setCuenta(await BC.conectar()); setMsg({ t: `Cuenta conectada en ${BC.RED.nombre}.` }); });
  const desplegar = () => ejecutar(async () => {
    setMsg({ t: 'Confirma el despliegue en MetaMask…' });
    const r = await BC.desplegar(cuenta); setDir(r.direccion); setAutorizada(true);
    setMsg({ t: <>Contrato desplegado en <code className="hash">{r.direccion}</code>. Ponlo en <code>VITE_CONTRATO</code> para que todos lo usen. <a href={BC.enlaces.tx(r.hash)} target="_blank" rel="noopener noreferrer">Ver transacción</a></> });
  });
  const usarManual = () => { if (!BC.esDireccion(manual)) return setMsg({ t: 'La dirección debe tener el formato 0x seguido de 40 caracteres.', err: true }); BC.guardarDireccion(manual); setDir(manual); setManual(''); };
  const anclar = () => ejecutar(async () => {
    if (!verificacion || !verificacion.ok) throw new Error('La bitácora no está íntegra: no se puede anclar un historial alterado.');
    let c = cuenta; if (!c) { c = await BC.conectar(); setCuenta(c); }
    const n = verificacion.total, raiz = verificacion.raiz;
    const previo = await BC.contrato.consultar(raiz);
    if (previo.cuando) { setMsg({ t: `Este historial (${num(n)} eventos) ya estaba anclado (${fechaHora(previo.cuando * 1000)}).` }); return; }
    if (!(await BC.contrato.autorizado(c))) throw new Error('Esta cuenta no está autorizada para anclar. El propietario del contrato debe autorizarla.');
    const hash = await BC.anclar(c, raiz, n, (paso, h) => setMsg({ t: paso === 'firmar' ? 'Confirma la transacción en MetaMask…' : <>Transacción enviada. Esperando confirmación… <a href={BC.enlaces.tx(h)} target="_blank" rel="noopener noreferrer">Ver</a></> }));
    await api.post('/auditoria/anclajes', { n_eventos: n, raiz, red: BC.RED.nombre, chain_id: BC.RED.chainId, contrato: dir, tx_hash: hash, cuenta: c });
    setMsg({ t: <>Huella de {num(n)} eventos anclada en {BC.RED.nombre}. <a href={BC.enlaces.tx(hash)} target="_blank" rel="noopener noreferrer">Ver transacción</a></> });
    avisar('Bitácora anclada en blockchain.'); recargar(); alAnclar();
  });

  const archivo = typeof location !== 'undefined' && location.protocol === 'file:';
  return (
    <section className="tarjeta">
      <div className="tarjeta-h"><h2>Anclaje en blockchain <span className="insignia ok">{BC.RED.tipo}</span></h2></div>
      <p className="m">La huella del historial se publica en el contrato inteligente <code>TrazaAnclaje</code> de {BC.RED.nombre}. Una vez publicada nadie puede cambiarla: si alguien altera la base de datos, la huella deja de coincidir.</p>
      <dl className="datos cuatro">
        <div><dt>Red</dt><dd>{BC.RED.nombre}</dd></div>
        <div><dt>Contrato</dt><dd>{dir ? <a href={BC.enlaces.direccion(dir)} target="_blank" rel="noopener noreferrer"><code className="hash">{corto(dir)}</code></a> : 'Sin configurar'}</dd></div>
        <div><dt>Tu cuenta</dt><dd>{cuenta ? <><code className="hash">{corto(cuenta)}</code><small>{autorizada == null ? '' : autorizada ? 'Autorizada para anclar' : 'No autorizada'}</small></> : 'Sin conectar'}</dd></div>
        <div><dt>Eventos a anclar</dt><dd>{verificacion ? num(verificacion.total) : '—'}</dd></div>
      </dl>
      {archivo && <p className="nota">MetaMask no funciona en páginas abiertas como archivo. Usa el servidor de la aplicación.</p>}
      {!BC.billetera() && !archivo && <p className="nota">No se detectó MetaMask en este navegador: puedes consultar los anclajes, pero no crear nuevos.</p>}
      {!dir && (
        <div className="nota">
          <p><b>Falta el contrato.</b> Despliégalo en Remix (ver LEEME) o con el botón “Desplegar contrato”, y configura <code>VITE_CONTRATO</code>. También puedes usar uno ya desplegado:</p>
          <div className="en-linea"><input value={manual} onChange={e => setManual(e.target.value)} placeholder="0x…" aria-label="Dirección del contrato" /><button type="button" className="btn sm" onClick={usarManual}>Usar esta dirección</button></div>
        </div>
      )}
      <div className="acciones izq">
        {BC.billetera() && !cuenta && <button type="button" className="btn" onClick={conectar} disabled={ocupado}>Conectar MetaMask</button>}
        {BC.billetera() && cuenta && !dir && puede('admin') && <button type="button" className="btn pri" onClick={desplegar} disabled={ocupado}>Desplegar contrato</button>}
        {dir && puede('editor') && <button type="button" className="btn pri" onClick={anclar} disabled={ocupado || !BC.billetera() || !verificacion}>Anclar historial actual ({verificacion ? num(verificacion.total) : '…'} eventos)</button>}
      </div>
      {msg && <p className={'bc-msg' + (msg.err ? ' err' : '')} role="status">{msg.t}</p>}
      <h3 className="h3">Anclajes registrados</h3>
      {!lista ? <Cargando /> : !lista.datos.length ? <p className="vacio">Aún no hay anclajes.</p> : (
        <div className="tabla-envoltura"><table>
          <thead><tr><th scope="col">Eventos</th><th scope="col">Huella</th><th scope="col">Fecha</th><th scope="col">Base de datos</th><th scope="col">En la red</th><th scope="col"></th></tr></thead>
          <tbody>{lista.datos.map(a => { const r = enRed[a.id]; return (
            <tr key={a.id} className={a.coincide_local ? '' : 'fila-crit'}>
              <td className="num">{num(a.n_eventos)}</td>
              <td><code className="hash" title={a.raiz}>{corto(a.raiz)}</code></td>
              <td className="nw">{fechaHora(a.creado_en)}</td>
              <td>{a.coincide_local ? <span className="insignia ok"><i>✓</i>Coincide</span> : <span className="insignia crit"><i>✕</i>No coincide: datos alterados</span>}</td>
              <td>{!dir || a.contrato.toLowerCase() !== dir.toLowerCase() ? <span className="m">Otro contrato</span> : !r ? <span className="m">Consultando…</span> : r.error ? <span className="m" title={r.error}>Sin conexión</span> : r.ok ? <span className="insignia ok"><i>✓</i>Publicada</span> : <span className="insignia crit"><i>✕</i>No está en la red</span>}</td>
              <td><a href={BC.enlaces.tx(a.tx_hash)} target="_blank" rel="noopener noreferrer">Transacción</a></td>
            </tr>); })}</tbody>
        </table></div>
      )}
    </section>
  );
}

export default function Trazabilidad() {
  const [v, setV] = useState(null);
  const [verificando, setVerificando] = useState(false);
  const [errorV, setErrorV] = useState(null);
  const [filtro, setFiltro] = useState({ entidad: '', pagina: 1 });
  const [abierto, setAbierto] = useState(null);
  const { datos: ev, cargando, error, recargar } = useDatos('/auditoria/eventos' + qs({ entidad: filtro.entidad, pagina: filtro.pagina, por_pagina: 20 }));
  const verificar = async () => { setVerificando(true); setErrorV(null); try { setV(await api.get('/auditoria/verificar')); } catch (e) { setErrorV(e); } finally { setVerificando(false); } };
  useEffect(() => { verificar(); }, []);

  return (
    <>
      <Encabezado antetitulo="Trazabilidad" titulo="Bitácora certificada">
        <Link to="/analisis" className="btn">Simular manipulaciones (análisis territorial)</Link>
      </Encabezado>
      <section className="tarjeta"><MensajeError error={errorV} alReintentar={verificar} />{!errorV && <Verificacion v={v} cargando={verificando} alVerificar={verificar} />}</section>
      <Anclaje verificacion={v} alAnclar={() => { verificar(); recargar(); }} />
      <section className="tarjeta">
        <div className="tarjeta-h"><h2>Eventos</h2>
          <label className="filtro en-linea"><span>Entidad</span><select value={filtro.entidad} onChange={e => setFiltro({ entidad: e.target.value, pagina: 1 })}>{Object.entries(ENTIDADES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        </div>
        <p className="m">Cada cambio en instituciones, imágenes, reintegros y configuración queda registrado con su huella SHA-256. La tabla es de solo inserción: la base de datos impide modificar o borrar eventos.</p>
        <MensajeError error={error} alReintentar={recargar} />
        {cargando && !ev ? <Cargando /> : ev && (
          <>
            <ol className="eventos">
              {ev.datos.map(e => (
                <li key={e.n}>
                  <button type="button" className="evento-cab" aria-expanded={abierto === e.n} onClick={() => setAbierto(abierto === e.n ? null : e.n)}>
                    <span className="mono">#{e.n}</span><b>{e.accion.replace(/_/g, ' ').toLowerCase()}</b>
                    <span>{e.entidad}{e.entidad_id ? ' ' + e.entidad_id : ''}</span><small>{fechaHora(e.ts)} · {e.usuario}</small>
                    <code className="hash">{e.hash.slice(0, 10)}…</code>
                  </button>
                  {abierto === e.n && <div className="evento-det"><p>Huella: <code className="hash">{e.hash}</code></p><p>Anterior: <code className="hash">{e.prev}</code></p><pre>{JSON.stringify(e.datos, null, 2)}</pre></div>}
                </li>
              ))}
            </ol>
            <Paginacion pagina={ev.pagina} porPagina={ev.por_pagina} total={ev.total} alCambiar={p => setFiltro(f => ({ ...f, pagina: p }))} />
          </>
        )}
      </section>
    </>
  );
}
