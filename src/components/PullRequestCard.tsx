import type { NostrEvent } from "@nostrify/nostrify";
import {
	Copy,
	GitBranch,
	GitCommit,
	GitPullRequest,
	Wand2,
} from "lucide-react";
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
	const cloneUrls = event.tags.filter(([n]) => n === "clone").map(([, v]) => v);
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

	const handleCopy = (url: string) => {
		navigator.clipboard.writeText(url);
	};

	const shakespeareUrl = cloneUrls[0]
		? `https://shakespeare.diy/clone?url=${encodeURIComponent(cloneUrls[0])}`
		: "https://shakespeare.diy";

	return (
		<div className="space-y-3 mt-1">
			{/* Title + branch info */}
			<div className="flex items-start gap-2">
				<GitPullRequest className="size-5 text-green-500 shrink-0 mt-0.5" />
				<div className="min-w-0 flex-1">
					<span className="font-semibold text-base leading-tight line-clamp-2">
						{title}
					</span>
					<div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
						{repoName && <span>{repoName}</span>}
						{repoName && branchName && (
							<span className="text-muted-foreground/50">/</span>
						)}
						{branchName && (
							<Badge
								variant="secondary"
								className="text-xs font-mono px-2 py-0"
							>
								{branchName}
							</Badge>
						)}
					</div>
				</div>
			</div>

			{/* Branch & commit metadata — detail view only */}
			{!preview && (commitTip || mergeBase || branchName) && (
				<div className="space-y-2">
					{branchName && (
						<div className="flex items-center gap-2 text-sm">
							<GitBranch className="size-4 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground">Branch</span>
							<code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
								{branchName}
							</code>
						</div>
					)}
					{commitTip && (
						<div className="flex items-center gap-2 text-sm">
							<GitCommit className="size-4 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground">Tip</span>
							<code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
								{commitTip.slice(0, 12)}
							</code>
						</div>
					)}
					{mergeBase && (
						<div className="flex items-center gap-2 text-sm">
							<GitCommit className="size-4 text-muted-foreground shrink-0" />
							<span className="text-muted-foreground">Base</span>
							<code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
								{mergeBase.slice(0, 12)}
							</code>
						</div>
					)}
				</div>
			)}

			{/* PR description — detail view only, rendered as markdown */}
			{!preview && hasDescription && (
				<div className="space-y-1.5">
					<h4 className="text-sm font-medium text-muted-foreground">
						Description
					</h4>
					<div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg">
						<Markdown rehypePlugins={[rehypeSanitize]}>
							{event.content}
						</Markdown>
					</div>
				</div>
			)}

			{/* Labels section */}
			{labels.length > 0 && (
				<div className="space-y-1.5">
					<h4 className="text-sm font-medium text-muted-foreground">Labels</h4>
					<div className="flex flex-wrap gap-1.5">
						{labels.slice(0, preview ? 6 : labels.length).map((label) => (
							<Badge key={label} variant="secondary" className="text-xs">
								{label}
							</Badge>
						))}
						{preview && labels.length > 6 && (
							<Badge
								variant="outline"
								className="text-xs text-muted-foreground"
							>
								+{labels.length - 6} more
							</Badge>
						)}
					</div>
				</div>
			)}

			{/* Clone URL section */}
			{cloneUrls[0] && (
				<div className="space-y-1.5">
					<h4 className="text-sm font-medium text-muted-foreground">Clone</h4>
					<div className="flex items-center gap-2">
						<code className="flex-1 bg-muted px-2.5 py-1.5 rounded-md text-xs font-mono truncate">
							{cloneUrls[0]}
						</code>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 w-7 p-0 shrink-0"
							onClick={(e) => {
								e.stopPropagation();
								handleCopy(cloneUrls[0]);
							}}
						>
							<Copy className="size-3.5" />
						</Button>
					</div>
				</div>
			)}

			{/* Action buttons */}
			<div className="flex flex-wrap gap-2 pt-1">
				{hasShakespeare && (
					<button
						type="button"
						className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
						onClick={(e) => {
							e.stopPropagation();
							window.open(shakespeareUrl, "_blank", "noopener,noreferrer");
						}}
					>
						<Wand2 className="size-4" />
						Edit with Shakespeare
					</button>
				)}
				{!hasShakespeare && cloneUrls[0] && (
					<button
						type="button"
						className="flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium hover:bg-secondary/60 transition-colors"
						onClick={(e) => {
							e.stopPropagation();
							handleCopy(cloneUrls[0]);
						}}
					>
						<Copy className="size-4" />
						Copy Clone URL
					</button>
				)}
			</div>
		</div>
	);
}
