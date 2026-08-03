import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { openUrl } from "@/lib/downloadFile";

/**
 * External NIP-34 web clients that resolve bare NIP-19 identifiers at
 * their URL root: nostrhub.io renders ticket and repo pages, and
 * gitworkshop.dev redirects nevent/naddr to the right repo/issue/PR page.
 * NostrHub is listed first and rendered as the primary action.
 */
const GIT_SITES = [
	{
		name: "NostrHub",
		base: "https://nostrhub.io/",
		favicon: "https://nostrhub.io/favicon-32x32.png",
		primary: true,
	},
	{
		name: "Gitworkshop",
		base: "https://gitworkshop.dev/",
		favicon: "https://gitworkshop.dev/favicon.svg",
		primary: false,
	},
] as const;

interface GitSiteLinksProps {
	/**
	 * NIP-19 identifier (nevent1... or naddr1...) of the event to open on
	 * the external site. Renders nothing when undefined (e.g. encode failed).
	 */
	nip19: string | undefined;
	className?: string;
}

function GitSiteButton({
	site,
	nip19,
}: {
	site: (typeof GIT_SITES)[number];
	nip19: string;
}) {
	const [faviconError, setFaviconError] = useState(false);
	const href = `${site.base}${nip19}`;

	return (
		<a
			href={href}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
				site.primary
					? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
					: "border border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
			)}
			onClick={(e) => {
				// Real anchor for link semantics (hover URL, middle-click,
				// copy link), but route the primary click through openUrl so
				// it also works inside Capacitor's webview.
				e.preventDefault();
				e.stopPropagation();
				openUrl(href);
			}}
		>
			{faviconError ? (
				<ExternalLink className="size-3.5" />
			) : (
				<img
					src={site.favicon}
					alt=""
					className="size-3.5 object-contain"
					loading="lazy"
					onError={() => setFaviconError(true)}
				/>
			)}
			View on {site.name}
		</a>
	);
}

/** "View on NostrHub" / "View on Gitworkshop" buttons for NIP-34 cards. */
export function GitSiteLinks({ nip19, className }: GitSiteLinksProps) {
	if (!nip19) return null;

	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{GIT_SITES.map((site) => (
				<GitSiteButton key={site.name} site={site} nip19={nip19} />
			))}
		</div>
	);
}
