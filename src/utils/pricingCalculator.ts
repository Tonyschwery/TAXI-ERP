export interface PricingRule {
  vehicle_type: string;
  base_fare: number;
  price_per_km: number;
  minimum_fare: number;
  night_multiplier: number;
  night_start_hour: number;
  night_end_hour: number;
  extra_stop_fee: number;
  waiting_fee_per_15min: number;
}

export function calculateFare(
  distanceKm: number,
  vehicleType: string,
  scheduledDateTime: Date | string,
  extraCharges: number,
  pricingRules: PricingRule[]
): { calculatedFare: number; finalFare: number; breakdown: any } {
  const rule = pricingRules.find(r => r.vehicle_type === vehicleType) || pricingRules[0];
  
  if (!rule) {
    return { calculatedFare: 0, finalFare: 0, breakdown: { error: "No pricing rule found" } };
  }

  const date = new Date(scheduledDateTime);
  const hour = date.getHours();

  let isNight = false;
  if (rule.night_start_hour > rule.night_end_hour) {
    // Crosses midnight (e.g. 22:00 to 06:00)
    isNight = hour >= rule.night_start_hour || hour < rule.night_end_hour;
  } else {
    // Same day (e.g. 18:00 to 23:00)
    isNight = hour >= rule.night_start_hour && hour < rule.night_end_hour;
  }

  const multiplier = isNight ? rule.night_multiplier : 1.0;
  
  const distanceCost = distanceKm * rule.price_per_km;
  let calculatedFare = distanceCost * multiplier;
  
  // Rule: Minimum fare only kicks in if the ride is less than 5 km
  let minimumApplied = false;
  if (distanceKm < 5 && calculatedFare < rule.minimum_fare) {
    calculatedFare = rule.minimum_fare;
    minimumApplied = true;
  }

  const finalFare = calculatedFare + extraCharges;

  return {
    calculatedFare: Number(calculatedFare.toFixed(2)),
    finalFare: Number(finalFare.toFixed(2)),
    breakdown: {
      distanceCost: Number(distanceCost.toFixed(2)),
      isNightMultiplierApplied: isNight,
      multiplier,
      subtotal: Number(distanceCost.toFixed(2)),
      minimumApplied,
      extraCharges
    }
  };
}
