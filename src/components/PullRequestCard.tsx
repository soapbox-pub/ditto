import type { NostrEvent } from "@nostrify/nostrify";
import {
	Copy,
	GitBranch,
	GitCommit,
	GitPullRequest,
	Wand2,
} from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PullRequestCardProps {
	event: NostrEvent;
	/** If true, show a compact preview. If false, show the full PR content. Defaults to true. */
	preview?: boolean;
}

/** Renders a NIP-34 kind 1618 pull request event card. */
export function PullRequestCard({
	event,
	preview = true,
}: PullRequestCardProps) {
	const subject = event.tags.find(([n]) => n === "subject")?.[1];
	const branchName = event.tags.find(([n]) => n === "branch-name")?.[1];
	const repoTag = event.tags.find(([n]) => n === "a")?.[1];
	const repoName = repoTag?.split(":")[2] ?? "";
	const cloneUrls = event.tags
		.filter(([n]) => n === "clone")
		.map(([, v]) => v);
	const hasShakespeare = event.tags.some(
		([n, v]) => n === "t" && v === "shakespeare",
	);
	const commitTip = event.tags.find(([n]) => n === "c")?.[1];
	const mergeBase = event.tags.find(([n]) => n === "merge-base")?.[1];
	const labels = event.tags
		.filter(([n]) => n === "t")
		.map(([, v]) => v)
		.filter((t) => t !== "shakespeare");

	const title =
		subject || event.content.split("\n")[0]?.trim() || "Pull Request";
	const hasDescription = event.content.trim().length > 0;

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
		<div className="mt-2 space-y-3">
			{/* Card container */}
			<div className="rounded-2xl border border-border overflow-hidden">
				<div className="px-3.5 py-3 space-y-2">
					{/* Title + branch info */}
					<div className="flex items-start gap-2.5">
						<GitPullRequest className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
						<div className="min-w-0 flex-1">
							<span className="font-semibold text-sm leading-snug line-clamp-2">
								{title}
							</span>
							<div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
								{repoName && (
									<span className="font-mono">{repoName}</span>
								)}
								{repoName && branchName && (
									<span className="text-muted-foreground/40">
										/
									</span>
								)}
								{branchName && (
									<Badge
										variant="secondary"
										className="text-[10px] font-mono px-1.5 py-0 border-0"
									>
										{branchName}
									</Badge>
								)}
							</div>
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

					{/* Clone URL */}
					{cloneUrls[0] && (
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
					<div className="flex flex-wrap gap-2">
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
						{!hasShakespeare && cloneUrls[0] && (
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
						)}
					</div>
				</div>
			</div>

			{/* Detail sections -- outside card, only in detail view */}

			{/* Branch & commit metadata */}
			{!preview && (commitTip || mergeBase || branchName) && (
				<div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
					{branchName && (
						<div className="flex items-center gap-2.5 px-3.5 py-2 text-sm">
							<GitBranch className="size-3.5 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground text-xs">
								Branch
							</span>
							<code className="ml-auto text-xs font-mono text-muted-foreground">
								{branchName}
							</code>
						</div>
					)}
					{commitTip && (
						<div className="flex items-center gap-2.5 px-3.5 py-2 text-sm">
							<GitCommit className="size-3.5 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground text-xs">
								Tip
							</span>
							<code className="ml-auto text-xs font-mono text-muted-foreground">
								{commitTip.slice(0, 12)}
							</code>
						</div>
					)}
					{mergeBase && (
						<div className="flex items-center gap-2.5 px-3.5 py-2 text-sm">
							<GitCommit className="size-3.5 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground text-xs">
								Base
							</span>
							<code className="ml-auto text-xs font-mono text-muted-foreground">
								{mergeBase.slice(0, 12)}
							</code>
						</div>
					)}
				</div>
			)}

			{/* PR description */}
			{!preview && hasDescription && (
			<div className="rounded-2xl border border-border overflow-hidden px-4 py-4 sidebar:px-5 sidebar:py-5">
				<div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-muted prose-pre:text-foreground prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal">
					<Markdown rehypePlugins={[rehypeSanitize]}>
						{event.content}
					</Markdown>
				</div>
			</div>
			)}
		</div>
	);
}
