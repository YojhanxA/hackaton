import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './cliente';

/** Carga datos del backend con estado de carga, error y recarga. Cancela la solicitud anterior si cambia la ruta. */
export function useDatos(ruta, { activo = true } = {}) {
  const [estado, setEstado] = useState({ datos: null, cargando: !!(ruta && activo), error: null });
  const ctl = useRef(null);
  const cargar = useCallback(async () => {
    if (!ruta || !activo) return;
    if (ctl.current) ctl.current.abort();
    const c = new AbortController(); ctl.current = c;
    setEstado(e => ({ datos: e.datos, cargando: true, error: null }));
    try {
      const d = await api.get(ruta, { signal: c.signal });
      if (!c.signal.aborted) setEstado({ datos: d, cargando: false, error: null });
    } catch (e) {
      if (e.name !== 'AbortError' && !c.signal.aborted) setEstado(s => ({ datos: s.datos, cargando: false, error: e }));
    }
  }, [ruta, activo]);
  useEffect(() => { cargar(); return () => ctl.current && ctl.current.abort(); }, [cargar]);
  return { ...estado, recargar: cargar };
}
