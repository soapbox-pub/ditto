import type { Config } from "tailwindcss";
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
				'success-spark': 'success-spark 1.1s ease-out both'
			}
		}
	},
	plugins: [tailwindcssAnimate, typography],
} satisfies Config;
