import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircleMarker, Marker } from 'react-leaflet';
import { api, qs } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { useAvisos } from '../contexto/Avisos';
import { useSesion } from '../contexto/Sesion';
import { Cargando, Confirmar, Encabezado, EstadoInstitucion, EstadoReintegro, MensajeError, Tabla } from '../componentes/ui';
import { Galeria } from '../componentes/Imagenes';
import { BarrasHorizontales, CATEGORIAS, DivisionCategorias } from '../componentes/Graficos';
import { AjustarVista, MapaBase, iconoSecretaria, useConfiguracion } from '../componentes/Mapa';
import { cop, fecha, fechaHora, num } from '../formato';

const ACCIONES = { INSTITUCION_CREADA: 'Creación', INSTITUCION_IMPORTADA: 'Carga inicial (GeoMedellín)', INSTITUCION_ACTUALIZADA: 'Actualización', IMAGENES_CARGADAS: 'Imágenes cargadas',
  IMAGEN_PRINCIPAL: 'Cambio de imagen principal', IMAGEN_REEMPLAZADA: 'Imagen reemplazada', IMAGEN_ELIMINADA: 'Imagen eliminada' };

export default function InstitucionFicha() {
  const { id } = useParams();
  const nav = useNavigate();
  const avisar = useAvisos();
  const { puede } = useSesion();
  const { config } = useConfiguracion();
  const { datos: d, cargando, error, recargar } = useDatos('/instituciones/' + id);
  const { datos: rein } = useDatos('/reintegros' + qs({ institucion_id: id, por_pagina: 8 }));
  const { datos: hist } = useDatos('/auditoria/eventos' + qs({ entidad: 'institucion', entidad_id: id, por_pagina: 10 }));
  const [borrar, setBorrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (cargando && !d) return <Cargando />;
  if (error) return <MensajeError error={error} alReintentar={recargar} />;
  const tieneCoords = d.latitud != null;
  const eliminar = async () => {
    setOcupado(true);
    try { await api.del('/instituciones/' + id); avisar('Institución eliminada. El registro queda en la bitácora.'); nav('/instituciones'); }
    catch (e) { avisar(e.message, 'error'); setOcupado(false); setBorrar(false); }
  };
  const dato = (t, v) => <div><dt>{t}</dt><dd>{v || <span className="m">Sin registrar</span>}</dd></div>;

  return (
    <>
      <Encabezado antetitulo={`${d.codigo} · ${d.sector === 'oficial' ? 'Oficial' : d.sector === 'no_oficial' ? 'No oficial' : 'Sector sin definir'}`} titulo={d.nombre}>
        <EstadoInstitucion estado={d.estado} />
        {tieneCoords && <Link className="btn" to={'/mapa' + qs({ destinos: d.id })}>Trazar ruta</Link>}
        {puede('editor') && <Link className="btn pri" to={`/instituciones/${d.id}/editar`}>Editar</Link>}
        {puede('admin') && <button type="button" className="btn peligro" onClick={() => setBorrar(true)}>Eliminar</button>}
      </Encabezado>
      <div className="ficha-rejilla">
        <section className="tarjeta"><Galeria imagenes={d.imagenes} nombre={d.nombre} /></section>
        <section className="tarjeta">
          <h2>Datos</h2>
          <dl className="datos">
            {dato('Institución a la que pertenece', d.institucion)}
            {dato('Clase', d.clase)}
            {dato('Dirección', d.direccion)}
            {dato('Barrio o vereda', d.barrio)}
            {dato('Comuna o corregimiento', d.comuna)}
            {dato('Municipio', `${d.municipio}, ${d.departamento}`)}
            {dato('Coordenadas', tieneCoords ? `${d.latitud}, ${d.longitud}` : null)}
            {dato('Estudiantes', d.estudiantes != null ? num(d.estudiantes) : null)}
            {dato('Contacto', [d.contacto_nombre, d.telefono, d.correo].filter(Boolean).join(' · '))}
            {dato('Última actualización', fechaHora(d.actualizado_en))}
          </dl>
          {d.descripcion && <p className="descripcion">{d.descripcion}</p>}
        </section>
        <section className="tarjeta">
          <h2>Ubicación</h2>
          {tieneCoords ? (
            <MapaBase centro={[d.latitud, d.longitud]} zoom={15} className="mapa-ficha">
              {config && <Marker position={[config.origen.latitud, config.origen.longitud]} icon={iconoSecretaria} />}
              <CircleMarker center={[d.latitud, d.longitud]} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#5a43c9', fillOpacity: 1 }} />
              {config && <AjustarVista clave={d.id} puntos={[[d.latitud, d.longitud], [config.origen.latitud, config.origen.longitud]]} max={16} />}
            </MapaBase>
          ) : <p className="vacio">Sin coordenadas: <Link to={`/instituciones/${d.id}/editar`}>agrégalas</Link> para verla en el mapa y trazar rutas.</p>}
        </section>
        <section className="tarjeta">
          <div className="tarjeta-h"><h2>Reintegros</h2>{rein && rein.total > 8 && <Link to={'/reintegros' + qs({ institucion_id: d.id })}>Ver los {num(rein.total)}</Link>}</div>
          {d.reintegros && d.reintegros.n > 0 && (
            <div className="resumen-rein">
              <p className="m"><b>{num(d.reintegros.n)}</b> reintegros · <b>{num(d.reintegros.elementos)}</b> elementos · {num(d.reintegros.realizados)} realizados{d.reintegros.ultimo ? ` · último: ${fecha(d.reintegros.ultimo)}` : ''} (sin contar anulados)</p>
              {d.reintegros.pendientes > 0 && (
                <p className="aviso-warn">{num(d.reintegros.pendientes)} reintegros pendientes por recoger ({num(d.reintegros.elementos_pendientes)} elementos). <Link to={'/mapa?destinos=' + d.id}>Ver la ruta desde la Secretaría</Link></p>
              )}
              <DivisionCategorias datos={[{ categoria: 'mobiliario', elementos: d.reintegros.mobiliario }, { categoria: 'electrico', elementos: d.reintegros.electrico }]} />
              <BarrasHorizontales titulo="Objetos reintegrados" filas={d.reintegros.por_articulo.map(x => ({ clave: x.articulo, etiqueta: x.articulo, valor: x.elementos, color: (CATEGORIAS[x.categoria] || CATEGORIAS.electrico).color, detalle: CATEGORIAS[x.categoria]?.t }))} />
            </div>
          )}
          {rein ? <Tabla filas={rein.datos} vacio="Esta institución no tiene reintegros registrados." columnas={[
            { k: 'codigo', t: 'Código', clase: 'mono' }, { k: 'fecha', t: 'Fecha', render: r => fecha(r.fecha_reintegro) },
            { k: 'desc', t: 'Elemento', render: r => `${r.descripcion} ×${r.cantidad}` }, { k: 'valor', t: 'Valor', clase: 'num', render: r => cop(r.valor) },
            { k: 'estado', t: 'Estado', render: r => <EstadoReintegro estado={r.estado} /> }]} /> : <Cargando />}
        </section>
        <section className="tarjeta ancho-total">
          <div className="tarjeta-h"><h2>Historial certificado</h2><Link to="/trazabilidad">Verificar la cadena</Link></div>
          {hist ? <ol className="historial">
            {hist.datos.map(e => (
              <li key={e.n}><span className="hist-acc">{ACCIONES[e.accion] || e.accion}</span><small>{fechaHora(e.ts)} · {e.usuario}</small>
                <code className="hash" title={e.hash}>#{e.n} · {e.hash.slice(0, 12)}…</code>
                {e.datos.cambios && <ul className="cambios">{Object.entries(e.datos.cambios).map(([k, v]) => <li key={k}><b>{k}</b>: {String(v.antes ?? '—')} → {String(v.despues ?? '—')}</li>)}</ul>}
              </li>
            ))}
          </ol> : <Cargando />}
        </section>
      </div>
      <Confirmar abierto={borrar} titulo="Eliminar institución" peligro accion="Eliminar definitivamente" ocupado={ocupado} alCerrar={() => setBorrar(false)} alConfirmar={eliminar}
        texto={`Se eliminarán “${d.nombre}” y sus ${num(d.imagenes.length)} imágenes. Sus reintegros se conservan, sin institución asociada. Si solo dejó de operar, es mejor marcarla como inactiva.`} />
    </>
  );
}
