/* Construye la aplicación Express (sin abrir el puerto, para poder probarla). */
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { config } = require('./config');
const { consultar } = require('./db/pool');
const { autenticar } = require('./middleware/auth');
const { manejadorErrores, ErrorApp } = require('./middleware/errores');

function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Política de seguridad de contenido: scripts solo propios (+ d3 de cdnjs para el módulo de análisis heredado).
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // Leaflet y React usan estilos en línea
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],                         // teselas del mapa
        connectSrc: ["'self'", 'https:'],                                        // nodo RPC de la blockchain (lectura)
        frameSrc: ["'self'"], frameAncestors: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
        ...(config.produccion ? { upgradeInsecureRequests: [] } : {})
      }
    }
  }));
  // CORS: el mismo dominio siempre (frontend servido por este backend) + los orígenes de FRONTEND_ORIGINS.
  app.use(cors((req, cb) => {
    const origen = req.header('Origin');
    const propio = `${req.protocol}://${req.get('host')}`;
    if (!origen || origen === propio || config.origenesFrontend.includes(origen)) return cb(null, { origin: true, exposedHeaders: ['Content-Disposition', 'X-Total-Filas'] });
    cb(new ErrorApp(403, 'Origen no permitido.'));
  }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/salud', async (_req, res) => {
    try { await consultar('SELECT 1'); res.json({ ok: true, base_de_datos: 'conectada' }); }
    catch (e) { res.status(503).json({ ok: false, base_de_datos: 'sin conexión' }); }
  });

  // Públicas: inicio de sesión y archivos de imagen (nombres aleatorios)
  app.use('/api', require('./rutas/auth'));
  app.use('/api', require('./rutas/imagenes'));

  // A partir de aquí todo exige sesión
  app.use('/api', autenticar);
  app.use('/api', require('./rutas/importaciones'));
  app.use('/api', require('./rutas/instituciones'));
  app.use('/api', require('./rutas/reintegros'));
  app.use('/api', require('./rutas/informes'));
  app.use('/api', require('./rutas/rutas'));
  app.use('/api', require('./rutas/configuracion'));
  app.use('/api', require('./rutas/auditoria'));

  app.use('/api', (_req, _res, next) => next(new ErrorApp(404, 'Ruta no encontrada.')));

  // Frontend compilado (un solo servicio en producción). Usa HashRouter, así que basta con servir index.html.
  if (fs.existsSync(path.join(config.dirFrontend, 'index.html'))) {
    app.use(express.static(config.dirFrontend, {
      index: 'index.html',
      setHeaders: (res, ruta) => res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(ruta) ? 'public, max-age=31536000, immutable' : 'no-cache')
    }));
  }
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
