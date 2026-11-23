import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

/** What takes a tap for itself inside a larger tap target (see the `can-hover` variant). */
const PRESS_TARGETS = [
	'a',
	'button',
	'input',
	'textarea',
	'select',
	'label',
	'summary',
	'video',
	'[role="button"]',
	'[role="link"]',
	'[role="tab"]',
	'.cursor-pointer',
];

export default {
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		screens: {
			// Keep ascending: Tailwind emits screen variants in this order, so a
			// smaller breakpoint listed later would override a larger one.
			'sm': '640px',
			'md': '768px',
			'sidebar': '900px',
			'lg': '1024px',
			'xl': '1280px',
			'2xl': '1536px',
		},
		extend: {
			spacing: {
				'22': '5.5rem',
			},
			fontFamily: {
				sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
				emoji: ['Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', 'Android Emoji', 'EmojiSymbols', 'sans-serif'],
			},
			colors: {
				border: {
					DEFAULT: 'hsl(var(--border))',
					// Softer outline for cards, quotes, and other boxed content.
					subtle: 'hsl(var(--border-subtle))',
				},
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				greentext: 'hsl(var(--greentext))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				}
			},
			borderRadius: {
				// Scale with --radius so the whole app rounds together.
				'3xl': 'calc(var(--radius) * 2)',
				'2xl': 'calc(var(--radius) * 4 / 3)',
				xl: 'var(--radius)',
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				xs: 'calc(var(--radius) - 8px)'
			},
			// Named motion curves, defined in index.css (see src/lib/motion.ts).
			transitionTimingFunction: {
				spring: 'var(--ease-spring)',
				emphasized: 'var(--ease-emphasized)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'pending-glow': {
					'0%, 100%': {
						boxShadow: '0 0 0 0 hsl(var(--primary) / 0)'
					},
					'50%': {
						boxShadow: '0 0 8px 2px hsl(var(--primary) / 0.15)'
					}
				},
			'badge-spotlight': {
				from: { transform: 'rotate(0deg)' },
				to: { transform: 'rotate(360deg)' }
			},
			'progress-sweep': {
				// Indeterminate progress bar: a short segment sweeping across
				// the track. Used when a relay can't tell us a total up front
				// (no NIP-45 COUNT), so there's no percentage to show but work
				// is still happening.
				'0%': { transform: 'translateX(-100%)' },
				'100%': { transform: 'translateX(400%)' }
			},
			'highlight-fade': {
				from: { backgroundColor: 'hsl(var(--primary) / 0.10)' },
				to: { backgroundColor: 'transparent' }
			},
			'collapsible-down': {
				from: { height: '0' },
				to: { height: 'var(--radix-collapsible-content-height)' }
			},
			'collapsible-up': {
				from: { height: 'var(--radix-collapsible-content-height)' },
				to: { height: '0' }
			},
			'equaliser-bar': {
				// Vertical bounce for the bird-song play button's
				// inline equaliser. Bars share this keyframe and
				// stagger via animationDelay so the group reads as
				// an organic audio indicator.
				'0%, 100%': { transform: 'scaleY(0.35)' },
				'50%': { transform: 'scaleY(1)' }
			},
			'success-pop': {
				// Celebratory pop-in for the zap success checkmark.
				'0%': { transform: 'scale(0.3)', opacity: '0' },
				'60%': { transform: 'scale(1.15)', opacity: '1' },
				'100%': { transform: 'scale(1)', opacity: '1' }
			},
			'success-halo': {
				// Expanding ring behind the checkmark.
				'0%': { transform: 'scale(0.6)', opacity: '0.7' },
				'100%': { transform: 'scale(2.2)', opacity: '0' }
			},
			'success-fade-up': {
				// Staggered fade-in from below for the body text + actions.
				'0%': { transform: 'translateY(8px)', opacity: '0' },
				'100%': { transform: 'translateY(0)', opacity: '1' }
			},
			'success-spark': {
				// Individual sparkle: scale + drift outward then fade.
				'0%': { transform: 'translate(0, 0) scale(0.4)', opacity: '0' },
				'20%': { opacity: '1' },
				'100%': { transform: 'translate(var(--spark-x, 0), var(--spark-y, 0)) scale(1)', opacity: '0' }
			},
			'celebration-fall': {
				// Confetti piece: drifts down through the card, swaying and
				// spinning. Travel distance is measured from the card by
				// CelebrationOverlay (--celebration-distance) so the pace is
				// consistent whether the card is short or tall. Per-piece
				// drift/spin via CSS vars.
				'0%': { transform: 'translate(0, -12px) rotate(0deg)', opacity: '0' },
				'8%': { opacity: '1' },
				'80%': { opacity: '1' },
				'100%': { transform: 'translate(var(--celebration-sway, 0px), var(--celebration-distance, 240px)) rotate(var(--celebration-spin, 540deg))', opacity: '0' }
			},
			'heart-drift': {
				// Love-list paper background hearts: a gentle side-to-side
				// drift so the scattered hearts feel alive. Only ~12 per card,
				// and translate-only so it composites cheaply.
				'0%, 100%': { transform: 'translateX(-5px)' },
				'50%': { transform: 'translateX(5px)' }
			},
			'heart-float': {
				// Love-list ambient float: a heart rises from below the sheet up
				// past its top edge (clipped by overflow-hidden) like a lava-lamp
				// bubble, swaying and tipping side to side, fading in low and out
				// high. Vertical travel is driven by `bottom` (% of the sheet) so
				// it adapts to any card height; sway/tip come from CSS vars.
				// Loops forever, so only a handful run per card.
				'0%': { bottom: '-8%', transform: 'translateX(0) rotate(-10deg)', opacity: '0' },
				'12%': { opacity: 'var(--float-opacity, 0.5)' },
				'50%': { transform: 'translateX(var(--float-sway, 14px)) rotate(10deg)' },
				'85%': { opacity: 'var(--float-opacity, 0.5)' },
				'100%': { bottom: '106%', transform: 'translateX(0) rotate(-6deg)', opacity: '0' }
			},
			'heart-fall': {
				// Love List heart: bursts in near the top, falls fast, then
				// dissolves in mid-air (fade starts early and finishes well
				// before the travel end) so hearts never snap off at the
				// overflow-clipped bottom edge.
				'0%': { transform: 'translate(0, -12px) rotate(0deg) scale(0.6)', opacity: '0' },
				'6%': { opacity: '1', transform: 'translate(0, 0) rotate(0deg) scale(1)' },
				'45%': { opacity: '1' },
				'85%': { opacity: '0' },
				'100%': { transform: 'translate(var(--celebration-sway, 0px), var(--celebration-distance, 240px)) rotate(var(--celebration-spin, 90deg)) scale(0.9)', opacity: '0' }
			},
			'celebration-rise': {
				// Birthday balloon: floats up from the bottom of the card.
				'0%': { transform: 'translate(0, 20px)', opacity: '0' },
				'12%': { opacity: '1' },
				'80%': { opacity: '1' },
				'100%': { transform: 'translate(var(--celebration-sway, 0px), calc(-1 * var(--celebration-distance, 240px)))', opacity: '0' }
			},
			'birthday-rain': {
				// Continuous birthday rain (BirthdayRain): a piece falls from
				// above the region to past its clipped bottom edge, swaying and
				// spinning, fading out near the end so nothing snaps off. Runs
				// with `infinite` and negative delays so the sky is already
				// full at mount and the rain never pauses between cycles.
				'0%': { transform: 'translate(0, -28px) rotate(0deg)', opacity: '0' },
				'5%': { opacity: '1' },
				'85%': { opacity: '1' },
				'100%': { transform: 'translate(var(--rain-sway, 0px), var(--rain-distance, 320px)) rotate(var(--rain-spin, 540deg))', opacity: '0' }
			},
			'birthday-float': {
				// BirthdayRain balloons: buoyant — rises from below the
				// region's clipped bottom edge toward the top, swaying and
				// tipping, fading out near the end so nothing snaps off.
				'0%': { transform: 'translate(0, 0) rotate(0deg)', opacity: '0' },
				'5%': { opacity: '1' },
				'85%': { opacity: '1' },
				'100%': { transform: 'translate(var(--rain-sway, 0px), calc(-1 * var(--rain-distance, 320px))) rotate(var(--rain-spin, 0deg))', opacity: '0' }
			},
			'celebration-twinkle': {
				// Welcome sparkle: a star scales in with a quarter turn, then out.
				'0%': { transform: 'scale(0) rotate(0deg)', opacity: '0' },
				'50%': { transform: 'scale(1) rotate(45deg)', opacity: '1' },
				'100%': { transform: 'scale(0) rotate(90deg)', opacity: '0' }
			},
			'celebration-sun': {
				// gm sunrise: the sun eases up from below the card edge, holds,
				// and fades.
				'0%': { transform: 'translate(-50%, 0)', opacity: '0' },
				'20%': { opacity: '0.9' },
				'75%': { transform: 'translate(-50%, -105px)', opacity: '0.9' },
				'100%': { transform: 'translate(-50%, -120px)', opacity: '0' }
			},
			'celebration-moon': {
				// gn moonrise: the crescent drifts up slower than the sun,
				// rocking gently as it rises, then fades.
				'0%': { transform: 'translate(-50%, 0) rotate(-12deg)', opacity: '0' },
				'25%': { opacity: '0.95' },
				'50%': { transform: 'translate(-50%, -70px) rotate(4deg)' },
				'78%': { transform: 'translate(-50%, -100px) rotate(-4deg)', opacity: '0.95' },
				'100%': { transform: 'translate(-50%, -112px) rotate(0deg)', opacity: '0' }
			},
			'celebration-glow': {
				// gm sunrise / gn moonrise: wash that swells and recedes with the sun or moon.
				'0%': { opacity: '0' },
				'35%': { opacity: '1' },
				'75%': { opacity: '0.8' },
				'100%': { opacity: '0' }
			},
			'reaction-pop': {
				// Reaction burst: squash-and-release. The icon compresses for a
				// beat (anticipation), then explodes past full size and settles.
				// The wind-up is what sells the impact.
				'0%': { transform: 'scale(1)' },
				'20%': { transform: 'scale(0.8)' },
				'55%': { transform: 'scale(1.4)' },
				'100%': { transform: 'scale(1)' }
			},
			'reaction-spark': {
				// Reaction burst particle: ejects violently (most of the travel
				// happens in the first third via the animation's bezier), then
				// decays and fades.
				'0%': { transform: 'translate(0, 0) scale(0)', opacity: '0' },
				'12%': { transform: 'translate(calc(var(--spark-x, 0px) * 0.4), calc(var(--spark-y, 0px) * 0.4)) scale(1.1)', opacity: '1' },
				'70%': { opacity: '1' },
				'100%': { transform: 'translate(var(--spark-x, 0px), var(--spark-y, 0px)) scale(0.5)', opacity: '0' }
			},
			'magazine-drop': {
				// Pulp magazine: the issue is tossed down, lands a touch
				// past flat, and settles.
				'0%': { transform: 'translate3d(0, -40px, 0) rotate(10deg) scale(1.18)', opacity: '0' },
				'55%': { transform: 'translate3d(0, 3px, 0) rotate(-1deg) scale(0.98)', opacity: '1' },
				'78%': { transform: 'translate3d(0, -2px, 0) rotate(0.5deg) scale(1.01)' },
				'100%': { transform: 'none', opacity: '1' }
			},
			'magazine-dust': {
				// Puff of dust where the magazine lands.
				'0%, 45%': { transform: 'scale(0.7)', opacity: '0' },
				'60%': { opacity: '0.8' },
				'100%': { transform: 'scale(1.5)', opacity: '0' }
			},
			'magazine-open': {
				// Pulp magazine reader hand-off: the cover swings open on its spine.
				'0%': { transform: 'rotateY(0deg)' },
				'100%': { transform: 'rotateY(-165deg)' }
			},
			'magazine-open-shift': {
				// ...while the whole book rises and slides right so the open
				// spread ends up centered.
				'0%': { transform: 'translateX(0) scale(0.85)', opacity: '0' },
				'20%': { opacity: '1' },
				'100%': { transform: 'translateX(50%) scale(1)', opacity: '1' }
			},
			'new-posts-pill-in': {
				// New posts pill: drops down from under the header, overshoots
				// a touch, and settles.
				'0%': { transform: 'translateY(-120%) scale(0.85)', opacity: '0' },
				'60%': { transform: 'translateY(6%) scale(1.04)', opacity: '1' },
				'100%': { transform: 'none', opacity: '1' }
			},
			'feed-row-in': {
				// A post a refresh brought in opens up from nothing at the top
				// of the feed, pushing the rest down, and fades in as it does.
				'0%': { gridTemplateRows: '0fr', opacity: '0' },
				'100%': { gridTemplateRows: '1fr', opacity: '1' }
			},
			'nav-pop': {
				// Bottom nav: the icon of the tab you land on dips and springs up.
				'0%': { transform: 'scale(1)' },
				'30%': { transform: 'scale(0.82)' },
				'65%': { transform: 'scale(1.14)' },
				'100%': { transform: 'scale(1)' }
			},
			'new-posts-arrow': {
				// New posts pill arrow: a gentle upward nudge toward the top.
				'0%, 70%, 100%': { transform: 'translateY(0)' },
				'80%': { transform: 'translateY(-3px)' },
				'90%': { transform: 'translateY(1px)' }
			}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'pending-glow': 'pending-glow 2.5s ease-in-out infinite',
				'badge-spotlight': 'badge-spotlight 8s linear infinite',
				'progress-sweep': 'progress-sweep 1.2s ease-in-out infinite',
				'highlight-fade': 'highlight-fade 1.5s ease-out forwards',
				'collapsible-down': 'collapsible-down 0.2s ease-out',
				'collapsible-up': 'collapsible-up 0.2s ease-out',
				'equaliser-bar': 'equaliser-bar 0.9s ease-in-out infinite',
				'success-pop': 'success-pop 0.55s var(--ease-spring) both',
				'success-halo': 'success-halo 0.9s ease-out both',
				'success-fade-up': 'success-fade-up 0.45s ease-out both',
				'success-spark': 'success-spark 1.1s ease-out both',
				'celebration-fall': 'celebration-fall 2s linear both',
				'heart-fall': 'heart-fall 2s ease-in both',
				'heart-drift': 'heart-drift 4s ease-in-out infinite',
				'heart-float': 'heart-float var(--float-duration, 7s) ease-in-out infinite',
				'celebration-rise': 'celebration-rise 2.6s ease-out both',
				'birthday-rain': 'birthday-rain var(--rain-duration, 5s) linear infinite',
				'birthday-float': 'birthday-float var(--rain-duration, 5s) linear infinite',
				'celebration-twinkle': 'celebration-twinkle 1.2s ease-in-out both',
				'celebration-sun': 'celebration-sun 3.2s ease-out both',
				'celebration-moon': 'celebration-moon 3.8s ease-out both',
				'celebration-glow': 'celebration-glow 3.2s ease-out both',
				'reaction-pop': 'reaction-pop 0.5s var(--ease-spring) both',
				// The spark and halo hold for 90ms — they detonate at the moment
				// the icon releases from its squash, not on the initial press.
				'reaction-spark': 'reaction-spark 0.6s cubic-bezier(0.16, 1, 0.3, 1) 90ms both',
				'reaction-halo': 'success-halo 0.5s cubic-bezier(0.16, 1, 0.3, 1) 90ms both',
				'magazine-drop': 'magazine-drop 0.75s cubic-bezier(0.2, 0.8, 0.3, 1) both',
				'magazine-dust': 'magazine-dust 0.9s ease-out both',
				// 0.9s total — keep in sync with OPEN_DURATION_MS in PulpMagazineCard.
				'magazine-open': 'magazine-open 0.75s cubic-bezier(0.45, 0, 0.2, 1) 0.15s both',
				'magazine-open-shift': 'magazine-open-shift 0.9s cubic-bezier(0.45, 0, 0.2, 1) both',
				'new-posts-pill-in': 'new-posts-pill-in 0.5s var(--ease-spring) both',
				'new-posts-avatar-in': 'success-pop 0.45s var(--ease-spring) both',
				'new-posts-arrow': 'new-posts-arrow 3s ease-in-out 1s infinite',
				'feed-row-in': 'feed-row-in 0.45s var(--ease-emphasized) both',
				'nav-pop': 'nav-pop 0.45s var(--ease-spring)',
			}
		}
	},
	plugins: [
		tailwindcssAnimate,
		typography,
		// `fullscreen:` variant — targets an element while it is the fullscreen element.
		plugin(({ addVariant }) => {
			addVariant('fullscreen', '&:fullscreen');
			// While a finger is down on it, on touch screens: the feedback a mouse
			// gets from hover. :active reaches every ancestor of what was touched,
			// so a target stands down when the press is on a tap target inside it
			// (a feed card whose like button is pressed stays as it is).
			const pressed = `@media (hover: none) { &:active:not(:has(${PRESS_TARGETS.map((t) => `${t}:active`).join(', ')})) }`;
			// Hover on devices with a real pointer only. Touch WebViews keep
			// :hover on whatever was last tapped, so a plain hover: tint on a tap
			// target (a button, a post's actions, a feed card) stays lit after the
			// tap. There the tint shows while the target is pressed instead. Use
			// it for tints; hover-to-reveal controls keep hover:. cn() treats it
			// as hover: when merging classes (src/lib/utils.ts).
			addVariant('can-hover', ['@media (hover: hover) { &:hover }', pressed]);
		}),
	],
} satisfies Config;
