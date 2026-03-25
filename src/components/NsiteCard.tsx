import type { NostrEvent } from "@nostrify/nostrify";
import { ExternalLink, FileText, Globe } from "lucide-react";
import { nip19 } from "nostr-tools";

interface NsiteCardProps {
	event: NostrEvent;
}

/** Encode a 32-byte hex pubkey as a base36 string (50 chars, zero-padded). */
function hexToBase36(hex: string): string {
	// Process the hex string in chunks to build a BigInt
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
		// Named site: <pubkeyB36><dTag>.nsite.lol
		const pubkeyB36 = hexToBase36(event.pubkey);
		return `https://${pubkeyB36}${dTag}.nsite.lol`;
	}

	// Root site (kind 15128): <npub>.nsite.lol
	const npub = nip19.npubEncode(event.pubkey);
	return `https://${npub}.nsite.lol`;
}

/** Renders an nsite deployment card for kind 15128 (root site) or 35128 (named site). */
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

	return (
		<div className="mt-2 rounded-2xl border border-border overflow-hidden">
			<div className="px-3.5 py-3 space-y-2">
				{/* Site name + type badge */}
				<div className="flex items-center gap-2 min-w-0">
					<Globe className="size-4 text-muted-foreground shrink-0" />
					<span className="font-semibold text-sm truncate leading-snug">
						{displayName}
					</span>
					<span className="shrink-0 rounded-full border border-border px-2 py-0 text-[11px] text-muted-foreground leading-relaxed">
						{isNamed ? "Named Site" : "Root Site"}
					</span>
				</div>

				{/* Description */}
				{description && (
					<p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">
						{description}
					</p>
				)}

				{/* File count + server info */}
				<div className="flex items-center gap-3 text-[11px] text-muted-foreground">
					{pathTags.length > 0 && (
						<span className="inline-flex items-center gap-1">
							<FileText className="size-3" />
							{pathTags.length} {pathTags.length === 1 ? "file" : "files"}
						</span>
					)}
					{serverTags.length > 0 && (
						<span>
							{serverTags.length}{" "}
							{serverTags.length === 1 ? "server" : "servers"}
						</span>
					)}
				</div>

				{/* Action buttons */}
				<div className="flex flex-wrap gap-2 pt-0.5">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						onClick={(e) => {
							e.stopPropagation();
							window.open(siteUrl, "_blank", "noopener,noreferrer");
						}}
					>
						<ExternalLink className="size-3" />
						View Site
					</button>
					{sourceUrl && (
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/60"
							onClick={(e) => {
								e.stopPropagation();
								window.open(sourceUrl, "_blank", "noopener,noreferrer");
							}}
						>
							<Globe className="size-3" />
							Source
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
