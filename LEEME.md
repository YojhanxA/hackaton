# Traza Educativa Medellín · v2

Plataforma web para gestionar instituciones educativas, verlas en un mapa de OpenStreetMap, planear rutas de recogida, importar actas de reintegro desde Excel, generar informes en Excel y PDF y certificar los cambios en una bitácora encadenada.

## 1. Análisis del sistema anterior y decisiones

**Lo que había:** una aplicación solo con JavaScript (`frontend/public/legacy/`) con mapa por comunas en d3, tablero, alertas, asistente y una cadena SHA-256 en el navegador. No tenía backend ni base de datos: conectividad, TIC, mobiliario, personal y reintegros eran datos de ejemplo.

**Qué se conservó y por qué:**
- La versión anterior sigue completa y funcionando dentro de la nueva plataforma, en el módulo **Análisis territorial**. Reescribirla en React no aportaba nada a los requisitos y arriesgaba romper lo que ya funcionaba. Se puede migrar por partes más adelante.
- Las **779 sedes reales** de GeoMedellín (vigencia 2024) se importan a PostgreSQL con `npm run seed:instituciones`. La fuente no trae direcciones, contactos ni fotos, y no se inventan: quedan vacíos.
- El contrato inteligente `TrazaAnclaje` y el algoritmo de huellas (SHA-256 + Merkle) son los mismos de la versión anterior.
- El modelo de reintegros conserva los campos de la aplicación de reintegros existente (placa, cantidad, descripción, institución tal como llega en el soporte y huella anti-duplicados con la misma composición de `processor.py`). Además agrega los campos del trámite que pide el requerimiento.

**Backend:** el proyecto anterior no tenía backend, así que se construyó en **Node.js + Express**, como recomienda el requerimiento. La aplicación de reintegros en FastAPI es un proyecto aparte; su integración con esta base se describe en la sección 9.

**Frontend:** React 18 con JavaScript, Vite, React Router (HashRouter, para que funcione en cualquier hosting estático), React Leaflet y Recharts.

## 2. Estructura

```
backend/
  src/config.js            Configuración central (variables de entorno)
  src/app.js, servidor.js  Aplicación Express y arranque (aplica migraciones al iniciar)
  src/db/                  Conexión, transacciones y migraciones versionadas (migraciones/*.sql)
  src/middleware/          Autenticación JWT por rol y manejo de errores
  src/rutas/               Endpoints: auth, instituciones, imagenes, reintegros, informes, rutas, configuracion, auditoria
  src/servicios/           Bitácora encadenada, almacenamiento de imágenes, OSRM con caché, informes y Excel
                           Importación de Excel, familias de artículos y preparación al arrancar
  src/db/migraciones/      Esquema PostgreSQL; migraciones equivalentes en migraciones/sqlite/
  scripts/                 crear-usuario, seed-instituciones (datos reales), seed-demo (reintegros de demostración)
  test/api.test.js         Pruebas de los procesos principales contra PostgreSQL real
  test/sqlite.test.js      Pruebas del adaptador SQLite local
frontend/
  src/config.js            URL del API, colores de rutas y red blockchain (un solo lugar)
  src/api/                 Cliente HTTP (sesión, errores, carga de archivos, descargas) y hook useDatos
  src/componentes/         ui (tablas, paginación, modales, campos), Mapa, Imagenes, Graficos, Reintegros, ImportarExcel, Plantilla
  src/informes/pdf.js      Reportes PDF con gráficos y tabla de resultados
  src/paginas/             Panel, Instituciones, Ficha, Formulario, MapaRutas, Reintegros, Informes, Trazabilidad, Analisis, Configuracion
  src/blockchain/          Conexión con el contrato (MetaMask para firmar, nodo público para leer)
  public/legacy/           Versión anterior completa (JavaScript + d3)
contratos/
  TrazaAnclaje.sol         Contrato inteligente (Solidity 0.8.24)
  TrazaAnclaje.json        ABI y bytecode compilados
  herramientas/            Compilar y probar el contrato en una EVM local
docker-compose.yml         PostgreSQL 16 opcional para desarrollo o despliegue
render.yaml                Despliegue en Render (backend, frontend y PostgreSQL)
```

## 3. Base de datos (SQLite local y PostgreSQL en despliegue)

En desarrollo, el backend usa SQLite por defecto y crea `backend/data/traza.sqlite` al arrancar. Para PostgreSQL local o administrado, define `DATABASE_URL` como `postgres://` o `postgresql://`; en despliegues que requieren TLS, define también `DATABASE_SSL=true`. PostgreSQL es obligatorio en producción.

Tablas: `usuarios`, `instituciones`, `institucion_imagenes`, `reintegros`, `configuracion`, `bitacora`, `anclajes` y `schema_migraciones`.

- Claves foráneas: las imágenes se borran en cascada con su institución. Si se elimina una institución, sus reintegros se conservan con `institucion_id` en nulo.
- Restricciones:
  - código de institución único;
  - latitud y longitud en rango, y ambas o ninguna;
  - una sola imagen principal por institución;
  - imágenes sin duplicar (huella SHA-256);
  - huella única por reintegro, que evita duplicados al repetir una carga;
  - estados del trámite con valores fijos.
- Índices: búsqueda por texto en nombres y descripciones, y por municipio, comuna, estado, fecha, institución y placa.
- Las consultas son parametrizadas en todo el backend. Las operaciones que tocan varios registros van en una transacción.
- Las migraciones son versionadas (PostgreSQL: `backend/src/db/migraciones/NNN_*.sql`; SQLite: `backend/src/db/migraciones/sqlite/NNN_*.sql`). Se aplican una sola vez y en orden, y el sistema detecta si alguien edita una migración ya aplicada.
- PostGIS no es necesario: las rutas las calcula OSRM y las búsquedas son por atributos. Se puede agregar si después se necesitan consultas espaciales, como “instituciones a menos de 2 km”.

## 4. Instalación y ejecución local

Requisitos: Node.js 20 o superior. SQLite local no necesita un servicio adicional; PostgreSQL 14 o superior (o Docker) se requiere para despliegue o desarrollo con PostgreSQL.

```bash
# 1. Backend (SQLite local, no requiere instalar una base de datos aparte)
cd backend
cp .env.example .env                 # usa DATABASE_URL=sqlite:./data/traza.sqlite y configura JWT_SECRET
npm install
npm run migrar
npm run seed:instituciones           # 779 sedes reales de GeoMedellín
npm run crear-usuario -- --usuario admin --nombre "Administrador SEM" --rol admin
npm run seed:demo                    # OPCIONAL: 240 reintegros de demostración (referencia DEMO-…)
npm run dev                          # API en http://localhost:4000/api

# 2. Frontend (otra terminal)
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

En **Reintegros → Importar Excel** puedes revisar las actas `.xlsx` antes de confirmar su importación. La fecha se toma del acta y, si falta, se extrae del nombre del archivo cuando contiene una fecha completa (por ejemplo `15-03-2026`, `2026-03-15` o `15 de marzo de 2026`). Un nombre con solo mes y año no se convierte en una fecha inventada. El archivo de prueba ficticio está en `docs/ejemplos/acta_reintegro_EJEMPLO.xlsx`. En el mapa se puede planificar la recogida óptima de reintegros pendientes; Informes incorpora clasificación por artículo/categoría y exportación PDF.

En despliegue, `render.yaml` configura un servicio web que compila y sirve el frontend y la API, junto con PostgreSQL. Configura `ADMIN_CLAVE` al desplegar; no se modifica la contraseña de administradores ya existentes.

En despliegue, configura `DATABASE_URL` con una URL `postgres://` o `postgresql://` y `DATABASE_SSL` según el proveedor. Producción requiere PostgreSQL; SQLite se usa para desarrollo local.

Para quitar los reintegros de demostración: `npm run seed:demo -- --borrar`. **No uses `seed:demo` en producción.**

**Roles:**
- `admin`: todo, incluida la configuración, los usuarios y las eliminaciones.
- `editor`: crear y editar instituciones, imágenes y reintegros.
- `lector`: solo consulta.

## 5. Módulos y cómo verificarlos

| Módulo | Qué hace | Cómo verificarlo |
|---|---|---|
| Panel | Indicadores de instituciones y reintegros, gráfico de 12 meses, últimos movimientos | Entra y compara las cifras con Informes |
| Instituciones | Registro, edición, búsqueda (nombre, código, barrio), filtros (municipio, comuna, sector, estado, imágenes, coordenadas), paginación | Crea una institución con coordenadas: aparece en el mapa |
| Imágenes | Varias por institución, vista previa antes de guardar, principal, reemplazar, eliminar, galería con vista ampliada. JPG/PNG/WebP hasta 5 MB, validadas por su firma real | Intenta subir un PDF renombrado a .jpg: se rechaza |
| Mapa y rutas | OSM con todas las sedes, Secretaría con marcador propio, tarjeta con foto al pasar el cursor (o al tocar en móvil), hasta 8 rutas simultáneas con colores, inicio y fin marcados, distancia, duración e indicaciones, ocultar rutas, limpiar, ajuste automático del zoom | Selecciona 3 sedes y pulsa “Trazar 3 rutas” |
| Reintegros | Registro, edición, cambio de estado, filtros (fechas, institución, estado, municipio, texto), duplicados rechazados | Registra el mismo reintegro dos veces: el segundo se rechaza |
| Informes | Totales por estado (los realizados aparte de pendientes, rechazados y anulados), por mes, por institución y municipio, valores, comparación con el período anterior, exportación .xlsx con hojas Resumen y Detalle | Filtra un rango y exporta: el Detalle tiene las mismas filas que el resumen |
| Trazabilidad | Bitácora de solo inserción con huella SHA-256 encadenada, verificación, anclaje en blockchain con MetaMask, recibos verificados contra la red | “Verificar ahora” y “Anclar historial actual” |
| Análisis territorial | La versión anterior completa, con sus simulaciones de manipulación | Abre el módulo |
| Configuración | Origen de las rutas (editable con clic en el mapa), servicios externos, usuarios | Cambia el origen: las rutas nuevas salen de ahí |

## 6. Pruebas

**Backend** (21 pruebas contra PostgreSQL real; la base de pruebas se borra):

```bash
docker compose exec postgres createdb -U traza traza_test   # una sola vez
cd backend
TEST_DATABASE_URL=postgres://traza:traza@localhost:5432/traza_test \
TEST_DATABASE_ADMIN_URL=postgres://traza:traza@localhost:5432/traza_test \
npm test
```

Cubren:
- permisos por rol;
- validaciones;
- imágenes: carga, archivos falsos, tamaño, duplicadas, principal, reemplazo y borrado sin archivos huérfanos;
- reintegros duplicados y cambios de estado;
- estadísticas cruzadas contra SQL directo y comparación de períodos;
- contenido del Excel (fechas como fecha, números como número);
- rutas, con un OSRM simulado para que la prueba sea repetible;
- inmutabilidad de la bitácora y detección de una alteración hecha directamente en la base de datos.

**Contrato** (12 pruebas en una EVM local): `cd contratos/herramientas && npm install && npm run probar`.

**Punta a punta:** se verificaron 43 criterios en un navegador contra el backend, PostgreSQL, los tiles de OpenStreetMap y el servidor OSRM reales, más una EVM local para el anclaje:
- registro con imágenes y elección de la principal;
- tarjeta con foto al pasar el cursor y espacio reservado sin foto;
- tres rutas independientes con inicio y fin;
- duplicados de reintegros;
- Excel igual al resumen;
- anclaje y verificación en la red;
- versión anterior operativa;
- sin desplazamiento horizontal en móvil.

El hook `VITE_E2E=1` solo expone el mapa para esas pruebas. No se activa en un build normal.

## 7. Blockchain

1. Cada cambio queda en `bitacora` con la huella SHA-256 de su contenido y la del evento anterior. La tabla tiene disparadores que impiden `UPDATE`, `DELETE` y `TRUNCATE`.
2. En **Trazabilidad**, un editor ancla la raíz Merkle de todo el historial en el contrato `TrazaAnclaje` usando MetaMask. El recibo (red, contrato, hash de la transacción) se guarda en `anclajes`.
3. La verificación revisa dos cosas: que la raíz guardada siga coincidiendo con la bitácora recalculada (si no, la base fue alterada) y que la raíz exista en la red.

**Desplegar el contrato en Polygon Amoy (red de prueba):**
1. En MetaMask usa una cuenta solo para pruebas y pide POL de prueba en un faucet de Amoy.
2. En https://remix.ethereum.org pega `contratos/TrazaAnclaje.sol` y compila con 0.8.24 y optimización activada (200). Si al desplegar sale un error de opcode, elige EVM `paris`. Despliega con “Injected Provider – MetaMask”. También puedes desplegarlo con el botón “Desplegar contrato” de Trazabilidad, siendo administrador.
3. Pon la dirección en `VITE_CONTRATO` del frontend y vuelve a construirlo.

## 8. Despliegue sugerido

- **Base de datos:** Render PostgreSQL, Neon o Supabase. Pon `DATABASE_SSL=true`.
- **Backend:** Render, como Web Service.
  - Raíz: `backend`. Construcción: `npm ci`. Inicio: `npm start`.
  - Variables: las de `backend/.env.example`. `FRONTEND_ORIGINS` debe ser la URL https del frontend.
  - Las imágenes necesitan un disco persistente montado en `UPLOAD_DIR`, o reemplazar `servicios/almacenamiento.js` por S3 o Supabase Storage (la interfaz es `guardar`, `flujo`, `eliminar`).
- **Frontend:** Vercel o Netlify.
  - Raíz: `frontend`. Construcción: `npm run build`. Salida: `dist`.
  - Variable: `VITE_API_URL` con la URL del backend.
  - También sirve GitHub Pages, publicando `frontend/dist`.
- Antes de cualquier cambio importante en producción, saca un respaldo: `pg_dump "$DATABASE_URL" > respaldo.sql`.

## 9. Limitaciones conocidas

- **Servidor OSRM público:** es solo para demostraciones (uso limitado, sin garantía). El backend guarda las rutas en caché 24 horas y hace las consultas en serie, pero para producción hace falta un OSRM propio u otro proveedor, configurado en `OSRM_URL`. Los tiempos no consideran el tráfico.
- **Tiles de OpenStreetMap:** tienen una política de uso justo. Para uso intensivo, configura otro proveedor en `MAP_TILES_URL`.
- **Origen de las rutas:** la dirección es la oficial de la Alcaldía (Edificio Bulevar de San Juan, Calle 44 # 51-50). Las coordenadas son aproximadas: ajústalas en Configuración con un clic en el mapa.
- **Códigos de las sedes:** las sedes importadas usan los códigos internos `S001…S779`, no el código DANE, porque la capa de GeoMedellín no lo trae. Se pueden editar.
- **Anclaje manual:** se hace desde el navegador con MetaMask. En producción conviene un proceso nocturno del backend con una cuenta de servicio autorizada.
- **Integración con la app de reintegros (FastAPI):** comparte la misma lógica de huella. La migración de sus datos se hace con un script que lea su tabla `reintegros` y los inserte aquí con la misma huella, así no hay duplicados. Ese script no está incluido.
- **Recálculo de la bitácora:** la verificación recalcula toda la bitácora, lo cual va bien hasta cientos de miles de eventos. Más allá, conviene verificar por tramos ya anclados.
