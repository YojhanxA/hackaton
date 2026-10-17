/* La versión anterior (JavaScript + d3) se conserva completa y se integra aquí sin reescribirla:
   mapa territorial por comunas, tablero, alertas, asistente y simulaciones de manipulación. */
const URL_LEGADO = `${import.meta.env.BASE_URL}legacy/index.html`;

export default function Analisis() {
  return (
    <div className="analisis">
      <div className="encabezado compacto">
        <div><p className="antetitulo">Versión anterior, integrada</p><h1>Análisis territorial</h1>
          <p className="m">Mapa por comunas con matrícula, IPM e indicadores, tablero, alertas y asistente. Conectividad, TIC, mobiliario y personal de este módulo son datos de ejemplo.</p></div>
        <div className="enc-acciones"><a className="btn" href={URL_LEGADO} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a></div>
      </div>
      <iframe title="Análisis territorial (versión anterior)" src={URL_LEGADO} className="marco-legado" />
    </div>
  );
}
