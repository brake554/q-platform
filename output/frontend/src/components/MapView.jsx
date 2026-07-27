/**
 * MapView — Leaflet map with live occupancy pins.
 *
 * Uses CARTO's dark basemap (no API key required) so the map works out of the
 * box. Tiles © CARTO, map data © OpenStreetMap contributors.
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CITY_CENTER } from '../data/stjohns.js';
import { radiusFor, distanceMeters } from '../lib/geofence.js';

// Venues further out than this don't get a say in the initial framing.
const FRAME_RADIUS_M = 1200;

const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function pinColor(pct) {
  return pct >= 90 ? '#ff4d6d' : pct >= 70 ? '#f5a524' : '#2dd48f';
}

function pinIcon(business) {
  const pct = business.occupancy_pct || 0;
  const color = pinColor(pct);
  return L.divIcon({
    className: 'q-pin',
    html: `
      <div style="
        background:${color};
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        width:34px;height:34px;
        display:flex;align-items:center;justify-content:center;
        border:2px solid #fff;
        box-shadow:0 0 16px ${color}80, 0 2px 8px rgba(0,0,0,.5);
      ">
        <span style="transform:rotate(45deg);font-size:10px;font-weight:700;color:#fff;font-family:'Space Grotesk',system-ui,sans-serif;">${pct}%</span>
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34],
  });
}

function userIcon() {
  return L.divIcon({
    className: 'q-user-pin',
    html: `
      <div style="
        width:16px;height:16px;border-radius:50%;
        background:linear-gradient(135deg,#8b5cf6,#d946ef);
        border:3px solid #fff;
        box-shadow:0 0 16px rgba(139,92,246,.9);
      "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function MapView({
  businesses = [], userLocation, onSelect,
  insideIds = [], simulateMode = false, onMapClick,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayer = useRef(null);
  const userMarker = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const bizRef = useRef(businesses);
  bizRef.current = businesses;
  const fenceLayer = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const insideKey = [...insideIds].sort().join('|');

  // Stable identity for the current pin set, so we only re-draw/re-frame
  // when the venues actually change — not on every parent render.
  const signature = businesses.map((b) => `${b.id}:${b.occupancy_pct}`).join('|');

  // Create the map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [CITY_CENTER.lat, CITY_CENTER.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer(TILES, { attribution: ATTRIB, maxZoom: 20, detectRetina: true }).addTo(map);
    // Keep controls clear of the bottom sheet
    map.attributionControl.setPosition('topleft');
    L.control.zoom({ position: 'topright' }).addTo(map);
    fenceLayer.current = L.layerGroup().addTo(map);   // under the pins
    markerLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e) => {
      if (onMapClickRef.current) onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Leaflet caches its pixel size, so any layout change around it (filter
    // rows appearing, the page transition settling) leaves markers drawn in
    // the wrong place until it re-measures.
    const t = setTimeout(() => map.invalidateSize(), 120);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerLayer.current = null;
      fenceLayer.current = null;
      userMarker.current = null;
    };
  }, []);

  // Sync business markers
  useEffect(() => {
    const layer = markerLayer.current;
    if (!layer) return;
    layer.clearLayers();

    const list = bizRef.current;
    list.forEach((b) => {
      if (b.lat == null || b.lng == null) return;
      const marker = L.marker([Number(b.lat), Number(b.lng)], {
        icon: pinIcon(b),
        title: b.name,
        riseOnHover: true,
      });
      const fee = b.entry_fee_cents > 0 ? `$${(b.entry_fee_cents / 100).toFixed(0)} cover` : 'No cover';
      marker.bindPopup(
        `<div style="font-family:'Space Grotesk',system-ui,sans-serif;min-width:170px">
           <div style="font-weight:600;font-size:14px;color:#f4f4f8;margin-bottom:2px">${b.name}</div>
           <div style="font-size:12px;color:#9a9aad;margin-bottom:6px">${b.address}</div>
           <div style="font-size:12px;color:${pinColor(b.occupancy_pct || 0)};font-weight:600">
             ${b.occupancy_pct || 0}% full · ${b.queue_length || 0} in Q
           </div>
           <div style="font-size:12px;color:#a78bfa;margin-top:2px">${fee}</div>
         </div>`,
        { className: 'q-popup', closeButton: false }
      );
      marker.on('click', () => onSelectRef.current && onSelectRef.current(b));
      marker.addTo(layer);
    });

    // Frame the dense core rather than the whole city — a handful of venues
    // sit several km out, and fitting those zooms past the useful detail.
    const withCoords = list.filter((b) => b.lat != null && b.lng != null);
    const anchor = userLocation || CITY_CENTER;
    const core = withCoords.filter(
      (b) => distanceMeters(anchor.lat, anchor.lng, Number(b.lat), Number(b.lng)) <= FRAME_RADIUS_M
    );
    const pts = (core.length >= 2 ? core : withCoords).map((b) => [Number(b.lat), Number(b.lng)]);
    if (pts.length && mapRef.current) {
      mapRef.current.flyToBounds(L.latLngBounds(pts), {
        paddingTopLeft: [34, 34],
        paddingBottomRight: [34, 300],
        maxZoom: 17,
        duration: 0.85,
      });
    }
  }, [signature]);

  // Draw the geofences
  useEffect(() => {
    const layer = fenceLayer.current;
    if (!layer) return;
    layer.clearLayers();

    bizRef.current.forEach((b) => {
      if (b.lat == null || b.lng == null) return;
      const active = insideIds.includes(b.id);
      L.circle([Number(b.lat), Number(b.lng)], {
        radius: radiusFor(b),
        color: active ? '#2dd48f' : '#8b5cf6',
        weight: active ? 2 : 1,
        opacity: active ? 0.9 : 0.28,
        fillColor: active ? '#2dd48f' : '#8b5cf6',
        fillOpacity: active ? 0.18 : 0.05,
        interactive: false,
      }).addTo(layer);
    });
  }, [signature, insideKey]);

  // Sync the user's own position
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      if (userMarker.current) {
        map.removeLayer(userMarker.current);
        userMarker.current = null;
      }
      return;
    }
    const pos = [userLocation.lat, userLocation.lng];
    if (userMarker.current) {
      userMarker.current.setLatLng(pos);
    } else {
      userMarker.current = L.marker(pos, { icon: userIcon(), interactive: false, zIndexOffset: 1000 }).addTo(map);
    }
    map.flyTo(pos, Math.max(map.getZoom(), 15), { duration: 0.9 });
  }, [userLocation]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%', background: '#08080c',
        cursor: simulateMode ? 'crosshair' : '',
      }}
    />
  );
}
