import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isValidCoordinatePair } from "../../lib/deliveryOrder";

export interface DeliveryMapPickerProps {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
}

// Center of the Dominican Republic, shown until the customer shares or marks a location.
const DEFAULT_CENTER: L.LatLngTuple = [18.7357, -70.1627];
const DEFAULT_ZOOM = 8;
const PIN_ZOOM = 17;

// A CSS-only pin avoids Leaflet's default marker images, which bundlers do not resolve.
const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#34d399;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);transform:rotate(-45deg)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

/** Tap-to-pin map (OpenStreetMap tiles). Lazy-loaded so the public menu does not pay for Leaflet up front. */
export default function DeliveryMapPicker({ lat, lng, onPick }: DeliveryMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, { zoomControl: true, attributionControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => onPickRef.current(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;

    // The drawer animates open, so the container size is not final on mount.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.invalidateSize());
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!isValidCoordinatePair(lat, lng)) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const position: L.LatLngTuple = [lat, lng as number];
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    } else {
      const marker = L.marker(position, { icon: pinIcon, draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const next = marker.getLatLng();
        onPickRef.current(next.lat, next.lng);
      });
      markerRef.current = marker;
    }
    map.setView(position, Math.max(map.getZoom(), PIN_ZOOM));
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Mapa para marcar el lugar de entrega"
      className="relative isolate z-0 h-56 w-full overflow-hidden rounded-xl border border-[#27272a] bg-[#18181b]"
    />
  );
}
