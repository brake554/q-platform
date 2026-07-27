/**
 * Geofence maths shared by the map and the queue engine.
 *
 * A venue's fence is a circle around its coordinates. Crossing into it counts
 * as arriving; leaving it counts as departing, which frees a slot for the next
 * person in the Q.
 */

// Fence radius in metres, by venue type. Big rooms get a wider fence so the
// GPS jitter of standing at the back of a club doesn't read as "left".
const RADIUS_BY_CATEGORY = {
  nightlife: 55,
  restaurant: 45,
  clinic: 45,
  medical: 45,
  pharmacy: 35,
  barbershop: 30,
  salon: 30,
  tattoo: 30,
};
const DEFAULT_RADIUS_M = 40;

// Hysteresis: you must get this much further out than the fence before we call
// it a departure, so someone hovering on the boundary isn't flapped in and out.
export const EXIT_BUFFER_M = 15;

export function radiusFor(business) {
  return RADIUS_BY_CATEGORY[business?.category] ?? DEFAULT_RADIUS_M;
}

/** Great-circle distance in metres. */
export function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Which venues contain this position?
 * `previouslyInside` applies the exit buffer so boundary jitter doesn't flap.
 */
export function venuesContaining(lat, lng, businesses, previouslyInside = []) {
  const inside = [];
  for (const b of businesses) {
    if (b.lat == null || b.lng == null) continue;
    const d = distanceMeters(lat, lng, Number(b.lat), Number(b.lng));
    const r = radiusFor(b);
    const wasInside = previouslyInside.includes(b.id);
    if (d <= (wasInside ? r + EXIT_BUFFER_M : r)) inside.push(b.id);
  }
  return inside;
}
