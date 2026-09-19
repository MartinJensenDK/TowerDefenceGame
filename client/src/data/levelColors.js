/**
 * One colour per tower level (index 0 = level 1). The game paints a tower's flag and weapon in
 * its level colour instead of showing stars, so the same list drives the 3D tint and the panel swatch.
 */
export const LEVEL_COLORS = [
  '#3b82f6', // 1  blue (the castle's colour: a fresh recruit)
  '#22c55e', // 2  green
  '#eab308', // 3  yellow
  '#f97316', // 4  orange
  '#ef4444', // 5  red
  '#ec4899', // 6  pink
  '#a855f7', // 7  purple
  '#14b8a6', // 8  teal
  '#f8fafc', // 9  white
  '#1f2937', // 10 black
];

export function levelColor(level) {
  return LEVEL_COLORS[Math.min(LEVEL_COLORS.length - 1, Math.max(0, level))];
}
