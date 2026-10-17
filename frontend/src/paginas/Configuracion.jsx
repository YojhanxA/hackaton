import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { useAvisos } from '../contexto/Avisos';
import { useSesion } from '../contexto/Sesion';
import { Campo, Cargando, Confirmar, Encabezado, MensajeError, Tabla } from '../componentes/ui';
import { SelectorCoordenadas, useConfiguracion } from '../componentes/Mapa';
import { BLOCKCHAIN } from '../config';
import { fecha } from '../formato';

function Origen({ config, refrescar, editable }) {
  const avisar = useAvisos();
  const [f, setF] = useState(null);
  const [errores, setErrores] = useState({});
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (config) setF({ ...config.origen, latitud: String(config.origen.latitud), longitud: String(config.origen.longitud) }); }, [config]);
  if (!f) return <Cargando />;
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const guardar = async e => {
    e.preventDefault(); setOcupado(true); setErrores({});
    try { await api.put('/configuracion/origen', { ...f, latitud: Number(f.latitud), longitud: Number(f.longitud) }); await refrescar(); avisar('Origen de las rutas actualizado.'); }
    catch (err) { setErrores({ ...err.porCampo, _: err.message }); } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={guardar} noValidate>
      {errores._ && <p className="msg-error" role="alert"><span aria-hidden="true">✕</span>{errores._}</p>}
      <fieldset disabled={!editable || ocupado} className="campos">
        <Campo etiqueta="Nombre" requerido error={errores.nombre} ancho="doble">{p => <input {...p} value={f.nombre} onChange={set('nombre')} />}</Campo>
        <Campo etiqueta="Dirección" requerido error={errores.direccion} ancho="doble">{p => <input {...p} value={f.direccion} onChange={set('direccion')} />}</Campo>
        <Campo etiqueta="Latitud" requerido error={errores.latitud}>{p => <input {...p} inputMode="decimal" value={f.latitud} onChange={set('latitud')} />}</Campo>
        <Campo etiqueta="Longitud" requerido error={errores.longitud}>{p => <input {...p} inputMode="decimal" value={f.longitud} onChange={set('longitud')} />}</Campo>
      </fieldset>
      {editable && <SelectorCoordenadas lat={f.latitud} lon={f.longitud} alCambiar={(la, lo) => setF(x => ({ ...x, latitud: String(la), longitud: String(lo) }))} />}
      {editable && <div className="acciones izq"><button type="submit" className="btn pri" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar origen'}</button></div>}
    </form>
  );
}

function Usuarios() {
  const avisar = useAvisos();
  const { usuario: yo } = useSesion();
  const { datos, cargando, error, recargar } = useDatos('/usuarios');
  const [f, setF] = useState({ usuario: '', nombre: '', clave: '', rol: 'lector' });
  const [errores, setErrores] = useState({});
  const crear = async e => {
    e.preventDefault(); setErrores({});
    try { await api.post('/usuarios', f); avisar(`Usuario ${f.usuario} creado.`); setF({ usuario: '', nombre: '', clave: '', rol: 'lector' }); recargar(); }
    catch (err) { setErrores({ ...err.porCampo, _: err.message }); }
  };
  const cambiar = async (u, cambios) => { try { await api.patch('/usuarios/' + u.id, cambios); recargar(); avisar('Usuario actualizado.'); } catch (e) { avisar(e.message, 'error'); } };
  if (cargando && !datos) return <Cargando />;
  return (
    <>
      <MensajeError error={error} alReintentar={recargar} />
      {datos && <Tabla filas={datos.datos} columnas={[
        { k: 'usuario', t: 'Usuario', clase: 'mono' }, { k: 'nombre', t: 'Nombre' },
        { k: 'rol', t: 'Rol', render: u => <select value={u.rol} disabled={u.id === yo.id} onChange={e => cambiar(u, { rol: e.target.value })} aria-label={`Rol de ${u.usuario}`}><option value="admin">Administrador</option><option value="editor">Editor</option><option value="lector">Solo lectura</option></select> },
        { k: 'activo', t: 'Estado', render: u => <label className="interruptor"><input type="checkbox" checked={u.activo} disabled={u.id === yo.id} onChange={e => cambiar(u, { activo: e.target.checked })} /><span>{u.activo ? 'Activo' : 'Inactivo'}</span></label> },
        { k: 'creado_en', t: 'Creado', render: u => fecha(u.creado_en) }]} />}
      <form onSubmit={crear} noValidate className="nuevo-usuario">
        <h3 className="h3">Nuevo usuario</h3>
        {errores._ && <p className="msg-error" role="alert"><span aria-hidden="true">✕</span>{errores._}</p>}
        <div className="campos">
          <Campo etiqueta="Usuario" requerido error={errores.usuario} ayuda="Minúsculas, números, punto o guion.">{p => <input {...p} value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value.toLowerCase() })} autoComplete="off" />}</Campo>
          <Campo etiqueta="Nombre completo" requerido error={errores.nombre}>{p => <input {...p} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />}</Campo>
          <Campo etiqueta="Contraseña" requerido error={errores.clave} ayuda="Mínimo 12 caracteres.">{p => <input {...p} type="password" autoComplete="new-password" value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} />}</Campo>
          <Campo etiqueta="Rol" requerido>{p => <select {...p} value={f.rol} onChange={e => setF({ ...f, rol: e.target.value })}><option value="lector">Solo lectura</option><option value="editor">Editor</option><option value="admin">Administrador</option></select>}</Campo>
        </div>
        <div className="acciones izq"><button type="submit" className="btn pri">Crear usuario</button></div>
      </form>
    </>
  );
}

/** Borra los reintegros de demostración (DEMO-…) antes de cargar los datos reales. */
function DatosDemo() {
  const avisar = useAvisos();
  const { datos, recargar } = useDatos('/reintegros-demostracion');
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  if (!datos || !datos.n) return <p className="m">No hay reintegros de demostración.</p>;
  const borrar = async () => {
    setOcupado(true);
    try { const r = await api.del('/reintegros/demostracion'); avisar(`${r ? r.eliminados : datos.n} reintegros de demostración eliminados.`); setConfirmar(false); recargar(); }
    catch (e) { avisar(e.message, 'error'); } finally { setOcupado(false); }
  };
  return (
    <>
      <p className="m">Hay <b>{datos.n}</b> reintegros de DEMOSTRACIÓN (referencia DEMO-…) para presentar la plataforma. Elimínalos antes de importar los datos reales.</p>
      <button type="button" className="btn peligro" onClick={() => setConfirmar(true)}>Eliminar datos de demostración</button>
      <Confirmar abierto={confirmar} titulo="Eliminar datos de demostración" peligro accion="Eliminar" ocupado={ocupado} alCerrar={() => setConfirmar(false)} alConfirmar={borrar}
        texto={`Se eliminarán ${datos.n} reintegros de demostración. La eliminación queda registrada en la bitácora.`} />
    </>
  );
}

export default function Configuracion() {
  const { puede } = useSesion();
  const { config, error, refrescar } = useConfiguracion();
  if (error) return <MensajeError error={error} />;
  if (!config) return <Cargando />;
  return (
    <>
      <Encabezado antetitulo="Sistema" titulo="Configuración" />
      <div className="rejilla-2">
        <section className="tarjeta">
          <h2>Origen de las rutas</h2>
          <p className="m">Todas las rutas salen de este punto. {puede('admin') ? 'Haz clic en el mapa para ajustar la ubicación exacta.' : 'Solo un administrador puede cambiarlo.'}</p>
          <Origen config={config} refrescar={refrescar} editable={puede('admin')} />
        </section>
        <section className="tarjeta">
          <h2>Servicios externos</h2>
          <dl className="datos">
            <div><dt>Servicio de rutas</dt><dd><code>{config.rutas.servicio}</code> · perfil {config.rutas.perfil}</dd></div>
            <div><dt>Rutas por consulta</dt><dd>Hasta {config.rutas.max_destinos}</dd></div>
            <div><dt>Mapa base</dt><dd>OpenStreetMap</dd></div>
            <div><dt>Imágenes</dt><dd>JPG, PNG o WebP · hasta {Math.round(config.imagenes.max_bytes / 1048576)} MB · {config.imagenes.max_por_carga} por carga</dd></div>
            <div><dt>Blockchain</dt><dd>{BLOCKCHAIN.nombre} ({BLOCKCHAIN.tipo}){BLOCKCHAIN.contrato ? <> · contrato <code>{BLOCKCHAIN.contrato}</code></> : ' · contrato sin configurar'}</dd></div>
          </dl>
          {config.rutas.servidor_publico && <p className="nota">Se está usando el servidor público de demostración de OSRM. Para producción configura un servicio propio en <code>OSRM_URL</code>: el público no garantiza disponibilidad ni admite uso intensivo.</p>}
          <p className="m">Estos valores se cambian en las variables de entorno del backend y del frontend (ver LEEME).</p>
        </section>
        {puede('admin') && <section className="tarjeta"><h2>Datos de demostración</h2><DatosDemo /></section>}
        {puede('admin') && <section className="tarjeta ancho-total"><h2>Usuarios</h2><Usuarios /></section>}
      </div>
    </>
  );
}
