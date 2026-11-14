import { usePresence } from '@/hooks/usePresence';
import { cn } from '@/lib/utils';

/** An unread dot that pops in when something arrives and shrinks away once it's read. */
export function UnreadDot({ show, className }: { show: boolean; className?: string }) {
  const { mounted, leaving } = usePresence(show, 200);
  if (!mounted) return null;
  return (
    <span
      className={cn(
        'absolute bg-primary rounded-full',
        leaving
          ? 'motion-safe:animate-out motion-safe:zoom-out-0 motion-safe:fade-out-0 motion-safe:duration-200 fill-mode-forwards'
          : 'motion-safe:animate-in motion-safe:zoom-in-0 motion-safe:duration-300',
        className,
      )}
    />
  );
}
