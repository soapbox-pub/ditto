import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

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
			'sm': '640px',
			'sidebar': '900px',
			'md': '768px',
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
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
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
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				xs: 'calc(var(--radius) - 8px)'
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
			'celebration-glow': {
				// gm sunrise: warm wash that swells and recedes with the sun.
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
			}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'pending-glow': 'pending-glow 2.5s ease-in-out infinite',
				'badge-spotlight': 'badge-spotlight 8s linear infinite',
				'highlight-fade': 'highlight-fade 1.5s ease-out forwards',
				'collapsible-down': 'collapsible-down 0.2s ease-out',
				'collapsible-up': 'collapsible-up 0.2s ease-out',
				'equaliser-bar': 'equaliser-bar 0.9s ease-in-out infinite',
				'success-pop': 'success-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both',
				'success-halo': 'success-halo 0.9s ease-out both',
				'success-fade-up': 'success-fade-up 0.45s ease-out both',
				'success-spark': 'success-spark 1.1s ease-out both',
				'celebration-fall': 'celebration-fall 2s linear both',
				'heart-fall': 'heart-fall 2s ease-in both',
				'heart-drift': 'heart-drift 4s ease-in-out infinite',
				'heart-float': 'heart-float var(--float-duration, 7s) ease-in-out infinite',
				'celebration-rise': 'celebration-rise 2.6s ease-out both',
				'celebration-twinkle': 'celebration-twinkle 1.2s ease-in-out both',
				'celebration-sun': 'celebration-sun 3.2s ease-out both',
				'celebration-glow': 'celebration-glow 3.2s ease-out both',
				'reaction-pop': 'reaction-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
				// The spark and halo hold for 90ms — they detonate at the moment
				// the icon releases from its squash, not on the initial press.
				'reaction-spark': 'reaction-spark 0.6s cubic-bezier(0.16, 1, 0.3, 1) 90ms both',
				'reaction-halo': 'success-halo 0.5s cubic-bezier(0.16, 1, 0.3, 1) 90ms both'
			}
		}
	},
	plugins: [
		tailwindcssAnimate,
		typography,
		// `fullscreen:` variant — targets an element while it is the fullscreen element.
		plugin(({ addVariant }) => {
			addVariant('fullscreen', '&:fullscreen');
		}),
	],
} satisfies Config;
