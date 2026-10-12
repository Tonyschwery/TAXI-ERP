import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cljmmzzetajamciohcan.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function calculateRouteAndDistance(pickupLat: number, pickupLng: number, destLat: number, destLng: number) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${pickupLat},${pickupLng}&destination=${destLat},${destLng}&key=${apiKey}`);
      const data = await res.json();
      if (data.status === 'OK') {
        const route = data.routes[0].legs[0];
        return {
          distanceKm: route.distance.value / 1000,
          durationMinutes: Math.ceil(route.duration.value / 60),
          polyline: data.routes[0].overview_polyline.points,
          source: 'google'
        };
      }
    } catch (e) {
      console.error("Google Maps routing failed, falling back to OSRM", e);
    }
  }

  // Fallback to OSRM
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=full`);
    const data = await res.json();
    if (data.code === 'Ok') {
      const route = data.routes[0];
      return {
        distanceKm: route.distance / 1000,
        durationMinutes: Math.ceil(route.duration / 60),
        polyline: route.geometry,
        source: 'osrm'
      };
    }
  } catch (e) {
    console.error("OSRM failed, falling back to Haversine", e);
  }

  // Offline / Absolute Fallback
  const straightLineKm = getHaversineDistance(pickupLat, pickupLng, destLat, destLng);
  return {
    distanceKm: straightLineKm * 1.3, // Road factor
    durationMinutes: Math.ceil((straightLineKm * 1.3) / 0.5), // Approx 30km/h average in cities = 0.5 km/min
    polyline: null,
    source: 'haversine'
  };
}

export async function searchPlaceAutocomplete(query: string) {
  if (!query || query.length < 2) return [];

  const results: any[] = [];

  // 1. Search Local Dialect Landmarks
  try {
    const { data: localPlaces } = await getSupabase()
      .from('dialect_landmarks')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(5);

    if (localPlaces && localPlaces.length > 0) {
      localPlaces.forEach(p => {
        results.push({ name: p.name, lat: p.lat, lng: p.lng, source: 'local' });
      });
    }
  } catch (e) {
    // Ignore, table might not exist yet
  }

  // 2. Google Places Fallback
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places:autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey
        },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ["LB"]
        })
      });
      const data = await res.json();
      if (data.suggestions) {
        data.suggestions.forEach((s: any) => {
          if (s.placePrediction) {
            results.push({ 
              name: s.placePrediction.text.text, 
              place_id: s.placePrediction.placeId, 
              source: 'google' 
            });
          }
        });
        return results;
      }
    } catch (e) {
      console.error("Google Places failed", e);
    }
  }

  // 3. Nominatim OSM Fallback
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=lb&limit=5`);
    const data = await res.json();
    data.forEach((d: any) => {
      results.push({ name: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon), source: 'osm' });
    });
  } catch (e) {
    console.error("Nominatim failed", e);
  }

  return results;
}

export async function reverseGeocodeLocation(lat: number, lng: number): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address.split(',').slice(0, 2).join(',').trim();
      }
    } catch (e) {
      console.error("Reverse geocoding error:", e);
    }
  }

  // Fallback to OpenStreetMap Nominatim
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
      headers: { 'User-Agent': 'TaxiERP-Dispatch/1.0' }
    });
    const data = await res.json();
    if (data.display_name) {
      return data.display_name.split(',').slice(0, 2).join(',').trim();
    }
  } catch (e) {
    console.error("OSM Reverse geocoding error:", e);
  }

  return "Location Pin";
}

export async function geocodePlaceName(placeName: string): Promise<{ lat: number, lng: number, formattedAddress: string } | null> {
  if (!placeName) return null;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(placeName + ', Lebanon')}&key=${apiKey}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        return {
          lat: loc.lat,
          lng: loc.lng,
          formattedAddress: data.results[0].formatted_address.split(',').slice(0, 2).join(',').trim()
        };
      }
    } catch (e) {
      console.error("Geocoding error:", e);
    }
  }

  // Fallback to OSM
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName + ', Lebanon')}&format=json&limit=1`, {
      headers: { 'User-Agent': 'TaxiERP-Dispatch/1.0' }
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        formattedAddress: data[0].display_name.split(',').slice(0, 2).join(',').trim()
      };
    }
  } catch (e) {
    console.error("OSM Geocoding error:", e);
  }

  return null;
}

