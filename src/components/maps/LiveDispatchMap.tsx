'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import WhatsAppButton from '@/components/ui/WhatsAppButton'

// Polyline Decoder (Google / OSRM format)
function decodePolyline(str: string, precision: number = 5): [number, number][] {
  let index = 0, lat = 0, lng = 0, coordinates: [number, number][] = [], shift = 0, result = 0, byte = null, latitude_change, longitude_change, factor = Math.pow(10, precision);
  while (index < str.length) {
      byte = null; shift = 0; result = 0;
      do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      shift = result = 0;
      do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += latitude_change; lng += longitude_change;
      coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

// Fix missing marker icons in leaflet for Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom marker icons
// Icons are cached per status so markers aren't rebuilt on every re-render
// (important now that the map re-renders while panels are being resized).
const driverIconCache: Record<string, L.DivIcon> = {};
const createDriverIcon = (status: string) => {
  const key = status === 'available' ? 'available' : 'busy';
  if (driverIconCache[key]) return driverIconCache[key];
  const color = key === 'available' ? '#22c55e' : '#f97316'; // green or orange
  // White outline keeps pins readable on top of satellite imagery
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1.2" width="32px" height="32px">
                 <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
               </svg>`;
  driverIconCache[key] = L.divIcon({
    html: svg,
    className: 'custom-driver-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
  return driverIconCache[key];
};

const pickupIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3b82f6" stroke="#ffffff" stroke-width="1.2" width="32px" height="32px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>`,
  className: 'pickup-icon',
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

const destIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="1.2" width="32px" height="32px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>`,
  className: 'dest-icon',
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

function MapEventsHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

function MapBoundsFitter({ pickup, dest }: { pickup: [number, number] | null, dest: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (pickup && dest) {
      const bounds = L.latLngBounds(pickup, dest)
      map.fitBounds(bounds, { padding: [50, 50] })
    } else if (pickup) {
      map.setView(pickup, 15)
    }
  }, [pickup, dest, map])
  return null
}

function MapFocusHandler({ location }: { location?: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (location) {
      map.flyTo(location, 16, { animate: true, duration: 1 })
    }
  }, [location, map])
  return null
}

// Leaflet only measures its container once. Whenever the container changes size
// (panel drag, full-screen, window resize) we must tell it, otherwise grey/blank
// tile areas appear.
function MapResizeHandler() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [map])
  return null
}

// ---- Base map layers ----
type BaseLayerId = 'streets' | 'satellite'
const BASE_LAYER_STORAGE_KEY = 'dispatch.map.baseLayer'
const BASE_LAYER_OPTIONS: { id: BaseLayerId; label: string }[] = [
  { id: 'streets', label: 'Streets' },
  { id: 'satellite', label: 'Satellite' },
]
const ESRI_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community'

function readStoredBaseLayer(): BaseLayerId {
  try {
    const stored = window.localStorage.getItem(BASE_LAYER_STORAGE_KEY)
    if (stored && BASE_LAYER_OPTIONS.some(o => o.id === stored)) return stored as BaseLayerId
  } catch {}
  return 'streets'
}

export type DriverMarker = {
  id: string;
  driver_code: string;
  full_name: string;
  categoryName?: string;
  availability: 'available' | 'busy' | 'offline';
  lat: number;
  lng: number;
  phone?: string;
  secure_access_token?: string;
}

interface LiveDispatchMapProps {
  drivers?: DriverMarker[];
  pickup?: [number, number] | null;
  destination?: [number, number] | null;
  encodedPolyline?: string | null;
  distanceKm?: number;
  durationMins?: number;
  focusedLocation?: [number, number] | null;
  onMapClick?: (lat: number, lng: number) => void;
  onDriverClick?: (driverId: string) => void;
}

export default function LiveDispatchMap({
  drivers = [],
  pickup = null,
  destination = null,
  encodedPolyline = null,
  distanceKm,
  durationMins,
  focusedLocation = null,
  onMapClick,
  onDriverClick
}: LiveDispatchMapProps) {
  
  // Default to Beirut
  const defaultCenter: [number, number] = [33.8938, 35.5018]

  // This component is only ever loaded client-side (ssr: false), so localStorage is safe here
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>(readStoredBaseLayer)
  const changeBaseLayer = (id: BaseLayerId) => {
    setBaseLayer(id)
    try { window.localStorage.setItem(BASE_LAYER_STORAGE_KEY, id) } catch {}
  }

  // Full-screen: prefer the native Fullscreen API (Esc exits automatically),
  // fall back to a fixed overlay if the browser doesn't support it.
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [isCssFullscreen, setIsCssFullscreen] = useState(false)
  const isFullscreen = isNativeFullscreen || isCssFullscreen

  useEffect(() => {
    const onChange = () => setIsNativeFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!isCssFullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsCssFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCssFullscreen])

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      return
    }
    if (isCssFullscreen) {
      setIsCssFullscreen(false)
      return
    }
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setIsCssFullscreen(true))
    } else {
      setIsCssFullscreen(true)
    }
  }, [isCssFullscreen])

  const availableCount = drivers.filter(d => d.availability === 'available').length
  const busyCount = drivers.length - availableCount

  const decodedRoute = useMemo(() => {
    if (encodedPolyline) {
      try {
        return decodePolyline(encodedPolyline);
      } catch (e) {
        console.error("Failed to decode polyline", e);
        return [];
      }
    }
    return [];
  }, [encodedPolyline]);

  return (
    <div
      ref={wrapperRef}
      className={`overflow-hidden relative bg-gray-100 dark:bg-gray-900 ${
        isFullscreen
          ? 'rounded-none'
          : 'h-full w-full rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm z-0'
      } ${isCssFullscreen ? 'fixed inset-0 z-[9999]' : ''}`}
      style={{ minHeight: '200px' }}
    >

      {/* Map Toolbar: layer switcher + full-screen (sits outside the Leaflet DOM so clicks don't hit the map) */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        <div className="flex gap-1 p-1 rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur shadow-lg border border-gray-200 dark:border-gray-700">
          {BASE_LAYER_OPTIONS.map(opt => (
            <button
              key={opt.id}
              id={`map-layer-${opt.id}`}
              type="button"
              onClick={() => changeBaseLayer(opt.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                baseLayer === opt.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          id="map-fullscreen-toggle"
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen map'}
          className="p-2 rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur shadow-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {isFullscreen ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          )}
        </button>
      </div>

      {/* Driver Legend */}
      {drivers.length > 0 && (
        <div className="absolute bottom-6 left-3 z-[1000] flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur shadow-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-700 dark:text-gray-200 pointer-events-none">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>Available {availableCount}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>Busy {busyCount}</span>
        </div>
      )}
      
      {/* HUD Overlay for Route Info */}
      {(distanceKm !== undefined || durationMins !== undefined) && (
        <div className="absolute top-4 left-4 z-[400] bg-white/95 dark:bg-gray-900/95 backdrop-blur p-4 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 pointer-events-none">
          <div className="flex gap-6">
            {distanceKm !== undefined && (
              <div>
                <p className="text-[10px] uppercase font-extrabold text-gray-500 tracking-wider">Distance</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{distanceKm.toFixed(1)} km</p>
              </div>
            )}
            {durationMins !== undefined && (
              <div>
                <p className="text-[10px] uppercase font-extrabold text-gray-500 tracking-wider">Est. Driving Time</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{durationMins} mins</p>
              </div>
            )}
          </div>
        </div>
      )}

      <MapContainer 
        center={pickup || defaultCenter} 
        zoom={pickup ? 15 : 13} 
        scrollWheelZoom={true} 
        maxZoom={20}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
      >
        {baseLayer === 'streets' && (
          <TileLayer
            key="streets"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={19}
            maxZoom={20}
          />
        )}

        {/* Satellite imagery + road / street names + place names on top */}
        {baseLayer === 'satellite' && (
          <>
            <TileLayer
              key="satellite-imagery"
              attribution={ESRI_ATTRIBUTION}
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={19}
              maxZoom={20}
              zIndex={1}
            />
            <TileLayer
              key="satellite-roads"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={19}
              maxZoom={20}
              zIndex={2}
            />
            <TileLayer
              key="satellite-places"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={19}
              maxZoom={20}
              zIndex={3}
            />
          </>
        )}



        <MapResizeHandler />

        {onMapClick && <MapEventsHandler onClick={onMapClick} />}
        
        <MapBoundsFitter pickup={pickup} dest={destination} />
        <MapFocusHandler location={focusedLocation} />

        {/* Drivers */}
        {drivers.map(d => (
          <Marker 
            key={d.id} 
            position={[d.lat, d.lng]} 
            icon={createDriverIcon(d.availability)}
            eventHandlers={{
              click: () => onDriverClick && onDriverClick(d.id)
            }}
          >
            <Popup>
              <div className="font-sans min-w-[150px]">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-sm text-gray-900">{d.driver_code}</span>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-bold ${d.availability === 'available' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {d.availability}
                  </span>
                </div>
                <p className="font-medium text-gray-800">{d.full_name}</p>
                {d.categoryName && <p className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-1">{d.categoryName}</p>}
                
                {d.phone && (
                  <WhatsAppButton
                    phone={d.phone}
                    driverName={d.full_name}
                    message={d.secure_access_token ? `Hello ${d.full_name}, your driver portal link is:\nhttps://taxi-erp.vercel.app/driver-portal/${d.secure_access_token}` : undefined}
                    variant="button"
                    label="Chat on WhatsApp"
                    className="mt-2 w-full justify-center"
                  />
                )}

                {onDriverClick && d.availability === 'available' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDriverClick(d.id);
                    }} 
                    className="mt-2 w-full bg-blue-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Select for Dispatch
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Pickup Marker */}
        {pickup && (
          <Marker position={pickup} icon={pickupIcon}>
            <Popup><div className="font-bold">Pickup Location</div></Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destination && (
          <Marker position={destination} icon={destIcon}>
            <Popup><div className="font-bold">Destination</div></Popup>
          </Marker>
        )}

        {/* Route Line */}
        {decodedRoute.length > 0 && (
          <Polyline positions={decodedRoute} color="#3b82f6" weight={5} opacity={0.8} />
        )}

      </MapContainer>
    </div>
  )
}
