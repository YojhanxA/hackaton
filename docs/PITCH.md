# Guion del pitch y de la demo · Traza Educativa Medellín

Duración objetivo: **4 minutos** (1 de problema y solución, 2½ de demo, ½ de cierre). Cada bloque dice qué mostrar en pantalla.

## 0. Una frase

> “Traza Educativa le muestra a la Secretaría de Educación **dónde están los bienes que hay que reintegrar, cómo ir por ellos en la ruta más corta y qué se ha reintegrado**, con un historial que nadie puede alterar sin que se note, porque está **anclado en blockchain**.”

## 1. El problema (30 s)

- La Secretaría recoge bienes (sillas, pupitres, computadores, video beams…) de cientos de sedes. Las actas llegan en **Excel sueltos**.
- Hoy no hay una vista que diga **cuántos reintegros tiene cada colegio, qué se reintegra más ni por dónde ir a recogerlos**.
- Y los registros de bienes públicos se pueden modificar sin dejar rastro: **cero trazabilidad**.

## 2. La solución (30 s)

Una aplicación web con cuatro piezas:
1. **Visor de reintegros sobre el mapa** de las 779 sedes reales de Medellín (GeoMedellín).
2. **Ruta antes del reintegro**: desde la Secretaría hasta la sede, o el **recorrido óptimo** que pasa por varias.
3. **Información con gráficos**: top 10 de instituciones, cantidad por objeto, mobiliario frente a eléctrico, **PDF** y Excel.
4. **Smart contract** en Polygon: cada cambio queda en una bitácora encadenada y su huella se publica en la blockchain.

## 3. Demo (2½ min) — en este orden

1. **Importar el acta** (Reintegros → *Importar Excel* → `acta_reintegro_EJEMPLO.xlsx`, estado *Pendiente* → *Revisar archivo*).
   Decir: “Lee el mismo formato que usa hoy la Secretaría. Antes de guardar, explica fila por fila: nuevas, duplicadas, omitidas y por qué.” → *Importar*.
   Volver a importar el mismo archivo: “No duplica: cada fila tiene una huella.”
2. **Mapa** (Mapa y rutas). “El tamaño de cada punto es la cantidad de reintegros; los naranjas tienen pendientes por recoger.” Pasar el cursor por una sede: **foto, conteo, mobiliario y eléctrico**.
3. **Recogida óptima**: *Planificar recogida óptima*. “Sale de la Secretaría, pasa por las 8 sedes con más elementos pendientes en el orden más corto y vuelve: 40 km, 1 h 9 min, con indicaciones paso a paso.”
4. **Informes**: top 10, “lo que más se reintegra” (tocar *SILLA* para filtrar), mobiliario frente a eléctrico. Pulsar **Reporte en PDF** y abrirlo.
5. **Trazabilidad** (el momento del smart contract): *Verificar ahora* → “la cadena está íntegra”. *Anclar historial actual* con MetaMask → abrir la transacción en **amoy.polygonscan.com**. “Si alguien cambia un reintegro directamente en la base de datos, la raíz ya no coincide con la que está en la blockchain y el sistema lo detecta.”

## 4. Smart contract (si preguntan, 30 s)

- `TrazaAnclaje.sol` (Solidity 0.8.24), desplegado en **Polygon Amoy**. Dirección: `0x…` *(pegar aquí la de tu despliegue)*.
- Guarda la **raíz Merkle SHA-256** de toda la bitácora, cuántos eventos cubre, quién la ancló y cuándo. No guarda datos personales: solo huellas.
- Solo cuentas autorizadas pueden anclar; una raíz no se puede anclar dos veces; errores personalizados para ahorrar gas.
- 12 pruebas automáticas en una EVM local.
- **Por qué blockchain y no solo una base de datos:** la base la controla quien la administra; la huella en una red pública no la controla nadie, así que sirve de prueba ante un tercero (control interno, Contraloría, ciudadanía).

## 5. Calidad técnica (si preguntan)

- **Stack:** React + Leaflet/OpenStreetMap, Node/Express, PostgreSQL, OSRM, Solidity.
- **Pruebas:** 29 del backend contra PostgreSQL real, 12 del contrato y 56 criterios de punta a punta en navegador (43 + 13), incluido el build de producción con su política de seguridad.
- **Seguridad:** roles (admin, editor, lector), contraseñas con bcrypt, validación de todo lo que entra, consultas parametrizadas, CSP, imágenes validadas por su firma real, bitácora de solo inserción protegida con disparadores en la base de datos.
- **Datos reales:** 779 sedes de GeoMedellín; el lector de Excel es un port fiel del que ya usa la Secretaría, así que las cifras coinciden.
- **Documentado:** `LEEME.md` (instalación, módulos, despliegue, limitaciones) y `docs/LIBRERIAS_Y_SERVICIOS.md` (cada librería y servicio externo con versión y licencia).

## 6. Cierre: el legado (20 s)

> “Lo dejamos desplegado y documentado para que la Secretaría lo use mañana: importa sus actas, planifica la recogida y cada informe lleva su huella verificable en blockchain. Lo siguiente es sumar la conectividad de las sedes con los datos del DANE.”

## 7. Lista de chequeo antes de las 6:00 p. m.

- [ ] Código en GitHub y desplegado en Render con `render.yaml` (ver `LEEME.md` §8). `…/api/salud` responde `ok`.
- [ ] Contrato desplegado en **Amoy** con una cuenta de MetaMask **solo de pruebas** (con POL de faucet). Dirección en `VITE_CONTRATO` y nuevo despliegue.
- [ ] Al menos **un anclaje** hecho, con el enlace de la transacción a mano.
- [ ] Acta de ejemplo importada como *Pendiente* (para que la recogida óptima tenga paradas).
- [ ] Abrir la URL 2 minutos antes de presentar (el plan gratuito se duerme).
- [ ] Decidir si se dejan o se borran los reintegros de DEMOSTRACIÓN (Configuración). Si se dejan, decir que son de demostración.
- [ ] Probar el PDF y tener uno ya descargado por si falla la red.

## 8. Preguntas probables

- **¿Los datos de reintegros son reales?** Las sedes sí (GeoMedellín). Los reintegros de la demo están marcados DEMO-, y el acta de ejemplo dice que es ficticia; con las actas reales de la Secretaría funciona igual.
- **¿Qué pasa si se cae el servidor de rutas?** Muestra un mensaje claro y el resto sigue funcionando. Para producción se configura un OSRM propio.
- **¿Cuánto cuesta anclar?** En Amoy, nada (moneda de prueba). En Polygon principal, una fracción de centavo por anclaje, y basta con uno al día.
- **¿Y la conectividad?** Está en la idea, pero no encontramos una fuente abierta y confiable para hoy; es el siguiente paso.
