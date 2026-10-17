/* Mapa territorial por comunas, tablero, alertas y asistente. */
import { API_URL } from '../config';

const URL_LEGADO = `${import.meta.env.BASE_URL}legacy/index.html`;

export default function Analisis() {
  const src = `${URL_LEGADO}?api=${encodeURIComponent(API_URL)}`;
  return (
    <div className="analisis">
      <div className="encabezado compacto">
        <div><h1>Análisis territorial</h1>
          <p className="m">Mapa por comunas con matrícula, IPM e indicadores, tablero, alertas y asistente. Conectividad, TIC, mobiliario y personal de este módulo son datos de ejemplo.</p></div>
        <div className="enc-acciones"><a className="btn" href={src} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a></div>
      </div>
      <iframe title="Análisis territorial (versión anterior)" src={src} className="marco-legado" />
    </div>
  );
}
