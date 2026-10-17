/* =========================================================
   Traza Educativa · ANCLAJE EN BLOCKCHAIN
   Conecta la página con el contrato inteligente TrazaAnclaje
   (contratos/TrazaAnclaje.sol) usando MetaMask para firmar y
   el nodo público de la red para leer.
   - Anclar: publica la raíz Merkle SHA-256 del historial actual.
   - Verificar: lee los anclajes de la red y los compara con la
     raíz recalculada localmente. Si alguien alteró el historial,
     la raíz deja de coincidir.
   Sin librerías: las llamadas al contrato se codifican a mano
   (ABI de Solidity) porque son pocas y simples.
   ========================================================= */
(function () {
  'use strict';
  const TE = window.TE, C = TE.cadena, RED = window.TRAZA_RED || {}, ART = window.TRAZA_ARTEFACTO || {};
  const $ = id => document.getElementById(id);
  const eth = () => window.ethereum || null;
  const CHAIN_HEX = '0x' + Number(RED.chainId || 0).toString(16);

  /* ---------- Almacenamiento local (solo comodidad de este navegador) ---------- */
  const leerLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento bloqueado */ } };
  const esDireccion = a => /^0x[0-9a-fA-F]{40}$/.test(a || '');
  let contrato = esDireccion(RED.contrato) ? RED.contrato : (esDireccion(leerLS('traza.contrato', '')) ? leerLS('traza.contrato', '') : '');
  const desdeConfig = () => esDireccion(RED.contrato);
  const txs = leerLS('traza.txs', {}); // raíz → hash de la transacción que la ancló

  /* ---------- Codificación ABI mínima ---------- */
  const SEL = { anclar: 'e5d256ff', consultar: '1b606327', total: '2ddbd13a', raices: '27f1054d', autorizados: '8c14c670', propietario: '3c4f81cd' };
  const ERR = { '93342084': 'Esta cuenta no está autorizada para anclar. El propietario del contrato debe autorizarla con la función autorizar.',
    '1b3a91a2': 'Esta huella ya estaba anclada en la red.', '91bdcb8d': 'La huella o el número de bloques no son válidos.' };
  const pal = h => String(h).replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const num = n => BigInt(n).toString(16).padStart(64, '0');
  const palabra = (hex, i) => hex.replace(/^0x/, '').slice(i * 64, (i + 1) * 64);
  const aNum = w => Number(BigInt('0x' + (w || '0')));
  const aDir = w => '0x' + w.slice(24);
  const corta = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';

  /* ---------- Llamadas a la red ---------- */
  let idRpc = 1;
  async function leer(method, params) {
    // Lectura por el nodo público: funciona aunque no haya MetaMask o esté en otra red.
    const r = await fetch(RED.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method, params }) });
    if (!r.ok) throw new Error(`El nodo de ${RED.nombre} respondió ${r.status}.`);
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message || 'Error del nodo'); e.data = j.error.data; e.code = j.error.code; throw e; }
    return j.result;
  }
  const llamar = (datos, from) => leer('eth_call', [Object.assign({ to: contrato, data: '0x' + datos }, from ? { from } : {}), 'latest']);
  const api = {
    total: async () => aNum(palabra(await llamar(SEL.total), 0)),
    raiz: async i => '0x' + palabra(await llamar(SEL.raices + num(i)), 0),
    consultar: async raiz => { const h = await llamar(SEL.consultar + pal(raiz)); return { bloques: aNum(palabra(h, 0)), cuando: aNum(palabra(h, 1)), quien: aDir(palabra(h, 2)) }; },
    autorizado: async dir => aNum(palabra(await llamar(SEL.autorizados + pal(dir)), 0)) === 1,
    propietario: async () => aDir(palabra(await llamar(SEL.propietario), 0))
  };

  function mensajeError(e) {
    if (!e) return 'Error desconocido.';
    if (e.code === 4001) return 'Cancelaste la firma en MetaMask. No se envió nada.';
    if (e.code === -32002) return 'MetaMask ya tiene una solicitud abierta. Ábrela desde el ícono de la extensión.';
    const texto = [e.data, e.data && e.data.data, e.data && e.data.originalError && e.data.originalError.data, e.error && e.error.data, e.message].map(x => typeof x === 'string' ? x : x ? JSON.stringify(x) : '').join(' ');
    for (const [sel, msg] of Object.entries(ERR)) if (texto.toLowerCase().includes(sel)) return msg;
    if (/insufficient funds|fondos insuficientes/i.test(texto)) return `La cuenta no tiene ${RED.moneda.symbol} de prueba para pagar la transacción. Pide en un faucet de ${RED.nombre}.`;
    if (/failed to fetch|networkerror|load failed/i.test(texto)) return `No se pudo conectar con el nodo de ${RED.nombre}. Revisa tu conexión a internet.`;
    return (e.message || String(e)).slice(0, 220);
  }

  /* ---------- Billetera ---------- */
  async function asegurarRed() {
    const w = eth();
    const actual = await w.request({ method: 'eth_chainId' });
    if (String(actual).toLowerCase() === CHAIN_HEX) return;
    try { await w.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
    catch (e) {
      if (e.code !== 4902 && !(e.data && e.data.originalError && e.data.originalError.code === 4902)) throw e;
      await w.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: `${RED.nombre}`, rpcUrls: [RED.rpc], nativeCurrency: RED.moneda, blockExplorerUrls: [RED.explorador] }] });
    }
  }
  async function enviar(tx) {
    await asegurarRed();
    const hash = await eth().request({ method: 'eth_sendTransaction', params: [Object.assign({ from: st.cuenta }, tx)] });
    return hash;
  }
  async function esperar(hash, alAvanzar) {
    for (let k = 0; k < 120; k++) {
      const r = await eth().request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
      if (r) { if (r.status !== '0x1') throw new Error('La transacción fue revertida por el contrato.'); return r; }
      if (alAvanzar) alAvanzar(k);
      await new Promise(res => setTimeout(res, 2000));
    }
    throw new Error('La red no confirmó la transacción en 4 minutos. Revisa su estado en el explorador.');
  }

  /* ---------- Estado e interfaz ---------- */
  const st = { cuenta: null, autorizado: null, total: null, lista: null, verif: null, ocupado: false, msg: '', msgTipo: '', desactualizado: false };
  const card = () => $('bcCard');
  const enlaceDir = a => `<a href="${RED.explorador}/address/${a}" target="_blank" rel="noopener"><code class="hash">${corta(a)}</code></a>`;
  const enlaceTx = h => `<a href="${RED.explorador}/tx/${h}" target="_blank" rel="noopener">Ver transacción</a>`;
  const ICONO = { ok: '<i class="st ok" aria-hidden="true">✓</i>', crit: '<i class="st crit" aria-hidden="true">✕</i>', otra: '<i class="st pend" aria-hidden="true">◷</i>' };
  const TXT = { ok: 'Coincide con tu historial', crit: 'No coincide: el historial fue alterado', otra: 'Historial de otra sesión de la demo' };

  function aviso() {
    const el = $('avisoBc'); if (!el) return;
    el.textContent = contrato ? `Anclaje real en blockchain: contrato inteligente en ${RED.nombre} (${RED.tipo}). El anclaje diario automático es simulado.` : 'El anclaje en blockchain está listo, pero falta desplegar el contrato. El anclaje diario automático es simulado.';
  }
  function setMsg(msg, tipo = '') { st.msg = msg; st.msgTipo = tipo; render(); }

  function render() {
    const el = card(); if (!el) return;
    const n = C.bloques.length, archivo = location.protocol === 'file:';
    const ver = st.verif;
    let estado = '';
    if (ver) {
      const malos = ver.filas.filter(f => f.estado === 'crit').length, buenos = ver.filas.filter(f => f.estado === 'ok').length;
      estado = malos ? `<div class="int-big crit"><i aria-hidden="true">✕</i><div><b>La blockchain delata una alteración</b><p>${TE.plural(malos, 'huella anclada ya no coincide', 'huellas ancladas ya no coinciden')} con el historial recalculado. Alguien cambió bloques que ya estaban certificados en la red.</p></div></div>`
        : buenos ? `<div class="int-big ok"><i aria-hidden="true">✓</i><div><b>El historial coincide con la blockchain</b><p>${TE.plural(buenos, 'huella anclada coincide', 'huellas ancladas coinciden')} con el historial recalculado en este navegador.${ver.actualAnclada ? ' El historial actual completo está anclado.' : ` Hay ${TE.plural(n - ver.maxOk, 'bloque nuevo', 'bloques nuevos')} sin anclar todavía.`}</p></div></div>`
        : `<div class="int-big warn"><i aria-hidden="true">!</i><div><b>Aún no hay huellas de este historial en la red</b><p>Ancla el historial actual para que quede certificado.</p></div></div>`;
      if (st.desactualizado) estado = estado.replace('</p></div></div>', ' <b>Los datos cambiaron después de esta verificación: vuelve a verificar.</b></p></div></div>');
    }
    el.innerHTML = `
      <div class="res-h"><div><h2>Anclaje en blockchain <span class="tag real">${TE.esc(RED.tipo || '')}</span></h2>
        <p class="m">Un contrato inteligente en ${TE.esc(RED.nombre)} guarda la huella del historial. Nadie puede cambiarla después, ni siquiera quien administra el sistema.</p></div></div>
      <dl class="kv4">
        <div><dt>Red</dt><dd class="dd-s">${TE.esc(RED.nombre)}</dd></div>
        <div><dt>Contrato</dt><dd class="dd-s">${contrato ? enlaceDir(contrato) : 'Sin configurar'}</dd></div>
        <div><dt>Tu cuenta</dt><dd class="dd-s">${st.cuenta ? `${enlaceDir(st.cuenta)}<small>${st.autorizado == null ? '' : st.autorizado ? 'Autorizada para anclar' : 'No autorizada para anclar'}</small>` : 'Sin conectar'}</dd></div>
        <div><dt>Anclajes en la red</dt><dd>${st.total == null ? '—' : TE.fmt(st.total)}</dd></div>
      </dl>
      ${archivo ? `<p class="nota">Abriste la página como archivo (doble clic). MetaMask no funciona así: ábrela desde GitHub Pages o con Live Server de VS Code. La verificación sí funciona.</p>` : ''}
      ${!eth() && !archivo ? `<p class="nota">No se detectó MetaMask en este navegador. Puedes verificar, pero para anclar necesitas la extensión.</p>` : ''}
      ${!contrato ? `<div class="sim"><p><b>Falta desplegar el contrato.</b> Despliégalo en Remix (instrucciones en LEEME.md) o con el botón “Desplegar contrato” y pega la dirección en <code>js/config-blockchain.js</code>.</p></div>` : ''}
      <div class="acc">
        ${eth() && !st.cuenta ? '<button type="button" class="btn" id="bcConectar">Conectar MetaMask</button>' : ''}
        ${eth() && st.cuenta && !contrato ? '<button type="button" class="btn pri" id="bcDesplegar">Desplegar contrato</button>' : ''}
        ${contrato ? `<button type="button" class="btn pri" id="bcAnclar" ${!eth() ? 'disabled title="Necesitas MetaMask"' : ''}>Anclar historial actual (${TE.fmt(n)} bloques)</button>` : ''}
        ${contrato ? '<button type="button" class="btn" id="bcVerificar">Verificar contra la blockchain</button>' : ''}
      </div>
      ${st.msg ? `<p class="bc-msg ${st.msgTipo}" role="status">${st.msg}</p>` : ''}
      ${estado}
      ${ver && ver.filas.length ? `<div class="tabla"><table><thead><tr><th scope="col">Bloques</th><th scope="col" class="izq">Huella anclada</th><th scope="col" class="izq">Fecha en la red</th><th scope="col" class="izq">Firmó</th><th scope="col" class="izq">Estado</th><th scope="col" class="izq"></th></tr></thead><tbody>
        ${ver.filas.map(f => `<tr class="bc-${f.estado}"><td>${TE.fmt(f.bloques)}</td><td class="izq"><code class="hash" title="${f.raiz}">${TE.corto(f.raiz.slice(2))}</code></td><td class="izq nw">${TE.fechaHora(f.cuando * 1000)}</td><td class="izq">${enlaceDir(f.quien)}</td><td class="izq nw">${ICONO[f.estado]} ${TXT[f.estado]}</td><td class="izq nw">${txs[f.raiz] ? enlaceTx(txs[f.raiz]) : ''}</td></tr>`).join('')}
        </tbody></table></div>${ver.total > ver.filas.length ? `<p class="m">Se muestran los últimos ${ver.filas.length} de ${TE.fmt(ver.total)} anclajes. Todos están en el <a href="${RED.explorador}/address/${contrato}#events" target="_blank" rel="noopener">explorador</a>.</p>` : ''}` : ''}`;
    const b = id => $(id);
    if (b('bcConectar')) b('bcConectar').onclick = conectar;
    if (b('bcDesplegar')) b('bcDesplegar').onclick = desplegar;
    if (b('bcAnclar')) b('bcAnclar').onclick = anclar;
    if (b('bcVerificar')) b('bcVerificar').onclick = () => verificar();
    el.querySelectorAll('.acc .btn').forEach(x => { if (st.ocupado) x.disabled = true; });
  }

  /* ---------- Acciones ---------- */
  async function conectar() {
    if (!eth()) return setMsg('Instala MetaMask para conectar una cuenta.', 'err');
    try {
      st.ocupado = true; setMsg('Abriendo MetaMask…');
      const cuentas = await eth().request({ method: 'eth_requestAccounts' });
      st.cuenta = cuentas[0] || null;
      await asegurarRed();
      st.autorizado = contrato ? await api.autorizado(st.cuenta).catch(() => null) : null;
      st.ocupado = false; setMsg(`Cuenta conectada en ${RED.nombre}.`, 'ok');
    } catch (e) { st.ocupado = false; setMsg(mensajeError(e), 'err'); }
  }

  async function desplegar() {
    if (!ART.bytecode) return setMsg('Falta el archivo js/contrato-artefacto.js con el contrato compilado.', 'err');
    try {
      st.ocupado = true; setMsg('Confirma el despliegue del contrato en MetaMask…');
      const hash = await enviar({ data: ART.bytecode });
      setMsg(`Desplegando el contrato… ${enlaceTx(hash)}`);
      const r = await esperar(hash);
      contrato = r.contractAddress; guardarLS('traza.contrato', contrato);
      st.autorizado = true; st.ocupado = false; aviso();
      setMsg(`Contrato desplegado en <code class="hash">${contrato}</code>. Pega esta dirección en <code>js/config-blockchain.js</code> para que todos los visitantes usen el mismo contrato. ${enlaceTx(hash)}`, 'ok');
      TE.toast('Contrato desplegado. Ya puedes anclar el historial.');
      await refrescarTotal();
    } catch (e) { st.ocupado = false; setMsg(mensajeError(e), 'err'); }
  }

  async function anclar() {
    if (!st.cuenta) { await conectar(); if (!st.cuenta) return; }
    if (C.estado === 'fallo' || C.estado === 'pendiente') return setMsg('La auditoría local detectó cambios sin certificar. Restaura los datos antes de anclar: anclar un historial alterado lo volvería “oficial”.', 'err');
    const n = C.bloques.length, raiz = '0x' + C.raizHasta(n);
    try {
      st.ocupado = true; setMsg('Revisando la red…');
      const previo = await api.consultar(raiz);
      if (previo.cuando) { st.ocupado = false; setMsg(`Este historial (${TE.fmt(n)} bloques) ya estaba anclado (${TE.fechaHora(previo.cuando * 1000)}). No hace falta volver a anclarlo.`, 'ok'); return verificar(true); }
      st.autorizado = await api.autorizado(st.cuenta);
      if (!st.autorizado) { st.ocupado = false; return setMsg(ERR['93342084'], 'err'); }
      await llamar(SEL.anclar + pal(raiz) + num(n), st.cuenta); // simulación previa: si va a fallar, falla aquí sin gastar
      setMsg('Confirma la transacción en MetaMask…');
      const hash = await enviar({ to: contrato, data: '0x' + SEL.anclar + pal(raiz) + num(n) });
      txs[raiz] = hash; guardarLS('traza.txs', txs);
      setMsg(`Transacción enviada. Esperando confirmación de la red… ${enlaceTx(hash)}`);
      await esperar(hash);
      st.ocupado = false;
      setMsg(`Huella de ${TE.fmt(n)} bloques anclada en ${RED.nombre}. ${enlaceTx(hash)}`, 'ok');
      TE.toast(`Historial anclado en ${RED.nombre}: ${TE.fmt(n)} bloques.`);
      await verificar(true);
    } catch (e) { st.ocupado = false; setMsg(mensajeError(e), 'err'); }
  }

  async function refrescarTotal() { try { st.total = await api.total(); } catch (e) { st.total = null; } render(); }

  async function verificar(silencioso) {
    if (!contrato) return null;
    try {
      st.ocupado = true; if (!silencioso) setMsg(`Leyendo los anclajes de ${RED.nombre}…`);
      const total = await api.total(); st.total = total;
      const desde = Math.max(0, total - 25), filas = [];
      for (let i = total - 1; i >= desde; i--) {
        const raiz = await api.raiz(i), a = await api.consultar(raiz);
        let estado;
        if (a.bloques <= C.bloques.length && '0x' + C.raizHasta(a.bloques) === raiz) estado = 'ok';
        else if (a.bloques <= C.base) estado = 'crit';   // el historial base es idéntico para todos: si no coincide, fue alterado
        else estado = 'otra';                            // bloques creados en otra sesión de la demo
        filas.push(Object.assign({ raiz, estado }, a));
      }
      const oks = filas.filter(f => f.estado === 'ok');
      st.verif = { cuando: Date.now(), total, filas, maxOk: oks.length ? Math.max(...oks.map(f => f.bloques)) : 0, actualAnclada: oks.some(f => f.bloques === C.bloques.length) };
      st.desactualizado = false; st.ocupado = false;
      const malos = filas.filter(f => f.estado === 'crit').length;
      if (!silencioso) setMsg(malos ? '' : `Verificación terminada: ${TE.plural(total, 'anclaje leído', 'anclajes leídos')} de la red.`, malos ? '' : 'ok');
      else render();
      TE.emit('blockchain', st.verif);
      return st.verif;
    } catch (e) { st.ocupado = false; setMsg(mensajeError(e), 'err'); return null; }
  }

  /* ---------- Integración ---------- */
  if (eth()) {
    eth().on && eth().on('accountsChanged', a => { st.cuenta = a[0] || null; st.autorizado = null; if (st.cuenta && contrato) api.autorizado(st.cuenta).then(v => { st.autorizado = v; render(); }).catch(() => {}); render(); });
    eth().request({ method: 'eth_accounts' }).then(a => { if (a && a[0]) { st.cuenta = a[0]; if (contrato) return api.autorizado(st.cuenta).then(v => { st.autorizado = v; }); } }).catch(() => {}).finally(render);
  }
  TE.on('cadena', () => { if (st.verif) st.desactualizado = true; render(); });
  TE.bc = { configurado: () => !!contrato, verificar, render, estado: () => st, red: RED };
  aviso(); render();
  if (contrato) refrescarTotal();
})();
