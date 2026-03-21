import type { NostrEvent } from "@nostrify/nostrify";
import { FileText, GitCommit, User, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PatchCardProps {
	event: NostrEvent;
	/** If true, show a compact preview. If false, show the full patch content. Defaults to true. */
	preview?: boolean;
}

/** Parse the git format-patch content into structured parts. */
function parsePatchContent(content: string) {
	const lines = content.split("\n");
	let subject = "";
	let commitMessage = "";
	let diff = "";

	// Extract subject from first line or Subject: header
	const firstLine = lines[0]?.trim() ?? "";
	if (firstLine.startsWith("Subject:")) {
		subject = firstLine.replace(/^Subject:\s*(\[PATCH[^\]]*\])?\s*/, "");
	} else {
		subject = firstLine;
	}

	// Find the diff start (lines starting with "---" followed by diff content, or "diff --git")
	let diffStartIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith("diff --git ")) {
			diffStartIdx = i;
			break;
		}
	}

	if (diffStartIdx > 0) {
		const messageLines: string[] = [];
		for (let i = 1; i < diffStartIdx; i++) {
			const line = lines[i];
			if (/^[A-Z][a-z-]+:/.test(line) && messageLines.length === 0)
				continue;
			if (line === "---") continue;
			if (/^\s+\S+.*\|.*\d+/.test(line)) continue;
			if (/^\s*\d+ files? changed/.test(line)) continue;
			messageLines.push(line);
		}
		commitMessage = messageLines.join("\n").trim();
		diff = lines.slice(diffStartIdx).join("\n");
	} else {
		commitMessage = lines.slice(1).join("\n").trim();
	}

	return { subject, commitMessage, diff };
}

/** Renders a NIP-34 kind 1617 patch event card. */
export function PatchCard({ event, preview = true }: PatchCardProps) {
	const { subject, commitMessage, diff } = parsePatchContent(event.content);

	const isRoot = event.tags.some(([n, v]) => n === "t" && v === "root");
	const isRevision = event.tags.some(
		([n, v]) => n === "t" && v === "root-revision",
	);
	const hasShakespeare = event.tags.some(
		([n, v]) => n === "t" && v === "shakespeare",
	);
	const repoTag = event.tags.find(([n]) => n === "a")?.[1];
	const repoName = repoTag?.split(":")[2] ?? "";
	const commitId = event.tags.find(([n]) => n === "commit")?.[1];
	const parentCommit = event.tags.find(([n]) => n === "parent-commit")?.[1];
	const committerTag = event.tags.find(([n]) => n === "committer");
	const hashtags = event.tags
		.filter(([n]) => n === "t")
		.map(([, v]) => v)
		.filter(
			(t) => t !== "root" && t !== "root-revision" && t !== "shakespeare",
		);

	return (
		<div className="mt-2 space-y-3">
			{/* Card container */}
			<div className="rounded-2xl border border-border overflow-hidden">
				<div className="px-3.5 py-3 space-y-2">
					{/* Title + status badges */}
					<div className="flex items-start gap-2.5">
						<FileText className="size-4 text-orange-500 dark:text-orange-400 shrink-0 mt-0.5" />
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2 flex-wrap">
								<span className="font-semibold text-sm leading-snug line-clamp-2">
									{subject || "Patch"}
								</span>
								{isRoot && (
									<Badge
										variant="outline"
										className="text-[10px] px-1.5 py-0 font-medium border-orange-500/30 text-orange-600 dark:text-orange-400"
									>
										root
									</Badge>
								)}
								{isRevision && (
									<Badge
										variant="outline"
										className="text-[10px] px-1.5 py-0 font-medium border-orange-500/30 text-orange-600 dark:text-orange-400"
									>
										revision
									</Badge>
								)}
							</div>
							{repoName && (
								<p className="text-xs text-muted-foreground mt-0.5 font-mono">
									{repoName}
								</p>
							)}
						</div>
					</div>

					{/* Tags */}
					{hashtags.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{hashtags
								.slice(0, preview ? 6 : hashtags.length)
								.map((tag) => (
									<span
										key={tag}
										className="text-[11px] text-muted-foreground"
									>
										#{tag}
									</span>
								))}
							{preview && hashtags.length > 6 && (
								<span className="text-[11px] text-muted-foreground/50">
									+{hashtags.length - 6} more
								</span>
							)}
						</div>
					)}

					{/* Shakespeare action */}
					{hasShakespeare && (
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							onClick={(e) => {
								e.stopPropagation();
								window.open(
									"https://shakespeare.diy",
									"_blank",
									"noopener,noreferrer",
								);
							}}
						>
							<Wand2 className="size-3" />
							Edit with Shakespeare
						</button>
					)}
				</div>
			</div>

			{/* Detail sections -- outside card, only in detail view */}

			{/* Commit metadata */}
			{!preview && (commitId || parentCommit || committerTag) && (
				<div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
					{commitId && (
						<div className="flex items-center gap-2.5 px-3.5 py-2 text-sm">
							<GitCommit className="size-3.5 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground text-xs">
								Commit
							</span>
							<code className="ml-auto text-xs font-mono text-muted-foreground">
								{commitId.slice(0, 12)}
							</code>
						</div>
					)}
					{parentCommit && (
						<div className="flex items-center gap-2.5 px-3.5 py-2 text-sm">
							<GitCommit className="size-3.5 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground text-xs">
								Parent
							</span>
							<code className="ml-auto text-xs font-mono text-muted-foreground">
								{parentCommit.slice(0, 12)}
							</code>
						</div>
					)}
					{committerTag && (
						<div className="flex items-center gap-2.5 px-3.5 py-2 text-sm">
							<User className="size-3.5 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground text-xs">
								Committer
							</span>
							<span className="ml-auto text-xs">
								{committerTag[1]}
							</span>
							{committerTag[2] && (
								<span className="text-xs text-muted-foreground">
									&lt;{committerTag[2]}&gt;
								</span>
							)}
						</div>
					)}
				</div>
			)}

			{/* Commit message */}
			{!preview && commitMessage && (
				<div className="rounded-2xl border border-border overflow-hidden px-3.5 py-3">
					<p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
						{commitMessage}
					</p>
				</div>
			)}

			{/* Diff */}
			{!preview && diff && (
				<div className="rounded-2xl border border-border overflow-hidden">
					<div className="overflow-x-auto">
						<pre className="px-3.5 py-3 text-xs font-mono leading-relaxed">
							{diff.split("\n").map((line, i) => {
								let lineClass = "text-muted-foreground";
								if (
									line.startsWith("+") &&
									!line.startsWith("+++")
								)
									lineClass =
										"text-green-700 dark:text-green-400 bg-green-500/5";
								else if (
									line.startsWith("-") &&
									!line.startsWith("---")
								)
									lineClass =
										"text-red-700 dark:text-red-400 bg-red-500/5";
								else if (line.startsWith("@@"))
									lineClass =
										"text-blue-700 dark:text-blue-400 bg-blue-500/5";
								else if (line.startsWith("diff --git"))
									lineClass =
										"text-foreground font-semibold mt-2 first:mt-0";
								return (
									// biome-ignore lint/suspicious/noArrayIndexKey: diff lines are static and never reorder
									<div key={i} className={lineClass}>
										{line}
									</div>
								);
							})}
						</pre>
					</div>
				</div>
			)}
		</div>
	);
}
