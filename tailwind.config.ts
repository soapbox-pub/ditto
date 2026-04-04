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
				sm: 'calc(var(--radius) - 4px)'
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
			'spin-slow': {
				from: { transform: 'rotate(0deg)' },
				to: { transform: 'rotate(360deg)' }
			},
			'float-particle': {
				'0%, 100%': { transform: 'translateY(0) scale(1)', opacity: '0.6' },
				'50%': { transform: 'translateY(-20px) scale(1.2)', opacity: '1' }
			},
			'bounce-gentle': {
				'0%, 100%': { transform: 'translateY(0)' },
				'50%': { transform: 'translateY(-4px)' }
			},
			'walk-bob': {
				'0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
				'25%': { transform: 'translateY(-3px) rotate(-2deg)' },
				'75%': { transform: 'translateY(-3px) rotate(2deg)' }
			},
			'look-down': {
				'0%': { transform: 'translateY(0) rotate(0deg)' },
				'100%': { transform: 'translateY(2px) rotate(8deg)' }
			},
			'guide-fall': {
				'0%': { transform: 'translateY(0)', opacity: '1' },
				'100%': { transform: 'translateY(120vh)', opacity: '0' }
			},
			'guide-rise': {
				'0%': { transform: 'translateY(120vh)', opacity: '0' },
				'40%': { opacity: '1' },
				'100%': { transform: 'translateY(0)' }
			},
			'tour-highlight-pulse': {
				'0%, 100%': { boxShadow: '0 0 0 0 rgba(251,191,36,0.4)' },
				'50%': { boxShadow: '0 0 0 6px rgba(251,191,36,0.15)' }
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
				'spin-slow': 'spin-slow 20s linear infinite',
				'float-particle': 'float-particle 3s ease-in-out infinite',
				'bounce-gentle': 'bounce-gentle 2s ease-in-out infinite',
				'walk-bob': 'walk-bob 0.4s ease-in-out infinite',
				'look-down': 'look-down 0.4s ease-out forwards',
				'guide-fall': 'guide-fall 0.6s ease-in forwards',
				'guide-rise': 'guide-rise 0.7s ease-out forwards',
				'tour-highlight-pulse': 'tour-highlight-pulse 2s ease-in-out infinite'
			}
		}
	},
	plugins: [tailwindcssAnimate, typography],
} satisfies Config;
