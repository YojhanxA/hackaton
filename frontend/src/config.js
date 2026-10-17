/* Configuración centralizada del frontend. Ningún secreto vive aquí: solo direcciones públicas.
   El origen de las rutas (Secretaría de Educación) NO se configura aquí: lo entrega el backend
   desde la tabla de configuración, para que exista en un solo lugar. */
const env = import.meta.env;

/** URL del backend. Vacía = mismo dominio (en desarrollo, Vite redirige /api al backend). */
export const API_URL = (env.VITE_API_URL || '').replace(/\/$/, '');

/** Convierte una ruta del backend (/api/imagenes/...) en URL absoluta. */
export const urlApi = ruta => (ruta && ruta.startsWith('/') ? API_URL + ruta : ruta);

/** Colores de las rutas: 8 tonos distinguibles entre sí (paleta categórica validada). */
export const COLORES_RUTA = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#6250d6', '#e34948'];
export const MAX_RUTAS = COLORES_RUTA.length;

/** Red y contrato para anclar la bitácora (contratos/TrazaAnclaje.sol). */
export const BLOCKCHAIN = {
  nombre: env.VITE_CHAIN_NOMBRE || 'Monad Testnet',
  tipo: 'red de prueba',
  chainId: Number(env.VITE_CHAIN_ID || 10143),
  rpc: env.VITE_CHAIN_RPC || 'https://testnet-rpc.monad.xyz',
  explorador: env.VITE_CHAIN_EXPLORADOR || 'https://testnet.monadscan.com',
  moneda: { name: env.VITE_CHAIN_MONEDA || 'MON', symbol: env.VITE_CHAIN_MONEDA || 'MON', decimals: 18 },
  contrato: env.VITE_CONTRATO || ''
};

export const ESTADOS_REINTEGRO = {
  realizado: { t: 'Realizado', ic: '✓', clase: 'ok' },
  pendiente: { t: 'Pendiente', ic: '!', clase: 'warn' },
  rechazado: { t: 'Rechazado', ic: '✕', clase: 'crit' },
  anulado: { t: 'Anulado', ic: '–', clase: 'neutro' }
};
