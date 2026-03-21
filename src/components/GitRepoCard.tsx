import type { NostrEvent } from "@nostrify/nostrify";
import { Copy, ExternalLink, Globe, Wand2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface GitRepoCardProps {
	event: NostrEvent;
}

/** Derive a favicon URL from a website URL. */
function getFaviconUrl(webUrl: string): string | undefined {
	try {
		const origin = new URL(webUrl).origin;
		return `${origin}/favicon.ico`;
	} catch {
		return undefined;
	}
}

/** Renders a NIP-34 kind 30617 event. Shakespeare apps show as app cards; others as repo cards. */
export function GitRepoCard({ event }: GitRepoCardProps) {
	const name = event.tags.find(([n]) => n === "name")?.[1];
	const description = event.tags.find(([n]) => n === "description")?.[1];
	const webUrls = event.tags.filter(([n]) => n === "web").map(([, v]) => v);
	const cloneUrls = event.tags
		.filter(([n]) => n === "clone")
		.map(([, v]) => v);
	const isPersonalFork = event.tags.some(
		([n, v]) => n === "t" && v === "personal-fork",
	);
	const hasShakespeare = event.tags.some(
		([n, v]) => n === "t" && v === "shakespeare",
	);
	const dTag = event.tags.find(([n]) => n === "d")?.[1] ?? "";

	// Shakespeare + web URL = this is a deployed application, not a repo
	const isApp = hasShakespeare && !!webUrls[0];
	const faviconUrl = isApp ? getFaviconUrl(webUrls[0]) : undefined;

	const displayName = name || dTag;

	const [faviconError, setFaviconError] = useState(false);
	const [copied, setCopied] = useState(false);

	const handleCopy = (url: string) => {
		navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const shakespeareUrl = cloneUrls[0]
		? `https://shakespeare.diy/clone?url=${encodeURIComponent(cloneUrls[0])}`
		: "https://shakespeare.diy";

	return (
		<div className="mt-2 rounded-2xl border border-border overflow-hidden">
			<div className="px-3.5 py-3 space-y-2">
				{/* Name + fork badge */}
				<div className="flex items-center gap-2 min-w-0">
					{isApp && faviconUrl && !faviconError && (
						<img
							src={faviconUrl}
							alt=""
							className="size-5 rounded object-cover shrink-0"
							loading="lazy"
							onError={() => setFaviconError(true)}
						/>
					)}
					<span className="font-semibold text-sm truncate leading-snug">
						{displayName}
					</span>
					{isPersonalFork && (
						<span className="shrink-0 rounded-full border border-border px-2 py-0 text-[11px] text-muted-foreground leading-relaxed">
							Fork
						</span>
					)}
				</div>

				{/* Description */}
				{description && (
					<p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">
						{description}
					</p>
				)}

				{/* Clone URL -- hidden for apps */}
				{!isApp && cloneUrls[0] && (
					<div className="group/clone flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
						<code className="flex-1 text-[11px] font-mono text-muted-foreground truncate select-all">
							{cloneUrls[0]}
						</code>
						<Button
							variant="ghost"
							size="sm"
							className="h-5 w-5 p-0 shrink-0 opacity-50 group-hover/clone:opacity-100 transition-opacity"
							onClick={(e) => {
								e.stopPropagation();
								handleCopy(cloneUrls[0]);
							}}
						>
							<Copy className="size-3" />
							<span className="sr-only">
								{copied ? "Copied" : "Copy"}
							</span>
						</Button>
					</div>
				)}

				{/* Action buttons */}
				{(hasShakespeare || isApp || webUrls[0] || cloneUrls[0]) && (
					<div className="flex flex-wrap gap-2 pt-0.5">
						{hasShakespeare && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								onClick={(e) => {
									e.stopPropagation();
									window.open(
										shakespeareUrl,
										"_blank",
										"noopener,noreferrer",
									);
								}}
							>
								<Wand2 className="size-3" />
								Edit with Shakespeare
							</button>
						)}
						{isApp ? (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/60"
								onClick={(e) => {
									e.stopPropagation();
									window.open(
										webUrls[0],
										"_blank",
										"noopener,noreferrer",
									);
								}}
							>
								<ExternalLink className="size-3" />
								Open App
							</button>
						) : webUrls[0] ? (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/60"
								onClick={(e) => {
									e.stopPropagation();
									window.open(
										webUrls[0],
										"_blank",
										"noopener,noreferrer",
									);
								}}
							>
								<Globe className="size-3" />
								Browse Repository
							</button>
						) : !hasShakespeare && cloneUrls[0] ? (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/60"
								onClick={(e) => {
									e.stopPropagation();
									handleCopy(cloneUrls[0]);
								}}
							>
								<Copy className="size-3" />
								{copied ? "Copied!" : "Copy Clone URL"}
							</button>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}
