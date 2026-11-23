import { useRef, useState } from 'react';
import { ChevronDown, Clock, Flame, TrendingUp } from 'lucide-react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { TabButton } from '@/components/TabButton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDiscoverSort } from '@/hooks/useDiscoverSort';
import type { DiscoverSort } from '@/lib/discoverNetwork';
import { DISCOVER_TAB_ICON } from '@/lib/tabIcons';
import { cn } from '@/lib/utils';

const messages = defineMessages({
  label: { id: 'feed.discoverSort.label', defaultMessage: 'Sort Discover' },
  hot: { id: 'feed.discoverSort.hot', defaultMessage: 'Hot' },
  hotDescription: { id: 'feed.discoverSort.hotDescription', defaultMessage: "What's been popular lately" },
  rising: { id: 'feed.discoverSort.rising', defaultMessage: 'Rising' },
  risingDescription: { id: 'feed.discoverSort.risingDescription', defaultMessage: 'Catching on right now' },
  latest: { id: 'feed.discoverSort.latest', defaultMessage: 'Latest' },
  latestDescription: { id: 'feed.discoverSort.latestDescription', defaultMessage: 'Newest posts first' },
});

const OPTIONS: Record<DiscoverSort, { label: MessageDescriptor; description: MessageDescriptor; icon: typeof Flame }> = {
  hot: { label: messages.hot, description: messages.hotDescription, icon: Flame },
  rising: { label: messages.rising, description: messages.risingDescription, icon: TrendingUp },
  latest: { label: messages.latest, description: messages.latestDescription, icon: Clock },
};

/** Discover's compass, with the current sort's icon as a badge on its corner. */
function DiscoverSortIcon({ sort, className, badgeClassName }: { sort: DiscoverSort; className?: string; badgeClassName?: string }) {
  const Badge = OPTIONS[sort].icon;
  return (
    <span className="relative inline-flex shrink-0" aria-hidden>
      <DISCOVER_TAB_ICON className={className} />
      <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-background p-px">
        <Badge className={badgeClassName} strokeWidth={3} />
      </span>
    </span>
  );
}

/**
 * Props for a menu trigger and its content so that a menu opened by a tap
 * doesn't hand focus back to the trigger on close, which would draw a focus
 * outline on it. Opened from the keyboard, focus still returns.
 */
function useTapMenuFocus() {
  const openedByPointer = useRef(false);
  return {
    triggerProps: {
      onPointerDown: () => { openedByPointer.current = true; },
      onKeyDown: () => { openedByPointer.current = false; },
    },
    onCloseAutoFocus: (event: Event) => {
      if (openedByPointer.current) event.preventDefault();
    },
  };
}

interface DiscoverSortMenuContentProps {
  sort: DiscoverSort;
  onSortChange: (sort: DiscoverSort) => void;
  onCloseAutoFocus: (event: Event) => void;
}

function DiscoverSortMenuContent({ sort, onSortChange, onCloseAutoFocus }: DiscoverSortMenuContentProps) {
  const intl = useIntl();

  return (
    <DropdownMenuContent align="center" className="w-60" aria-label={intl.formatMessage(messages.label)} onCloseAutoFocus={onCloseAutoFocus}>
      <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onSortChange(value as DiscoverSort)}>
        {(Object.keys(OPTIONS) as DiscoverSort[]).map((value) => {
          const { label, description, icon: Icon } = OPTIONS[value];
          return (
            <DropdownMenuRadioItem key={value} value={value} className="gap-3 py-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex flex-col">
                <span className="font-medium"><FormattedMessage {...label} /></span>
                <span className="text-xs text-muted-foreground"><FormattedMessage {...description} /></span>
              </span>
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  );
}

interface DiscoverTabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

/**
 * The Discover tab of a feed whose Discover can be sorted. Picking the tab
 * works like any other; tapping it again opens the sort menu. While it's
 * selected, the tab shows the compass with the current sort's badge, and a
 * chevron.
 */
export function DiscoverTabButton({ label, active, onClick }: DiscoverTabButtonProps) {
  const intl = useIntl();
  const [sort, setSort] = useDiscoverSort();
  const [open, setOpen] = useState(false);
  const { triggerProps, onCloseAutoFocus } = useTapMenuFocus();

  return (
    // Opened only from a click on the selected tab, so picking the tab
    // doesn't also open the menu.
    <DropdownMenu open={open} onOpenChange={(next) => { if (!next) setOpen(false); }}>
      <DropdownMenuTrigger asChild>
        <TabButton
          label={label}
          active={active}
          onClick={onClick}
          onActiveClick={() => setOpen(true)}
          {...triggerProps}
          aria-label={active ? `${label}, ${intl.formatMessage(OPTIONS[sort].label)}` : label}
        >
          {active ? (
            <span className="flex items-center justify-center gap-1.5">
              <DiscoverSortIcon sort={sort} className="size-4" badgeClassName="size-2" />
              {label}
              <ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
            </span>
          ) : label}
        </TabButton>
      </DropdownMenuTrigger>
      <DiscoverSortMenuContent sort={sort} onSortChange={setSort} onCloseAutoFocus={onCloseAutoFocus} />
    </DropdownMenu>
  );
}

/**
 * Icon button for the header of a page with a sortable Discover tab. Shown
 * only when logged out: the page is Discover alone then, with no tab to sort
 * from.
 */
export function DiscoverSortButton() {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const [sort, setSort] = useDiscoverSort();
  const { triggerProps, onCloseAutoFocus } = useTapMenuFocus();

  if (user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full text-muted-foreground can-hover:text-foreground"
          aria-label={`${intl.formatMessage(messages.label)}: ${intl.formatMessage(OPTIONS[sort].label)}`}
          {...triggerProps}
        >
          {/* Important sizes: Button sizes every svg inside it to size-4. */}
          <DiscoverSortIcon sort={sort} className="!size-4" badgeClassName="!size-2" />
        </Button>
      </DropdownMenuTrigger>
      <DiscoverSortMenuContent sort={sort} onSortChange={setSort} onCloseAutoFocus={onCloseAutoFocus} />
    </DropdownMenu>
  );
}
