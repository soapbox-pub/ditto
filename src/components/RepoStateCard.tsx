import type { NostrEvent } from "@nostrify/nostrify";
import { GitBranch, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RepoStateCardProps {
	event: NostrEvent;
	/** If true, show a compact preview with a few refs. If false, show all refs. Defaults to true. */
	preview?: boolean;
}

interface GitRef {
	name: string;
	commit: string;
}

/** Parse branches, tags, and the HEAD branch from a kind 30618 repository state event. */
function parseRepoState(event: NostrEvent): {
	branches: GitRef[];
	tags: GitRef[];
	headBranch?: string;
} {
	const branches: GitRef[] = [];
	const tags: GitRef[] = [];
	let headBranch: string | undefined;

	for (const [name, value] of event.tags) {
		if (name === "HEAD" && value?.startsWith("ref: refs/heads/")) {
			headBranch = value.slice("ref: refs/heads/".length);
		} else if (name.startsWith("refs/heads/") && value) {
			branches.push({ name: name.slice("refs/heads/".length), commit: value });
		} else if (name.startsWith("refs/tags/") && value) {
			tags.push({ name: name.slice("refs/tags/".length), commit: value });
		}
	}

	// HEAD branch first, then alphabetical.
	branches.sort((a, b) =>
		a.name === headBranch ? -1 : b.name === headBranch ? 1 : a.name.localeCompare(b.name),
	);

	return { branches, tags, headBranch };
}

/**
 * Renders a NIP-34 kind 30618 repository state event ("pushed to <repo>"):
 * the current branches and tags of a repository after a push.
 */
export function RepoStateCard({ event, preview = true }: RepoStateCardProps) {
	const repoId = event.tags.find(([n]) => n === "d")?.[1] ?? "";
	const { branches, tags, headBranch } = parseRepoState(event);

	const maxRows = preview ? 4 : Infinity;
	const shownBranches = branches.slice(0, maxRows);
	const remainingRows = Math.max(0, branches.length - shownBranches.length);
	const shownTags = preview ? tags.slice(0, 3) : tags;
	const remainingTags = tags.length - shownTags.length;

	return (
		<div className="mt-2 rounded-2xl border border-border overflow-hidden">
			<div className="px-3.5 py-3 space-y-2">
				{/* Repo name */}
				<div className="flex items-center gap-2 min-w-0">
					<GitBranch className="size-4 text-muted-foreground shrink-0" />
					<span className="font-semibold text-sm truncate leading-snug font-mono">
						{repoId || "repository"}
					</span>
				</div>

				{/* Branches */}
				{shownBranches.length > 0 && (
					<div className="rounded-lg bg-muted/50 divide-y divide-border/50 overflow-hidden">
						{shownBranches.map((branch) => (
							<div
								key={branch.name}
								className="flex items-center gap-2 px-2.5 py-1.5"
							>
								<GitBranch className="size-3 text-muted-foreground shrink-0" />
								<span className="text-[11px] font-mono truncate">
									{branch.name}
								</span>
								{branch.name === headBranch && (
									<Badge
										variant="secondary"
										className="text-[10px] px-1.5 py-0 border-0 shrink-0"
									>
										default
									</Badge>
								)}
								<code className="ml-auto text-[11px] font-mono text-muted-foreground shrink-0">
									{branch.commit.slice(0, 8)}
								</code>
							</div>
						))}
						{remainingRows > 0 && (
							<div className="px-2.5 py-1.5 text-[11px] text-muted-foreground/70">
								+{remainingRows} more{" "}
								{remainingRows === 1 ? "branch" : "branches"}
							</div>
						)}
					</div>
				)}

				{/* Tags */}
				{shownTags.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						{shownTags.map((tag) => (
							<span
								key={tag.name}
								className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono text-muted-foreground"
							>
								<Tag className="size-3" />
								{tag.name}
							</span>
						))}
						{remainingTags > 0 && (
							<span className="text-[11px] text-muted-foreground/50">
								+{remainingTags} more
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
