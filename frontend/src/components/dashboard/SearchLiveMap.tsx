"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";

export interface SearchMapPoint {
  id: string;
  name: string;
  phone: string | null;
  website: string | null;
  hasWebsite?: boolean;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  latitude: number;
  longitude: number;
}

interface SearchLiveMapProps {
  points: SearchMapPoint[];
  isSearching: boolean;
  location: string;
  segment: string;
}

function createPopupContent(point: SearchMapPoint) {
  const content = document.createElement("div");
  content.className = "abordai-map-popup";
  const name = document.createElement("strong");
  name.className = "abordai-map-popup-title";
  name.textContent = point.name;
  content.append(name);

  const addressText = [point.address, point.city].filter(Boolean).join(" · ");
  if (addressText) {
    const address = document.createElement("p");
    address.className = "abordai-map-popup-address";
    address.textContent = addressText;
    content.append(address);
  }

  const metadata = [
    point.category,
    point.rating == null
      ? null
      : `★ ${point.rating}${point.reviewsCount == null ? "" : ` · ${point.reviewsCount} avaliações`}`
  ].filter(Boolean);
  if (metadata.length) {
    const details = document.createElement("p");
    details.className = "abordai-map-popup-details";
    details.textContent = metadata.join(" · ");
    content.append(details);
  }

  const digits = point.phone?.replace(/\D/g, "") || "";
  const whatsappNumber = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits
    : (digits.length === 10 || digits.length === 11) ? `55${digits}` : null;
  const phoneNumber = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const phoneHref = phoneNumber.length >= 10 && phoneNumber.length <= 15 ? `tel:+${phoneNumber}` : null;
  let websiteHref: string | null = null;
  let isWhatsAppWebsite = false;
  if (point.website) {
    try {
      const website = new URL(/^https?:\/\//i.test(point.website) ? point.website : `https://${point.website}`);
      if (website.protocol === "http:" || website.protocol === "https:") {
        websiteHref = website.toString();
        isWhatsAppWebsite = ["wa.me", "whatsapp.com", "api.whatsapp.com"].includes(website.hostname.toLowerCase());
      }
    } catch {
      websiteHref = null;
    }
  }

  if (phoneHref || websiteHref) {
    const actions = document.createElement("div");
    actions.className = "abordai-map-popup-actions";

    if (phoneHref && point.phone) {
      const call = document.createElement("a");
      call.href = phoneHref;
      call.className = "abordai-map-popup-action";
      call.textContent = point.phone || "Ligar";
      call.setAttribute("aria-label", `Ligar para ${point.name}`);
      actions.append(call);
    }

    if (whatsappNumber || isWhatsAppWebsite) {
      const whatsapp = document.createElement("a");
      whatsapp.href = whatsappNumber ? `https://wa.me/${whatsappNumber}` : websiteHref!;
      whatsapp.target = "_blank";
      whatsapp.rel = "noopener noreferrer";
      whatsapp.className = "abordai-map-popup-action abordai-map-popup-action-primary";
      whatsapp.textContent = "WhatsApp";
      whatsapp.setAttribute("aria-label", `Abrir WhatsApp para ${point.name}`);
      actions.append(whatsapp);
    }

    if (websiteHref && !isWhatsAppWebsite) {
      const website = document.createElement("a");
      website.href = websiteHref;
      website.target = "_blank";
      website.rel = "noopener noreferrer";
      website.className = "abordai-map-popup-action";
      website.textContent = point.hasWebsite ? "Abrir site" : "Abrir perfil/contato";
      website.setAttribute("aria-label", `${point.hasWebsite ? "Abrir site" : "Abrir perfil ou contato"} de ${point.name}`);
      actions.append(website);
    }

    content.append(actions);
  }

  return content;
}

export function SearchLiveMap({ points, isSearching, location, segment }: SearchLiveMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, LeafletMarker>());
  const hasCenteredOnResults = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapGeneration, setMapGeneration] = useState(0);
  const [mapError, setMapError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    const markerRegistry = markers.current;

    void import("leaflet")
      .then((leaflet) => {
        if (cancelled || !mapElement.current) return;

        map = leaflet.map(mapElement.current, {
          center: [-14.235, -51.925],
          zoom: 4,
          zoomControl: false,
          attributionControl: true,
          scrollWheelZoom: true,
          wheelDebounceTime: 50
        });
        map.attributionControl.setPrefix(false);
        map.createPane("abordaiTiles").classList.add("abordai-map-tile-pane");

        leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          pane: "abordaiTiles",
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
        }).addTo(map);

        map.on("tileerror", () => setMapError(true));
        mapInstance.current = map;
        setMapError(false);
        setMapReady(true);
        setMapGeneration((generation) => generation + 1);
      })
      .catch(() => setMapError(true));

    return () => {
      cancelled = true;
      for (const marker of markerRegistry.values()) marker.remove();
      markerRegistry.clear();
      map?.remove();
      mapInstance.current = null;
      hasCenteredOnResults.current = false;
      setMapReady(false);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;

    let cancelled = false;
    void import("leaflet").then((leaflet) => {
      if (cancelled) return;

      const validPoints = points.filter((point) =>
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        point.latitude >= -34 &&
        point.latitude <= 6 &&
        point.longitude >= -75 &&
        point.longitude <= -28
      );

      for (const point of validPoints) {
        const coordinates: [number, number] = [point.latitude, point.longitude];
        const existingMarker = markers.current.get(point.id);
        if (existingMarker) {
          existingMarker.setLatLng(coordinates);
          existingMarker.setPopupContent(createPopupContent(point));
          continue;
        }

        const marker = leaflet.marker(coordinates, {
          title: point.name,
          alt: point.name,
          icon: leaflet.divIcon({
            className: "abordai-search-marker",
            html: '<span class="abordai-search-pin"></span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        });
        marker.bindPopup(createPopupContent(point));
        marker.addTo(map);
        markers.current.set(point.id, marker);
      }

      if (!hasCenteredOnResults.current && validPoints.length > 0) {
        if (validPoints.length === 1) {
          const point = validPoints[0];
          map.flyTo([point.latitude, point.longitude], 13, { duration: 1.1 });
        } else {
          const bounds = leaflet.latLngBounds(
            validPoints.map((point) => [point.latitude, point.longitude] as [number, number])
          );
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13, animate: true });
        }
        hasCenteredOnResults.current = true;
      } else if (hasCenteredOnResults.current && validPoints.some((point) =>
        !map.getBounds().contains([point.latitude, point.longitude])
      )) {
        const bounds = leaflet.latLngBounds(
          validPoints.map((point) => [point.latitude, point.longitude] as [number, number])
        );
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13, animate: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [points, mapReady, mapGeneration]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => mapInstance.current?.invalidateSize({ animate: false }));
    return () => window.cancelAnimationFrame(frame);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  const zoomIn = useCallback(() => mapInstance.current?.zoomIn(), []);
  const zoomOut = useCallback(() => mapInstance.current?.zoomOut(), []);
  const toggleFullscreen = useCallback(() => setIsFullscreen((fullscreen) => !fullscreen), []);

  const mapSection = (
    <section
      aria-label="Mapa ao vivo dos resultados da busca"
      className={"relative mb-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090d0b] " + (isFullscreen ? "abordai-map-fullscreen" : "")}
    >
      <div className={"abordai-map-frame relative w-full " + (isFullscreen ? "h-[100dvh]" : "h-[300px] sm:h-[390px] xl:h-[min(58vh,620px)]")}>
        <div ref={mapElement} className="abordai-map-canvas h-full w-full" aria-label="Mapa interativo com resultados da Apify" />

        <div role="group" aria-label="Controles do mapa" className="absolute right-3 top-1/2 z-[500] flex -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b100e]/90 p-1 shadow-xl backdrop-blur">
          <button type="button" onClick={zoomIn} aria-label="Aproximar mapa" title="Aproximar" className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            <Plus size={18} />
          </button>
          <button type="button" onClick={zoomOut} aria-label="Afastar mapa" title="Afastar" className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            <Minus size={18} />
          </button>
          <span className="mx-2 h-px bg-white/10" />
          <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Sair da tela cheia" : "Expandir mapa"} title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"} className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>

        {isSearching && (
          <div aria-hidden="true" className="abordai-map-scan pointer-events-none absolute inset-x-0 top-0 z-[400] h-20 bg-gradient-to-b from-transparent via-emerald-300/[0.10] to-transparent" />
        )}

        {mapError && (
          <div role="status" className="absolute bottom-3 left-3 z-[500] max-w-[min(80%,24rem)] rounded-xl border border-amber-200/20 bg-[#0b100e]/90 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur">
            O mapa base não carregou. A busca e os resultados da Apify continuam sendo atualizados.
          </div>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        Mapa de {segment || "empresas"} em {location || "Brasil"}.{" "}
        {isSearching ? "A Apify está buscando e os marcadores serão atualizados durante a busca." : points.length + " resultados no mapa."}
      </span>
    </section>
  );

  return isFullscreen && typeof document !== "undefined"
    ? createPortal(mapSection, document.body)
    : mapSection;
}
