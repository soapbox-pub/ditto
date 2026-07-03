import type { NostrEvent } from "@nostrify/nostrify";
import {
	CircleCheck,
	CircleDashed,
	CircleDot,
	CircleX,
	FileText,
	GitPullRequest,
	GitPullRequestArrow,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { nip19 } from "nostr-tools";
import { EmbeddedCardShell } from "@/components/EmbeddedCardShell";
import { getGitRepoRef, getGitTicketSubject, gitStatusVerb } from "@/lib/gitActivity";

interface KindMeta {
	icon: ComponentType<{ className?: string }>;
	label: string;
	iconClassName: string;
}

/**
 * Header meta per kind. Status labels use the root-kind-agnostic verb
 * (an embed doesn't fetch the referenced ticket, so 1631 reads
 * "Resolved" rather than distinguishing merged/applied).
 */
function kindMeta(kind: number): KindMeta {
	switch (kind) {
		case 1617:
			return { icon: FileText, label: "Patch", iconClassName: "text-orange-500 dark:text-orange-400" };
		case 1618:
			return { icon: GitPullRequest, label: "Pull request", iconClassName: "text-emerald-600 dark:text-emerald-400" };
		case 1619:
			return { icon: GitPullRequestArrow, label: "Pull request update", iconClassName: "text-emerald-600 dark:text-emerald-400" };
		case 1621:
			return { icon: CircleDot, label: "Issue", iconClassName: "text-green-600 dark:text-green-400" };
		case 1630:
			return { icon: CircleDot, label: gitStatusVerb(kind), iconClassName: "text-green-600 dark:text-green-400" };
		case 1631:
			return { icon: CircleCheck, label: gitStatusVerb(kind), iconClassName: "text-purple-600 dark:text-purple-400" };
		case 1632:
			return { icon: CircleX, label: gitStatusVerb(kind), iconClassName: "text-red-600 dark:text-red-400" };
		default:
			return { icon: CircleDashed, label: gitStatusVerb(kind), iconClassName: "text-muted-foreground" };
	}
}

/**
 * Compact inline card for quoted/embedded NIP-34 git events (patches,
 * PRs, PR updates, issues, and status events). Without this, git events
 * quoted via nevent fall through to the generic embed, which shows only
 * the `alt` tag or tombstones as "not supported".
 */
export function EmbeddedGitCard({
	event,
	className,
	disableHoverCards,
}: {
	event: NostrEvent;
	className?: string;
	disableHoverCards?: boolean;
}) {
	const neventId = useMemo(
		() => nip19.neventEncode({ id: event.id, author: event.pubkey }),
		[event.id, event.pubkey],
	);

	const { icon: Icon, label, iconClassName } = kindMeta(event.kind);
	const repoName = getGitRepoRef(event)?.identifier;
	const isStatus = event.kind >= 1630 && event.kind <= 1633;
	// Status/PR-update events: content is a short comment (may be empty).
	// Tickets: derive the subject line.
	const title =
		event.kind === 1619 || isStatus
			? event.content.split("\n")[0]?.trim()
			: getGitTicketSubject(event);

	return (
		<EmbeddedCardShell
			pubkey={event.pubkey}
			createdAt={event.created_at}
			navigateTo={neventId}
			className={className}
			disableHoverCards={disableHoverCards}
		>
			<div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				<Icon className={`size-3 ${iconClassName}`} />
				{label}
			</div>
			{title && (
				<p className="mt-1 text-sm font-medium leading-snug line-clamp-2 break-words">
					{title}
				</p>
			)}
			{repoName && (
				<p className="mt-0.5 text-xs text-muted-foreground font-mono truncate">
					{repoName}
				</p>
			)}
		</EmbeddedCardShell>
	);
}
