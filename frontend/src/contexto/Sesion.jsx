import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, sesion, alExpirarSesion } from '../api/cliente';

const Ctx = createContext(null);
const NIVEL = { lector: 1, editor: 2, admin: 3 };

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(() => (sesion.leer() || {}).usuario || null);
  const [aviso, setAviso] = useState('');

  const salir = useCallback(msg => { sesion.borrar(); setUsuario(null); setAviso(msg || ''); }, []);
  useEffect(() => { alExpirarSesion(msg => salir(msg || 'Tu sesión terminó. Inicia sesión de nuevo.')); }, [salir]);

  const entrar = useCallback(async (u, clave) => {
    const r = await api.post('/auth/login', { usuario: u, clave });
    sesion.guardar(r); setUsuario(r.usuario); setAviso('');
    return r.usuario;
  }, []);

  const valor = useMemo(() => ({
    usuario, entrar, salir, aviso,
    /** ¿El usuario tiene al menos este rol? */
    puede: rol => !!usuario && NIVEL[usuario.rol] >= NIVEL[rol]
  }), [usuario, entrar, salir, aviso]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useSesion = () => useContext(Ctx);
