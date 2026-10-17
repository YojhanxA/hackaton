/* Conexión con el contrato TrazaAnclaje (contratos/TrazaAnclaje.sol).
   Lectura por el nodo público de la red; firma con MetaMask. Sin librerías: el ABI se codifica a mano
   porque solo se usan cuatro funciones. Probado contra una EVM local (ver backend/test y LEEME). */
import { BLOCKCHAIN as RED } from '../config';
import ARTEFACTO from './TrazaAnclaje.json';

const SEL = { anclar: 'e5d256ff', consultar: '1b606327', total: '2ddbd13a', raices: '27f1054d', autorizados: '8c14c670' };
const ERR = { '93342084': 'Esta cuenta no está autorizada para anclar. El propietario del contrato debe autorizarla.', '1b3a91a2': 'Esta huella ya estaba anclada en la red.', '91bdcb8d': 'La huella o el número de eventos no son válidos.' };
const CHAIN_HEX = '0x' + RED.chainId.toString(16);
const pal = h => String(h).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const num = n => BigInt(n).toString(16).padStart(64, '0');
const palabra = (hex, i) => hex.replace(/^0x/, '').slice(i * 64, (i + 1) * 64);
const aNum = w => Number(BigInt('0x' + (w || '0')));
export const billetera = () => (typeof window !== 'undefined' && window.ethereum) || null;
export const esDireccion = a => /^0x[0-9a-fA-F]{40}$/.test(a || '');

const CLAVE = 'traza.contrato.v2';
export function direccionContrato() {
  if (esDireccion(RED.contrato)) return RED.contrato;
  try { const v = localStorage.getItem(CLAVE); return esDireccion(v) ? v : ''; } catch { return ''; }
}
export function guardarDireccion(a) { try { localStorage.setItem(CLAVE, a); } catch { /* bloqueado */ } }
export const desdeConfiguracion = () => esDireccion(RED.contrato);

let idRpc = 1;
async function leer(method, params) {
  const r = await fetch(RED.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method, params }) });
  if (!r.ok) throw new Error(`El nodo de ${RED.nombre} respondió ${r.status}.`);
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message || 'Error del nodo'); e.data = j.error.data; e.code = j.error.code; throw e; }
  return j.result;
}
const llamar = (datos, from) => leer('eth_call', [Object.assign({ to: direccionContrato(), data: '0x' + datos }, from ? { from } : {}), 'latest']);

export const contrato = {
  total: async () => aNum(palabra(await llamar(SEL.total), 0)),
  raiz: async i => palabra(await llamar(SEL.raices + num(i)), 0),
  consultar: async raiz => { const h = await llamar(SEL.consultar + pal(raiz)); return { eventos: aNum(palabra(h, 0)), cuando: aNum(palabra(h, 1)), quien: '0x' + palabra(h, 2).slice(24) }; },
  autorizado: async dir => aNum(palabra(await llamar(SEL.autorizados + pal(dir)), 0)) === 1
};

export function mensajeError(e) {
  if (!e) return 'Error desconocido.';
  if (e.code === 4001) return 'Cancelaste la firma en MetaMask. No se envió nada.';
  if (e.code === -32002) return 'MetaMask ya tiene una solicitud abierta. Ábrela desde el ícono de la extensión.';
  const t = [e.data, e.data && e.data.data, e.data && e.data.originalError && e.data.originalError.data, e.message].map(x => (typeof x === 'string' ? x : x ? JSON.stringify(x) : '')).join(' ').toLowerCase();
  for (const [s, m] of Object.entries(ERR)) if (t.includes(s)) return m;
  if (/insufficient funds/.test(t)) return `La cuenta no tiene ${RED.moneda.symbol} de prueba para pagar la transacción. Pídelos en un faucet de ${RED.nombre}.`;
  if (/failed to fetch|networkerror|load failed/.test(t)) return `No se pudo conectar con el nodo de ${RED.nombre}.`;
  return (e.message || String(e)).slice(0, 220);
}

export async function conectar() {
  const w = billetera(); if (!w) throw new Error('No se detectó MetaMask en este navegador.');
  const [cuenta] = await w.request({ method: 'eth_requestAccounts' });
  await asegurarRed();
  return cuenta;
}
async function asegurarRed() {
  const w = billetera();
  if (String(await w.request({ method: 'eth_chainId' })).toLowerCase() === CHAIN_HEX) return;
  try { await w.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
  catch (e) {
    if (e.code !== 4902) throw e;
    await w.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: RED.nombre, rpcUrls: [RED.rpc], nativeCurrency: RED.moneda, blockExplorerUrls: [RED.explorador] }] });
  }
}
async function esperar(hash) {
  for (let k = 0; k < 120; k++) {
    const r = await billetera().request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
    if (r) { if (r.status !== '0x1') throw new Error('La transacción fue revertida por el contrato.'); return r; }
    await new Promise(res => setTimeout(res, 2000));
  }
  throw new Error('La red no confirmó la transacción en 4 minutos. Revisa su estado en el explorador.');
}

/** Despliega el contrato desde el navegador (alternativa a Remix). Devuelve la dirección. */
export async function desplegar(cuenta) {
  await asegurarRed();
  const hash = await billetera().request({ method: 'eth_sendTransaction', params: [{ from: cuenta, data: ARTEFACTO.bytecode }] });
  const r = await esperar(hash);
  guardarDireccion(r.contractAddress);
  return { direccion: r.contractAddress, hash };
}

/** Publica la raíz (64 hex) de los primeros n eventos. Simula antes para no gastar si va a fallar. */
export async function anclar(cuenta, raiz, n, alAvanzar = () => {}) {
  await asegurarRed();
  const datos = SEL.anclar + pal(raiz) + num(n);
  await llamar(datos, cuenta);
  alAvanzar('firmar');
  const hash = await billetera().request({ method: 'eth_sendTransaction', params: [{ from: cuenta, to: direccionContrato(), data: '0x' + datos }] });
  alAvanzar('esperar', hash);
  await esperar(hash);
  return hash;
}

export const enlaces = {
  tx: h => `${RED.explorador}/tx/${h}`,
  direccion: a => `${RED.explorador}/address/${a}`
};
export { RED, CHAIN_HEX };
