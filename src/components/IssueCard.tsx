import type { NostrEvent } from "@nostrify/nostrify";
import { CircleDot } from "lucide-react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { buildMarkdownComponents } from "@/components/markdownComponents";
import { GitSiteLinks } from "@/components/GitSiteLinks";
import { NoteContent } from "@/components/NoteContent";
import { NGIT_RELAY } from "@/lib/appRelays";
import { getGitRepoRef, getGitTicketSubject } from "@/lib/gitActivity";
import { tryNeventEncode } from "@/lib/safeNip19";

interface IssueCardProps {
	event: NostrEvent;
	/** If true, show a compact preview. If false, show the full issue content. Defaults to true. */
	preview?: boolean;
}

/** Renders a NIP-34 kind 1621 issue event card. */
export function IssueCard({ event, preview = true }: IssueCardProps) {
	const repoRef = getGitRepoRef(event);
	const repoName = repoRef?.identifier ?? "";
	const subject = event.tags.find(([n]) => n === "subject")?.[1]?.trim();
	const title = getGitTicketSubject(event) ?? "Issue";
	const labels = event.tags.filter(([n]) => n === "t").map(([, v]) => v);

	// When there's no subject tag the first content line doubles as the
	// title -- don't repeat it in the body preview.
	const body = subject
		? event.content.trim()
		: event.content.split("\n").slice(1).join("\n").trim();

	const nevent = tryNeventEncode({
		id: event.id,
		author: event.pubkey,
		relays: [NGIT_RELAY],
	});

	return (
		<div className="mt-2 space-y-3">
			{/* Card container */}
			<div className="rounded-2xl border border-border overflow-hidden">
				<div className="px-3.5 py-3 space-y-2">
					{/* Title + repo */}
					<div className="flex items-start gap-2.5">
						<CircleDot className="size-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
						<div className="min-w-0 flex-1">
							<span className="font-semibold text-sm leading-snug line-clamp-2">
								{title}
							</span>
							{repoName && (
								<p className="text-xs text-muted-foreground mt-0.5 font-mono">
									{repoName}
								</p>
							)}
						</div>
					</div>

					{/* Labels */}
					{labels.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{labels
								.slice(0, preview ? 6 : labels.length)
								.map((label) => (
									<span
										key={label}
										className="text-[11px] text-muted-foreground"
									>
										#{label}
									</span>
								))}
							{preview && labels.length > 6 && (
								<span className="text-[11px] text-muted-foreground/50">
									+{labels.length - 6} more
								</span>
							)}
						</div>
					)}

					{/* Body preview — inline-linkified (nostr URIs become
					    links, not embed cards, so the line clamp stays clean) */}
					{preview && body && (
						<div className="text-[13px] text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap break-words">
							<NoteContent
								event={{ ...event, content: body }}
								as="span"
								disableNoteEmbeds
								disableMediaEmbeds
							/>
						</div>
					)}

					{/* External site links */}
					<GitSiteLinks nip19={nevent} className="pt-0.5" />
				</div>
			</div>

			{/* Full issue body -- outside card, only in detail view */}
			{!preview && body && (
				<div className="rounded-2xl border border-border overflow-hidden px-4 py-4 sidebar:px-5 sidebar:py-5">
					<div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-bold prose-strong:text-foreground prose-a:text-primary prose-img:rounded-lg prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-muted prose-pre:text-foreground prose-code:text-[13px] prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-li:marker:text-muted-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-hr:border-border prose-th:text-foreground">
					<Markdown
						rehypePlugins={[rehypeSanitize]}
						components={buildMarkdownComponents(event)}
					>
						{body}
					</Markdown>
					</div>
				</div>
			)}
		</div>
	);
}
