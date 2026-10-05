import { createClient } from '@supabase/supabase-js'
import { calculateRouteAndDistance, getHaversineDistance } from './routingService'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function getNearestDrivers(pickupLat: number, pickupLng: number, requestedVehicleType: string) {
  // Fetch active available drivers
  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('*, driver_categories(name)')
    .eq('is_active', true)
    .eq('availability', 'available')
  
  if (error || !drivers) {
    console.error("Failed to fetch drivers", error);
    return [];
  }

  // Filter by requested vehicle type (if strict)
  const compatibleDrivers = drivers.filter(d => 
    requestedVehicleType === 'any' || d.vehicle_type === requestedVehicleType
  );

  const rankedDrivers = [];

  for (const driver of compatibleDrivers) {
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

      rankedDrivers.push({
        id: driver.id,
        name: driver.full_name,
        category: driver.driver_categories?.name || 'Unknown',
        vehicleType: driver.vehicle_type,
        distanceKm: Number(distanceKm.toFixed(2)),
        etaMins,
        phone: driver.phone
      });
    }
  }

  // Sort by ETA ascending
  return rankedDrivers.sort((a, b) => a.etaMins - b.etaMins);
}
