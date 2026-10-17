/* Imágenes de una institución: carga con vista previa y validación, administración y galería. */
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/cliente';
import { urlApi } from '../config';
import { useAvisos } from '../contexto/Avisos';
import { Confirmar, Modal } from './ui';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const mb = b => (b / 1048576).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' MB';

/** Valida archivos en el navegador (el backend vuelve a validar por la firma real del archivo). */
export function validarArchivos(files, maxBytes) {
  const ok = [], errores = [];
  for (const f of files) {
    if (!TIPOS.includes(f.type)) errores.push(`“${f.name}”: formato no permitido. Usa JPG, PNG o WebP.`);
    else if (f.size > maxBytes) errores.push(`“${f.name}”: pesa ${mb(f.size)}; el máximo es ${mb(maxBytes)}.`);
    else ok.push({ archivo: f, vista: URL.createObjectURL(f), id: Math.random().toString(36).slice(2) });
  }
  return { ok, errores };
}

/** Sube las imágenes pendientes. `principal` = índice de la nueva imagen que debe quedar como principal (o null). */
export function subirImagenes(institucionId, pendientes, principal, alProgresar) {
  const fd = new FormData();
  pendientes.forEach(p => fd.append('imagenes', p.archivo, p.archivo.name));
  if (principal != null) fd.append('principal', String(principal));
  return api.subir(`/instituciones/${institucionId}/imagenes`, fd, alProgresar);
}

/**
 * Gestor de imágenes del formulario.
 * - existentes: imágenes ya guardadas (solo al editar); sus acciones se aplican de inmediato.
 * - pendientes / principalNueva: imágenes nuevas que se suben al guardar el formulario.
 */
export function GestorImagenes({ existentes = [], pendientes, setPendientes, principalNueva, setPrincipalNueva, maxBytes, maxPorCarga, alCambiarExistentes }) {
  const avisar = useAvisos();
  const entrada = useRef(null), reemplazo = useRef(null);
  const [errores, setErrores] = useState([]);
  const [arrastre, setArrastre] = useState(false);
  const [borrar, setBorrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aReemplazar, setAReemplazar] = useState(null);
  useEffect(() => () => pendientes.forEach(p => URL.revokeObjectURL(p.vista)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const agregar = files => {
    const libres = maxPorCarga - pendientes.length;
    const lista = [...files];
    const { ok, errores: errs } = validarArchivos(lista.slice(0, Math.max(0, libres)), maxBytes);
    if (lista.length > libres) errs.push(`Puedes agregar hasta ${maxPorCarga} imágenes por carga.`);
    setErrores(errs);
    if (ok.length) {
      setPendientes(p => [...p, ...ok]);
      if (principalNueva == null && !existentes.some(e => e.es_principal)) setPrincipalNueva(pendientes.length);
    }
  };
  const quitar = i => {
    URL.revokeObjectURL(pendientes[i].vista);
    setPendientes(p => p.filter((_, k) => k !== i));
    if (principalNueva === i) setPrincipalNueva(existentes.some(e => e.es_principal) || pendientes.length < 2 ? null : 0);
    else if (principalNueva > i) setPrincipalNueva(principalNueva - 1);
  };
  const accion = async (fn, ok) => {
    setOcupado(true);
    try { await fn(); avisar(ok); alCambiarExistentes && alCambiarExistentes(); }
    catch (e) { avisar(e.message, 'error'); }
    finally { setOcupado(false); setBorrar(null); }
  };
  const reemplazar = async files => {
    const { ok, errores: errs } = validarArchivos([...files].slice(0, 1), maxBytes);
    if (errs.length) return setErrores(errs);
    const fd = new FormData(); fd.append('imagen', ok[0].archivo, ok[0].archivo.name);
    URL.revokeObjectURL(ok[0].vista);
    await accion(() => api.subir(`/imagenes/${aReemplazar}`, fd, null, 'PUT'), 'Imagen reemplazada.');
    setAReemplazar(null);
  };

  return (
    <div className="gestor-imagenes">
      {existentes.length > 0 && (
        <>
          <h3 className="h3">Imágenes guardadas</h3>
          <ul className="rejilla-fotos">
            {existentes.map(im => (
              <li key={im.id} className={im.es_principal ? 'principal' : ''}>
                <img src={urlApi(im.url)} alt={im.nombre_original} loading="lazy" />
                <div className="foto-pie">
                  {im.es_principal ? <span className="insignia ok"><i aria-hidden="true">★</i>Principal</span>
                    : <button type="button" className="btn xs" disabled={ocupado} onClick={() => accion(() => api.patch(`/imagenes/${im.id}/principal`), 'Imagen principal actualizada.')}>Marcar principal</button>}
                  <button type="button" className="btn xs" disabled={ocupado} onClick={() => { setAReemplazar(im.id); reemplazo.current.click(); }}>Reemplazar</button>
                  <button type="button" className="btn xs peligro" disabled={ocupado} onClick={() => setBorrar(im)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
          <input ref={reemplazo} type="file" accept={TIPOS.join(',')} hidden onChange={e => { if (e.target.files.length) reemplazar(e.target.files); e.target.value = ''; }} />
        </>
      )}
      <div className={'zona-carga' + (arrastre ? ' activa' : '')}
        onDragOver={e => { e.preventDefault(); setArrastre(true); }} onDragLeave={() => setArrastre(false)}
        onDrop={e => { e.preventDefault(); setArrastre(false); agregar(e.dataTransfer.files); }}>
        <p><b>Arrastra fotografías aquí</b> o</p>
        <button type="button" className="btn" onClick={() => entrada.current.click()}>Seleccionar imágenes</button>
        <small>JPG, PNG o WebP · máximo {mb(maxBytes)} cada una · hasta {maxPorCarga} por carga</small>
        <input ref={entrada} type="file" multiple accept={TIPOS.join(',')} hidden onChange={e => { agregar(e.target.files); e.target.value = ''; }} aria-label="Seleccionar imágenes" />
      </div>
      {errores.length > 0 && <ul className="errores-carga" role="alert">{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {pendientes.length > 0 && (
        <>
          <h3 className="h3">Vista previa · se guardarán al guardar el formulario</h3>
          <ul className="rejilla-fotos">
            {pendientes.map((p, i) => (
              <li key={p.id} className={principalNueva === i ? 'principal' : ''}>
                <img src={p.vista} alt={`Vista previa de ${p.archivo.name}`} />
                <div className="foto-pie">
                  <label className="radio"><input type="radio" name="principal-nueva" checked={principalNueva === i} onChange={() => setPrincipalNueva(i)} /> Principal</label>
                  <button type="button" className="btn xs" onClick={() => quitar(i)}>Quitar</button>
                </div>
                <small className="foto-nombre">{p.archivo.name} · {mb(p.archivo.size)}</small>
              </li>
            ))}
          </ul>
        </>
      )}
      <Confirmar abierto={!!borrar} titulo="Eliminar imagen" peligro accion="Eliminar" ocupado={ocupado}
        texto={borrar ? `¿Eliminar “${borrar.nombre_original}”? Esta acción no se puede deshacer.${borrar.es_principal ? ' Otra imagen pasará a ser la principal.' : ''}` : ''}
        alCerrar={() => setBorrar(null)} alConfirmar={() => accion(() => api.del(`/imagenes/${borrar.id}`), 'Imagen eliminada.')} />
    </div>
  );
}

/** Galería de la ficha: imagen grande, miniaturas y vista ampliada. */
export function Galeria({ imagenes, nombre }) {
  const [sel, setSel] = useState(0);
  const [ampliada, setAmpliada] = useState(false);
  if (!imagenes.length) return <div className="foto-vacia" role="img" aria-label="Sin imágenes registradas"><span aria-hidden="true">▧</span><b>Sin imágenes registradas</b><small>Esta institución aún no tiene fotografías.</small></div>;
  const im = imagenes[Math.min(sel, imagenes.length - 1)];
  const mover = d => setSel(s => (s + d + imagenes.length) % imagenes.length);
  return (
    <div className="galeria">
      <button type="button" className="galeria-grande" onClick={() => setAmpliada(true)} aria-label="Ver imagen ampliada">
        <img src={urlApi(im.url)} alt={`${nombre}: ${im.nombre_original}`} />
      </button>
      {imagenes.length > 1 && (
        <ul className="galeria-minis">
          {imagenes.map((x, i) => <li key={x.id}><button type="button" className={i === sel ? 'sel' : ''} onClick={() => setSel(i)} aria-label={`Imagen ${i + 1}`}><img src={urlApi(x.url)} alt="" loading="lazy" /></button></li>)}
        </ul>
      )}
      <Modal titulo={`${nombre} · ${sel + 1} de ${imagenes.length}`} abierto={ampliada} alCerrar={() => setAmpliada(false)} ancho="lg">
        <div className="visor" onKeyDown={e => { if (e.key === 'ArrowRight') mover(1); if (e.key === 'ArrowLeft') mover(-1); }}>
          <img src={urlApi(im.url)} alt={im.nombre_original} />
          {imagenes.length > 1 && <div className="acciones"><button type="button" className="btn" onClick={() => mover(-1)}>← Anterior</button><button type="button" className="btn" onClick={() => mover(1)}>Siguiente →</button></div>}
        </div>
      </Modal>
    </div>
  );
}
