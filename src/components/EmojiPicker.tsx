import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CustomEmoji } from "@/hooks/useCustomEmojis";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { recordEmojiUsage } from "@/hooks/useEmojiUsage";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "@/hooks/useTheme";
import { getBackgroundThemeMode } from "@/lib/colorUtils";
import { isLoadableEmojiUrl } from "@/lib/customEmoji";
import { syncEmojiMartCategories, type EmojiMartCustomCategory } from "@/lib/emojiMartCategories";

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
	/** NIP-30 custom emojis, shown in one section per source pack. */
	customEmojis?: CustomEmoji[];
	/** Picker height (px number or CSS length, e.g. '100%'). Defaults to 280px. */
	height?: number | string;
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
 * Custom NIP-30 emojis are added via emoji-mart's `custom` prop, one section
 * per source pack, between the frequent row and the standard categories.
 */
export function EmojiPicker({ onSelect, customEmojis, height = 280 }: EmojiPickerProps) {
	useTheme(); // subscribe to theme changes so resolvedTheme stays fresh
	const isMobile = useIsMobile();
	const { user } = useCurrentUser();
	const containerRef = useRef<HTMLDivElement>(null);
	const pickerRef = useRef<InstanceType<typeof Picker> | null>(null);

	const resolvedTheme = getBackgroundThemeMode();
	const onSelectRef = useRef(onSelect);

	// Keep callback ref up to date without re-creating the picker.
	onSelectRef.current = onSelect;

	// Every pick feeds the shared usage table, so the quick-react row and the
	// picker's "Frequently used" row learn from the same selections.
	const handleSelect = useCallback((emoji: EmojiMartEmoji) => {
		if (emoji.src) {
			// Custom emoji — has an image URL
			recordEmojiUsage(user?.pubkey, `:${emoji.id}:`, emoji.src, emoji.id);
			onSelectRef.current({
				type: "custom",
				shortcode: emoji.id,
				url: emoji.src,
			});
		} else if (emoji.native) {
			// Native Unicode emoji
			recordEmojiUsage(user?.pubkey, emoji.native, undefined, emoji.id);
			onSelectRef.current({
				type: "native",
				emoji: emoji.native,
			});
		}
	}, [user?.pubkey]);

	// One emoji-mart category per source pack, so the picker's sticky heading
	// answers "which pack is this emoji from?". Emojis inlined on the kind-10030
	// list have no pack and fall into a generic "Custom" group.
	const customCategories = useMemo((): EmojiMartCustomCategory[] | undefined => {
		if (!customEmojis || customEmojis.length === 0) return undefined;

		const groups = new Map<string, EmojiMartCustomCategory>();
		const usedIds = new Set<string>();
		for (const e of customEmojis) {
			// emoji-mart renders these as plain <img>s, so the same load rules as
			// CustomEmojiImg apply: an unloadable URL never reaches the picker.
			if (!isLoadableEmojiUrl(e.url)) continue;
			const key = e.packCoord ?? "";
			let group = groups.get(key);
			if (!group) {
				// emoji-mart keys DOM ids and its category index off this, so keep
				// it to a safe charset rather than passing a raw `kind:pubkey:d`.
				// The `custom-` prefix is what syncEmojiMartCategories keys on.
				// Coordinates differing only in punctuation collapse to the same
				// slug, so suffix any repeat to keep ids unique.
				const base = key ? `custom-${key.replace(/[^a-zA-Z0-9]+/g, "-")}` : "custom-nostr";
				let id = base;
				for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
				usedIds.add(id);
				group = {
					id,
					name: (key && e.packName) || "Custom",
					emojis: [],
				};
				groups.set(key, group);
			}
			group.emojis.push({
				id: e.shortcode,
				name: e.shortcode,
				keywords: [e.shortcode],
				skins: [{ src: e.url }],
			});
		}

		// Deliberately NO per-category `icon`: emoji-mart gives every custom
		// category with one its own nav button, and the bottom nav is a single
		// non-scrolling row — a handful of packs overflows it. Without an icon it
		// chains each pack onto the first one's button, so the packs share one
		// nav entry while keeping their own labelled sections in the scroll area.
		return groups.size > 0 ? [...groups.values()] : undefined;
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
			maxFrequentRows: 1,
			navPosition: "bottom",
			dynamicWidth: true,
			parent: container,
			// Auto-focus the search input on desktop so users can type immediately.
			// Disabled on mobile to avoid the virtual keyboard popping up unexpectedly.
			autoFocus: !isMobile,
		};

		if (customCategories) {
			// Must run before the Picker constructor: it reconciles emoji-mart's
			// module-global category table, which the `categories` ordering below
			// is filtered from (see syncEmojiMartCategories).
			syncEmojiMartCategories(customCategories);
			pickerOptions.custom = customCategories;
			// Order: Recent, one section per pack, then standard categories
			pickerOptions.categories = [
				"frequent",
				...customCategories.map((c) => c.id),
				"people",
				"nature",
				"foods",
				"activity",
				"places",
				"objects",
				"flags",
			];
		}

		const picker = new Picker(pickerOptions);
		pickerRef.current = picker;

		// Inject overrides into the shadow DOM.
		// emoji-mart hardcodes `width: min-content; height: 435px` on :host
		// and sets a calculated pixel width on #root.  We override both so
		// the picker fills its container and matches the app theme.
		requestAnimationFrame(() => {
			const shadowRoot = (container.firstChild as HTMLElement)?.shadowRoot;
			if (shadowRoot) {
				const style = document.createElement("style");
				style.textContent = [
					// Fill the wrapper div, which owns the picker height (see the
					// `height` prop) — this lets containers size the picker to the
					// visible viewport instead of a fixed 280px.
					":host { width: 100% !important; height: 100% !important; min-height: 0 !important; border-radius: 0 !important; box-shadow: none !important; }",
					"#root { width: 100% !important; background-color: transparent !important; --sidebar-width: 0px !important; }",
					".scroll { padding-right: var(--padding) !important; }",
					".sticky { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background-color: transparent !important; }",
					// Match the app's input style (same as StickerPicker / GifPicker)
					".search input[type='search'] { background-color: hsl(var(--muted) / 0.5) !important; border: 0 !important; border-radius: 9999px !important; padding: 0.5rem 2rem 0.5rem 2.2rem !important; height: 36px !important; }",
					".search input[type='search']:focus { box-shadow: 0 0 0 1px hsl(var(--ring)) !important; background-color: hsl(var(--background)) !important; }",
					".search input[type='search']::placeholder { color: hsl(var(--muted-foreground)) !important; opacity: 1 !important; }",
					".search .icon { color: hsl(var(--muted-foreground)) !important; }",
					"input { font-size: 16px !important; }",
					// Nav — prevent icon clipping from height constraint
					"#nav { flex-shrink: 0 !important; overflow: visible !important; }",
					"#nav svg, #nav img { overflow: visible !important; }",
					"#nav button { color: hsl(var(--muted-foreground)) !important; overflow: visible !important; }",
					"#nav button:hover { color: hsl(var(--foreground)) !important; }",
					"#nav button[aria-selected] { color: hsl(var(--primary)) !important; }",
					"#nav .bar { background-color: hsl(var(--primary)) !important; }",
					// Hover state on emoji buttons
					".category button .background { background-color: hsl(var(--muted)) !important; }",
					// Scrollbar — hide the custom scrollbar, use native overlay
					".scroll::-webkit-scrollbar { width: 6px !important; }",
					".scroll::-webkit-scrollbar-thumb { background-color: transparent !important; border: 0 !important; border-radius: 9999px !important; }",
					".scroll:hover::-webkit-scrollbar-thumb { background-color: hsl(var(--border)) !important; }",
					".scroll::-webkit-scrollbar-track { background: transparent !important; }",
					// Category headers
					".sticky { color: hsl(var(--muted-foreground)) !important; font-size: 11px !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }",
					// Fix SVGs without intrinsic dimensions collapsing in custom emoji grid
					".emoji-mart-emoji img[src] { width: 1em; height: 1em; object-fit: contain; }",
				].join(" ");
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
			className="emoji-mart-wrapper w-full"
			style={{ isolation: "isolate", height }}
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
