/** Pure polyline helpers for points shaped { x, z } in world space. No three.js here so they stay testable. */

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return total;
}

/**
 * Point and heading (atan2(dx, dz), matching Enemy.heading) at `distance` along the polyline.
 * Distances wrap around the total length so callers can loop forever.
 */
export function pointAlongPolyline(points, distance) {
  const total = polylineLength(points);
  if (total === 0 || points.length < 2) {
    const p = points[points.length - 1];
    return { x: p.x, z: p.z, heading: 0 };
  }
  let d = distance % total;
  if (d < 0) d += total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (d <= len || i === points.length - 1) {
      const f = len === 0 ? 0 : Math.min(1, d / len);
      return { x: a.x + dx * f, z: a.z + dz * f, heading: Math.atan2(dx, dz) };
    }
    d -= len;
  }
  const p = points[points.length - 1];
  return { x: p.x, z: p.z, heading: 0 };
}
