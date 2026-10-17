# Librerías y servicios externos

Todo lo externo que usa Traza Educativa, con la versión **instalada** (leída de `node_modules`), la licencia y para qué se usa. Las versiones exactas quedan fijadas en `package-lock.json`.

## 1. Backend (`backend/`, Node.js 20 o superior)

| Librería | Versión | Licencia | Para qué |
|---|---|---|---|
| express | 4.22.3 | MIT | Servidor HTTP y enrutamiento de la API; también sirve el frontend compilado |
| pg | 8.13.1 | MIT | Cliente de PostgreSQL (consultas parametrizadas, transacciones) |
| zod | 3.23.8 | MIT | Validación de todo lo que entra a la API, con mensajes en español |
| jsonwebtoken | 9.0.2 | MIT | Sesiones firmadas (JWT) con rol |
| bcryptjs | 2.4.3 | MIT | Hash de contraseñas (costo 12) |
| helmet | 8.0.0 | MIT | Cabeceras de seguridad y política de seguridad de contenido (CSP) |
| cors | 2.8.5 | MIT | Control de orígenes (mismo dominio + `FRONTEND_ORIGINS`) |
| express-rate-limit | 7.4.1 | MIT | Límite de intentos de inicio de sesión |
| multer | 2.4.0 | MIT | Carga de imágenes y de archivos Excel (en memoria, con límites de tamaño) |
| exceljs | 4.4.0 | MIT | Lectura de las actas de reintegro (.xlsx) y generación del informe en Excel |
| dotenv | 16.4.5 | BSD-2-Clause | Variables de entorno desde `.env` en desarrollo |
| supertest *(solo pruebas)* | 7.0.0 | MIT | Pruebas de la API |

Módulos nativos de Node usados: `crypto` (SHA-256, UUID), `node:test` (pruebas), `fetch` (OSRM).

## 2. Frontend (`frontend/`)

| Librería | Versión | Licencia | Para qué |
|---|---|---|---|
| react / react-dom | 18.3.1 | MIT | Interfaz |
| react-router-dom | 6.30.6 | MIT | Navegación (HashRouter) |
| leaflet | 1.9.4 | BSD-2-Clause | Mapa interactivo |
| react-leaflet | 4.2.1 | **Hippocratic-2.1** | Componentes de React para Leaflet |
| recharts | 2.13.3 | MIT | Gráfico de reintegros por mes |
| jspdf | 4.2.1 | MIT | Reporte en PDF (se carga solo al pulsar el botón) |
| jspdf-autotable | 5.0.9 | MIT | Tablas del reporte en PDF |
| vite *(compilación)* | 5.4.21 | MIT | Servidor de desarrollo y compilación |
| @vitejs/plugin-react *(compilación)* | 4.3.4 | MIT | JSX y recarga en caliente |

> **Ojo con la licencia de react-leaflet.** La Hippocratic License 2.1 no es una licencia de código abierto aprobada por la OSI: permite el uso, pero lo condiciona a no violar derechos humanos. Para una entidad pública no suele ser un problema, pero conviene que el área jurídica la revise. Si no se acepta, el mapa se puede reescribir sobre Leaflet directo (BSD-2) sin cambiar el backend.

Los gráficos de barras horizontales, la división mobiliario/eléctrico y los gráficos del PDF están hechos a mano (HTML/CSS y vectores de jsPDF), sin librerías adicionales.

## 3. Módulo heredado (`frontend/public/legacy/`)

| Librería | Versión | Licencia | Origen |
|---|---|---|---|
| d3 | 7.8.5 | ISC | cdnjs.cloudflare.com (permitido en la CSP) |

## 4. Contrato inteligente (`contratos/`)

| Herramienta | Versión | Licencia | Para qué |
|---|---|---|---|
| Solidity (solc) | 0.8.24 | GPL-3.0 (compilador) | Compilación de `TrazaAnclaje.sol` (EVM `paris`, optimizador 200) |
| solc-js | 0.8.24 | MIT | Compilar desde Node (`contratos/herramientas`) |
| ethers | 6.13.4 | MIT | Pruebas del contrato |
| ganache | 7.9.2 | MIT | EVM local para las pruebas |

El contrato (`SPDX-License-Identifier: MIT`) no depende de librerías externas como OpenZeppelin: es autocontenido, con errores personalizados (`NoAutorizado`, `YaAnclado`, `DatosInvalidos`) y eventos (`Anclado`, `Autorizacion`). En el navegador no se usa ninguna librería de blockchain: la conexión con MetaMask es EIP-1193 directo y la codificación ABI está hecha a mano en `frontend/src/blockchain/contrato.js`.

## 5. Servicios externos

| Servicio | Para qué | Condiciones y riesgos |
|---|---|---|
| **OpenStreetMap** (`tile.openstreetmap.org`) | Mapa base | Datos © colaboradores de OpenStreetMap (ODbL). Hay que mostrar la atribución (ya está en el mapa) y respetar la [política de uso de tiles](https://operations.osmfoundation.org/policies/tiles/). Para uso intensivo, otro proveedor en `MAP_TILES_URL`. |
| **OSRM** (`router.project-osrm.org`) | Rutas por la red vial (`/route`) y recorrido óptimo de recogida (`/trip`) | Servidor público **solo para demostraciones**, sin garantía y con límites. El backend guarda las rutas 24 h en caché y consulta en serie. En producción: OSRM propio o proveedor con contrato (`OSRM_URL`). |
| **Polygon Amoy** (chain id 80002) | Red de prueba donde vive el contrato `TrazaAnclaje` | RPC público `https://rpc-amoy.polygon.technology`, explorador `https://amoy.polygonscan.com`. Moneda de prueba (POL) gratuita en faucets; no tiene valor. Se puede cambiar de red con las variables `VITE_CHAIN_*`. |
| **MetaMask** | Firmar el despliegue del contrato y cada anclaje | Extensión del navegador. Usa una cuenta **solo para pruebas**: nunca pongas la frase semilla ni la llave privada en el código ni en variables de entorno. |
| **Remix IDE** (`remix.ethereum.org`) | Alternativa para compilar y desplegar el contrato | No guarda nada en el proyecto. |
| **Google Fonts** | Tipografías Archivo, IBM Plex Sans e IBM Plex Mono (SIL Open Font License) | El navegador de cada usuario las descarga de Google. Si se prefiere no depender de Google, se pueden alojar en `public/`. |
| **cdnjs** | d3 para el módulo heredado | Solo el módulo Análisis territorial. |
| **Render** | Hospedaje (servicio web + PostgreSQL), opcional | Plan gratuito: el servicio se duerme tras 15 min sin uso y la base vence a los 30 días. |

## 6. Fuentes de datos

| Fuente | Qué aporta | Notas |
|---|---|---|
| **GeoMedellín**, capa Sedes Educativas (vigencia 2024) | 779 sedes con nombre, sector, comuna, barrio, coordenadas y matrícula de 0° a 11° | Se cargan con `npm run seed:instituciones`. No trae dirección, contacto, fotos ni código DANE: no se inventan. |
| **GeoMedellín**, límite político-administrativo | Comunas, corregimientos, barrios y veredas | Usado por el módulo heredado. |
| **Secretaría de Educación de Medellín** | Actas de reintegro en Excel | Se importan desde la pantalla Reintegros → Importar Excel. |
| **DANE** (geodatos) | Previsto en la idea para conectividad y códigos oficiales | **No integrado todavía.** Las sedes usan códigos internos `S001…S779`. |

`docs/ejemplos/acta_reintegro_EJEMPLO.xlsx` es un archivo **de ejemplo con datos ficticios** (lo dice en su primera fila) para probar la importación; se regenera con `node backend/scripts/generar-acta-ejemplo.js`.

## 7. Avisos de seguridad conocidos

`npm audit --omit=dev` al cierre de esta versión:

- **backend:** `uuid` (moderado, dependencia de exceljs). Solo afecta a las versiones v3/v5/v6 cuando se pasa un búfer, que exceljs no usa.
- **frontend:** `react-router` 6 (moderado). Afecta a redirecciones con URL externas en `<Link>`/`navigate` y a la hidratación en servidor; aquí no se usan. La corrección exige React Router 7 (cambio mayor).

Se actualizaron `multer` (2.4.0), `express` (4.22.3) y `react-router-dom` (6.30.6) para cerrar los avisos altos.
