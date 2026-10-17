/* Configuración central. Todo lo que cambia entre entornos viene de variables de entorno.
   Ningún secreto se envía al frontend. */
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_PATH || path.join(__dirname, '..', '.env') });

const entero = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const produccion = (process.env.NODE_ENV || 'development') === 'production';
const databaseUrl = process.env.DATABASE_URL || (produccion ? '' : 'sqlite:./data/traza.sqlite');
const tipoBaseDatos = databaseUrl.startsWith('sqlite:') ? 'sqlite' : 'postgres';

const config = {
  produccion,
  puerto: entero(process.env.PORT, 4000),
  databaseUrl,
  tipoBaseDatos,
  databasePath: tipoBaseDatos === 'sqlite'
    ? databaseUrl === 'sqlite::memory:' ? ':memory:' : path.resolve(__dirname, '..', databaseUrl.slice('sqlite:'.length))
    : '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecreto: process.env.JWT_SECRET || '',
  jwtDuracion: process.env.JWT_EXPIRES_IN || '8h',
  origenesFrontend: (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean),

  // Imágenes: el backend guarda los archivos en disco; PostgreSQL guarda metadatos y referencias.
  almacenamiento: process.env.ALMACENAMIENTO === 'postgres' ? 'postgres' : 'disco',
  dirSubidas: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'subidas')),
  maxBytesImagen: entero(process.env.MAX_IMAGE_BYTES, 5 * 1024 * 1024),
  maxImagenesPorCarga: 10,

  // Rutas: servicio compatible con OSRM. El servidor público de demostración NO es para producción.
  osrmUrl: (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, ''),
  osrmPerfil: process.env.OSRM_PROFILE || 'driving',
  osrmTimeoutMs: entero(process.env.OSRM_TIMEOUT_MS, 12000),
  maxDestinosPorConsulta: 8, // 8 colores distinguibles en el mapa
  maxParadasRecogida: 12,
  maxFilasImportacion: 20000,
  maxBytesExcel: 10 * 1024 * 1024,
  dirFrontend: path.resolve(process.env.FRONTEND_DIST || path.join(__dirname, '..', '..', 'frontend', 'dist')),

  // Mapa base (se envía al frontend: es público).
  tilesUrl: process.env.MAP_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tilesAtribucion: process.env.MAP_TILES_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a>',

  // Origen por defecto de las rutas: sede de la Secretaría de Educación de Medellín.
  // Dirección oficial publicada por la Alcaldía; coordenadas aproximadas, se ajustan en Configuración.
  origenPorDefecto: {
    nombre: 'Secretaría de Educación de Medellín',
    direccion: 'Edificio Bulevar de San Juan, Calle 44 # 51-50, piso 3, Medellín',
    latitud: Number(process.env.ORIGEN_LAT || 6.2455),
    longitud: Number(process.env.ORIGEN_LON || -75.5707)
  }
};

function validarConfig() {
  const errores = [];
  if (!config.databaseUrl) errores.push('DATABASE_URL es obligatoria en producción.');
  if (config.produccion && config.tipoBaseDatos !== 'postgres') errores.push('En producción DATABASE_URL debe apuntar a PostgreSQL.');
  if (config.jwtSecreto.length < 32 || /^cambia/i.test(config.jwtSecreto)) errores.push('JWT_SECRET debe tener al menos 32 caracteres aleatorios.');
  if (config.produccion && config.origenesFrontend.some(o => !o.startsWith('https://'))) errores.push('En producción FRONTEND_ORIGINS debe usar https.');
  if (errores.length) throw new Error('Configuración inválida:\n- ' + errores.join('\n- '));
}

module.exports = { config, validarConfig };
