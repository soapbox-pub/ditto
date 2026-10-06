/**
 * Shared layout constants for Blobbi room components.
 */

/**
 * CSS class for the bottom action bar in every room.
 *
 * The Blobbi page hides the mobile bottom nav, so below the sidebar
 * breakpoint the bar only pads past the device's safe area.
 */
export const ROOM_BOTTOM_BAR_CLASS =
  'relative z-10 px-3 sm:px-6 pt-[1em] sidebar:pt-[1.4em] pb-[calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+0.5rem)] sidebar:pb-5';

/**
 * Base size for the room's controls, in container units of the room shell:
 * the HUD and dock grow with the room from a small phone up to the feed
 * column, and every control inside is sized in `em` from this.
 */
export const ROOM_UI_SCALE = 'text-[clamp(15px,4.2cqw,20px)]';

/**
 * Base size for the bottom dock: smaller than the rest of the room's
 * controls on phones, leaving more of the screen to the room, and the same
 * at the feed column's width.
 */
export const ROOM_DOCK_SCALE = 'text-[clamp(13px,3.4cqw,20px)]';

/** Round icon buttons in the room HUD corners. */
export const HUD_BUTTON_CLASS = [
  'size-[2.75em] rounded-full flex items-center justify-center [&_svg]:size-[1.2em]',
  'border border-border/50 bg-background/85 backdrop-blur-md shadow-md text-foreground/80',
  'transition-colors hover:text-foreground hover:bg-background active:scale-95 motion-reduce:active:scale-100',
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
].join(' ');

/** Fixed-width side slot in a bottom bar, so the center carousel stays centered. */
export const ROOM_ACTION_SLOT = 'w-[4.75em] shrink-0';

/**
 * Floating control surface — provides readable contrast over custom room backgrounds.
 * Uses theme-relative tokens (works in light + dark mode).
 */
export const ROOM_CONTROL_SURFACE = 'bg-background/60 backdrop-blur-xs border border-border/20 shadow-xs';

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
 * Use ROOM_GUIDE_RING_PULSE for those elements instead.
 */
export const ROOM_GUIDE_HIGHLIGHT = 'ring-2 ring-primary ring-offset-2 ring-offset-background motion-safe:animate-[guide-pulse_2.6s_ease-in-out_infinite]';

/**
 * Non-transform pulse for positioned elements — animates box-shadow glow
 * without affecting transform (safe with -translate-y-1/2 etc.). Pulses three
 * times, then stops, and not at all with reduced motion.
 */
export const ROOM_GUIDE_RING_PULSE = 'motion-safe:animate-[guide-ring-pulse_2.6s_ease-in-out_3]';
