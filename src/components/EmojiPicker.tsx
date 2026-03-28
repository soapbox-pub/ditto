import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CustomEmoji } from "@/hooks/useCustomEmojis";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "@/hooks/useTheme";

/** A native Unicode emoji selection. */
export interface NativeEmojiSelection {
	type: "native";
	emoji: string;
}

/** A custom NIP-30 emoji selection. */
export interface CustomEmojiSelection {
	type: "custom";
	shortcode: string;
	url: string;
}

export type EmojiSelection = NativeEmojiSelection | CustomEmojiSelection;

interface EmojiPickerProps {
	onSelect: (selection: EmojiSelection) => void;
	/** NIP-30 custom emojis to display in a dedicated tab. */
	customEmojis?: CustomEmoji[];
}

interface EmojiMartEmoji {
	id: string;
	native?: string;
	shortcodes?: string;
	unified?: string;
	/** Present for custom emojis — the image URL from `skins[0].src`. */
	src?: string;
}

/**
 * Emoji picker that manages the emoji-mart Picker (a Web Component) imperatively.
 *
 * We bypass `@emoji-mart/react` because it creates `new Picker()` inside a
 * `useEffect`, which can trigger "Failed to construct 'HTMLElement': Illegal
 * constructor" when React unmounts and remounts the component (e.g. popovers,
 * strict mode). By attaching the picker to a ref-managed container and only
 * creating it once per mount, we avoid the illegal constructor error.
 *
 * Custom NIP-30 emojis are added via emoji-mart's `custom` prop, which renders
 * them in a dedicated tab alongside the standard Unicode categories.
 */
export function EmojiPicker({ onSelect, customEmojis }: EmojiPickerProps) {
	const { theme } = useTheme();
	const isMobile = useIsMobile();
	const containerRef = useRef<HTMLDivElement>(null);
	const pickerRef = useRef<InstanceType<typeof Picker> | null>(null);

	// Resolve to 'dark' or 'light' for emoji-mart.
	// Custom themes set class="custom" on <html> (not .dark), so we can't
	// rely on the dark class. Instead, check the actual computed background
	// luminance to determine if the current theme is visually dark.
	// `theme` is intentionally in the dependency array to trigger recomputation
	// when the theme changes, even though we read from CSS vars instead.
	const resolvedTheme = useMemo(() => {
		if (typeof document === "undefined") return "light";
		const bg = getComputedStyle(document.documentElement)
			.getPropertyValue("--background")
			.trim();
		if (!bg) return "light";
		// HSL format from Tailwind CSS vars: "H S% L%" — check lightness
		const parts = bg.split(/\s+/);
		const lightness = parseFloat(parts[parts.length - 1]);
		if (!isNaN(lightness)) {
			return lightness < 50 ? "dark" : "light";
		}
		return "light";
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [theme]) as "dark" | "light";
	const onSelectRef = useRef(onSelect);

	// Keep callback ref up to date without re-creating the picker.
	onSelectRef.current = onSelect;

	const handleSelect = useCallback((emoji: EmojiMartEmoji) => {
		if (emoji.src) {
			// Custom emoji — has an image URL
			onSelectRef.current({
				type: "custom",
				shortcode: emoji.id,
				url: emoji.src,
			});
		} else if (emoji.native) {
			// Native Unicode emoji
			onSelectRef.current({
				type: "native",
				emoji: emoji.native,
			});
		}
	}, []);

	// Build emoji-mart custom categories from NIP-30 emoji list
	const customCategories = useMemo(() => {
		if (!customEmojis || customEmojis.length === 0) return undefined;
		return [
			{
				id: "custom-nostr",
				name: "Custom",
				emojis: customEmojis.map((e) => ({
					id: e.shortcode,
					name: e.shortcode,
					keywords: [e.shortcode],
					skins: [{ src: e.url }],
				})),
			},
		];
	}, [customEmojis]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Create the picker and let it append itself to our container div.
		const pickerOptions: Record<string, unknown> = {
			data,
			onEmojiSelect: handleSelect,
			theme: resolvedTheme,
			previewPosition: "none",
			skinTonePosition: "search",
			set: "native",
			maxFrequentRows: 2,
			navPosition: "bottom",
			perLine: 8,
			parent: container,
			// Auto-focus the search input on desktop so users can type immediately.
			// Disabled on mobile to avoid the virtual keyboard popping up unexpectedly.
			autoFocus: !isMobile,
		};

		if (customCategories) {
			pickerOptions.custom = customCategories;
		}

		const picker = new Picker(pickerOptions);
		pickerRef.current = picker;

		// Inject style into shadow DOM to remove backdrop-filter blur on the sticky category bar
		requestAnimationFrame(() => {
			const shadowRoot = (container.firstChild as HTMLElement)?.shadowRoot;
			if (shadowRoot) {
				const style = document.createElement("style");
				style.textContent =
					".sticky { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background-color: var(--em-color-background) !important; } input { font-size: 16px !important; } #nav button { color: rgba(var(--em-rgb-color), .85) !important; } #nav button[aria-selected] { color: rgb(var(--em-rgb-accent)) !important; }";
				shadowRoot.appendChild(style);
			}
		});

		return () => {
			// Clean up: remove the picker's custom element from the DOM.
			pickerRef.current = null;
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
		};
		// We intentionally depend only on mount/unmount + theme + custom emojis + mobile state.
		// The handleSelect callback uses a ref so it never goes stale.
	}, [resolvedTheme, handleSelect, customCategories, isMobile]);

	return (
		<div
			ref={containerRef}
			className="emoji-mart-wrapper"
			style={{ isolation: "isolate" }}
			onWheel={(e) => {
				// Prevent scroll from bubbling to the page
				e.stopPropagation();
			}}
			onTouchMove={(e) => {
				// Prevent Radix Dialog's scroll-lock from blocking touch scrolling
				// inside the emoji-mart shadow DOM on mobile devices
				e.stopPropagation();
			}}
		/>
	);
}
