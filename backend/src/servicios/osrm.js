/* Cliente del servicio de rutas compatible con OSRM.
   - Calcula recorridos reales sobre la red vial (no líneas rectas).
   - Caché en memoria de 24 h para no repetir solicitudes al servicio.
   - Solicitudes en serie, con una pausa corta, para respetar la política de uso del servidor público.
   - Traduce las maniobras de OSRM a indicaciones en español. */
const { config } = require('../config');

const CACHE = new Map();
const TTL = 24 * 3600 * 1000, MAX_CACHE = 1000;
let ultimaSolicitud = 0;

const MOD = { left: 'a la izquierda', right: 'a la derecha', 'slight left': 'ligeramente a la izquierda', 'slight right': 'ligeramente a la derecha',
  'sharp left': 'fuertemente a la izquierda', 'sharp right': 'fuertemente a la derecha', straight: 'derecho', uturn: 'en U' };
const ORD = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava'];

function instruccion(paso) {
  const m = paso.maneuver || {}, via = paso.name ? ` por ${paso.name}` : '', en = paso.name ? ` en ${paso.name}` : '';
  const mod = MOD[m.modifier] || '';
  switch (m.type) {
    case 'depart': return `Salga${via || ' del origen'}`;
    case 'arrive': return 'Llegue al destino';
    case 'turn': case 'end of road': return m.modifier === 'uturn' ? `Dé la vuelta en U${en}` : `Gire ${mod}${en}`.trim();
    case 'continue': case 'new name': return m.modifier && m.modifier !== 'straight' ? `Continúe ${mod}${via}` : `Continúe${via || ' derecho'}`;
    case 'merge': return `Incorpórese ${mod}${en}`.trim();
    case 'on ramp': return `Tome la rampa ${mod}${en}`.trim();
    case 'off ramp': return `Salga por la rampa ${mod}${en}`.trim();
    case 'fork': return `En la bifurcación, manténgase ${mod}${en}`.trim();
    case 'roundabout': case 'rotary': case 'roundabout turn':
      return m.exit ? `En la glorieta, tome la ${ORD[m.exit - 1] || m.exit + '.ª'} salida${en}` : `Entre a la glorieta${en}`;
    case 'exit roundabout': case 'exit rotary': return `Salga de la glorieta${en}`;
    default: return `Continúe${via}`;
  }
}

const clave = (o, d) => `${config.osrmPerfil}|${o.lon.toFixed(5)},${o.lat.toFixed(5)}|${d.lon.toFixed(5)},${d.lat.toFixed(5)}`;

async function esperarTurno() {
  const espera = 250 - (Date.now() - ultimaSolicitud);
  if (espera > 0) await new Promise(r => setTimeout(r, espera));
  ultimaSolicitud = Date.now();
}

async function pedir(url) {
  await esperarTurno();
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(config.osrmTimeoutMs), headers: { 'User-Agent': 'TrazaEducativa/2.0 (Secretaria de Educacion de Medellin)' } });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'El servicio de rutas no respondió a tiempo.' : 'No se pudo conectar con el servicio de rutas.');
  }
  if (r.status === 429) throw new Error('El servicio de rutas limitó las solicitudes. Intenta de nuevo en un minuto.');
  let j;
  try { j = await r.json(); } catch (e) { throw new Error(`El servicio de rutas respondió ${r.status} sin datos válidos.`); }
  return { r, j };
}
const MENSAJES = { NoRoute: 'No existe un recorrido por vías entre el origen y esta institución.', NoTrips: 'No se encontró un recorrido que una todas las paradas.', NoSegment: 'Las coordenadas están lejos de cualquier vía.', InvalidValue: 'Coordenadas inválidas para el servicio de rutas.' };
const pasosDe = legs => legs.flatMap(l => l.steps).map(p => ({ instruccion: instruccion(p), distancia_m: Math.round(p.distance), duracion_s: Math.round(p.duration) }))
  .filter((p, i, a) => p.distancia_m > 0 || i === a.length - 1 || i === 0);
function guardar(k, v) {
  if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(k, { t: Date.now(), v });
}

/** Ruta de `origen` a `destino` ({lat, lon}). Lanza un Error con mensaje legible si no se puede calcular. */
async function calcularRuta(origen, destino) {
  const k = clave(origen, destino), c = CACHE.get(k);
  if (c && Date.now() - c.t < TTL) return Object.assign({ desde_cache: true }, c.v);
  const { r, j } = await pedir(`${config.osrmUrl}/route/v1/${config.osrmPerfil}/${origen.lon},${origen.lat};${destino.lon},${destino.lat}?overview=full&geometries=geojson&steps=true`);
  if (j.code !== 'Ok' || !j.routes || !j.routes.length) throw new Error(MENSAJES[j.code] || `El servicio de rutas no pudo calcular el recorrido (${j.code || r.status}).`);
  const ruta = j.routes[0];
  const v = { distancia_m: Math.round(ruta.distance), duracion_s: Math.round(ruta.duration), geometria: ruta.geometry.coordinates.map(([lon, lat]) => [lat, lon]), pasos: pasosDe(ruta.legs) };
  guardar(k, v);
  return v;
}

/**
 * Recorrido ÓPTIMO de recogida (servicio "trip" de OSRM: resuelve el problema del viajante con
 * heurísticas sobre la red vial). Sale del origen, visita todas las paradas en el mejor orden y,
 * si `regreso`, vuelve al origen. Devuelve el orden de visita y cada tramo.
 */
async function calcularRecorrido(origen, paradas, { regreso = true } = {}) {
  const coords = [origen, ...paradas];
  const k = 'trip|' + (regreso ? 'r|' : 'n|') + coords.map(p => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const c = CACHE.get(k);
  if (c && Date.now() - c.t < TTL) return Object.assign({ desde_cache: true }, c.v);
  const opciones = regreso ? 'source=first&roundtrip=true' : 'source=first&destination=any&roundtrip=false';
  const { r, j } = await pedir(`${config.osrmUrl}/trip/v1/${config.osrmPerfil}/${coords.map(p => `${p.lon},${p.lat}`).join(';')}?${opciones}&overview=full&geometries=geojson&steps=true`);
  if (j.code !== 'Ok' || !j.trips || !j.trips.length || !Array.isArray(j.waypoints)) throw new Error(MENSAJES[j.code] || `El servicio de rutas no pudo calcular el recorrido (${j.code || r.status}).`);
  const viaje = j.trips[0];
  // waypoints[k].waypoint_index = posición de la coordenada k dentro del recorrido
  const orden = j.waypoints.map((w, idx) => ({ idx, pos: w.waypoint_index })).sort((a, b) => a.pos - b.pos).map(x => x.idx);
  const tramos = viaje.legs.map((l, n) => ({ desde: orden[n], hasta: orden[n + 1] ?? 0, distancia_m: Math.round(l.distance), duracion_s: Math.round(l.duration) }));
  const v = {
    distancia_m: Math.round(viaje.distance), duracion_s: Math.round(viaje.duration), geometria: viaje.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    orden: orden.slice(1).map(i => i - 1), // índices de `paradas` en orden de visita
    tramos, pasos: pasosDe(viaje.legs), regreso
  };
  guardar(k, v);
  return v;
}

module.exports = { calcularRuta, calcularRecorrido, instruccion, _cache: CACHE };
