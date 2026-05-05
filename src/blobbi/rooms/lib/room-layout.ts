/**
 * Shared layout constants for Blobbi room components.
 */

/**
 * CSS class for the bottom action bar in every room.
 *
 * Provides a subtle translucent surface so controls remain readable over
 * custom/colorful room backgrounds.  Rounded top corners + soft border-top
 * give the bar an intentional "floating tray" feel without a heavy strip.
 *
 * On mobile (max-sidebar), adds extra bottom padding to clear the
 * fixed bottom navigation bar. On desktop (sidebar:), uses normal padding.
 */
export const ROOM_BOTTOM_BAR_CLASS =
  'relative z-10 px-3 sm:px-6 pt-2 pb-4 sm:pb-6 max-sidebar:pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)] bg-background/60 backdrop-blur-sm rounded-t-2xl border-t border-border/15';

/**
 * Floating control surface — provides readable contrast over custom room backgrounds.
 * Uses theme-relative tokens (works in light + dark mode).
 */
export const ROOM_CONTROL_SURFACE = 'bg-background/60 backdrop-blur-sm border border-border/20 shadow-sm';

/**
 * Minimal backing for small inline elements (arrows, labels).
 * Nearly invisible on neutral backgrounds, provides contrast on clashing ones.
 */
export const ROOM_CONTROL_SURFACE_SUBTLE = 'bg-background/50 backdrop-blur-[2px]';

/**
 * Guide highlight — applied to controls during the stat-guide flow.
 * Uses ring-offset to ensure visibility over any room background/pattern.
 * Includes a gentle pulse scale animation for attention.
 *
 * IMPORTANT: Do not apply this to elements that use transform for positioning
 * (e.g. -translate-y-1/2). The pulse animation overrides transform.
 * Use ROOM_GUIDE_RING for those elements instead.
 */
export const ROOM_GUIDE_HIGHLIGHT = 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-[guide-pulse_1.5s_ease-in-out_infinite]';

/**
 * Guide ring only — visible ring highlight without transform-based animation.
 * Safe for elements that rely on transform for positioning (absolute + translate).
 */
export const ROOM_GUIDE_RING = 'ring-2 ring-primary ring-offset-2 ring-offset-background';

/**
 * Non-transform pulse for positioned elements — animates box-shadow glow
 * without affecting transform (safe with -translate-y-1/2 etc.).
 * Combine with ROOM_GUIDE_RING for full effect on nav arrows.
 */
export const ROOM_GUIDE_RING_PULSE = 'animate-[guide-ring-pulse_1.2s_ease-in-out_infinite]';
