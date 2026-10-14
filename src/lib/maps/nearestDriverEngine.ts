import { createClient } from '@supabase/supabase-js'
import { calculateRouteAndDistance, getHaversineDistance } from './routingService'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cljmmzzetajamciohcan.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

function normalizeVehicleType(type?: string | null): string {
  if (!type) return 'sedan';
  const clean = type.toLowerCase().trim();
  if (clean === 'suv/van' || clean === 'suv' || clean === 'van') return 'suv';
  return clean;
}

export async function getNearestDrivers(pickupLat: number, pickupLng: number, requestedVehicleType: string) {
  // Fetch active available drivers
  const { data: drivers, error } = await getSupabase()
    .from('drivers')
    .select('*, driver_categories(name)')
    .eq('is_active', true)
    .eq('availability', 'available')
  
  if (error || !drivers) {
    console.error("Failed to fetch drivers", error);
    return [];
  }

  const normalizedRequested = normalizeVehicleType(requestedVehicleType);
  const rankedDrivers = [];

  for (const driver of drivers) {
    if (driver.current_lat && driver.current_lng) {
      // Optimization: If Haversine distance is > 50km, skip expensive routing API call
      const roughDist = getHaversineDistance(pickupLat, pickupLng, driver.current_lat, driver.current_lng);
      
      let distanceKm = roughDist * 1.3;
      let etaMins = Math.ceil(distanceKm / 0.5);

      if (roughDist < 30) {
        // Calculate real route
        const route = await calculateRouteAndDistance(driver.current_lat, driver.current_lng, pickupLat, pickupLng);
        distanceKm = route.distanceKm;
        etaMins = route.durationMinutes;
      }

      const driverNormalizedType = normalizeVehicleType(driver.vehicle_type);
      const isExactMatch = requestedVehicleType === 'any' || driverNormalizedType === normalizedRequested;

      rankedDrivers.push({
        id: driver.id,
        name: driver.full_name,
        category: driver.driver_categories?.name || 'Driver',
        vehicleType: driver.vehicle_type || 'sedan',
        distanceKm: Number(distanceKm.toFixed(2)),
        etaMins,
        phone: driver.phone,
        secure_access_token: driver.secure_access_token,
        isExactMatch
      });
    }
  }

  // Sort: Exact vehicle matches first, then nearest ETA ascending
  return rankedDrivers.sort((a, b) => {
    if (a.isExactMatch && !b.isExactMatch) return -1;
    if (!a.isExactMatch && b.isExactMatch) return 1;
    return a.etaMins - b.etaMins;
  });
}

