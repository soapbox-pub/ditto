import type { NostrEvent } from "@nostrify/nostrify";
import { FileCode, Wand2 } from "lucide-react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

interface CustomNipCardProps {
	event: NostrEvent;
	/** If true, show a truncated preview instead of the full NIP content. Defaults to true. */
	preview?: boolean;
}

/** Extracts the first meaningful paragraph from markdown content. */
function extractFirstParagraph(
	content: string,
	maxLength: number = 200,
): string {
	if (!content) return "";

	const lines = content
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	for (const line of lines) {
		// Skip markdown headers, rules, code fences, lists, blockquotes
		if (line.startsWith("#")) continue;
		if (line.match(/^[-*_]{3,}$/)) continue;
		if (line.startsWith("```")) continue;
		if (line.match(/^[-*+]\s/)) continue;
		if (line.match(/^\d+\.\s/)) continue;
		if (line.startsWith(">")) continue;

		if (line.length > 10) {
			const cleaned = line
				.replace(/\*\*(.*?)\*\*/g, "$1")
				.replace(/\*(.*?)\*/g, "$1")
				.replace(/`(.*?)`/g, "$1")
				.replace(/\[(.*?)\]\(.*?\)/g, "$1")
				.trim();

			if (cleaned.length > maxLength) {
				const truncated = cleaned.slice(0, maxLength);
				const lastSpace = truncated.lastIndexOf(" ");
				return `${
					lastSpace > maxLength * 0.7
						? truncated.slice(0, lastSpace)
						: truncated
				}...`;
			}
			return cleaned;
		}
	}

	const fallback = content.replace(/\n/g, " ").trim();
	return fallback.length > maxLength
		? `${fallback.slice(0, maxLength).trim()}...`
		: fallback;
}

/** Renders a NostrHub kind 30817 custom NIP proposal card (NostrHub-style). */
export function CustomNipCard({ event, preview = true }: CustomNipCardProps) {
	const title = event.tags.find(([n]) => n === "title")?.[1];
	const dTag = event.tags.find(([n]) => n === "d")?.[1] ?? "";
	const relatedKinds = event.tags.filter(([n]) => n === "k").map(([, v]) => v);
	const hasShakespeare = event.tags.some(
		([n, v]) => n === "t" && v === "shakespeare",
	);
	const contentPreview = preview
		? extractFirstParagraph(event.content, 200)
		: "";

	const displayTitle = title || `NIP: ${dTag}`;

	return (
		<div className="mt-2 space-y-3">
			{/* Card container */}
			<div className="rounded-2xl border border-border overflow-hidden">
				<div className="px-3.5 py-3 space-y-2">
					{/* Title */}
					<div className="flex items-start gap-2.5">
						<FileCode className="size-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
						<div className="min-w-0 flex-1">
							<span className="font-semibold text-sm leading-snug">
								{displayTitle}
							</span>
							{preview && contentPreview && (
								<p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-3 leading-relaxed">
									{contentPreview}
								</p>
							)}
						</div>
					</div>

					{/* Related Kinds */}
					{relatedKinds.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{relatedKinds
								.slice(0, preview ? 6 : relatedKinds.length)
								.map((k) => (
									<span
										key={k}
										className="text-[11px] font-mono text-muted-foreground"
									>
										Kind {k}
									</span>
								))}
							{preview && relatedKinds.length > 6 && (
								<span className="text-[11px] text-muted-foreground/50">
									+{relatedKinds.length - 6} more
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

			{/* Full markdown content -- detail view only, outside card */}
			{!preview && event.content && (
				<div className="rounded-2xl border border-border overflow-hidden px-3.5 py-3">
					<div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg">
						<Markdown rehypePlugins={[rehypeSanitize]}>
							{event.content}
						</Markdown>
					</div>
				</div>
			)}
		</div>
	);
}
