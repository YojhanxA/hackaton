/* Gráficos reutilizables (Recharts). Los estados usan siempre el mismo color + leyenda con texto. */
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ESTADOS_REINTEGRO } from '../config';
import { mes, num, cop } from '../formato';

const css = (v, d) => (typeof window !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(v).trim()) || d;
const COLOR = { realizado: ['--good', '#0ca30c'], pendiente: ['--warn', '#fab219'], rechazado: ['--crit', '#d03b3b'], anulado: ['--neutro', '#8b919f'] };
const ORDEN = ['realizado', 'pendiente', 'rechazado', 'anulado'];

function Globo({ active, payload, label, valor }) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="globo">
      <b>{mes(label)}</b>
      {payload.slice().reverse().map(p => <span key={p.dataKey}><i style={{ background: p.color }} />{ESTADOS_REINTEGRO[p.dataKey].t}: {num(p.value)}</span>)}
      <span className="m">Total: {num(total)}{valor != null ? ` · Valor realizado: ${cop(valor(label))}` : ''}</span>
    </div>
  );
}

/** Barras apiladas de reintegros por mes y estado. datos: [{ periodo:'2026-01', realizado, pendiente, ... }] */
export function ReintegrosPorMes({ datos, alto = 260, valorRealizado }) {
  const tinta = css('--tinta-2', '#4a5161'), rejilla = css('--rejilla', '#e8eaef');
  const mapaValor = valorRealizado ? new Map(datos.map(d => [d.periodo, d.valor_realizado])) : null;
  return (
    <div className="grafico" role="img" aria-label="Reintegros por mes y estado">
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart data={datos} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={rejilla} />
          <XAxis dataKey="periodo" tickFormatter={mes} tick={{ fill: tinta, fontSize: 12 }} axisLine={{ stroke: rejilla }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: tinta, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<Globo valor={mapaValor ? p => mapaValor.get(p) : null} />} cursor={{ fill: css('--superficie-2', '#f5f6f9') }} />
          <Legend formatter={k => <span style={{ color: tinta, fontSize: 13 }}>{ESTADOS_REINTEGRO[k].t}</span>} iconType="square" />
          {ORDEN.map((k, i) => <Bar key={k} dataKey={k} stackId="e" fill={css(...COLOR[k])} stroke={css('--superficie', '#fff')} strokeWidth={1} radius={i === ORDEN.length - 1 ? [3, 3, 0, 0] : 0} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Reintegros por objeto y categoría ----------
   Mobiliario y eléctrico son IDENTIDADES (no estados): usan los dos primeros tonos de la paleta categórica,
   nunca los colores de estado. Los valores van siempre en texto, el color solo acompaña. */
export const CATEGORIAS = {
  mobiliario: { t: 'Mobiliario', color: '#2a78d6' },
  electrico: { t: 'Eléctrico', color: '#eb6834' }
};

/** Barras horizontales en HTML (se leen bien con nombres largos y en el celular).
    filas: [{ clave, etiqueta, sub, valor, detalle, color }] */
export function BarrasHorizontales({ filas, titulo, alElegir, formato = num }) {
  const max = Math.max(1, ...filas.map(f => f.valor));
  if (!filas.length) return <p className="vacio">Sin datos para graficar.</p>;
  return (
    <ol className="barras-h" aria-label={titulo}>
      {filas.map((f, k) => {
        const contenido = (
          <>
            <span className="bh-et"><span className="bh-pos">{k + 1}</span><span className="bh-nom" title={f.etiqueta}>{f.etiqueta}</span>{f.sub && <small>{f.sub}</small>}</span>
            <span className="bh-pista"><span className="bh-barra" style={{ width: `${Math.max(1.5, (f.valor / max) * 100)}%`, background: f.color || 'var(--acento)' }} /></span>
            <span className="bh-val">{formato(f.valor)}</span>
            {f.detalle && <span className="bh-det">{f.detalle}</span>}
          </>
        );
        return (
          <li key={f.clave} title={f.detalle ? `${f.etiqueta}: ${f.detalle}` : undefined}>
            {alElegir ? <button type="button" className="bh-fila" onClick={() => alElegir(f)} aria-label={`${f.etiqueta}: ${formato(f.valor)}. Filtrar por este valor`}>{contenido}</button> : <div className="bh-fila">{contenido}</div>}
          </li>
        );
      })}
    </ol>
  );
}

/** Parte y todo de dos categorías: dos cifras grandes y una barra dividida al 100 %. */
export function DivisionCategorias({ datos, medida = 'elementos' }) {
  const v = Object.fromEntries(datos.map(d => [d.categoria, Number(d[medida]) || 0]));
  const total = (v.mobiliario || 0) + (v.electrico || 0);
  const pct = k => (total ? Math.round((v[k] || 0) / total * 1000) / 10 : 0);
  return (
    <div className="division">
      <div className="division-cifras">
        {['mobiliario', 'electrico'].map(k => (
          <div key={k} className="division-cifra">
            <span className="dc-t"><i style={{ background: CATEGORIAS[k].color }} aria-hidden="true" />{CATEGORIAS[k].t}</span>
            <span className="dc-v">{num(v[k] || 0)}</span>
            <span className="dc-d">{pct(k).toLocaleString('es-CO')} % de {num(total)} {medida}</span>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="division-barra" role="img" aria-label={`Mobiliario ${pct('mobiliario')} %, eléctrico ${pct('electrico')} %`}>
          {['mobiliario', 'electrico'].map(k => v[k] > 0 && <span key={k} style={{ flexGrow: v[k], background: CATEGORIAS[k].color }} title={`${CATEGORIAS[k].t}: ${num(v[k])} ${medida} (${pct(k)} %)`} />)}
        </div>
      )}
    </div>
  );
}

export function LeyendaCategorias() {
  return (
    <p className="leyenda-cat">{Object.values(CATEGORIAS).map(c => <span key={c.t}><i style={{ background: c.color }} aria-hidden="true" />{c.t}</span>)}</p>
  );
}
