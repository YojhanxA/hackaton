import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useAvisos } from '../contexto/Avisos';
import { useSesion } from '../contexto/Sesion';
import { Campo, Cargando, Encabezado, MensajeError } from '../componentes/ui';
import { GestorImagenes, subirImagenes } from '../componentes/Imagenes';
import { SelectorCoordenadas, useConfiguracion } from '../componentes/Mapa';

const VACIO = { codigo: '', nombre: '', institucion: '', sector: '', clase: '', direccion: '', barrio: '', comuna: '', municipio: 'Medellín', departamento: 'Antioquia',
  latitud: '', longitud: '', contacto_nombre: '', telefono: '', correo: '', descripcion: '', estudiantes: '', estado: 'activo' };

/** Validación en el navegador; el backend repite todas las reglas. */
function validar(f) {
  const e = {};
  if (!f.codigo.trim()) e.codigo = 'El código es obligatorio.';
  else if (!/^[A-Za-z0-9._-]+$/.test(f.codigo.trim())) e.codigo = 'Solo letras, números, punto, guion y guion bajo.';
  if (f.nombre.trim().length < 2) e.nombre = 'El nombre es obligatorio.';
  if (f.municipio.trim().length < 2) e.municipio = 'El municipio es obligatorio.';
  if (f.departamento.trim().length < 2) e.departamento = 'El departamento es obligatorio.';
  const lat = f.latitud === '' ? null : Number(f.latitud), lon = f.longitud === '' ? null : Number(f.longitud);
  if ((lat == null) !== (lon == null)) e[lat == null ? 'latitud' : 'longitud'] = 'Indica latitud y longitud juntas, o ninguna de las dos.';
  if (lat != null && (isNaN(lat) || lat < -90 || lat > 90)) e.latitud = 'La latitud debe estar entre -90 y 90.';
  if (lon != null && (isNaN(lon) || lon < -180 || lon > 180)) e.longitud = 'La longitud debe estar entre -180 y 180.';
  if (f.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo)) e.correo = 'Correo electrónico inválido.';
  if (f.telefono && !/^[0-9+()\s-]{7,40}$/.test(f.telefono)) e.telefono = 'Usa solo números, espacios, +, ( ) y guiones.';
  if (f.estudiantes !== '' && (!Number.isInteger(Number(f.estudiantes)) || Number(f.estudiantes) < 0)) e.estudiantes = 'Debe ser un número entero positivo.';
  return e;
}

export default function InstitucionFormulario() {
  const { id } = useParams();
  const editando = !!id;
  const nav = useNavigate();
  const avisar = useAvisos();
  const { puede } = useSesion();
  const { config } = useConfiguracion();
  const [f, setF] = useState(VACIO);
  const [imagenes, setImagenes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [principalNueva, setPrincipalNueva] = useState(null);
  const [errores, setErrores] = useState({});
  const [cargando, setCargando] = useState(editando);
  const [errorCarga, setErrorCarga] = useState(null);
  const [guardando, setGuardando] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');

  const cargar = async () => {
    try {
      const d = await api.get('/instituciones/' + id);
      setF(Object.fromEntries(Object.keys(VACIO).map(k => [k, d[k] == null ? '' : String(d[k])])));
      setImagenes(d.imagenes);
    } catch (e) { setErrorCarga(e); } finally { setCargando(false); }
  };
  const recargarImagenes = async () => { try { setImagenes((await api.get('/instituciones/' + id)).imagenes); } catch (e) { avisar(e.message, 'error'); } };
  useEffect(() => { if (editando) cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!puede('editor')) return <MensajeError error={{ message: 'Tu rol es de solo lectura: no puedes crear ni editar instituciones.' }} />;
  if (cargando) return <Cargando />;
  if (errorCarga) return <MensajeError error={errorCarga} alReintentar={cargar} />;

  const set = k => e => { setF(x => ({ ...x, [k]: e.target.value })); if (errores[k]) setErrores(x => ({ ...x, [k]: undefined })); };
  const enviar = async e => {
    e.preventDefault();
    const errs = validar(f);
    setErrores(errs); setErrorGeneral('');
    if (Object.keys(errs).length) { setErrorGeneral('Revisa los campos marcados.'); return; }
    const cuerpo = Object.assign({}, f, { estudiantes: f.estudiantes === '' ? null : Number(f.estudiantes), latitud: f.latitud === '' ? null : Number(f.latitud), longitud: f.longitud === '' ? null : Number(f.longitud), sector: f.sector || null });
    setGuardando('Guardando datos…');
    let guardada;
    try {
      guardada = editando ? await api.put('/instituciones/' + id, cuerpo) : await api.post('/instituciones', cuerpo);
    } catch (err) {
      setErrores(err.porCampo || {}); setErrorGeneral(err.message); setGuardando(''); return;
    }
    if (pendientes.length) {
      try {
        await subirImagenes(guardada.id, pendientes, principalNueva, p => setGuardando(`Subiendo imágenes… ${p} %`));
        pendientes.forEach(p => URL.revokeObjectURL(p.vista)); setPendientes([]); setPrincipalNueva(null);
      } catch (err) {
        setGuardando('');
        avisar(`Los datos se guardaron, pero las imágenes no: ${err.message}`, 'error');
        if (!editando) nav(`/instituciones/${guardada.id}/editar`, { replace: true }); else recargarImagenes();
        return;
      }
    }
    setGuardando('');
    avisar(editando ? 'Cambios guardados y registrados en la bitácora.' : 'Institución creada y registrada en la bitácora.');
    nav('/instituciones/' + guardada.id);
  };

  return (
    <form onSubmit={enviar} noValidate>
      <Encabezado antetitulo={editando ? `Editar · ${f.codigo}` : 'Nueva institución'} titulo={editando ? f.nombre || 'Institución' : 'Registrar institución'}>
        <Link to={editando ? '/instituciones/' + id : '/instituciones'} className="btn">Cancelar</Link>
        <button type="submit" className="btn pri" disabled={!!guardando}>{guardando || (editando ? 'Guardar cambios' : 'Guardar institución')}</button>
      </Encabezado>
      {errorGeneral && <p className="msg-error" role="alert"><span aria-hidden="true">✕</span>{errorGeneral}</p>}
      <div className="formulario">
        <section className="tarjeta">
          <h2>Identificación</h2>
          <div className="campos">
            <Campo etiqueta="Código" requerido error={errores.codigo} ayuda="Código DANE o identificador interno único.">{p => <input {...p} value={f.codigo} onChange={set('codigo')} maxLength={40} />}</Campo>
            <Campo etiqueta="Nombre de la institución o sede" requerido error={errores.nombre} ancho="doble">{p => <input {...p} value={f.nombre} onChange={set('nombre')} maxLength={200} />}</Campo>
            <Campo etiqueta="Institución a la que pertenece" error={errores.institucion} ayuda="Si es una sede, la institución educativa principal." ancho="doble">{p => <input {...p} value={f.institucion} onChange={set('institucion')} maxLength={200} />}</Campo>
            <Campo etiqueta="Sector" error={errores.sector}>{p => <select {...p} value={f.sector} onChange={set('sector')}><option value="">Sin definir</option><option value="oficial">Oficial</option><option value="no_oficial">No oficial</option></select>}</Campo>
            <Campo etiqueta="Estado" requerido error={errores.estado}>{p => <select {...p} value={f.estado} onChange={set('estado')}><option value="activo">Activa</option><option value="inactivo">Inactiva</option></select>}</Campo>
            <Campo etiqueta="Estudiantes matriculados" error={errores.estudiantes}>{p => <input {...p} type="number" min="0" step="1" value={f.estudiantes} onChange={set('estudiantes')} />}</Campo>
          </div>
        </section>
        <section className="tarjeta">
          <h2>Ubicación</h2>
          <div className="campos">
            <Campo etiqueta="Dirección" error={errores.direccion} ancho="doble">{p => <input {...p} value={f.direccion} onChange={set('direccion')} maxLength={200} placeholder="Ej.: Carrera 65 # 98-20" />}</Campo>
            <Campo etiqueta="Barrio o vereda" error={errores.barrio}>{p => <input {...p} value={f.barrio} onChange={set('barrio')} maxLength={120} />}</Campo>
            <Campo etiqueta="Comuna o corregimiento" error={errores.comuna}>{p => <input {...p} value={f.comuna} onChange={set('comuna')} maxLength={120} />}</Campo>
            <Campo etiqueta="Municipio" requerido error={errores.municipio}>{p => <input {...p} value={f.municipio} onChange={set('municipio')} maxLength={100} />}</Campo>
            <Campo etiqueta="Departamento" requerido error={errores.departamento}>{p => <input {...p} value={f.departamento} onChange={set('departamento')} maxLength={100} />}</Campo>
            <Campo etiqueta="Latitud" error={errores.latitud} ayuda="Ej.: 6.2476">{p => <input {...p} inputMode="decimal" value={f.latitud} onChange={set('latitud')} />}</Campo>
            <Campo etiqueta="Longitud" error={errores.longitud} ayuda="Ej.: -75.5658">{p => <input {...p} inputMode="decimal" value={f.longitud} onChange={set('longitud')} />}</Campo>
          </div>
          <SelectorCoordenadas lat={f.latitud} lon={f.longitud} origen={config && config.origen} alCambiar={(la, lo) => { setF(x => ({ ...x, latitud: String(la), longitud: String(lo) })); setErrores(x => ({ ...x, latitud: undefined, longitud: undefined })); }} />
        </section>
        <section className="tarjeta">
          <h2>Contacto y descripción</h2>
          <div className="campos">
            <Campo etiqueta="Persona de contacto" error={errores.contacto_nombre}>{p => <input {...p} value={f.contacto_nombre} onChange={set('contacto_nombre')} maxLength={120} />}</Campo>
            <Campo etiqueta="Teléfono" error={errores.telefono}>{p => <input {...p} type="tel" value={f.telefono} onChange={set('telefono')} maxLength={40} />}</Campo>
            <Campo etiqueta="Correo electrónico" error={errores.correo}>{p => <input {...p} type="email" value={f.correo} onChange={set('correo')} maxLength={120} />}</Campo>
            <Campo etiqueta="Descripción u observaciones" error={errores.descripcion} ancho="completo">{p => <textarea {...p} rows={3} value={f.descripcion} onChange={set('descripcion')} maxLength={4000} />}</Campo>
          </div>
        </section>
        <section className="tarjeta">
          <h2>Imágenes</h2>
          {config ? <GestorImagenes existentes={imagenes} pendientes={pendientes} setPendientes={setPendientes} principalNueva={principalNueva} setPrincipalNueva={setPrincipalNueva}
            maxBytes={config.imagenes.max_bytes} maxPorCarga={config.imagenes.max_por_carga} alCambiarExistentes={editando ? recargarImagenes : null} /> : <Cargando />}
        </section>
      </div>
      <div className="acciones-pie">
        <Link to={editando ? '/instituciones/' + id : '/instituciones'} className="btn">Cancelar</Link>
        <button type="submit" className="btn pri" disabled={!!guardando}>{guardando || (editando ? 'Guardar cambios' : 'Guardar institución')}</button>
      </div>
    </form>
  );
}
