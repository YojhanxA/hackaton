/* =========================================================
   Traza Educativa · TABLERO DE INDICADORES
   KPIs, gráficas comparativas por comuna y tabla de
   indicadores. El filtro de comuna filtra los totales y
   resalta la comuna en las gráficas comparativas.
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE, C = TE.cadena;
  const $ = id => document.getElementById(id);
  const DIA = 86400000;
  let com = 'all', orden = { k: 'conNo', dir: -1 };

  const tCom = $('tCom');
  tCom.append(new Option('Toda la ciudad', 'all'), ...TE.COMR.map(c => new Option(`${c.id} · ${c.name}`, c.id)));
  tCom.onchange = () => { com = tCom.value; render(); };

  const ofDe = c => TE.OF.filter(s => c === 'all' || s.com === c);
  const sedDe = c => TE.SED.filter(s => c === 'all' || s.com === c);
  const conteo = (ss, k) => { const o = { ok: 0, lim: 0, crit: 0 }; for (const s of ss) o[TE.met(s)[k]]++; return o; };

  /* ---------- Indicadores por comuna (también alimentan la tabla) ---------- */
  function indicadores(c) {
    const of = ofDe(c), sd = sedDe(c);
    const est = d3.sum(of, s => s.tot);
    const eq = d3.sum(of, s => TE.X.get(s.i).tic.equipos), doc = d3.sum(of, s => TE.X.get(s.i).per.docentes);
    const pup = d3.sum(of, s => TE.met(s).pup), malo = d3.sum(of, s => TE.X.get(s.i).mob.malo);
    const cc = conteo(of, 'conEst');
    return {
      id: c, nombre: c === 'all' ? 'Medellín' : TE.nomCom(c), sedes: sd.length, of: of.length, est: d3.sum(sd, s => s.tot), estOf: est,
      ipm: c === 'all' ? null : TE.comById.get(c).ipm, conNo: of.length ? (cc.lim + cc.crit) / of.length : null, conCrit: cc.crit,
      estEq: eq ? est / eq : null, malo: pup ? malo / pup : null, maloN: malo, estDoc: doc ? est / doc : null,
      vac: d3.sum(of, s => TE.X.get(s.i).per.vacantes), rein: d3.sum(of, s => TE.met(s).rein12),
      obs: eq ? d3.sum(of, s => TE.X.get(s.i).tic.equipos * TE.X.get(s.i).tic.obsoletosPct / 100) / eq : null
    };
  }

  /* ---------- KPIs ---------- */
  function kpis() {
    const k = indicadores(com), of = ofDe(com);
    const ids = new Set(of.map(s => s.id));
    const aprob = C.bloques.filter(b => b.accion === 'APROBACION' && ids.has(b.entidad.id) && Date.parse(b.ts) >= TE.HACE12M).length;
    const pend = [...C.pendientes.values()].filter(b => ids.has(b.entidad.id)).length;
    const regs = d3.sum(of, s => TE.X.get(s.i).rein.filter(q => q.fecha >= TE.HACE12M).length);
    const t = [
      ['Sedes oficiales', TE.fmt(k.of), true, `de ${TE.fmt(k.sedes)} sedes educativas`],
      ['Estudiantes', TE.fmtC(k.est), true, `${TE.pct(k.est ? k.estOf / k.est : null)} en sedes oficiales`],
      ['Conectividad adecuada', TE.pct(k.conNo == null ? null : 1 - k.conNo), false, `${TE.plural(k.conCrit, 'sede crítica', 'sedes críticas')}`, k.conNo > 0.5 ? 'crit' : k.conNo > 0.3 ? 'lim' : 'ok'],
      ['Estudiantes por equipo', TE.fmt1(k.estEq), false, `${TE.pct(k.obs)} de los equipos son obsoletos`, k.estEq > 25 ? 'crit' : k.estEq > 12 ? 'lim' : 'ok'],
      ['Pupitres en mal estado', TE.pct(k.malo, 1), false, `${TE.fmt(k.maloN)} por reponer`, k.malo > 0.3 ? 'crit' : k.malo > 0.15 ? 'lim' : 'ok'],
      ['Estudiantes por docente', TE.fmt1(k.estDoc), false, `${TE.plural(k.vac, 'vacante abierta', 'vacantes abiertas')}`, k.estDoc > 36 ? 'crit' : k.estDoc > 32 ? 'lim' : 'ok'],
      ['Elementos reintegrados', TE.fmt(k.rein), false, `${TE.fmt(regs)} registros en 12 meses`],
      ['Cambios aprobados', TE.fmt(aprob), false, `${TE.plural(pend, 'propuesta pendiente', 'propuestas pendientes')} · 12 meses`]
    ];
    $('tKpi').innerHTML = t.map(([l, v, real, sub, est]) => `<div class="kpi"><div class="kpi-h"><span>${l}</span>${TE.tag(real)}</div>
      <div class="kpi-v">${v}${est ? TE.pill(est) : ''}</div><p>${sub}</p></div>`).join('');
    $('tTitulo').textContent = com === 'all' ? 'Medellín · 16 comunas y 5 corregimientos' : `${com} · ${TE.nomCom(com)}`;
  }

  /* ---------- Utilidades de dibujo ---------- */
  function lienzo(id, h) {
    const el = $(id); el.innerHTML = '';
    const w = Math.max(280, el.clientWidth || 600);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h).attr('role', 'img');
    return { svg, w, h };
  }
  const tip = (ev, html) => TE.tip.show(ev, html);
  const ETQ = { ok: 'Adecuado', lim: 'Limitado', crit: 'Crítico' };

  /* Filas apiladas al 100 % con estados (adecuado / limitado / crítico) */
  function filasEstado(id, filas, opt = {}) {
    const fh = 20, gap = 9, top = 4;
    const { svg, w } = lienzo(id, top + filas.length * (fh + gap));
    const lw = Math.min(opt.lw || 132, w * 0.36), rw = 46, bw = w - lw - rw - 8;
    svg.attr('aria-label', opt.aria || 'Distribución de estados');
    filas.forEach((f, k) => {
      const y = top + k * (fh + gap), tot = f.ok + f.lim + f.crit || 1, dim = opt.resaltar && opt.resaltar !== f.key;
      const g = svg.append('g').attr('opacity', dim ? 0.38 : 1).style('cursor', opt.click ? 'pointer' : null);
      if (opt.click) g.on('click', () => opt.click(f));
      g.append('text').attr('class', 'ax-l' + (opt.resaltar === f.key ? ' fuerte' : '')).attr('x', lw - 8).attr('y', y + fh / 2).attr('dy', '.35em').attr('text-anchor', 'end').text(f.label);
      let x = lw;
      ['ok', 'lim', 'crit'].forEach((e, j) => {
        const ww = f[e] / tot * bw; if (ww <= 0) return;
        const quedan = ['ok', 'lim', 'crit'].slice(j + 1).some(z => f[z] > 0);
        g.append('rect').attr('class', 'm-' + e).attr('x', x).attr('y', y).attr('width', Math.max(1, ww - (quedan ? 2 : 0))).attr('height', fh).attr('rx', 3)
          .on('mousemove', ev => tip(ev, `<b>${TE.esc(f.label)}</b><span>${TE.pill(e)} ${TE.fmt(f[e])} de ${TE.fmt(tot)} sedes (${TE.pct(f[e] / tot)})</span>`))
          .on('mouseleave', TE.tip.hide);
        x += ww;
      });
      g.append('text').attr('class', 'ax-v').attr('x', w - 2).attr('y', y + fh / 2).attr('dy', '.35em').attr('text-anchor', 'end').text(TE.pct((f.lim + f.crit) / tot));
    });
  }

  /* Barras horizontales ordenadas, con línea de referencia opcional */
  function barras(id, filas, opt) {
    const fh = 14, gap = 8, top = opt.ref ? 22 : 4, bottom = 4;
    const { svg, w } = lienzo(id, top + filas.length * (fh + gap) + bottom);
    const lw = Math.min(opt.lw || 132, w * 0.36), rw = 52;
    const max = d3.max(filas, f => f.v) || 1, xmax = opt.ref ? Math.max(max, opt.ref.v * 1.1) : max;
    const x = d3.scaleLinear().domain([0, xmax]).range([lw, w - rw]);
    svg.attr('aria-label', opt.aria);
    filas.forEach((f, k) => {
      const y = top + k * (fh + gap), dim = opt.resaltar && opt.resaltar !== f.key;
      const g = svg.append('g').attr('opacity', dim ? 0.38 : 1).style('cursor', opt.click ? 'pointer' : null);
      if (opt.click) g.on('click', () => opt.click(f));
      g.append('rect').attr('x', 0).attr('y', y - gap / 2).attr('width', w).attr('height', fh + gap).attr('fill', 'transparent')
        .on('mousemove', ev => tip(ev, opt.tip(f))).on('mouseleave', TE.tip.hide);
      g.append('text').attr('class', 'ax-l' + (opt.resaltar === f.key ? ' fuerte' : '')).attr('x', lw - 8).attr('y', y + fh / 2).attr('dy', '.35em').attr('text-anchor', 'end').text(f.label).attr('pointer-events', 'none');
      g.append('rect').attr('class', f.cls || 'm-s1').attr('x', lw).attr('y', y).attr('width', Math.max(1, x(f.v) - lw)).attr('height', fh).attr('rx', 3).attr('pointer-events', 'none');
      g.append('text').attr('class', 'ax-v').attr('x', x(f.v) + 6).attr('y', y + fh / 2).attr('dy', '.35em').text(opt.fmt(f.v)).attr('pointer-events', 'none');
    });
    if (opt.ref) {
      const xr = x(opt.ref.v);
      svg.append('line').attr('class', 'ref').attr('x1', xr).attr('x2', xr).attr('y1', top - 6).attr('y2', top + filas.length * (fh + gap) - gap + 2);
      svg.append('text').attr('class', 'ax-m').attr('x', xr).attr('y', 11).attr('text-anchor', xr > w - 120 ? 'end' : 'middle').text(opt.ref.t);
    }
  }

  /* ---------- Gráficas ---------- */
  function gEstados() {
    const of = ofDe(com);
    filasEstado('cEst', [['Conectividad', 'conEst'], ['Infraestructura TIC', 'ticEst'], ['Mobiliario', 'mobEst'], ['Personal', 'perEst']]
      .map(([label, k]) => Object.assign({ label, key: k }, conteo(of, k))), { lw: 140, aria: 'Sedes oficiales por estado en cada dimensión' });
  }
  function gConectividad() {
    const filas = TE.COMR.map(c => Object.assign({ label: c.name, key: c.id }, conteo(ofDe(c.id), 'conEst')))
      .sort((a, b) => (b.lim + b.crit) / (b.ok + b.lim + b.crit || 1) - (a.lim + a.crit) / (a.ok + a.lim + a.crit || 1));
    filasEstado('cCon', filas, { resaltar: com === 'all' ? null : com, click: f => fijar(f.key), aria: 'Conectividad de las sedes oficiales por comuna' });
  }
  function gTic() {
    const filas = TE.COMR.map(c => ({ label: c.name, key: c.id, v: TE.DIM.tic.vc(c.id) })).filter(f => f.v != null).sort((a, b) => b.v - a.v);
    barras('cTic', filas, { resaltar: com === 'all' ? null : com, click: f => fijar(f.key), fmt: TE.fmt1, ref: { v: 12, t: 'Umbral adecuado de la demo: 12' },
      aria: 'Estudiantes por equipo de cómputo por comuna',
      tip: f => `<b>${TE.esc(f.label)}</b><span>${TE.fmt1(f.v)} estudiantes por equipo</span><span class="m">Sedes oficiales · dato de ejemplo</span>` });
  }
  function gMeses() {
    const of = new Set(ofDe(com).map(s => s.i));
    const meses = d3.utcMonths(Date.UTC(2025, 0, 1), Date.UTC(2026, 9, 1));
    const datos = meses.map(m => {
      const fin = d3.utcMonth.offset(m, 1);
      const fs = TE.REIN.filter(q => of.has(q.sede) && q.fecha >= +m && q.fecha < +fin);
      return { m, tic: d3.sum(fs.filter(q => q.grupo === 'TIC'), q => q.cantidad), mob: d3.sum(fs.filter(q => q.grupo === 'Mobiliario'), q => q.cantidad), n: fs.length };
    });
    const { svg, w, h } = lienzo('cMes', 230);
    svg.attr('aria-label', 'Elementos reintegrados por mes, TIC y mobiliario');
    const m = { l: 40, r: 8, t: 10, b: 24 };
    const x = d3.scaleBand().domain(datos.map(d => +d.m)).range([m.l, w - m.r]).paddingInner(0.28);
    const y = d3.scaleLinear().domain([0, d3.max(datos, d => d.tic + d.mob) || 1]).nice(4).range([h - m.b, m.t]);
    y.ticks(4).forEach(t => {
      svg.append('line').attr('class', t === 0 ? 'base' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(t)).attr('y2', y(t));
      svg.append('text').attr('class', 'ax-m').attr('x', m.l - 6).attr('y', y(t)).attr('dy', '.35em').attr('text-anchor', 'end').text(TE.fmtC(t));
    });
    datos.forEach((d, k) => {
      const x0 = x(+d.m), bw = x.bandwidth();
      const yT = y(d.tic), yM = y(d.tic + d.mob);
      if (d.tic) svg.append('rect').attr('class', 'm-s1').attr('x', x0).attr('y', yT).attr('width', bw).attr('height', y(0) - yT).attr('rx', 2);
      if (d.mob) svg.append('rect').attr('class', 'm-s2').attr('x', x0).attr('y', yM).attr('width', bw).attr('height', Math.max(0, yT - yM - (d.tic ? 2 : 0))).attr('rx', 2);
      if (k % 3 === 0) svg.append('text').attr('class', 'ax-m').attr('x', x0 + bw / 2).attr('y', h - 6).attr('text-anchor', 'middle').text(TE.mes(d.m));
      svg.append('rect').attr('x', x0 - x.step() * x.paddingInner() / 2).attr('y', m.t).attr('width', x.step()).attr('height', h - m.t - m.b).attr('fill', 'transparent')
        .on('mousemove', ev => tip(ev, `<b>${TE.mes(d.m)}</b><span><i class="sw s1"></i>TIC: ${TE.fmt(d.tic)} elementos</span><span><i class="sw s2"></i>Mobiliario: ${TE.fmt(d.mob)} elementos</span><span class="m">${TE.plural(d.n, 'registro', 'registros')} certificados</span>`))
        .on('mouseleave', TE.tip.hide);
    });
  }
  function gTipos() {
    const of = new Set(ofDe(com).map(s => s.i));
    const fs = TE.REIN.filter(q => of.has(q.sede) && q.fecha >= TE.HACE12M);
    const filas = d3.rollups(fs, v => ({ v: d3.sum(v, q => q.cantidad), n: v.length, g: v[0].grupo }), q => q.elemento)
      .map(([label, o]) => ({ label, key: label, v: o.v, n: o.n, cls: o.g === 'TIC' ? 'm-s1' : 'm-s2', g: o.g })).sort((a, b) => b.v - a.v);
    if (!filas.length) { $('cTipo').innerHTML = '<p class="vacio">Sin reintegros en los últimos 12 meses.</p>'; return; }
    barras('cTipo', filas, { lw: 170, fmt: TE.fmt, aria: 'Elementos reintegrados por tipo en los últimos 12 meses',
      tip: f => `<b>${TE.esc(f.label)}</b><span><i class="sw ${f.g === 'TIC' ? 's1' : 's2'}"></i>${f.g}</span><span>${TE.fmt(f.v)} elementos en ${TE.plural(f.n, 'registro', 'registros')}</span>` });
  }
  function gDispersion() {
    const pts = TE.COMR.filter(c => c.ipm != null).map(c => { const i = indicadores(c.id); return { c, x: c.ipm / 100, y: i.conNo, est: i.estOf }; }).filter(p => p.y != null);
    const { svg, w, h } = lienzo('cDis', 280);
    svg.attr('aria-label', 'Pobreza multidimensional frente a conectividad no adecuada, por comuna');
    const m = { l: 44, r: 16, t: 12, b: 34 };
    const x = d3.scaleLinear().domain([0, d3.max(pts, p => p.x) * 1.08]).nice(5).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, 1]).range([h - m.b, m.t]);
    const r = d3.scaleSqrt().domain([0, d3.max(pts, p => p.est)]).range([3, 13]);
    y.ticks(4).forEach(t => {
      svg.append('line').attr('class', t === 0 ? 'base' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(t)).attr('y2', y(t));
      svg.append('text').attr('class', 'ax-m').attr('x', m.l - 6).attr('y', y(t)).attr('dy', '.35em').attr('text-anchor', 'end').text(TE.pct(t));
    });
    x.ticks(5).forEach(t => svg.append('text').attr('class', 'ax-m').attr('x', x(t)).attr('y', h - m.b + 14).attr('text-anchor', 'middle').text(TE.pct(t)));
    svg.append('text').attr('class', 'ax-m').attr('x', w - m.r).attr('y', h - 4).attr('text-anchor', 'end').text('IPM 2025 (dato oficial) →');
    const etiq = new Set(pts.slice().sort((a, b) => (b.x + b.y) - (a.x + a.y)).slice(0, 4).map(p => p.c.id));
    if (com !== 'all') etiq.add(com);
    pts.sort((a, b) => b.est - a.est).forEach(p => {
      const sel = com === p.c.id;
      svg.append('circle').attr('class', sel ? 'm-ac' : 'm-s1').attr('cx', x(p.x)).attr('cy', y(p.y)).attr('r', r(p.est)).attr('fill-opacity', 0.78)
        .style('stroke', 'var(--surface)').attr('stroke-width', 2).style('cursor', 'pointer')
        .on('mousemove', ev => tip(ev, `<b>${TE.esc(p.c.id + ' · ' + p.c.name)}</b><span>IPM: ${TE.pct(p.x, 1)}</span><span>Conectividad no adecuada: ${TE.pct(p.y)} de las sedes oficiales</span><span class="m">${TE.fmt(p.est)} estudiantes en sedes oficiales</span>`))
        .on('mouseleave', TE.tip.hide).on('click', () => fijar(p.c.id));
      if (etiq.has(p.c.id)) svg.append('text').attr('class', 'ax-l' + (sel ? ' fuerte' : '')).attr('x', x(p.x) + r(p.est) + 4).attr('y', y(p.y)).attr('dy', '.35em')
        .attr('text-anchor', x(p.x) > w - 110 ? 'end' : 'start').attr('dx', x(p.x) > w - 110 ? -2 * r(p.est) - 8 : 0).text(p.c.name);
    });
  }

  /* ---------- Tabla ---------- */
  const COLS = [
    ['nombre', 'Comuna', v => TE.esc(v), true], ['of', 'Sedes oficiales', TE.fmt, true], ['est', 'Estudiantes', TE.fmt, true], ['ipm', 'IPM 2025', v => v == null ? '—' : TE.fmt1(v) + ' %', true],
    ['conNo', 'Conectividad no adecuada', v => TE.pct(v), false], ['estEq', 'Est. por equipo', TE.fmt1, false], ['malo', 'Pupitres en mal estado', v => TE.pct(v, 1), false],
    ['estDoc', 'Est. por docente', TE.fmt1, false], ['vac', 'Vacantes', TE.fmt, false], ['rein', 'Reintegros 12 m', TE.fmt, false]
  ];
  function tabla() {
    const filas = TE.COMR.map(c => indicadores(c.id));
    const k = orden.k;
    filas.sort((a, b) => k === 'nombre' ? orden.dir * a.nombre.localeCompare(b.nombre, 'es') : orden.dir * ((a[k] ?? -1) - (b[k] ?? -1)));
    const tot = indicadores('all');
    $('tTabla').innerHTML = `<table><thead><tr>${COLS.map(([c, t, , real]) => `<th scope="col" class="${c === 'nombre' ? 'izq' : ''}" aria-sort="${c === k ? (orden.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-k="${c}">${t}${real ? '' : '<sup title="Dato de ejemplo">*</sup>'}<span class="ord">${c === k ? (orden.dir > 0 ? '▲' : '▼') : ''}</span></button></th>`).join('')}</tr></thead>
      <tbody>${filas.map(f => `<tr class="${f.id === com ? 'sel' : ''}" data-com="${f.id}" tabindex="0">${COLS.map(([c, , fmt]) => `<td class="${c === 'nombre' ? 'izq' : ''}">${c === 'nombre' ? `<span class="cod">${f.id}</span> ` : ''}${fmt(f[c])}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr>${COLS.map(([c, , fmt]) => `<td class="${c === 'nombre' ? 'izq' : ''}">${c === 'nombre' ? 'Medellín' : c === 'ipm' ? '—' : fmt(tot[c])}</td>`).join('')}</tr></tfoot></table>`;
    $('tTabla').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const c = b.dataset.k; orden = { k: c, dir: orden.k === c ? -orden.dir : (c === 'nombre' ? 1 : -1) }; tabla(); });
    $('tTabla').querySelectorAll('tbody tr').forEach(tr => { tr.onclick = () => fijar(tr.dataset.com); tr.onkeydown = e => { if (e.key === 'Enter') fijar(tr.dataset.com); }; });
  }

  function fijar(c) { com = com === c ? 'all' : c; tCom.value = com; render(); }

  function visible() { const v = $('v-tablero'); return v && !v.hidden; }
  function render() {
    if (!visible()) return;
    kpis(); gEstados(); gConectividad(); gTic(); gMeses(); gTipos(); gDispersion(); tabla();
    $('tFiltro').textContent = com === 'all' ? 'Toda la ciudad' : TE.nomCom(com);
    $('tLimpiar').hidden = com === 'all';
  }
  $('tLimpiar').onclick = () => { com = 'all'; tCom.value = 'all'; render(); };

  TE.tablero = { render, indicadores };
  TE.on('datos', render);
  TE.on('cadena', () => { if (visible()) kpis(); });
  let rt, ancho = 0;
  new ResizeObserver(es => { const w = es[0].contentRect.width; if (Math.abs(w - ancho) < 2) return; ancho = w; clearTimeout(rt); rt = setTimeout(render, 140); }).observe($('v-tablero'));
})();
