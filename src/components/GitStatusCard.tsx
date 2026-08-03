import type { NostrEvent } from "@nostrify/nostrify";
import {
	CircleCheck,
	CircleDashed,
	CircleDot,
	CircleX,
	GitCommitHorizontal,
	GitMerge,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { buildMarkdownComponents } from "@/components/markdownComponents";
import { GitSiteLinks } from "@/components/GitSiteLinks";
import { NoteContent } from "@/components/NoteContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthor } from "@/hooks/useAuthor";
import { useEvent } from "@/hooks/useEvent";
import { NGIT_RELAY } from "@/lib/appRelays";
import { getDisplayName } from "@/lib/getDisplayName";
import {
	getGitRepoRef,
	getGitRootRef,
	getGitTicketSubject,
	gitStatusVerb,
	gitTicketNoun,
} from "@/lib/gitActivity";
import { tryNeventEncode } from "@/lib/safeNip19";

interface GitStatusCardProps {
	event: NostrEvent;
	/** If true, show a compact preview. If false, show the full status content. Defaults to true. */
	preview?: boolean;
}

/** Badge icon + color per status kind. Kind 1631 shows a merge icon for patches/PRs. */
function statusMeta(
	statusKind: number,
	rootKind?: number,
): { icon: ComponentType<{ className?: string }>; className: string } {
	switch (statusKind) {
		case 1630:
			return {
				icon: CircleDot,
				className:
					"border-green-500/30 text-green-700 dark:text-green-400 bg-green-500/5",
			};
		case 1631:
			return {
				icon: rootKind === 1617 || rootKind === 1618 ? GitMerge : CircleCheck,
				className:
					"border-purple-500/30 text-purple-700 dark:text-purple-400 bg-purple-500/5",
			};
		case 1632:
			return {
				icon: CircleX,
				className:
					"border-red-500/30 text-red-700 dark:text-red-400 bg-red-500/5",
			};
		default:
			return {
				icon: CircleDashed,
				className: "border-border text-muted-foreground bg-muted/40",
			};
	}
}

/** Root ticket author attribution ("by Alice"), rendered once the root loads. */
function TicketAuthorByline({ pubkey }: { pubkey: string }) {
	const author = useAuthor(pubkey);
	const name = getDisplayName(author.data?.metadata, pubkey);
	return <span className="text-muted-foreground"> by {name}</span>;
}

/**
 * Renders a NIP-34 status event (kind 1630-1633) as an activity card:
 * "[Merged] Fix relay reconnect · on <repo>". The referenced root ticket
 * is fetched to disambiguate the badge (1631 = resolved for issues,
 * applied for patches, merged for PRs) and to show its subject and author.
 */
export function GitStatusCard({ event, preview = true }: GitStatusCardProps) {
	const rootRef = getGitRootRef(event);
	const repoRef = getGitRepoRef(event);
	const repoName = repoRef?.identifier ?? "";

	const relayHints = [
		...(rootRef?.relay ? [rootRef.relay] : []),
		...(repoRef?.relay ? [repoRef.relay] : []),
		NGIT_RELAY,
	];

	const { data: root, isLoading: rootLoading } = useEvent(
		rootRef?.id,
		relayHints,
		repoRef?.pubkey,
	);

	const verb = gitStatusVerb(event.kind, root?.kind);
	const noun = gitTicketNoun(root?.kind);
	const subject = root ? getGitTicketSubject(root) : undefined;
	const { icon: StatusIcon, className: badgeClass } = statusMeta(
		event.kind,
		root?.kind,
	);

	const rootNevent = rootRef
		? tryNeventEncode({
				id: rootRef.id,
				relays: rootRef.relay ? [rootRef.relay] : [NGIT_RELAY],
				author: root?.pubkey,
			})
		: undefined;

	// External sites get this event's own nevent. Gitworkshop resolves
	// status events by following the e-tag chain to the ticket page anyway.
	const externalNip19 = tryNeventEncode({
		id: event.id,
		author: event.pubkey,
		relays: [NGIT_RELAY],
	});

	const comment = event.content.trim();

	// Merged/applied metadata (kind 1631). ngit emits the non-spec
	// "merge-commit-id" name alongside NIP-34's "merge-commit".
	const mergeCommit = event.tags.find(
		([n]) => n === "merge-commit" || n === "merge-commit-id",
	)?.[1];
	const appliedCommits =
		event.tags.find(([n]) => n === "applied-as-commits")?.slice(1) ?? [];

	const titleText =
		subject ?? (rootRef ? `#${rootRef.id.slice(0, 8)}` : undefined);

	return (
		<div className="mt-2 space-y-3">
			{/* Card container */}
			<div className="rounded-2xl border border-border overflow-hidden">
				<div className="px-3.5 py-3 space-y-2.5">
					{/* Status badge + noun */}
					<div className="flex items-center gap-2 flex-wrap">
						<span
							className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize shrink-0 ${badgeClass}`}
						>
							<StatusIcon className="size-3" />
							{verb}
						</span>
						{noun && (
							<span className="text-xs text-muted-foreground">
								{noun}
								{root && <TicketAuthorByline pubkey={root.pubkey} />}
							</span>
						)}
					</div>

					{/* Ticket subject */}
					{rootLoading && !titleText ? (
						<Skeleton className="h-4 w-3/4" />
					) : titleText ? (
						<div className="min-w-0">
							{rootNevent ? (
								<Link
									to={`/${rootNevent}`}
									className="font-semibold text-sm leading-snug hover:underline break-words line-clamp-2"
									onClick={(e) => e.stopPropagation()}
								>
									{titleText}
								</Link>
							) : (
								<span className="font-semibold text-sm leading-snug break-words line-clamp-2">
									{titleText}
								</span>
							)}
							{repoName && (
								<p className="text-xs text-muted-foreground mt-0.5 font-mono">
									{repoName}
								</p>
							)}
						</div>
					) : (
						repoName && (
							<p className="text-xs text-muted-foreground font-mono">
								{repoName}
							</p>
						)
					)}

					{/* Merge/apply commit metadata */}
					{mergeCommit && (
						<div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
							<GitMerge className="size-3.5 text-muted-foreground shrink-0" />
							<span className="text-[11px] text-muted-foreground">
								Merge commit
							</span>
							<code className="ml-auto text-[11px] font-mono text-muted-foreground">
								{mergeCommit.slice(0, 12)}
							</code>
						</div>
					)}
					{!preview && appliedCommits.length > 0 && (
						<div className="rounded-lg bg-muted/50 divide-y divide-border/50 overflow-hidden">
							{appliedCommits.map((commit) => (
								<div
									key={commit}
									className="flex items-center gap-2 px-2.5 py-1.5"
								>
									<GitCommitHorizontal className="size-3.5 text-muted-foreground shrink-0" />
									<span className="text-[11px] text-muted-foreground">
										Applied as
									</span>
									<code className="ml-auto text-[11px] font-mono text-muted-foreground">
										{commit.slice(0, 12)}
									</code>
								</div>
							))}
						</div>
					)}

					{/* Comment preview — inline-linkified (nostr URIs become
					    links, not embed cards, so the line clamp stays clean) */}
					{preview && comment && (
						<div className="text-[13px] text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap break-words">
							<NoteContent
								event={event}
								as="span"
								disableNoteEmbeds
								disableMediaEmbeds
							/>
						</div>
					)}

					{/* External site links */}
					<GitSiteLinks nip19={externalNip19} className="pt-0.5" />
				</div>
			</div>

			{/* Full comment -- outside card, only in detail view */}
			{!preview && comment && (
				<div className="rounded-2xl border border-border overflow-hidden px-4 py-4 sidebar:px-5 sidebar:py-5">
					<div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-bold prose-strong:text-foreground prose-a:text-primary prose-img:rounded-lg prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-muted prose-pre:text-foreground prose-code:text-[13px] prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-li:marker:text-muted-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-hr:border-border prose-th:text-foreground">
						<Markdown
							rehypePlugins={[rehypeSanitize]}
							components={buildMarkdownComponents(event)}
						>
							{comment}
						</Markdown>
					</div>
				</div>
			)}
		</div>
	);
}
