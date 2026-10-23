import type { NostrEvent } from "@nostrify/nostrify";
import {
	BookMarked,
	CircleCheck,
	CircleDashed,
	CircleDot,
	CircleX,
	FileCode,
	FileText,
	GitBranch,
	GitPullRequest,
	GitPullRequestArrow,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { nip19 } from "nostr-tools";
import { EmbeddedCardShell } from "@/components/EmbeddedCardShell";
import { getGitRepoRef, getGitTicketSubject, gitLabel, gitStatusVerb } from "@/lib/gitActivity";

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
function kindMeta(kind: number, intl: IntlShape): KindMeta {
	switch (kind) {
		case 30617:
			return { icon: BookMarked, label: intl.formatMessage({ id: "embeddedGitCard.repository", defaultMessage: "Repository" }), iconClassName: "text-muted-foreground" };
		case 30618:
			return { icon: GitBranch, label: intl.formatMessage({ id: "embeddedGitCard.repositoryState", defaultMessage: "Repository update" }), iconClassName: "text-muted-foreground" };
		case 30817:
			return { icon: FileCode, label: intl.formatMessage({ id: "embeddedGitCard.customNip", defaultMessage: "Custom NIP" }), iconClassName: "text-sky-600 dark:text-sky-400" };
		case 1617:
			return { icon: FileText, label: intl.formatMessage({ id: "embeddedGitCard.patch", defaultMessage: "Patch" }), iconClassName: "text-orange-500 dark:text-orange-400" };
		case 1618:
			return { icon: GitPullRequest, label: intl.formatMessage({ id: "embeddedGitCard.pullRequest", defaultMessage: "Pull request" }), iconClassName: "text-emerald-600 dark:text-emerald-400" };
		case 1619:
			return { icon: GitPullRequestArrow, label: intl.formatMessage({ id: "embeddedGitCard.pullRequestUpdate", defaultMessage: "Pull request update" }), iconClassName: "text-emerald-600 dark:text-emerald-400" };
		case 1621:
			return { icon: CircleDot, label: intl.formatMessage({ id: "embeddedGitCard.issue", defaultMessage: "Issue" }), iconClassName: "text-green-600 dark:text-green-400" };
		case 1630:
			return { icon: CircleDot, label: gitLabel(gitStatusVerb(kind), intl), iconClassName: "text-green-600 dark:text-green-400" };
		case 1631:
			return { icon: CircleCheck, label: gitLabel(gitStatusVerb(kind), intl), iconClassName: "text-purple-600 dark:text-purple-400" };
		case 1632:
			return { icon: CircleX, label: gitLabel(gitStatusVerb(kind), intl), iconClassName: "text-red-600 dark:text-red-400" };
		default:
			return { icon: CircleDashed, label: gitLabel(gitStatusVerb(kind), intl), iconClassName: "text-muted-foreground" };
	}
}

/** Title, description, and repo line for the card body, per kind. */
function cardText(event: NostrEvent): { title?: string; description?: string; repoName?: string } {
	const tag = (name: string) => event.tags.find(([n]) => n === name)?.[1]?.trim();
	switch (event.kind) {
		case 30617:
			return { title: tag("name") || tag("d"), description: tag("description") };
		case 30618:
			return { repoName: tag("d") };
		case 30817:
			return { title: tag("title") || tag("d") };
		case 1619:
		case 1630:
		case 1631:
		case 1632:
		case 1633:
			// Content is a short comment (may be empty).
			return { title: event.content.split("\n")[0]?.trim(), repoName: getGitRepoRef(event)?.identifier };
		default:
			return { title: getGitTicketSubject(event), repoName: getGitRepoRef(event)?.identifier };
	}
}

/**
 * Compact inline card for quoted/embedded NIP-34 git events (repositories,
 * repository state, patches, PRs, PR updates, issues, and status events)
 * and kind 30817 custom NIPs. Without this, these events fall through to
 * the generic embed, which shows only the `alt` tag or tombstones as "not
 * supported".
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
	const intl = useIntl();
	const navigateTo = useMemo(() => {
		if (event.kind >= 30000 && event.kind < 40000) {
			const identifier = event.tags.find(([n]) => n === "d")?.[1] ?? "";
			return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier });
		}
		return nip19.neventEncode({ id: event.id, author: event.pubkey });
	}, [event]);

	const { icon: Icon, label, iconClassName } = kindMeta(event.kind, intl);
	const { title, description, repoName } = cardText(event);

	return (
		<EmbeddedCardShell
			pubkey={event.pubkey}
			createdAt={event.created_at}
			navigateTo={navigateTo}
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
			{description && (
				<p className="mt-0.5 text-xs text-muted-foreground leading-relaxed line-clamp-2 break-words">
					{description}
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
