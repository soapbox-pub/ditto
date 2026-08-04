import { useEffect, useState } from 'react';
import { Sparkles, X, ChevronDown } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'ditto:marketplace-nag-dismissed';

export function MarketplaceNag() {
  const intl = useIntl();
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed === '1') setHidden(true);
  }, []);

  const dismiss = () => {
    setHidden(true);
    localStorage.setItem(STORAGE_KEY, '1');
  };

  if (hidden) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-40 mx-auto w-full max-w-md px-4"
    >
      <div className="rounded-xl border bg-card text-card-foreground shadow-lg">
        <div className="flex items-start gap-3 px-4 py-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              <FormattedMessage id="widgets.nag.title" defaultMessage="New: Widget marketplace" />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <FormattedMessage
                id="widgets.nag.body"
                defaultMessage="Browse and install community widgets to customise your feed."
              />
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={intl.formatMessage({
              id: 'widgets.nag.dismiss',
              defaultMessage: 'Dismiss widget marketplace notice',
            })}
            onClick={dismiss}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="border-t px-4">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <FormattedMessage id="widgets.nag.learnMore" defaultMessage="Learn more" />
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform motion-safe:duration-200',
                expanded && 'rotate-180',
              )}
            />
          </button>
          <div
            className={cn(
              'grid motion-safe:transition-all motion-safe:duration-200',
              expanded ? 'grid-rows-[1fr] pb-3' : 'grid-rows-[0fr]',
            )}
          >
            <div className="overflow-hidden">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <FormattedMessage
                  id="widgets.nag.disclaimer"
                  defaultMessage="Widgets are user-contributed content — they are not part of Ditto and not made by Soapbox. Exercise caution when installing and granting permissions."
                />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}