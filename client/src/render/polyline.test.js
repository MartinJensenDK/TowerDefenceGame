import { describe, it, expect } from 'vitest';
import { polylineLength, pointAlongPolyline } from './polyline.js';

const L = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
];

describe('polylineLength', () => {
  it('sums the segment lengths', () => {
    expect(polylineLength(L)).toBe(7);
  });

  it('is 0 for a single point', () => {
    expect(polylineLength([{ x: 1, z: 1 }])).toBe(0);
  });
});

describe('pointAlongPolyline', () => {
  it('returns the start at distance 0 with the heading of the first segment', () => {
    const p = pointAlongPolyline(L, 0);
    expect(p).toEqual({ x: 0, z: 0, heading: Math.atan2(4, 0) });
  });

  it('interpolates inside a segment', () => {
    expect(pointAlongPolyline(L, 2)).toEqual({ x: 2, z: 0, heading: Math.atan2(4, 0) });
  });

  it('turns the corner and keeps the new heading', () => {
    const p = pointAlongPolyline(L, 5);
    expect(p.x).toBeCloseTo(4);
    expect(p.z).toBeCloseTo(1);
    expect(p.heading).toBeCloseTo(Math.atan2(0, 3));
  });

  it('wraps distances beyond the total length', () => {
    const p = pointAlongPolyline(L, 9);
    expect(p.x).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(0);
  });

  it('wraps negative distances', () => {
    const p = pointAlongPolyline(L, -1);
    expect(p.x).toBeCloseTo(4);
    expect(p.z).toBeCloseTo(2);
  });

  it('clamps to the end when the polyline has no length', () => {
    expect(pointAlongPolyline([{ x: 1, z: 2 }], 5)).toEqual({ x: 1, z: 2, heading: 0 });
  });
});
