/* Formatos en español de Colombia. */
const n0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const num = v => (v == null || isNaN(v) ? '—' : n0.format(v));
export const dec = v => (v == null || isNaN(v) ? '—' : n1.format(v));
export const cop = v => (v == null || isNaN(v) ? '—' : pesos.format(v));
export const compacto = v => (v == null ? '—' : new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(v));
export const fecha = iso => {
  if (!iso) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00Z') : new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
};
export const fechaHora = iso => (iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '—');
export const mes = periodo => { const [y, m] = periodo.split('-'); return new Date(Date.UTC(+y, +m - 1, 15)).toLocaleDateString('es-CO', { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
export const km = m => (m == null ? '—' : m < 1000 ? `${n0.format(m)} m` : `${n1.format(m / 1000)} km`);
export const minutos = s => { if (s == null) return '—'; const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
export const plural = (n, uno, varios) => `${num(n)} ${n === 1 ? uno : varios}`;
export const corto = h => (h ? (h.startsWith('0x') ? h : '0x' + h).slice(0, 8) + '…' + h.slice(-6) : '—');
export const hoyBogota = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
