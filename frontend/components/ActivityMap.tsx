"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

interface Props {
  latLong: ([number, number] | null)[];
}

export default function ActivityMap({ latLong }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    const coords = latLong.filter(
      (p): p is [number, number] => Array.isArray(p) && p.length === 2
    );
    if (coords.length < 2 || !containerRef.current) return;
    if (mapRef.current) return; // already initialised

    import("leaflet").then((L) => {
      // Leaflet CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 19,
        }
      ).addTo(map);

      const line = L.polyline(coords, {
        color: "#34d399",
        weight: 3,
        opacity: 0.85,
      }).addTo(map);

      // Start dot (green) and finish dot (red)
      L.circleMarker(coords[0], {
        radius: 6,
        color: "#fff",
        weight: 2,
        fillColor: "#34d399",
        fillOpacity: 1,
      })
        .bindTooltip("Start", { permanent: false })
        .addTo(map);

      L.circleMarker(coords[coords.length - 1], {
        radius: 6,
        color: "#fff",
        weight: 2,
        fillColor: "#f87171",
        fillOpacity: 1,
      })
        .bindTooltip("Finish", { permanent: false })
        .addTo(map);

      map.fitBounds(line.getBounds(), { padding: [24, 24] });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ height: "280px", borderRadius: "10px", overflow: "hidden" }}
    />
  );
}
