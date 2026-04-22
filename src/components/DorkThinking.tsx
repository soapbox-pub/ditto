import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const DORK_ANIMATION = [
  '<[o_o]>',
  '>[-_-]<',
  '<[0_0]>',
  '>[-_-]<',
];

/** Animated Dork face shown while the AI is thinking. */
export function DorkThinking({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % DORK_ANIMATION.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <pre className={cn('font-mono text-muted-foreground leading-none', className)}>{DORK_ANIMATION[frame]}</pre>
  );
}
