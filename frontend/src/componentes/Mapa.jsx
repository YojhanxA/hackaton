/* Piezas de mapa reutilizables sobre OpenStreetMap con React Leaflet. */
import { useEffect, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { api } from '../api/cliente';

let cacheConfig = null;
/** Configuración pública del backend (tiles, origen de rutas, límites). Se pide una sola vez. */
export function useConfiguracion() {
  const [c, setC] = useState(cacheConfig);
  const [error, setError] = useState(null);
  useEffect(() => { if (!cacheConfig) api.get('/configuracion').then(d => { cacheConfig = d; setC(d); }).catch(setError); }, []);
  return { config: c, error, refrescar: async () => { cacheConfig = await api.get('/configuracion'); setC(cacheConfig); } };
}

export const MEDELLIN = [6.2476, -75.5658];

/** Marcador distintivo de la Secretaría de Educación (origen de todas las rutas). */
export const iconoSecretaria = L.divIcon({ className: 'pin-secretaria', html: '<span aria-hidden="true">SE</span>', iconSize: [34, 34], iconAnchor: [17, 17], tooltipAnchor: [16, 0] });
export const iconoDestino = (n, color) => L.divIcon({ className: 'pin-destino', html: `<span style="background:${color}">${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13], tooltipAnchor: [14, 0] });

/* Solo en pruebas automáticas (VITE_E2E=1) se expone el mapa para ubicar marcadores en pantalla. */
function ExponerParaPruebas() { const map = useMap(); useEffect(() => { if (import.meta.env.VITE_E2E) window.__trazaMapa = map; }, [map]); return null; }

export function MapaBase({ centro = MEDELLIN, zoom = 12, children, className = '', ...resto }) {
  const { config } = useConfiguracion();
  return (
    <MapContainer center={centro} zoom={zoom} className={'mapa ' + className} preferCanvas scrollWheelZoom {...resto}>
      <TileLayer url={(config && config.mapa.tiles) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
        attribution={(config && config.mapa.atribucion) || '&copy; colaboradores de OpenStreetMap'} maxZoom={19} />
      {import.meta.env.VITE_E2E && <ExponerParaPruebas />}
      {children}
    </MapContainer>
  );
}

/** Ajusta la vista a un conjunto de puntos [[lat, lon], …] cuando cambian. */
export function AjustarVista({ puntos, relleno = 40, max = 16, clave }) {
  const map = useMap();
  useEffect(() => {
    const p = (puntos || []).filter(x => x && isFinite(x[0]) && isFinite(x[1]));
    if (!p.length) return;
    if (p.length === 1) map.setView(p[0], Math.min(max, 16));
    else map.fitBounds(L.latLngBounds(p), { padding: [relleno, relleno], maxZoom: max });
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Mapa pequeño para elegir coordenadas con un clic. */
export function SelectorCoordenadas({ lat, lon, alCambiar, origen }) {
  const tiene = lat !== '' && lon !== '' && lat != null && lon != null && isFinite(lat) && isFinite(lon);
  function Clic() { useMapEvents({ click: e => alCambiar(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)) }); return null; }
  return (
    <div className="selector-coords">
      <MapaBase centro={tiene ? [Number(lat), Number(lon)] : MEDELLIN} zoom={tiene ? 15 : 12}>
        <Clic />
        {origen && <Marker position={[origen.latitud, origen.longitud]} icon={iconoSecretaria} />}
        {tiene && <CircleMarker center={[Number(lat), Number(lon)]} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#5a43c9', fillOpacity: 1 }} />}
      </MapaBase>
      <small>Haz clic en el mapa para ubicar el punto. Puedes ajustar los valores a mano.</small>
    </div>
  );
}
