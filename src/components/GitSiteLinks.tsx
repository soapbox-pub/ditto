import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { openUrl } from "@/lib/downloadFile";

/**
 * External NIP-34 web clients that resolve bare NIP-19 identifiers at
 * their URL root: gitworkshop.dev redirects nevent/naddr to the right
 * repo/issue/PR page, and nostrhub.io renders ticket and repo pages.
 */
const GIT_SITES = [
	{ name: "Gitworkshop", base: "https://gitworkshop.dev/" },
	{ name: "NostrHub", base: "https://nostrhub.io/" },
] as const;

interface GitSiteLinksProps {
	/**
	 * NIP-19 identifier (nevent1... or naddr1...) of the event to open on
	 * the external site. Renders nothing when undefined (e.g. encode failed).
	 */
	nip19: string | undefined;
	className?: string;
}

/** "View on Gitworkshop" / "View on NostrHub" buttons for NIP-34 cards. */
export function GitSiteLinks({ nip19, className }: GitSiteLinksProps) {
	if (!nip19) return null;

	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{GIT_SITES.map((site) => (
				<button
					key={site.name}
					type="button"
					className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
					onClick={(e) => {
						e.stopPropagation();
						openUrl(`${site.base}${nip19}`);
					}}
				>
					<ExternalLink className="size-3" />
					{site.name}
				</button>
			))}
		</div>
	);
}
