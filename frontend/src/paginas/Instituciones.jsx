import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { qs } from '../api/cliente';
import { useDatos } from '../api/useDatos';
import { useSesion } from '../contexto/Sesion';
import { Encabezado, EstadoInstitucion, MensajeError, Paginacion, Tabla, Cargando } from '../componentes/ui';
import { urlApi } from '../config';
import { num } from '../formato';

const INICIAL = { q: '', municipio: '', comuna: '', estado: '', sector: '', con_imagenes: '', con_coordenadas: '' };

export default function Instituciones() {
  const { puede } = useSesion();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState(() => Object.fromEntries(Object.keys(INICIAL).map(k => [k, params.get(k) || ''])));
  const [pagina, setPagina] = useState(Number(params.get('pagina')) || 1);
  const [busqueda, setBusqueda] = useState(f.q);
  useEffect(() => { const t = setTimeout(() => { setF(x => (x.q === busqueda ? x : { ...x, q: busqueda })); setPagina(1); }, 350); return () => clearTimeout(t); }, [busqueda]);
  useEffect(() => { setParams(Object.fromEntries(Object.entries({ ...f, pagina: pagina > 1 ? pagina : '' }).filter(([, v]) => v)), { replace: true }); }, [f, pagina, setParams]);

  const { datos: opciones } = useDatos('/instituciones/filtros');
  const { datos, cargando, error, recargar } = useDatos('/instituciones' + qs({ ...f, pagina, por_pagina: 20 }));
  const cambiar = (k, v) => { setF(x => ({ ...x, [k]: v })); setPagina(1); };
  const limpiar = () => { setF(INICIAL); setBusqueda(''); setPagina(1); };

  return (
    <>
      <Encabezado antetitulo="Gestión" titulo="Instituciones educativas">
        {puede('editor') && <Link to="/instituciones/nueva" className="btn pri">Nueva institución</Link>}
      </Encabezado>
      <section className="tarjeta filtros" aria-label="Filtros">
        <label className="filtro ancho-2"><span>Buscar</span><input type="search" placeholder="Nombre, código, institución o barrio" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
        <label className="filtro"><span>Municipio</span><select value={f.municipio} onChange={e => cambiar('municipio', e.target.value)}><option value="">Todos</option>{(opciones?.municipios || []).map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="filtro"><span>Comuna</span><select value={f.comuna} onChange={e => cambiar('comuna', e.target.value)}><option value="">Todas</option>{(opciones?.comunas || []).map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="filtro"><span>Sector</span><select value={f.sector} onChange={e => cambiar('sector', e.target.value)}><option value="">Todos</option><option value="oficial">Oficial</option><option value="no_oficial">No oficial</option></select></label>
        <label className="filtro"><span>Estado</span><select value={f.estado} onChange={e => cambiar('estado', e.target.value)}><option value="">Todos</option><option value="activo">Activa</option><option value="inactivo">Inactiva</option></select></label>
        <label className="filtro"><span>Imágenes</span><select value={f.con_imagenes} onChange={e => cambiar('con_imagenes', e.target.value)}><option value="">Todas</option><option value="si">Con imágenes</option><option value="no">Sin imágenes</option></select></label>
        <label className="filtro"><span>Coordenadas</span><select value={f.con_coordenadas} onChange={e => cambiar('con_coordenadas', e.target.value)}><option value="">Todas</option><option value="si">Con coordenadas</option><option value="no">Sin coordenadas</option></select></label>
        <button type="button" className="btn sm" onClick={limpiar}>Limpiar filtros</button>
      </section>
      <section className="tarjeta">
        <MensajeError error={error} alReintentar={recargar} />
        {cargando && !datos ? <Cargando /> : datos && (
          <div className={cargando ? 'atenuado' : ''}>
            <Tabla filas={datos.datos} alClic={x => nav('/instituciones/' + x.id)} columnas={[
              { k: 'img', t: '', clase: 'col-img', render: x => x.imagen_principal ? <img src={urlApi(x.imagen_principal)} alt="" loading="lazy" className="miniatura" /> : <span className="miniatura vacia" aria-hidden="true">Sin foto</span> },
              { k: 'codigo', t: 'Código', clase: 'mono' },
              { k: 'nombre', t: 'Nombre', render: x => <span className="doble"><b>{x.nombre}</b><small>{x.institucion || (x.sector === 'oficial' ? 'Oficial' : x.sector === 'no_oficial' ? 'No oficial' : '')}</small></span> },
              { k: 'ubic', t: 'Ubicación', render: x => <span className="doble"><span>{x.barrio || x.direccion || '—'}</span><small>{[x.comuna, x.municipio].filter(Boolean).join(' · ')}</small></span> },
              { k: 'coords', t: 'Mapa', render: x => x.latitud != null ? <span className="si">✓ Ubicada</span> : <span className="no">Sin coordenadas</span> },
              { k: 'n_imagenes', t: 'Fotos', clase: 'num', render: x => num(x.n_imagenes) },
              { k: 'estado', t: 'Estado', render: x => <EstadoInstitucion estado={x.estado} /> }
            ]} />
            <Paginacion pagina={datos.pagina} porPagina={datos.por_pagina} total={datos.total} alCambiar={setPagina} />
          </div>
        )}
      </section>
    </>
  );
}
