'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
const createDriverIcon = (status: string) => {
  const color = status === 'available' ? '#22c55e' : '#f97316'; // green or orange
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="32px" height="32px">
                 <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
               </svg>`;
  return L.divIcon({
    html: svg,
    className: 'custom-driver-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

const pickupIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3b82f6" width="32px" height="32px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>`,
  className: 'pickup-icon',
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

const destIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ef4444" width="32px" height="32px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>`,
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

export type DriverMarker = {
  id: string;
  driver_code: string;
  full_name: string;
  categoryName?: string;
  availability: 'available' | 'busy' | 'offline';
  lat: number;
  lng: number;
}

interface LiveDispatchMapProps {
  drivers?: DriverMarker[];
  pickup?: [number, number] | null;
  destination?: [number, number] | null;
  encodedPolyline?: string | null;
  distanceKm?: number;
  durationMins?: number;
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
  onMapClick,
  onDriverClick
}: LiveDispatchMapProps) {
  
  // Default to Beirut
  const defaultCenter: [number, number] = [33.8938, 35.5018]

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
    <div className="h-full w-full rounded-xl overflow-hidden relative border border-gray-200 dark:border-gray-800 shadow-sm z-0" style={{ minHeight: '400px' }}>
      
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
        style={{ height: '100%', width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {onMapClick && <MapEventsHandler onClick={onMapClick} />}
        
        <MapBoundsFitter pickup={pickup} dest={destination} />

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
                
                {onDriverClick && d.availability === 'available' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDriverClick(d.id);
                    }} 
                    className="mt-3 w-full bg-blue-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
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
