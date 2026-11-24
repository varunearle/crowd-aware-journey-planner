import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ROUTES, STOPS, STOP_BY_ID } from './data';
import { LEVELS, levelOf, liveBuses, fmt } from './model';
import type { Journey } from './model';

interface Props {
  origin: string;
  dest: string;
  journey: Journey | null;
  time: number;
  showLive: boolean;
  onStopClick: (id: string) => void;
}

export default function MapView({ origin, dest, journey, time, showLive, onStopClick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const baseLayer = useRef<L.LayerGroup | null>(null);
  const journeyLayer = useRef<L.LayerGroup | null>(null);
  const liveLayer = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onStopClick);
  clickRef.current = onStopClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([28.6, 77.21], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(m);
    baseLayer.current = L.layerGroup().addTo(m);
    journeyLayer.current = L.layerGroup().addTo(m);
    liveLayer.current = L.layerGroup().addTo(m);
    map.current = m;

    for (const r of ROUTES) {
      L.polyline(
        r.stops.map((s) => [STOP_BY_ID[s].lat, STOP_BY_ID[s].lon] as [number, number]),
        { color: '#9aa5ad', weight: 3, opacity: 0.45 },
      ).addTo(baseLayer.current);
    }
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // stops (re-render when origin/destination changes)
  useEffect(() => {
    const layer = baseLayer.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      if (l instanceof L.CircleMarker) layer.removeLayer(l);
    });
    for (const s of STOPS) {
      const isO = s.id === origin;
      const isD = s.id === dest;
      const mk = L.circleMarker([s.lat, s.lon], {
        radius: isO || isD ? 8 : 5,
        color: isO ? '#0b5d3b' : isD ? '#1b1f23' : '#4a5560',
        weight: 2,
        fillColor: isO ? '#2e9e6b' : isD ? '#1b1f23' : '#ffffff',
        fillOpacity: 1,
      });
      mk.bindTooltip(s.name + (isO ? ' (from)' : isD ? ' (to)' : ''), { direction: 'top', offset: [0, -6] });
      mk.on('click', () => clickRef.current(s.id));
      mk.addTo(layer);
    }
  }, [origin, dest]);

  // selected journey, coloured by crowd level per segment
  useEffect(() => {
    const layer = journeyLayer.current;
    const m = map.current;
    if (!layer || !m) return;
    layer.clearLayers();
    if (!journey) return;
    const pts: [number, number][] = [];
    for (const leg of journey.legs) {
      for (let k = leg.i; k < leg.j; k++) {
        const a = STOP_BY_ID[leg.trip.stops[k]];
        const b = STOP_BY_ID[leg.trip.stops[k + 1]];
        const lv = levelOf(leg.trip.loads[k]);
        L.polyline(
          [
            [a.lat, a.lon],
            [b.lat, b.lon],
          ],
          { color: LEVELS[lv].color, weight: 7, opacity: 0.9 },
        )
          .bindTooltip(`${leg.trip.route.id} ${a.name} to ${b.name}: ${LEVELS[lv].label} (about ${Math.round(leg.trip.loads[k])} on board)`)
          .addTo(layer);
        pts.push([a.lat, a.lon], [b.lat, b.lon]);
      }
    }
    if (journey.walk) {
      const a = STOP_BY_ID[journey.walk.from];
      const b = STOP_BY_ID[journey.walk.to];
      L.polyline(
        [
          [a.lat, a.lon],
          [b.lat, b.lon],
        ],
        { color: '#1b1f23', weight: 3, dashArray: '4 6' },
      ).addTo(layer);
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14 });
  }, [journey]);

  // simulated live buses
  useEffect(() => {
    const layer = liveLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showLive) return;
    for (const b of liveBuses(time)) {
      const lv = levelOf(b.load);
      L.circleMarker([b.lat, b.lon], {
        radius: 4.5,
        color: '#ffffff',
        weight: 1.5,
        fillColor: LEVELS[lv].color,
        fillOpacity: 1,
      })
        .bindTooltip(`${b.trip.route.id} towards ${STOP_BY_ID[b.trip.stops[b.trip.stops.length - 1]].name}<br>${LEVELS[lv].label}, about ${Math.round(b.load)} on board<br>Next stop ${b.nextStop} (${fmt(time)})`)
        .addTo(layer);
    }
  }, [time, showLive]);

  return <div ref={el} className="map" />;
}
