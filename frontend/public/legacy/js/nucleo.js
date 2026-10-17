/* =========================================================
   Traza Educativa · NÚCLEO
   Utilidades compartidas, entidades geográficas, sedes,
   estado global y bus de eventos.
   Depende de: d3 v7 y js/datos-reales.js
   ========================================================= */
(function () {
  'use strict';
  const D = window.EDU_DATA, CTX = window.EDU_CONTEXT;
  const TE = (window.TE = {});

  /* ---------- Formatos (es-CO) ---------- */
  const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  TE.fmt = v => (v == null || isNaN(v) ? '—' : nf0.format(Math.round(v)));
  TE.fmt1 = v => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v));
  TE.fmtC = v => new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  TE.pct = (v, d = 0) => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v * 100) + ' %');
  TE.fecha = t => new Date(t).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
  TE.fechaHora = t => new Date(t).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
  TE.mes = t => new Date(t).toLocaleDateString('es-CO', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  TE.plural = (n, uno, varios) => `${TE.fmt(n)} ${n === 1 ? uno : varios}`;
  TE.corto = h => (h ? h.slice(0, 10) + '…' + h.slice(-6) : '—');

  /* ---------- Texto seguro y normalización ---------- */
  TE.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  TE.norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  TE.cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  TE.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- Aleatorio reproducible (solo para datos de ejemplo) ---------- */
  TE.semilla = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  TE.rng = seed => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  /* ---------- Eventos ---------- */
  const oyentes = {};
  TE.on = (ev, fn) => (oyentes[ev] = oyentes[ev] || []).push(fn);
  TE.emit = (ev, x) => (oyentes[ev] || []).forEach(fn => fn(x));

  /* ---------- Geometría (polilíneas codificadas, precisión 1e4) ---------- */
  const K = Math.cos(6.25 * Math.PI / 180); // corrección de longitud a la latitud de Medellín
  TE.K = K;
  function decodificar(str) {
    let i = 0, lat = 0, lon = 0; const pts = [];
    while (i < str.length) {
      for (let k = 0; k < 2; k++) {
        let sh = 0, res = 0, b;
        do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << sh; sh += 5; } while (b >= 32);
        const d = res & 1 ? ~(res >> 1) : res >> 1;
        if (k === 0) lat += d; else lon += d;
      }
      pts.push([lon / 1e4 * K, lat / 1e4]);
    }
    return pts;
  }
  const feature = anillos => ({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: anillos.map(p => p.map(decodificar)) } });

  /* ---------- Comunas y corregimientos ---------- */
  TE.COM = D.C.map(c => Object.assign(feature(c[2]), {
    id: c[0], name: c[1] || 'Sin nombre', pop: D.CP[c[0]] || null,
    real: /^\d\d$/.test(c[0]), rural: /^\d\d$/.test(c[0]) && +c[0] >= 50,
    ipm: CTX.IPM[c[0]] ?? null
  }));
  TE.comById = new Map(TE.COM.map(c => [c.id, c]));
  TE.COMR = TE.COM.filter(c => c.real).sort((a, b) => +a.id - +b.id);
  TE.nomCom = id => (TE.comById.get(id) || {}).name || id;

  function comunaDePunto(x, y) {
    for (const c of TE.COMR) for (const poly of c.geometry.coordinates) if (d3.polygonContains(poly[0], [x, y])) return c.id;
    return null;
  }

  /* ---------- Barrios y veredas ---------- */
  TE.BAR = D.B.map(b => {
    const f = feature(b[3]);
    f.id = b[0]; f.name = b[1] || 'Sin nombre'; f.pop = D.P[b[0]] ?? null;
    let cid = /^\d{4}$/.test(b[0]) ? b[0].slice(0, 2) : null;
    if (!cid) { const r = f.geometry.coordinates[0][0]; cid = comunaDePunto(d3.mean(r, p => p[0]), d3.mean(r, p => p[1])); }
    f.com = cid; return f;
  });
  TE.barById = new Map(TE.BAR.map(b => [b.id, b]));
  TE.nomBar = id => (TE.barById.get(id) || {}).name || id;

  /* ---------- Sedes educativas (dato real) ---------- */
  TE.CLAS = ['Oficial · sede', 'Oficial · principal', 'No oficial', 'Oficial · confesión religiosa', 'Oficial · régimen especial', 'Cobertura contratada'];
  const esOficial = c => c === 0 || c === 1 || c === 3 || c === 4;
  TE.GR = ['0°', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°', '11°'];
  TE.SED = D.S.map((r, i) => {
    const g = r[7].split('.').map(Number);
    return {
      i, id: 'S' + String(i + 1).padStart(3, '0'), ie: r[0], ieName: D.E[r[0]],
      sede: r[1] || D.E[r[0]], principal: !r[1], clas: r[2], of: esOficial(r[2]),
      com: r[3], bar: r[4], lat: r[5] / 1e5, lon: r[6] / 1e5, x: r[6] / 1e5 * K, y: r[5] / 1e5, g, tot: d3.sum(g)
    };
  });
  TE.sedeById = new Map(TE.SED.map(s => [s.id, s]));
  TE.OF = TE.SED.filter(s => s.of);

  /* ---------- Estado global de la interfaz ---------- */
  TE.estado = {
    vista: 'mapa',
    rol: 'rector',          // rector | sem | auditor
    dim: 'con',             // dimensión activa en el mapa
    com: 'all',             // comuna seleccionada
    sedeSel: null,          // índice de sede seleccionada
    resaltadas: null,       // Set de índices resaltados por el asistente o las alertas
    resalteTxt: ''
  };
  /* ---------- Piezas de interfaz compartidas ---------- */
  let tipEl = null;
  TE.tip = {
    show(ev, html) {
      if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tt'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
      tipEl.innerHTML = html; tipEl.style.display = 'block';
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = ev.clientX + 14, y = ev.clientY + 14;
      if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
      if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
      tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
    },
    hide() { if (tipEl) tipEl.style.display = 'none'; }
  };
  let toastT = null;
  TE.toast = (msg, tipo = 'ok') => {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast ' + tipo; el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 5200);
  };
  TE.pill = est => est ? `<span class="pill ${est}"><i aria-hidden="true">${({ ok: '✓', lim: '!', crit: '✕' })[est]}</i>${({ ok: 'Adecuado', lim: 'Limitado', crit: 'Crítico' })[est]}</span>` : '';
  TE.tag = real => real ? '<span class="tag real" title="Dato oficial de fuente pública">Oficial</span>' : '<span class="tag ej" title="Dato de ejemplo generado para la demostración">Ejemplo</span>';

  TE.ROLES = {
    rector: { t: 'Rector/a de sede', d: 'propone actualizaciones', id: 'RS-DEMO' },
    sem: { t: 'Profesional SEM', d: 'aprueba o rechaza', id: 'PS-DEMO' },
    auditor: { t: 'Auditor/a externo', d: 'solo verifica', id: 'AU-DEMO' }
  };
})();
