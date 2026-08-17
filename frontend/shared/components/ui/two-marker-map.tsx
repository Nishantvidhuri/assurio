'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Small Leaflet map with up to two coloured markers + a dashed line
// between them. Used by the Video-KYC Location Check section in the
// verifier panel — declared (green) vs live captured (blue), with the
// distance read at a glance from the connecting line. Free, no API
// key, renders OSM tiles directly.

export interface TwoMarkerMapProps {
  declared?: { latitude: number; longitude: number };
  live: { latitude: number; longitude: number };
  // Min height — the parent's grid row may stretch this; this is just
  // the floor so an unstretched single-column render still has a
  // sensible size.
  minHeightPx?: number;
  className?: string;
}

// React-Leaflet's default marker icon ships from a URL that 404s when
// served from a Next.js page (it expects to find PNGs adjacent to its
// own bundle output). Override with a coloured pin-shaped SVG so we
// don't have to copy the assets into /public and so we can colour
// each marker per role.
function coloredPinIcon(fill: string): L.DivIcon {
  // Drop-pin SVG, 24×34 px. Lucide-style outline + filled body so it
  // reads cleanly on both light and dark OSM tiles.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34" fill="none">
      <path d="M12 1.5C6.20101 1.5 1.5 6.20101 1.5 12C1.5 19.5 12 32.5 12 32.5C12 32.5 22.5 19.5 22.5 12C22.5 6.20101 17.799 1.5 12 1.5Z"
            fill="${fill}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 34],
    iconAnchor: [12, 32], // tip of pin
  });
}

export function TwoMarkerMap({
  declared,
  live,
  minHeightPx = 180,
  className,
}: TwoMarkerMapProps) {
  // Centre on midpoint if both points exist; otherwise on the live
  // captured point. Memoised so the MapContainer doesn't re-mount.
  const center = useMemo<[number, number]>(() => {
    if (declared) {
      return [
        (declared.latitude + live.latitude) / 2,
        (declared.longitude + live.longitude) / 2,
      ];
    }
    return [live.latitude, live.longitude];
  }, [declared, live]);

  // Tile-attribution is a Leaflet requirement; we keep it tiny in the
  // corner to satisfy OSM's licence without dominating the tile.
  // The tile URL is OSM's public endpoint — no API key.
  // Red = declared (what the candidate filled in). Blue = live captured
  // GPS. Same colour pairing the verifier reads on the call recording
  // legend and the PDF report's legend table — keep these in sync.
  const declaredIcon = useMemo(() => coloredPinIcon('var(--color-failure)'), []); // red
  const liveIcon = useMemo(() => coloredPinIcon('#2563eb'), []); // blue

  // When `declared` flips in/out (geocode resolves later), Leaflet
  // needs `invalidateSize()` to recompute its internal pane size,
  // otherwise the tile grid keeps the original aspect and you get a
  // grey strip. We can't easily reach the map instance from props, so
  // the simpler trick is keying the container on the presence of
  // declared — React unmounts/remounts the map which triggers a clean
  // size calc.
  return (
    <div
      className={className}
      style={{ minHeight: minHeightPx, height: '100%' }}
    >
      <MapContainer
        key={declared ? 'with-declared' : 'live-only'}
        center={center}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: '100%', minHeight: minHeightPx, width: '100%' }}
        // No keyboard / drag interaction needed — this is a static
        // visual reference. Verifier can click "open in OSM" via the
        // parent link if they want to pan/zoom.
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {declared ? (
          <>
            <Marker
              position={[declared.latitude, declared.longitude]}
              icon={declaredIcon}
            />
            <Polyline
              positions={[
                [declared.latitude, declared.longitude],
                [live.latitude, live.longitude],
              ]}
              pathOptions={{
                color: 'var(--color-neutral-700)',
                weight: 2,
                dashArray: '6 6',
                opacity: 0.8,
              }}
            />
          </>
        ) : null}
        <Marker position={[live.latitude, live.longitude]} icon={liveIcon} />
        <InvalidateSizeOnMount />
        <FitToMarkers declared={declared} live={live} />
      </MapContainer>
    </div>
  );
}

// Forces a tile-grid recalculation once the container has its real
// pixel size. Needed because Leaflet measures the parent at mount
// time, and our parent's height is determined by the surrounding
// flexbox/grid AFTER the map first paints. Without this, the map
// renders at 0px tall on first paint and never recovers.
// Auto-frames the viewport so BOTH markers are visible — whether the
// two pins are 50 m apart (same building) or 1,500 km apart (declared
// Kanpur vs live Bangalore). Without this, a fixed zoom only shows
// the markers when they happen to fall inside the viewport, so
// cross-city mismatches render with one marker invisible off-screen.
function FitToMarkers({
  declared,
  live,
}: {
  declared?: { latitude: number; longitude: number };
  live: { latitude: number; longitude: number };
}) {
  const map = useMap();
  useEffect(() => {
    if (!declared) {
      map.setView([live.latitude, live.longitude], 15);
      return;
    }
    const bounds = L.latLngBounds(
      [declared.latitude, declared.longitude],
      [live.latitude, live.longitude],
    );
    // padding leaves breathing room around the pins; maxZoom stops
    // a near-overlap from snapping into building-level detail.
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [
    map,
    declared?.latitude,
    declared?.longitude,
    live.latitude,
    live.longitude,
  ]);
  return null;
}

function InvalidateSizeOnMount() {
  // We don't have a direct map ref here — instead, we use a
  // microtask to wait one frame after mount, then dispatch a
  // window resize event which Leaflet listens for to re-measure.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => window.clearTimeout(handle);
  }, []);
  return null;
}
