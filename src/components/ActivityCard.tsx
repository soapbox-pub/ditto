import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { NostrEvent } from "@nostrify/nostrify";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmojifiedText } from "@/components/CustomEmoji";
import { ProfileHoverCard } from "@/components/ProfileHoverCard";
import { cn } from "@/lib/utils";

/* ──── Shared activity card shell for reaction / repost / zap / poll vote / follow update ──── */

export interface ActivityCardProps {
  /** The round element in the left column (icon bubble or avatar). */
  icon: ReactNode;
  /** The actor row content (avatar + name + label + timestamp). */
  actorRow: ReactNode;
  /** Optional extra content below the actor row (zap message, vote label, etc.). */
  children?: ReactNode;
  /** Optional action header rendered above the card body (e.g. "X reposted"). */
  header?: ReactNode;
  /** Threaded mode: connector line below icon, no bottom border. */
  threaded?: boolean;
  /** Last item in thread — no connector line, has bottom border. */
  threadedLast?: boolean;
  /** Custom connector line class. */
  threadedLineClassName?: string;
  className?: string;
  onClick?: React.MouseEventHandler;
  onAuxClick?: React.MouseEventHandler;
}

export function ActivityCard({
  icon,
  actorRow,
  children,
  header,
  threaded,
  threadedLast,
  threadedLineClassName,
  className,
  onClick,
  onAuxClick,
}: ActivityCardProps) {
  const isThreaded = threaded || threadedLast;
  return (
    <article
      className={cn(
        "px-4 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
        isThreaded
          ? cn("pt-3", threaded ? "pb-0" : "pb-3 border-b border-border")
          : "py-3 border-b border-border",
        className,
      )}
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      {header}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          {icon}
          {threaded && (
            <div className={cn("w-0.5 flex-1 mt-2 rounded-full", threadedLineClassName || "bg-foreground/20")} />
          )}
        </div>
        <div className={cn("flex-1 min-w-0", isThreaded ? "min-h-10 flex flex-col justify-center" : "", threaded && "pb-3")}>
          {actorRow}
          {children}
        </div>
      </div>
    </article>
  );
}

/** Reusable actor row: small avatar + display name + action label + timestamp. */
export interface ActorRowProps {
  pubkey: string;
  profileUrl: string;
  avatarShape: Parameters<typeof Avatar>[0]['shape'];
  picture?: string;
  displayName: string;
  authorEvent?: NostrEvent;
  isLoading?: boolean;
  label: string;
  /** Extra inline elements after the label (e.g. zap amount). */
  extra?: ReactNode;
  /** Formatted timestamp string (e.g. timeAgo or full date). */
  timestampLabel: string;
}

export function ActorRow({ pubkey, profileUrl, avatarShape, picture, displayName, authorEvent, isLoading, label, extra, timestampLabel }: ActorRowProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-full shrink-0" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar shape={avatarShape} className="size-6">
            <AvatarImage src={picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[8px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
      </ProfileHoverCard>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="font-semibold text-sm hover:underline truncate" onClick={(e) => e.stopPropagation()}>
          {authorEvent ? <EmojifiedText tags={authorEvent.tags}>{displayName}</EmojifiedText> : displayName}
        </Link>
      </ProfileHoverCard>
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      {extra}
      <span className="text-xs text-muted-foreground ml-auto shrink-0">{timestampLabel}</span>
    </div>
  );
}
