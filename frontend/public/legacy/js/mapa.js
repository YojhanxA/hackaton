/* =========================================================
   Traza Educativa · MAPA TERRITORIAL
   Coropletas por comuna, sedes coloreadas por estado de la
   dimensión activa, ficha de sede con historial certificado
   y flujo de propuestas/aprobaciones según el rol.
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE, E = TE.estado, C = TE.cadena;
  const $ = id => document.getElementById(id);
  const svg = d3.select('#mapaSvg'), root = svg.append('g');
  const gC = root.append('g'), gB = root.append('g'), gP = root.append('g'), gR = root.append('g'), gL = root.append('g'), gBL = root.append('g');
  let W = 800, H = 600, proj, path, kz = 1, formTipo = null;

  /* ---------- Controles ---------- */
  const mDim = $('mDim'), mCom = $('mCom'), mBus = $('mBus'), mNom = $('mNom'), mPts = $('mPts');
  mDim.append(...TE.DIM_ORDEN.map(k => new Option(TE.DIM[k].t + (TE.DIM[k].real ? '' : ' · ejemplo'), k)));
  mDim.value = E.dim;
  mCom.append(new Option('Toda la ciudad', 'all'), ...TE.COMR.map(c => new Option(`${c.id} · ${c.name}`, c.id)));
  $('mDl').append(...TE.SED.map(s => { const o = document.createElement('option'); o.value = `${s.sede} — ${s.ieName} (${s.id})`; return o; }));
  mDim.onchange = () => { E.dim = mDim.value; render(); renderFicha(); };
  mCom.onchange = () => irComuna(mCom.value);
  mNom.onchange = mPts.onchange = () => render();
  mBus.oninput = () => { const m = mBus.value.match(/\((S\d{3})\)$/); if (m) { seleccionar(TE.sedeById.get(m[1]).i, true); mBus.value = ''; } };

  /* ---------- Zoom ---------- */
  const zoom = d3.zoom().scaleExtent([1, 40]).on('zoom', e => { root.attr('transform', e.transform); kz = e.transform.k; escalar(); });
  svg.call(zoom).on('dblclick.zoom', null);
  $('zIn').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.6);
  $('zOut').onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.6);
  $('zFit').onclick = () => irComuna('all');
  function escalar() {
    // En pantalla, puntos y nombres crecen poco con el zoom (k^0.25) para no tapar el mapa
    const q = Math.pow(kz, 0.75), fs = W < 600 ? 9 : 11.5, crece = Math.min(1.35, Math.pow(kz, 0.2));
    gC.selectAll('path').attr('stroke-width', 1.2 / kz);
    gB.selectAll('path').attr('stroke-width', 0.8 / kz);
    gP.selectAll('circle').attr('r', d => d._r / q).attr('stroke-width', 1.2 / kz);
    gR.selectAll('circle').attr('r', d => (d._r + 5) / q).attr('stroke-width', 2.5 / kz);
    gL.selectAll('text').attr('font-size', fs * crece / kz).attr('stroke-width', 3 / kz);
    gBL.selectAll('text').attr('font-size', (fs - 1) / kz).attr('stroke-width', 2.6 / kz);
  }
  function encuadrar(f, dur = 600) {
    if (!f) { svg.transition().duration(dur).call(zoom.transform, d3.zoomIdentity); return; }
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const k = Math.min(30, 0.85 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    svg.transition().duration(dur).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }

  /* ---------- Geometría ---------- */
  function layout() {
    const el = svg.node(); W = el.clientWidth || 800; H = el.clientHeight || 600;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    proj = d3.geoIdentity().reflectY(true).fitExtent([[18, 18], [W - 18, H - 18]], { type: 'FeatureCollection', features: TE.COMR });
    path = d3.geoPath(proj);
    gC.selectAll('path').data(TE.COM, d => d.id).join('path').attr('d', path).attr('fill-rule', 'evenodd')
      .style('cursor', d => d.real ? 'pointer' : 'default')
      .on('mousemove', (ev, d) => { if (!d.real) return; const D = TE.DIM[E.dim]; TE.tip.show(ev, `<b>${TE.esc(d.id + ' · ' + d.name)}</b><span>${TE.esc(D.ley)}: <b>${D.fmtC(D.vc(d.id))}</b></span><span class="m">${TE.fmt(d.pop)} habitantes · IPM ${d.ipm != null ? TE.fmt1(d.ipm) + ' %' : 's. d.'}</span>`); })
      .on('mouseleave', TE.tip.hide)
      .on('click', (ev, d) => { if (d.real && E.com !== d.id) irComuna(d.id); });
    gB.selectAll('path').data(TE.BAR, d => d.id).join('path').attr('d', path).attr('fill', 'none').attr('pointer-events', 'none');
    for (const s of TE.SED) { const p = proj([s.x, s.y]); s.px = p[0]; s.py = p[1]; }
    const lab = sel => sel.attr('text-anchor', 'middle').attr('dy', '.35em').attr('pointer-events', 'none').attr('paint-order', 'stroke').attr('stroke-linejoin', 'round');
    gL.selectAll('text').data(TE.COMR, d => d.id).join('text').attr('class', 'lbl-com').attr('x', d => path.centroid(d)[0]).attr('y', d => path.centroid(d)[1]).call(lab).text(d => d.name);
    gBL.selectAll('text').data(TE.BAR.filter(b => /^\d{4}$/.test(b.id)), d => d.id).join('text').attr('class', 'lbl-bar').attr('x', d => path.centroid(d)[0]).attr('y', d => path.centroid(d)[1]).call(lab).text(d => d.name);
  }

  /* ---------- Dibujo ---------- */
  function colorPunto(s) {
    const D = TE.DIM[E.dim];
    if (E.dim === 'mat') return s.of ? 'var(--oficial)' : 'var(--privado)';
    if (E.dim === 'ipm') return 'var(--faint)';
    if (E.dim === 'rei') return 'var(--accent)';
    return { ok: 'var(--good)', lim: 'var(--warn)', crit: 'var(--crit)' }[D.est(s)];
  }
  function render() {
    if (!path) return;
    const D = TE.DIM[E.dim], conCom = E.com !== 'all';
    const vals = new Map(TE.COMR.map(c => [c.id, D.vc(c.id)]));
    const ext = d3.extent([...vals.values()].filter(v => v != null));
    const ramp = d3.interpolateRgb(TE.cssv('--seq-0'), TE.cssv('--seq-1'));
    const col = v => v == null ? TE.cssv('--land') : ramp(ext[1] > ext[0] ? (v - ext[0]) / (ext[1] - ext[0]) : 0.5);
    gC.selectAll('path')
      .attr('fill', d => d.real ? col(vals.get(d.id)) : TE.cssv('--land'))
      .attr('fill-opacity', d => conCom && d.id !== E.com ? 0.3 : 1)
      .attr('stroke', TE.cssv('--surface'));
    gB.selectAll('path').attr('display', d => conCom && d.com === E.com ? null : 'none').attr('stroke', TE.cssv('--stroke'));
    gL.attr('display', mNom.checked && !conCom ? null : 'none');
    gBL.attr('display', mNom.checked && conCom ? null : 'none').selectAll('text').attr('display', d => d.com === E.com ? null : 'none');

    const datos = E.dim === 'mat' || E.dim === 'ipm' ? TE.SED : TE.OF;
    const maxT = d3.max(TE.SED, s => s.tot) || 1, maxR = d3.max(TE.OF, s => TE.met(s).rein12) || 1;
    const res = E.resaltadas;
    gP.attr('display', mPts.checked ? null : 'none');
    gP.selectAll('circle').data(datos, d => d.i).join('circle')
      .attr('cx', d => d.px).attr('cy', d => d.py)
      .each(d => { d._r = E.dim === 'rei' ? 1.6 + Math.sqrt(TE.met(d).rein12 / maxR) * 9 : E.dim === 'ipm' ? 1.4 : 1.8 + Math.sqrt(d.tot / maxT) * (E.dim === 'mat' ? 8 : 6); })
      .style('fill', colorPunto)
      .attr('fill-opacity', d => (res && !res.has(d.i)) || (conCom && d.com !== E.com) ? 0.18 : 0.92)
      .style('stroke', d => d.i === E.sedeSel ? 'var(--ink)' : 'var(--surface)')
      .classed('sel', d => d.i === E.sedeSel)
      .style('cursor', 'pointer')
      .on('mousemove', (ev, d) => {
        const est = D.est ? D.est(d) : null;
        TE.tip.show(ev, `<b>${TE.esc(d.sede)}</b><span class="m">${TE.esc(d.principal ? TE.CLAS[d.clas] : d.ieName)}</span><span>${TE.esc(TE.nomBar(d.bar))}, ${TE.esc(TE.nomCom(d.com))}</span><span>${TE.fmt(d.tot)} estudiantes${E.dim !== 'mat' && E.dim !== 'ipm' ? ' · ' + TE.esc(D.fmtV(D.v(d))) : ''}</span>${est ? TE.pill(est) : ''}`);
      })
      .on('mouseleave', TE.tip.hide)
      .on('click', (ev, d) => { ev.stopPropagation(); seleccionar(d.i, false); });
    gP.selectAll('circle.sel').raise();
    gR.selectAll('circle').data(res ? datos.filter(s => res.has(s.i)) : [], d => d.i).join('circle')
      .attr('cx', d => d.px).attr('cy', d => d.py).attr('fill', 'none').style('stroke', 'var(--accent)').attr('pointer-events', 'none');
    escalar();
    leyenda(D, ext);
    const rz = $('mRes');
    rz.hidden = !res;
    if (res) rz.innerHTML = `<span>${TE.esc(E.resalteTxt || 'Sedes resaltadas')} · ${TE.plural(res.size, 'sede', 'sedes')}</span><button type="button" id="mResX">Quitar</button>`, $('mResX').onclick = limpiarResalte;
  }
  function leyenda(D, ext) {
    const est = D.est ? `<div class="ley-row">${['ok', 'lim', 'crit'].map(k => `<span><i class="dot ${k}"></i>${TE.ESTADOS[k].t}</span>`).join('')}<span class="m">sedes oficiales · tamaño = matrícula</span></div>` : '';
    const pts = E.dim === 'mat' ? '<div class="ley-row"><span><i class="dot of"></i>Oficial</span><span><i class="dot no"></i>No oficial</span><span class="m">tamaño = matrícula</span></div>'
      : E.dim === 'rei' ? '<div class="ley-row"><span><i class="dot ac"></i>Sede oficial</span><span class="m">tamaño = elementos reintegrados</span></div>' : '';
    $('mLey').innerHTML = `<div class="ley-t"><b>${TE.esc(D.t)}</b>${TE.tag(D.real)}</div><div class="ley-s">${TE.esc(D.ley)}, por comuna</div>
      <div class="ramp"></div><div class="ramp-l"><span>${ext[0] != null ? D.fmtC(ext[0]) : '—'}</span><span>${ext[1] != null ? D.fmtC(ext[1]) : '—'}</span></div>
      <div class="ley-s">Más intenso = ${TE.esc(D.alto)}</div>${mPts.checked ? est + pts : ''}`;
  }

  /* ---------- Navegación ---------- */
  function irComuna(id) {
    E.com = id; mCom.value = id; E.sedeSel = null;
    encuadrar(id === 'all' ? null : TE.comById.get(id));
    render(); renderFicha();
  }
  function seleccionar(i, volar) {
    const s = TE.SED[i]; E.sedeSel = i; formTipo = null;
    if (volar) svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(7).translate(-s.px, -s.py));
    render(); renderFicha();
  }
  function resaltar(set, texto) {
    E.resaltadas = set && set.size ? set : null; E.resalteTxt = texto || '';
    if (E.resaltadas) {
      const pts = [...E.resaltadas].map(i => TE.SED[i]);
      const coms = new Set(pts.map(s => s.com));
      if (coms.size === 1) { E.com = [...coms][0]; mCom.value = E.com; encuadrar(TE.comById.get(E.com)); }
      else { E.com = 'all'; mCom.value = 'all'; encuadrar(null); }
    }
    render(); renderFicha();
  }
  function limpiarResalte() { E.resaltadas = null; E.resalteTxt = ''; render(); renderFicha(); }

  /* ---------- Ficha lateral ---------- */
  const fichaEl = $('ficha');
  function kv(pares) { return `<dl class="kv">${pares.map(([k, v]) => `<div><dt>${TE.esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`; }
  function barraEstados(cnt) {
    const tot = (cnt.ok || 0) + (cnt.lim || 0) + (cnt.crit || 0) || 1;
    return `<div class="stack" role="img" aria-label="Adecuado ${cnt.ok || 0}, limitado ${cnt.lim || 0}, crítico ${cnt.crit || 0}">${['ok', 'lim', 'crit'].map(k => `<span class="${k}" style="width:${(cnt[k] || 0) / tot * 100}%"></span>`).join('')}</div>
      <div class="stack-l">${['ok', 'lim', 'crit'].map(k => `<span><i class="dot ${k}"></i>${TE.ESTADOS[k].t} <b>${TE.fmt(cnt[k] || 0)}</b></span>`).join('')}</div>`;
  }
  function renderFicha() {
    if (E.sedeSel != null) return fichaSede(TE.SED[E.sedeSel]);
    const D = TE.DIM[E.dim], com = E.com, nom = com === 'all' ? 'Medellín' : `${com} · ${TE.nomCom(com)}`;
    let base = (E.dim === 'mat' || E.dim === 'ipm' ? TE.SED : TE.OF).filter(s => com === 'all' || s.com === com);
    if (E.resaltadas) base = base.filter(s => E.resaltadas.has(s.i));
    const ofs = TE.OF.filter(s => com === 'all' || s.com === com);
    let html = `<div class="f-head"><p class="eyebrow">${E.resaltadas ? 'Selección del asistente' : 'Resumen territorial'}</p><h2>${TE.esc(nom)}</h2></div>
      <div class="hero"><span class="hero-v">${D.fmtC(D.vc(com))}</span>${TE.tag(D.real)}</div><p class="sub">${TE.esc(D.ley)}</p>`;
    html += kv([['Sedes educativas', TE.fmt(TE.SED.filter(s => com === 'all' || s.com === com).length)], ['Sedes oficiales', TE.fmt(ofs.length)],
      ['Estudiantes', TE.fmt(d3.sum(TE.SED.filter(s => com === 'all' || s.com === com), s => s.tot))], ['Población 2025', com === 'all' ? TE.fmt(d3.sum(TE.COMR, c => c.pop)) : TE.fmt(TE.comById.get(com).pop)]]);
    if (D.est) { const cnt = d3.rollup(ofs, v => v.length, s => D.est(s)); html += `<h3 class="h3">Estado de las sedes oficiales</h3>${barraEstados(Object.fromEntries(cnt))}`; }
    if (E.dim === 'ipm') {
      const lista = TE.COMR.filter(c => c.ipm != null).sort((a, b) => b.ipm - a.ipm);
      html += `<h3 class="h3">Comunas con más pobreza multidimensional</h3><ol class="lst">${lista.slice(0, 8).map(c => `<li><button type="button" data-com="${c.id}"><span>${TE.esc(c.name)}</span><b>${TE.fmt1(c.ipm)} %</b></button></li>`).join('')}</ol>`;
    } else {
      const orden = base.filter(s => D.v(s) != null).sort((a, b) => D.dir * (D.v(b) - D.v(a)));
      const sinDato = base.filter(s => D.v(s) == null);
      const top = (D.dir === 1 ? sinDato : []).concat(orden).slice(0, 8);
      html += `<h3 class="h3">${E.dim === 'mat' ? 'Sedes con más estudiantes' : E.dim === 'rei' ? 'Sedes con más reintegros' : 'Sedes en peor situación'}</h3>
        <ol class="lst">${top.map(s => `<li><button type="button" data-sede="${s.i}"><span>${TE.esc(s.sede)}<small>${TE.esc(TE.nomCom(s.com))}</small></span><b>${TE.esc(D.fmtV(D.v(s)))}</b></button></li>`).join('')}</ol>`;
    }
    html += `<p class="nota">Toca una sede en el mapa para ver su ficha, su historial certificado y ${E.rol === 'rector' ? 'proponer actualizaciones' : E.rol === 'sem' ? 'aprobar cambios pendientes' : 'verificar sus registros'}.</p>`;
    fichaEl.innerHTML = html;
    fichaEl.querySelectorAll('[data-sede]').forEach(b => b.onclick = () => seleccionar(+b.dataset.sede, true));
    fichaEl.querySelectorAll('[data-com]').forEach(b => b.onclick = () => irComuna(b.dataset.com));
  }

  function miniGrados(g) {
    const w = 300, h = 74, mx = d3.max(g) || 1, bw = w / 12;
    return `<svg class="mini" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Estudiantes por grado">${g.map((v, k) => {
      const bh = v / mx * (h - 22);
      return `<rect x="${k * bw + 3}" y="${h - 14 - bh}" width="${bw - 6}" height="${Math.max(bh, 0.5)}" rx="2"><title>Grado ${TE.GR[k]}: ${TE.fmt(v)}</title></rect><text x="${k * bw + bw / 2}" y="${h - 3}" text-anchor="middle">${TE.GR[k]}</text>`;
    }).join('')}</svg>`;
  }

  function fichaSede(s) {
    const x = TE.X.get(s.i), m = x ? TE.met(s) : null, hist = C.historialSede(s.id);
    const pend = [...C.pendientes.values()].filter(b => b.entidad.id === s.id);
    let h = `<button type="button" class="volver" id="fVolver">← Volver al resumen</button>
      <div class="f-head"><p class="eyebrow">${s.id} · ${TE.esc(TE.CLAS[s.clas])}</p><h2>${TE.esc(s.sede)}</h2>
      <p class="sub">${s.principal ? 'Sede principal' : TE.esc(s.ieName)}<br>${TE.esc(TE.nomBar(s.bar))}, ${TE.esc(TE.nomCom(s.com))}</p></div>
      <section class="blk"><div class="blk-h"><h3>Matrícula</h3>${TE.tag(true)}</div><p class="big">${TE.fmt(s.tot)} <small>estudiantes de 0° a 11°</small></p>${miniGrados(s.g)}</section>`;
    if (!x) {
      h += `<p class="nota">Sede del sector no oficial: la Secretaría de Educación no administra su conectividad, dotación ni personal, así que solo se muestra la matrícula.</p>`;
      fichaEl.innerHTML = h; $('fVolver').onclick = volver; return;
    }
    const c = x.con, t = x.tic, mb = x.mob, p = x.per;
    h += `<section class="blk"><div class="blk-h"><h3>Conectividad</h3>${TE.pill(m.conEst)}${TE.tag(false)}</div>${kv([['Enlace', TE.esc(c.tipo)], ['Operador', TE.esc(c.operador)], ['Contratado', c.contratado ? TE.fmt(c.contratado) + ' Mbps' : '—'], ['Medido', c.contratado ? `${TE.fmt(c.medido)} Mbps (${TE.pct(m.cumpl)})` : '—'], ['Disponibilidad', c.contratado ? TE.fmt1(c.disp) + ' %' : '—']])}</section>
      <section class="blk"><div class="blk-h"><h3>Infraestructura TIC</h3>${TE.pill(m.ticEst)}${TE.tag(false)}</div>${kv([['Equipos', TE.fmt(t.equipos)], ['Portátiles / tabletas', `${TE.fmt(t.portatiles)} / ${TE.fmt(t.tabletas)}`], ['Estudiantes por equipo', TE.fmt1(m.estEq)], ['Obsoletos', t.obsoletosPct + ' %']])}</section>
      <section class="blk"><div class="blk-h"><h3>Mobiliario</h3>${TE.pill(m.mobEst)}${TE.tag(false)}</div>
        <div class="stack" role="img" aria-label="Bueno ${mb.bueno}, regular ${mb.regular}, malo ${mb.malo}"><span class="ok" style="width:${mb.bueno / m.pup * 100}%"></span><span class="lim" style="width:${mb.regular / m.pup * 100}%"></span><span class="crit" style="width:${mb.malo / m.pup * 100}%"></span></div>
        <div class="stack-l"><span><i class="dot ok"></i>Bueno <b>${TE.fmt(mb.bueno)}</b></span><span><i class="dot lim"></i>Regular <b>${TE.fmt(mb.regular)}</b></span><span><i class="dot crit"></i>Malo <b>${TE.fmt(mb.malo)}</b></span></div>
        <p class="m">Último inventario: ${TE.fecha(mb.fechaInv)}</p></section>
      <section class="blk"><div class="blk-h"><h3>Personal</h3>${TE.pill(m.perEst)}${TE.tag(false)}</div>${kv([['Docentes', TE.fmt(p.docentes)], ['Directivos', TE.fmt(p.directivos)], ['Administrativos', TE.fmt(p.admin)], ['Apoyo (aseo y vigilancia)', TE.fmt(p.apoyo)], ['Vacantes', TE.fmt(p.vacantes)], ['Estudiantes por docente', m.estDoc ? TE.fmt1(m.estDoc) : 'sin dato']])}
        <p class="m">Solo cifras agregadas: los datos personales no se publican ni van a la cadena.</p></section>
      <section class="blk"><div class="blk-h"><h3>Reintegros</h3>${TE.tag(false)}</div>${kv([['Registros', TE.fmt(m.reinN)], ['Elementos (12 meses)', TE.fmt(m.rein12)]])}
        ${x.rein.length ? `<ul class="rein">${x.rein.slice(-4).reverse().map(q => `<li><span>${TE.esc(q.elemento)} ×${q.cantidad}<small>${TE.fecha(q.fecha)} · ${TE.esc(q.estado)}</small></span><button type="button" class="hashbtn" data-fila="${q.id}" title="Verificar esta fila">${q.id}</button></li>`).join('')}</ul>` : ''}</section>`;

    // Pendientes y acciones según el rol
    h += `<section class="blk gob"><div class="blk-h"><h3>Gobierno del dato</h3></div>`;
    if (pend.length) h += pend.map(b => `<div class="pend"><p><b>Propuesta pendiente · bloque #${b.n}</b><br>${TE.esc(TE.TIPOS_CAMBIO[b.datos.tipo].t)} · ${TE.esc(b.actor.id)} · ${TE.fechaHora(b.ts)}</p>
      <ul>${Object.entries(b.datos.cambios).map(([k, v]) => `<li>${TE.esc(TE.ETQ_CAMPO[k])}: ${TE.esc(v.antes)} → <b>${TE.esc(v.despues)}</b></li>`).join('')}</ul>
      ${E.rol === 'sem' ? `<div class="acc"><button type="button" class="btn pri" data-apr="${b.n}">Aprobar y certificar</button><button type="button" class="btn" data-rec="${b.n}">Rechazar</button></div>` : ''}</div>`).join('');
    if (E.rol === 'rector') h += formulario(s, x);
    else if (E.rol === 'sem' && !pend.length) h += `<p class="m">No hay propuestas pendientes para esta sede. Cambia al rol “Rector/a de sede” para proponer una.</p>`;
    else if (E.rol === 'auditor') h += `<p class="m">Rol de solo lectura: puedes verificar cualquier registro, pero no proponer ni aprobar cambios.</p>`;
    h += `</section>`;

    h += `<section class="blk"><div class="blk-h"><h3>Historial certificado</h3><span class="m">${TE.plural(hist.length, 'bloque', 'bloques')}</span></div>
      <ol class="hist">${hist.slice().reverse().slice(0, 8).map(b => `<li><span class="acc-${b.accion}">${TE.esc(TE.ACCIONES[b.accion])}</span><small>${TE.fechaHora(b.ts)} · ${TE.esc(b.actor.id)}</small><button type="button" class="hashbtn" data-bloque="${b.n}" title="Verificar el bloque #${b.n}">#${b.n} · ${b.hash.slice(0, 10)}</button></li>`).join('')}</ol></section>`;
    fichaEl.innerHTML = h;
    $('fVolver').onclick = volver;
    fichaEl.querySelectorAll('[data-bloque]').forEach(b => b.onclick = () => TE.irVerificar('#' + b.dataset.bloque));
    fichaEl.querySelectorAll('[data-fila]').forEach(b => b.onclick = () => TE.irVerificar(b.dataset.fila));
    fichaEl.querySelectorAll('[data-apr]').forEach(b => b.onclick = () => { const r = C.decidir(+b.dataset.apr, true); TE.toast(`Aprobada y certificada en el bloque #${r.n}. Los datos de la sede se actualizaron.`); });
    fichaEl.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => { const r = C.decidir(+b.dataset.rec, false, 'Rechazada en la demostración: soporte insuficiente.'); TE.toast(`Rechazo registrado en el bloque #${r.n}. Los datos no cambiaron.`, 'warn'); });
    const f = $('fProp'); if (f) conectarFormulario(s, x);
  }
  function volver() { E.sedeSel = null; render(); renderFicha(); }

  function formulario(s, x) {
    const tipos = Object.entries(TE.TIPOS_CAMBIO);
    const tipo = formTipo || tipos[0][0];
    return `<form id="fProp" class="prop" novalidate>
      <p class="m">Como rector/a puedes proponer una actualización. Queda registrada en la cadena y solo cambia los datos cuando un profesional SEM la aprueba.</p>
      <div class="f"><label for="fTipo">Tipo de actualización</label><select id="fTipo">${tipos.map(([k, v]) => `<option value="${k}"${k === tipo ? ' selected' : ''}>${v.t}</option>`).join('')}</select></div>
      ${TE.TIPOS_CAMBIO[tipo].campos.map(c => `<div class="f"><label for="fc-${c.replace('.', '-')}">${TE.ETQ_CAMPO[c]} <small>actual: ${TE.esc(TE.leer(x, c))}</small></label><input id="fc-${c.replace('.', '-')}" type="number" step="${c === 'con.disp' ? '0.1' : '1'}" min="0" value="${TE.leer(x, c)}" data-campo="${c}"></div>`).join('')}
      <div class="f"><label for="fSop">Soporte</label><input id="fSop" type="text" placeholder="Ej.: Acta de medición 4512" autocomplete="off"></div>
      <p class="err" id="fErr" role="alert"></p>
      <button type="submit" class="btn pri">Firmar y enviar propuesta</button></form>`;
  }
  function conectarFormulario(s, x) {
    $('fTipo').onchange = e => { formTipo = e.target.value; fichaSede(s); };
    $('fProp').onsubmit = e => {
      e.preventDefault();
      const cambios = {};
      $('fProp').querySelectorAll('[data-campo]').forEach(inp => {
        const c = inp.dataset.campo, v = c === 'con.disp' ? Math.round(parseFloat(inp.value) * 10) / 10 : parseInt(inp.value, 10), a = TE.leer(x, c);
        if (!isNaN(v) && v !== a) cambios[c] = { antes: a, despues: v };
      });
      const sop = $('fSop').value.trim(), err = $('fErr');
      if (!Object.keys(cambios).length) { err.textContent = 'No cambiaste ningún valor. Modifica al menos un campo.'; return; }
      if (!sop) { err.textContent = 'Indica el soporte del cambio (acta, informe o resolución).'; return; }
      if (cambios['con.disp'] && cambios['con.disp'].despues > 100) { err.textContent = 'La disponibilidad no puede superar el 100 %.'; return; }
      const b = C.proponer(s, $('fTipo').value, cambios, sop);
      formTipo = null;
      TE.toast(`Propuesta registrada en el bloque #${b.n}. Cambia al rol “Profesional SEM” para aprobarla.`);
    };
  }

  /* ---------- Integración ---------- */
  TE.mapa = { render: () => { render(); renderFicha(); }, layout: () => { layout(); render(); }, seleccionar, resaltar, limpiarResalte, irComuna };
  TE.on('datos', () => { render(); renderFicha(); });
  TE.on('cadena', () => { if (E.sedeSel != null) renderFicha(); });
  TE.on('rol', () => { formTipo = null; renderFicha(); });
  TE.on('tema', render);
  let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (svg.node().clientWidth) { layout(); render(); } }, 120); }).observe(svg.node());
  layout(); render(); renderFicha();
})();
