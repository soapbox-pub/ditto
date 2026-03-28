/**
 * Utility functions for special marks system
 */

// Available special marks for validation
export const AVAILABLE_SPECIAL_MARKS = [
  'sigil_eye',
  'shimmer_band',
  'rune_top',
  'ring_mark',
  'oval_spots',
  'glow_crack_pattern',
  'dot_center',
];

// Utility function to check if a special mark is supported
export const isSpecialMarkSupported = (mark: string): boolean => {
  return AVAILABLE_SPECIAL_MARKS.includes(mark);
};
