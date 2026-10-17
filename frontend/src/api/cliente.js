/* Cliente HTTP del backend: añade la sesión, traduce errores y permite descargar y subir archivos. */
import { API_URL } from '../config';

const CLAVE_SESION = 'traza.sesion';
export const sesion = {
  leer() { try { return JSON.parse(sessionStorage.getItem(CLAVE_SESION)) || null; } catch { return null; } },
  guardar(s) { try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(s)); } catch { /* almacenamiento bloqueado */ } },
  borrar() { try { sessionStorage.removeItem(CLAVE_SESION); } catch { /* nada */ } }
};

export class ErrorApi extends Error {
  constructor(mensaje, estado, detalles) { super(mensaje); this.estado = estado; this.detalles = detalles || []; }
  /** Errores por campo, listos para un formulario: { campo: 'mensaje' } */
  get porCampo() { return Object.fromEntries(this.detalles.map(d => [d.campo, d.mensaje])); }
}

let alExpirar = () => {};
export const alExpirarSesion = fn => { alExpirar = fn; };

const cabeceras = (extra = {}) => {
  const s = sesion.leer();
  return Object.assign(s ? { Authorization: 'Bearer ' + s.token } : {}, extra);
};

async function procesar(r) {
  if (r.status === 204) return null;
  const tipo = r.headers.get('content-type') || '';
  const cuerpo = tipo.includes('application/json') ? await r.json().catch(() => null) : null;
  if (!r.ok) {
    if (r.status === 401 && sesion.leer()) alExpirar(cuerpo && cuerpo.error);
    throw new ErrorApi((cuerpo && cuerpo.error) || `El servidor respondió ${r.status}.`, r.status, cuerpo && cuerpo.detalles);
  }
  return cuerpo;
}

async function solicitar(metodo, ruta, datos, { signal } = {}) {
  let r;
  try {
    r = await fetch(API_URL + '/api' + ruta, {
      method: metodo, signal,
      headers: cabeceras(datos !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: datos !== undefined ? JSON.stringify(datos) : undefined
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ErrorApi('No se pudo conectar con el servidor. Revisa tu conexión o que el backend esté en marcha.', 0);
  }
  return procesar(r);
}

export const api = {
  get: (ruta, opts) => solicitar('GET', ruta, undefined, opts),
  post: (ruta, datos) => solicitar('POST', ruta, datos),
  put: (ruta, datos) => solicitar('PUT', ruta, datos),
  patch: (ruta, datos) => solicitar('PATCH', ruta, datos),
  del: ruta => solicitar('DELETE', ruta),

  /** Sube archivos con progreso (0–100). */
  subir(ruta, formData, alProgresar, metodo = 'POST') {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(metodo, API_URL + '/api' + ruta);
      Object.entries(cabeceras()).forEach(([k, v]) => x.setRequestHeader(k, v));
      x.upload.onprogress = e => { if (e.lengthComputable && alProgresar) alProgresar(Math.round(e.loaded / e.total * 100)); };
      x.onerror = () => reject(new ErrorApi('Se interrumpió la carga. Revisa tu conexión e intenta de nuevo.', 0));
      x.onload = () => {
        let cuerpo = null; try { cuerpo = JSON.parse(x.responseText); } catch { /* sin cuerpo */ }
        if (x.status >= 200 && x.status < 300) resolve(cuerpo);
        else reject(new ErrorApi((cuerpo && cuerpo.error) || `El servidor respondió ${x.status}.`, x.status, cuerpo && cuerpo.detalles));
      };
      x.send(formData);
    });
  },

  /** Descarga un archivo (p. ej. el Excel) respetando la sesión. */
  async descargar(ruta, nombrePorDefecto) {
    let r;
    try { r = await fetch(API_URL + '/api' + ruta, { headers: cabeceras() }); }
    catch { throw new ErrorApi('No se pudo conectar con el servidor.', 0); }
    if (!r.ok) await procesar(r);
    const disp = r.headers.get('content-disposition') || '';
    const nombre = (disp.match(/filename="([^"]+)"/) || [])[1] || nombrePorDefecto;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { nombre, filas: Number(r.headers.get('x-total-filas') || 0) };
  }
};

/** Convierte un objeto de filtros en query string, omitiendo vacíos. */
export const qs = obj => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null && !(Array.isArray(v) && !v.length)) p.set(k, Array.isArray(v) ? v.join(',') : v); });
  const s = p.toString();
  return s ? '?' + s : '';
};
