/* =========================================================
   Traza Educativa · APLICACIÓN
   Navegación entre vistas, rol de la demo, indicador de
   integridad y la vista de Trazabilidad (auditoría,
   verificador, pruebas de manipulación, bloques y anclajes).
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE, C = TE.cadena, E = TE.estado;
  const $ = id => document.getElementById(id);
  const VISTAS = ['mapa', 'tablero', 'alertas', 'asistente', 'cadena', 'datos'];

  /* ---------- Navegación ---------- */
  function irVista(v) {
    if (!VISTAS.includes(v)) v = 'mapa';
    E.vista = v;
    VISTAS.forEach(k => { $('v-' + k).hidden = k !== v; });
    document.querySelectorAll('.nav [data-vista]').forEach(b => b.setAttribute('aria-current', b.dataset.vista === v ? 'page' : 'false'));
    TE.tip.hide();
    if (v === 'tablero') TE.tablero.render();
    if (v === 'alertas') TE.alertas.render();
    if (v === 'cadena') renderCadena();
    if (v === 'mapa') requestAnimationFrame(() => TE.mapa.layout());
    if (location.hash !== '#' + v) { try { history.replaceState(null, '', '#' + v); } catch (e) { /* marco restringido */ } }
    window.scrollTo(0, 0);
  }
  TE.irVista = irVista;
  document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); irVista(b.dataset.vista); }));
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VISTAS.includes(v) && v !== E.vista) irVista(v); });

  /* ---------- Rol ---------- */
  const rolSel = $('rol');
  rolSel.append(...Object.entries(TE.ROLES).map(([k, r]) => new Option(r.t, k)));
  rolSel.value = E.rol;
  rolSel.onchange = () => {
    E.rol = rolSel.value; document.body.dataset.rol = E.rol;
    TE.emit('rol');
    const r = TE.ROLES[E.rol];
    TE.toast(`Ahora actúas como ${r.t} (${r.id}): ${r.d}.`);
  };
  document.body.dataset.rol = E.rol;

  /* ---------- Indicador de integridad ---------- */
  function chip() {
    const el = $('chipInt'), n = TE.fmt(C.bloques.length);
    const m = { ok: ['ok', '✓', 'Cadena íntegra', `${n} bloques`], fallo: ['crit', '✕', 'Alteración detectada', 'ver auditoría'], pendiente: ['warn', '!', 'Cambios sin auditar', 'auditar ahora'], 'sin-verificar': ['warn', '!', 'Sin verificar', 'auditar ahora'] }[C.estado];
    el.className = 'chip-int ' + m[0];
    el.innerHTML = `<i aria-hidden="true">${m[1]}</i><span><b>${m[2]}</b><small>${m[3]}</small></span>`;
    el.title = 'Abrir Trazabilidad';
  }
  $('chipInt').onclick = () => irVista('cadena');

  /* ---------- Tema (lo decide el visor o el sistema) ---------- */
  const avisarTema = () => TE.emit('tema');
  new MutationObserver(avisarTema).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', avisarTema); } catch (e) { /* navegador antiguo */ }

  /* =========================================================
     TRAZABILIDAD
     ========================================================= */
  const ICON = ok => ok === true ? '<i class="st ok" aria-label="Correcto">✓</i>' : ok === false ? '<i class="st crit" aria-label="Falló">✕</i>' : '<i class="st pend" aria-label="Pendiente">◷</i>';
  const mono = h => `<code class="hash" title="${h}">${TE.corto(h)}</code>`;

  function renderEstado() {
    const u = C.ultima, anclados = C.anclajes.filter(a => a.estado === 'anclado'), ult = anclados[anclados.length - 1];
    const m = { ok: ['ok', '✓', 'La información está íntegra', 'Todas las huellas, enlaces y raíces ancladas coinciden, y la base de datos corresponde a lo certificado.'],
      fallo: ['crit', '✕', 'Se detectaron alteraciones', 'La auditoría encontró diferencias. Revisa el detalle abajo y restaura los datos.'],
      pendiente: ['warn', '!', 'Hay cambios sin auditar', 'Se simuló una manipulación. Ejecuta la auditoría para ver si se detecta.'],
      'sin-verificar': ['warn', '!', 'Sin verificar', 'Ejecuta la auditoría.'] }[C.estado];
    $('cEstado').innerHTML = `<div class="int-big ${m[0]}"><i aria-hidden="true">${m[1]}</i><div><b>${m[2]}</b><p>${m[3]}</p>
      ${u ? `<p class="m">Última auditoría: ${TE.fechaHora(u.cuando)} · ${TE.fmt(u.v.n)} bloques verificados en ${TE.fmt(u.v.ms)} ms</p>` : ''}</div></div>
      <dl class="kv4">
        <div><dt>Bloques</dt><dd>${TE.fmt(C.bloques.length)}</dd></div>
        <div><dt>Días anclados</dt><dd>${TE.fmt(anclados.length)}</dd></div>
        <div><dt>Propuestas pendientes</dt><dd>${TE.fmt(C.pendientes.size)}</dd></div>
        <div><dt>Última raíz anclada</dt><dd>${ult ? mono(ult.raiz) : '—'}<small>${ult ? ult.fecha : ''}</small></dd></div>
      </dl>`;
  }

  /* ---------- Auditoría ---------- */
  function renderAuditoria() {
    const u = C.ultima, box = $('cRes');
    if (!u || !u.c || (u.ok && !mostrarAud)) { box.hidden = true; return; }
    box.hidden = false;
    const { v, c } = u, anc = C.anclajes.filter(a => a.estado === 'anclado').length, lotes = C.lotes.size, filas = [...C.lotes.values()].reduce((t, l) => t + l.ids.length, 0);
    const pasos = [
      [!v.err.length, `Huellas y enlaces de ${TE.fmt(v.n)} bloques`, v.err.length ? `${TE.plural(v.err.length, 'error', 'errores')}` : 'Cada bloque coincide con su huella y apunta al anterior'],
      [!v.errAn.length, `Raíces Merkle de ${TE.fmt(anc)} días anclados`, v.errAn.length ? `${TE.plural(v.errAn.length, 'día no coincide', 'días no coinciden')} con la raíz publicada` : 'Coinciden con las raíces publicadas (anclaje simulado)'],
      [!c.dif.length, `Base de datos frente a la cadena (${TE.fmt(TE.OF.length)} sedes × ${TE.CAMPOS.length} campos)`, c.dif.length ? `${TE.plural(c.dif.length, 'diferencia', 'diferencias')}` : 'Los valores actuales son los certificados'],
      [!c.rdif.length, `Filas de reintegros (${TE.fmt(filas)} filas en ${TE.fmt(lotes)} archivos)`, c.rdif.length ? `${TE.plural(c.rdif.length, 'fila alterada o borrada', 'filas alteradas o borradas')}` : 'Todas coinciden con su raíz Merkle']
    ];
    const det = [];
    v.err.slice(0, 6).forEach(e => det.push(`<li><span>Bloque #${e.n}: ${TE.esc(e.msg)}</span><button type="button" class="hashbtn" data-q="#${e.n}">Verificar</button></li>`));
    v.errAn.slice(0, 6).forEach(e => det.push(`<li><span>Anclaje del ${e.fecha} (bloques #${e.desde}–#${e.hasta}): ${TE.esc(e.msg)}</span><button type="button" class="hashbtn" data-q="#${e.desde}">Verificar</button></li>`));
    c.dif.slice(0, 6).forEach(d => det.push(`<li><span><b>${TE.esc(d.sede.sede)}</b> · ${TE.esc(TE.ETQ_CAMPO[d.campo] || d.campo)}: certificado <b>${TE.esc(d.cadena)}</b>, en la base de datos <b>${TE.esc(d.bd)}</b></span><button type="button" class="hashbtn" data-q="${d.sede.id}">Historial</button></li>`));
    c.rdif.slice(0, 6).forEach(d => det.push(`<li><span>${d.id} (${TE.esc(d.archivo)}): ${TE.esc(d.msg)}</span><button type="button" class="hashbtn" data-q="#${d.bloque}">Ver archivo</button></li>`));
    const extra = v.err.length + v.errAn.length + c.dif.length + c.rdif.length - det.length;
    box.innerHTML = `<div class="res-h"><h2>Resultado de la auditoría</h2><span class="m">${TE.fechaHora(u.cuando)}</span></div>
      <ul class="pasos-v">${pasos.map(([ok, t, d]) => `<li>${ICON(ok)}<span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ul>
      ${det.length ? `<h3 class="h3">Qué se alteró</h3><ul class="det">${det.join('')}</ul>${extra > 0 ? `<p class="m">y ${TE.fmt(extra)} hallazgos más.</p>` : ''}` : ''}
      ${v.errAn.length && !v.err.length ? '<p class="nota">El atacante recalculó todas las huellas para que la cadena “cuadrara”, pero no puede cambiar una raíz ya publicada en una blockchain pública. Por eso el anclaje es la defensa de fondo.</p>' : ''}`;
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => TE.irVerificar(b.dataset.q));
  }
  let mostrarAud = false;
  $('cAud').onclick = () => {
    mostrarAud = true;
    const a = C.auditar();
    TE.toast(a.ok ? `Auditoría completa: ${TE.fmt(a.v.n)} bloques verificados en ${TE.fmt(a.v.ms)} ms. Todo coincide.` : 'La auditoría detectó alteraciones. Revisa el detalle.', a.ok ? 'ok' : 'warn');
    renderCadena();
    $('cRes').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (TE.bc && TE.bc.configurado()) TE.bc.verificar(); // compara también contra la blockchain
  };

  /* ---------- Pruebas de manipulación ---------- */
  const ESPERA = {
    bloque: 'La huella SHA-256 del bloque ya no coincidirá con su contenido.',
    recalculo: 'La cadena parecerá consistente, pero la raíz Merkle del día ya estaba anclada y no coincidirá.',
    bd_sede: 'La conciliación mostrará que el valor actual no es el certificado por ninguna aprobación.',
    bd_rein: 'La fila borrada falta frente a la raíz Merkle del archivo que la certificó.'
  };
  function renderAlteracion() {
    const a = C.alteracion;
    $('cAlt').disabled = !!a; $('cAltBtn').hidden = !!a; $('cRest').hidden = !a;
    $('cAltMsg').innerHTML = a ? `<div class="sim"><p><b>Simulación activa.</b> ${TE.esc(a.d)}</p><p class="m">Qué debería pasar: ${TE.esc(ESPERA[a.tipo])}</p>${C.estado === 'pendiente' ? '<button type="button" class="btn pri sm" id="cAud2">Auditar ahora</button>' : ''}</div>` : '';
    const b2 = $('cAud2'); if (b2) b2.onclick = () => $('cAud').click();
  }
  $('cAltBtn').onclick = () => { C.alterar($('cAlt').value); mostrarAud = true; TE.toast('Manipulación simulada. Ejecuta la auditoría.', 'warn'); renderCadena(); };
  $('cRest').onclick = () => { C.restaurar(); mostrarAud = false; TE.toast('Datos originales restaurados. La auditoría vuelve a pasar.'); renderCadena(); };

  /* ---------- Verificador ---------- */
  function datosBloque(b) {
    return `<dl class="kv">
      <div><dt>Bloque</dt><dd>#${b.n}</dd></div><div><dt>Fecha</dt><dd>${TE.fechaHora(b.ts)}</dd></div>
      <div><dt>Acción</dt><dd><span class="acc-${b.accion}">${TE.esc(TE.ACCIONES[b.accion])}</span></dd></div>
      <div><dt>Actor</dt><dd>${TE.esc(b.actor.rol)} · ${TE.esc(b.actor.id)}</dd></div>
      <div><dt>Entidad</dt><dd>${TE.esc(b.entidad.nombre || b.entidad.id)}${b.entidad.tipo === 'sede' ? ` <small>${b.entidad.id}</small>` : ''}</dd></div>
      <div class="full"><dt>Huella SHA-256</dt><dd><code class="hash full">${b.hash}</code></dd></div>
      <div class="full"><dt>Huella del bloque anterior</dt><dd><code class="hash full">${b.prev}</code></dd></div></dl>`;
  }
  function verificar(q) {
    const out = $('vOut'), r = C.buscar(q);
    if (!r) { out.innerHTML = '<p class="err">No reconozco ese dato. Escribe un número de bloque (#120), una huella (al menos 6 caracteres), un reintegro (R00010), una placa (SEM-123456) o una sede (S205).</p>'; return; }
    if (r.tipo === 'sede') {
      const s = TE.sedeById.get(r.id); if (!s) { out.innerHTML = '<p class="err">No existe esa sede.</p>'; return; }
      const h = C.historialSede(s.id);
      out.innerHTML = `<div class="v-res"><p><b>${TE.esc(s.sede)}</b> · ${TE.esc(TE.nomCom(s.com))}</p>${h.length ? `<p class="m">${TE.plural(h.length, 'bloque certificado', 'bloques certificados')}. Elige uno para verificarlo.</p><ol class="hist">${h.slice().reverse().map(b => `<li><span class="acc-${b.accion}">${TE.esc(TE.ACCIONES[b.accion])}</span><small>${TE.fechaHora(b.ts)} · ${TE.esc(b.actor.id)}</small><button type="button" class="hashbtn" data-q="#${b.n}">#${b.n} · ${b.hash.slice(0, 10)}</button></li>`).join('')}</ol>` : '<p class="m">Esta sede no tiene bloques: es del sector no oficial y la plataforma solo guarda su matrícula.</p>'}
        <button type="button" class="btn sm" id="vMapa">Ver la sede en el mapa</button></div>`;
      out.querySelectorAll('[data-q]').forEach(b => b.onclick = () => TE.irVerificar(b.dataset.q));
      $('vMapa').onclick = () => { irVista('mapa'); TE.mapa.seleccionar(s.i, true); };
      return;
    }
    const v = r.tipo === 'bloque' ? C.verificarBloque(r.n) : C.verificarFila(r.id);
    if (!v) { out.innerHTML = `<p class="err">${r.tipo === 'bloque' ? `No existe el bloque #${r.n}. La cadena tiene ${TE.fmt(C.bloques.length)} bloques (del #0 al #${C.bloques.length - 1}).` : `No encontré ${r.id} en ningún archivo certificado.`}</p>`; return; }
    const b = v.b, fila = v.fila;
    const anc = v.anclaje || (r.tipo === 'fila' ? C.anclajeDe(b.n) : null);
    out.innerHTML = `<div class="v-res ${v.ok ? 'ok' : 'crit'}">
      <p class="v-tit">${ICON(v.ok)}<b>${v.ok ? (r.tipo === 'fila' ? 'Fila auténtica: no ha cambiado desde que se certificó' : 'Bloque auténtico: no ha sido alterado') : 'La verificación falló: el registro fue alterado'}</b></p>
      <ul class="pasos-v">${v.pasos.map(p => `<li>${ICON(p.ok)}<span><b>${TE.esc(p.t)}</b><small>${TE.esc(p.d)}</small></span></li>`).join('')}</ul>
      ${fila ? `<h3 class="h3">Fila de reintegro</h3><dl class="kv"><div><dt>Código</dt><dd>${fila.id}</dd></div><div><dt>Placa</dt><dd>${fila.placa}</dd></div><div><dt>Elemento</dt><dd>${TE.esc(fila.elemento)} ×${fila.cantidad}</dd></div><div><dt>Sede</dt><dd>${TE.esc(TE.SED[fila.sede].sede)}</dd></div><div><dt>Fecha</dt><dd>${TE.fecha(fila.fecha)}</dd></div><div><dt>Estado</dt><dd>${TE.esc(fila.estado)} · ${TE.esc(fila.motivo)}</dd></div></dl>` : ''}
      <h3 class="h3">${r.tipo === 'fila' ? 'Bloque que certificó el archivo' : 'Datos del bloque'}</h3>${datosBloque(b)}
      ${anc ? `<p class="anc"><span class="tag ${anc.estado === 'anclado' ? 'real' : 'ej'}">${anc.estado === 'anclado' ? 'Anclado · simulado' : 'Pendiente'}</span> Raíz del ${anc.fecha} (bloques #${anc.desde}–#${anc.hasta}) ${mono(anc.raiz)}${anc.recibo ? ` · recibo <code class="hash">${anc.recibo}</code>` : ''}</p>` : ''}
      <details><summary>Contenido certificado (JSON canónico)</summary><pre>${TE.esc(JSON.stringify({ n: b.n, ts: b.ts, actor: b.actor, accion: b.accion, entidad: b.entidad, datos: b.datos, prev: b.prev }, null, 2))}</pre></details>
      ${v.ruta ? `<details><summary>Prueba Merkle (${v.ruta.length} pasos)</summary><ol class="ruta">${v.ruta.map(p => `<li>Combinar por la ${p.lado === 'izq' ? 'izquierda' : 'derecha'} con <code class="hash">${TE.corto(p.hash)}</code></li>`).join('')}</ol></details>` : ''}
      ${b.entidad.tipo === 'sede' ? `<button type="button" class="btn sm" id="vMapa">Ver la sede en el mapa</button>` : ''}</div>`;
    const bm = $('vMapa'); if (bm) bm.onclick = () => { irVista('mapa'); TE.mapa.seleccionar(TE.sedeById.get(b.entidad.id).i, true); };
  }
  $('vForm').onsubmit = e => { e.preventDefault(); verificar($('vQ').value); };
  TE.irVerificar = q => { if (E.vista !== 'cadena') irVista('cadena'); $('vQ').value = q; verificar(q); $('vCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  /* ---------- Tabla de bloques ---------- */
  const POR_PAG = 20; let pag = 0;
  const cAcc = $('cAcc'), cBus = $('cBus');
  cAcc.append(new Option('Todas las acciones', 'all'), ...Object.entries(TE.ACCIONES).map(([k, t]) => new Option(t, k)));
  cAcc.onchange = () => { pag = 0; tablaBloques(); };
  cBus.oninput = () => { pag = 0; tablaBloques(); };
  function tablaBloques() {
    const acc = cAcc.value, q = TE.norm(cBus.value.trim());
    let bs = C.bloques.slice().reverse();
    if (acc !== 'all') bs = bs.filter(b => b.accion === acc);
    if (q) bs = bs.filter(b => b.hash.startsWith(q) || TE.norm(`${b.entidad.id} ${b.entidad.nombre || ''} ${b.actor.id}`).includes(q) || ('#' + b.n) === q || String(b.n) === q);
    const np = Math.max(1, Math.ceil(bs.length / POR_PAG)); pag = Math.min(pag, np - 1);
    const vis = bs.slice(pag * POR_PAG, (pag + 1) * POR_PAG);
    $('cTabla').innerHTML = vis.length ? `<table><thead><tr><th scope="col">Bloque</th><th scope="col" class="izq">Fecha</th><th scope="col" class="izq">Acción</th><th scope="col" class="izq">Entidad</th><th scope="col" class="izq">Actor</th><th scope="col" class="izq">Huella</th></tr></thead>
      <tbody>${vis.map(b => `<tr data-n="${b.n}" tabindex="0"><td>#${b.n}</td><td class="izq nw">${TE.fechaHora(b.ts)}</td><td class="izq"><span class="acc-${b.accion}">${TE.esc(TE.ACCIONES[b.accion])}</span></td><td class="izq">${TE.esc(b.entidad.nombre || b.entidad.id)}</td><td class="izq nw">${TE.esc(b.actor.id)}</td><td class="izq">${mono(b.hash)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="vacio">Ningún bloque coincide con la búsqueda.</p>';
    $('cTabla').querySelectorAll('tr[data-n]').forEach(tr => { const go = () => TE.irVerificar('#' + tr.dataset.n); tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    $('cPag').innerHTML = `<button type="button" class="btn sm" id="pAnt" ${pag === 0 ? 'disabled' : ''}>Más recientes</button><span>Página ${pag + 1} de ${np} · ${TE.plural(bs.length, 'bloque', 'bloques')}</span><button type="button" class="btn sm" id="pSig" ${pag >= np - 1 ? 'disabled' : ''}>Más antiguos</button>`;
    $('pAnt').onclick = () => { pag--; tablaBloques(); };
    $('pSig').onclick = () => { pag++; tablaBloques(); };
  }

  /* ---------- Anclajes ---------- */
  function anclajes() {
    const as = C.anclajes.slice(-8).reverse();
    $('cAnc').innerHTML = `<table><thead><tr><th scope="col" class="izq">Día</th><th scope="col">Bloques</th><th scope="col" class="izq">Raíz Merkle</th><th scope="col" class="izq">Recibo</th><th scope="col" class="izq">Estado</th></tr></thead><tbody>
      ${as.map(a => `<tr><td class="izq nw">${a.fecha}</td><td class="nw">#${a.desde}–#${a.hasta}</td><td class="izq">${mono(a.raiz)}</td><td class="izq">${a.recibo ? `<code class="hash">${a.recibo}</code>` : '—'}</td><td class="izq">${a.estado === 'anclado' ? '<span class="tag real">Anclado · simulado</span>' : '<span class="tag ej">Pendiente: se ancla al cierre del día</span>'}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderCadena() {
    chip();
    if (E.vista !== 'cadena') return;
    renderEstado(); renderAuditoria(); renderAlteracion(); tablaBloques(); anclajes(); if (TE.bc) TE.bc.render();
  }

  /* ---------- Arranque ---------- */
  TE.on('cadena', renderCadena);
  chip();
  TE.alertas.render();
  const inicial = location.hash.slice(1);
  irVista(VISTAS.includes(inicial) ? inicial : 'mapa');
  document.documentElement.classList.add('listo');
})();
