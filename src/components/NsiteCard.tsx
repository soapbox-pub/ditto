import type { NostrEvent } from "@nostrify/nostrify";
import { ExternalLink, FileText, Globe, Server } from "lucide-react";
import { nip19 } from "nostr-tools";

import { ExternalFavicon } from "@/components/ExternalFavicon";
import { Skeleton } from "@/components/ui/skeleton";
import { useLinkPreview } from "@/hooks/useLinkPreview";
import { cn } from "@/lib/utils";

interface NsiteCardProps {
	event: NostrEvent;
}

/** Encode a 32-byte hex pubkey as a base36 string (50 chars, zero-padded). */
function hexToBase36(hex: string): string {
	let n = 0n;
	for (let i = 0; i < hex.length; i++) {
		n = n * 16n + BigInt(parseInt(hex[i], 16));
	}
	const b36 = n.toString(36);
	return b36.padStart(50, "0");
}

/** Build the nsite.lol gateway URL for an nsite event. */
function getNsiteUrl(event: NostrEvent): string {
	const dTag = event.tags.find(([n]) => n === "d")?.[1];

	if (event.kind === 35128 && dTag) {
		const pubkeyB36 = hexToBase36(event.pubkey);
		return `https://${pubkeyB36}${dTag}.nsite.lol`;
	}

	const npub = nip19.npubEncode(event.pubkey);
	return `https://${npub}.nsite.lol`;
}

/** Extract display domain from a URL. */
function displayDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

/** Renders an nsite deployment card with a rich link preview. */
export function NsiteCard({ event }: NsiteCardProps) {
	const title = event.tags.find(([n]) => n === "title")?.[1];
	const description = event.tags.find(([n]) => n === "description")?.[1];
	const dTag = event.tags.find(([n]) => n === "d")?.[1];
	const sourceUrl = event.tags.find(([n]) => n === "source")?.[1];
	const pathTags = event.tags.filter(([n]) => n === "path");
	const serverTags = event.tags.filter(([n]) => n === "server");

	const isNamed = event.kind === 35128 && !!dTag;
	const siteUrl = getNsiteUrl(event);
	const displayName = title || (isNamed ? dTag : "Root Site");

	const { data: preview, isLoading } = useLinkPreview(siteUrl);
	const image = preview?.thumbnail_url;
	const previewTitle = preview?.title;
	const domain = preview?.provider_name || displayDomain(siteUrl);

	if (isLoading) {
		return <NsiteCardSkeleton />;
	}

	return (
		<a
			href={siteUrl}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				"group block mt-2 rounded-2xl border border-border overflow-hidden",
				"hover:bg-secondary/40 transition-colors",
			)}
			onClick={(e) => e.stopPropagation()}
		>
			{/* Link preview thumbnail */}
			{image && (
				<div className="w-full overflow-hidden bg-muted">
					<img
						src={image}
						alt=""
						className="w-full h-[180px] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
						loading="lazy"
						onError={(e) => {
							(e.currentTarget.parentElement as HTMLElement).style.display = "none";
						}}
					/>
				</div>
			)}

			<div className="px-3.5 py-2.5 space-y-1.5">
				{/* Domain bar with favicon */}
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<ExternalFavicon url={siteUrl} size={14} className="shrink-0" />
					<span className="truncate">{domain}</span>
					<span className="shrink-0 ml-auto rounded-full border border-border px-2 py-0 text-[11px] leading-relaxed">
						{isNamed ? "Named Site" : "Root Site"}
					</span>
				</div>

				{/* Title — use OEmbed title if available, fall back to event title/d-tag */}
				<p className="text-sm font-semibold leading-snug line-clamp-2">
					{previewTitle || displayName}
				</p>

				{/* Description — prefer event description (it's curated), fall back to OEmbed author */}
				{(description || preview?.author_name) && (
					<p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
						{description || preview?.author_name}
					</p>
				)}

				{/* Deployment stats + source link */}
				<div className="flex items-center gap-3 pt-0.5 text-[11px] text-muted-foreground">
					{pathTags.length > 0 && (
						<span className="inline-flex items-center gap-1">
							<FileText className="size-3" />
							{pathTags.length} {pathTags.length === 1 ? "file" : "files"}
						</span>
					)}
					{serverTags.length > 0 && (
						<span className="inline-flex items-center gap-1">
							<Server className="size-3" />
							{serverTags.length} {serverTags.length === 1 ? "server" : "servers"}
						</span>
					)}
					{sourceUrl && (
						<a
							href={sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(
								"ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
								"hover:bg-primary/10 hover:text-primary transition-colors",
							)}
							onClick={(e) => e.stopPropagation()}
						>
							<Globe className="size-3" />
							<span>Source</span>
						</a>
					)}
					{!sourceUrl && (
						<span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full hover:bg-primary/10 hover:text-primary transition-colors">
							<ExternalLink className="size-3" />
							<span>Visit</span>
						</span>
					)}
				</div>
			</div>
		</a>
	);
}

function NsiteCardSkeleton() {
	return (
		<div className="mt-2 rounded-2xl border border-border overflow-hidden">
			<Skeleton className="w-full h-[180px] rounded-none" />
			<div className="px-3.5 py-2.5 space-y-1.5">
				<Skeleton className="h-3 w-28" />
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-32" />
			</div>
		</div>
	);
}
