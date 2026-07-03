import type { NostrEvent } from "@nostrify/nostrify";
import { GitCommitHorizontal, GitPullRequestArrow } from "lucide-react";
import { Link } from "react-router-dom";
import { GitSiteLinks } from "@/components/GitSiteLinks";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent } from "@/hooks/useEvent";
import { NGIT_RELAY } from "@/lib/appRelays";
import {
	getGitRepoRef,
	getGitRootRef,
	getGitTicketSubject,
} from "@/lib/gitActivity";
import { tryNeventEncode } from "@/lib/safeNip19";

interface PrUpdateCardProps {
	event: NostrEvent;
	/** If true, show a compact preview. If false, show full metadata. Defaults to true. */
	preview?: boolean;
}

/**
 * Renders a NIP-34 kind 1619 pull request update: the author pushed a new
 * tip commit to an existing PR. The referenced PR is fetched to show its
 * subject.
 */
export function PrUpdateCard({ event, preview = true }: PrUpdateCardProps) {
	const prRef = getGitRootRef(event);
	const repoRef = getGitRepoRef(event);
	const repoName = repoRef?.identifier ?? "";
	const commitTip = event.tags.find(([n]) => n === "c")?.[1];
	const mergeBase = event.tags.find(([n]) => n === "merge-base")?.[1];

	const relayHints = [
		...(prRef?.relay ? [prRef.relay] : []),
		...(repoRef?.relay ? [repoRef.relay] : []),
		NGIT_RELAY,
	];

	const { data: pr, isLoading: prLoading } = useEvent(
		prRef?.id,
		relayHints,
		repoRef?.pubkey,
	);

	const subject = pr ? getGitTicketSubject(pr) : undefined;
	const titleText =
		subject ?? (prRef ? `#${prRef.id.slice(0, 8)}` : "a pull request");

	const prNevent = prRef
		? tryNeventEncode({
				id: prRef.id,
				relays: prRef.relay ? [prRef.relay] : [NGIT_RELAY],
				author: pr?.pubkey,
			})
		: undefined;

	// External sites get this event's own nevent. Gitworkshop resolves PR
	// updates by following the E-tag chain to the PR page anyway.
	const externalNip19 = tryNeventEncode({
		id: event.id,
		author: event.pubkey,
		relays: [NGIT_RELAY],
	});

	return (
		<div className="mt-2 rounded-2xl border border-border overflow-hidden">
			<div className="px-3.5 py-3 space-y-2">
				{/* Title + repo */}
				<div className="flex items-start gap-2.5">
					<GitPullRequestArrow className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
					<div className="min-w-0 flex-1">
						{prLoading && !subject ? (
							<Skeleton className="h-4 w-3/4" />
						) : (
							<span className="text-sm leading-snug">
								<span className="text-muted-foreground">
									Pushed an update to
								</span>{" "}
								{prNevent ? (
									<Link
										to={`/${prNevent}`}
										className="font-semibold hover:underline break-words"
										onClick={(e) => e.stopPropagation()}
									>
										{titleText}
									</Link>
								) : (
									<span className="font-semibold break-words">
										{titleText}
									</span>
								)}
							</span>
						)}
						{repoName && (
							<p className="text-xs text-muted-foreground mt-0.5 font-mono">
								{repoName}
							</p>
						)}
					</div>
				</div>

				{/* New tip commit */}
				{commitTip && (
					<div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
						<GitCommitHorizontal className="size-3.5 text-muted-foreground shrink-0" />
						<span className="text-[11px] text-muted-foreground">
							New tip
						</span>
						<code className="ml-auto text-[11px] font-mono text-muted-foreground">
							{commitTip.slice(0, 12)}
						</code>
					</div>
				)}

				{/* Merge base -- detail view only */}
				{!preview && mergeBase && (
					<div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
						<GitCommitHorizontal className="size-3.5 text-muted-foreground shrink-0" />
						<span className="text-[11px] text-muted-foreground">
							Merge base
						</span>
						<code className="ml-auto text-[11px] font-mono text-muted-foreground">
							{mergeBase.slice(0, 12)}
						</code>
					</div>
				)}

				{/* External site links */}
				<GitSiteLinks nip19={externalNip19} className="pt-0.5" />
			</div>
		</div>
	);
}
