import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext(() => {});

/** Mensajes de confirmación o error que aparecen unos segundos en la esquina. */
export function ProveedorAvisos({ children }) {
  const [lista, setLista] = useState([]);
  const id = useRef(0);
  const avisar = useCallback((texto, tipo = 'ok') => {
    const k = ++id.current;
    setLista(l => [...l.slice(-2), { k, texto, tipo }]);
    setTimeout(() => setLista(l => l.filter(x => x.k !== k)), tipo === 'error' ? 7000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {lista.map(a => <div key={a.k} className={'aviso-flot ' + a.tipo}><span aria-hidden="true">{a.tipo === 'error' ? '✕' : '✓'}</span>{a.texto}</div>)}
      </div>
    </Ctx.Provider>
  );
}
export const useAvisos = () => useContext(Ctx);
