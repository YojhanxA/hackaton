const { config, validarConfig } = require('./config');
const { migrar } = require('./db/migrar');
const { crearApp } = require('./app');
const { preparar } = require('./arranque');
const { cerrar } = require('./db/pool');

(async () => {
  try {
    validarConfig();
    await migrar(); // aplica migraciones pendientes al arrancar
    await preparar();
    const servidor = crearApp().listen(config.puerto, () => console.log(`API de Traza Educativa en http://localhost:${config.puerto}/api`));
    const apagar = () => servidor.close(() => cerrar().then(() => process.exit(0)));
    process.on('SIGTERM', apagar); process.on('SIGINT', apagar);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
