import { Link } from 'react-router-dom';
import { SeparatorHorizontal, ChevronDown, ChevronUp, LinkIcon, Pencil, Check } from 'lucide-react';
import { useState } from 'react';
import { sidebarItemIcon, itemPath } from '@/lib/sidebarItems';
import type { HiddenSidebarItem } from '@/hooks/useFeedSettings';
import { nip19 } from 'nostr-tools';

interface SidebarMoreMenuProps {
  editing: boolean;
  hiddenItems: HiddenSidebarItem[];
  onDoneEditing: () => void;
  onStartEditing: () => void;
  onAdd: (id: string) => void;
  onAddDivider: () => void;
  onNavigate?: () => void;
  /** Extra classes on the link text. */
  linkClassName?: string;
  /** Sidebar item ID configured as the homepage. */
  homePage?: string;
}

export function SidebarMoreMenu({
  editing, hiddenItems, onDoneEditing, onStartEditing, onAdd, onAddDivider, onNavigate, linkClassName, homePage,
}: SidebarMoreMenuProps) {
  const [expanded, setExpanded] = useState(false);
  const [linkInput, setLinkInput] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');

  const sizeClass = linkClassName ?? 'text-lg';

  const handleAddLink = () => {
    const raw = linkValue.trim();
    if (!raw) return;

    // External content: URLs
    if (raw.startsWith('https://') || raw.startsWith('http://')) {
      onAdd(raw);
      setLinkInput(false);
      setLinkValue('');
      setLinkError('');
      return;
    }

    // External content: iso3166 codes
    if (raw.startsWith('iso3166:')) {
      const code = raw.slice('iso3166:'.length);
      if (!/^[A-Za-z]{2}(-[A-Za-z0-9]+)?$/.test(code)) {
        setLinkError('Invalid country/region code');
        return;
      }
      onAdd(raw);
      setLinkInput(false);
      setLinkValue('');
      setLinkError('');
      return;
    }

    // External content: isbn
    if (raw.startsWith('isbn:')) {
      onAdd(raw);
      setLinkInput(false);
      setLinkValue('');
      setLinkError('');
      return;
    }

    // Nostr: strip "nostr:" prefix if present for validation
    const bech32 = raw.startsWith('nostr:') ? raw.slice(6) : raw;

    // Validate it's a valid NIP-19 identifier
    try {
      const decoded = nip19.decode(bech32);
      const validTypes = ['npub', 'nprofile', 'note', 'nevent', 'naddr'];
      if (!validTypes.includes(decoded.type)) {
        setLinkError('Unsupported identifier type');
        return;
      }
    } catch {
      setLinkError('Invalid identifier');
      return;
    }

    // Normalize to "nostr:" prefixed form
    const nostrUri = `nostr:${bech32}`;
    onAdd(nostrUri);
    setLinkInput(false);
    setLinkValue('');
    setLinkError('');
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <button onClick={onAddDivider} className={`flex items-center gap-4 px-3 py-3 rounded-full transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/40 bg-background/85 ${sizeClass}`}>
          <SeparatorHorizontal className="size-6" />
          <span>Add divider</span>
        </button>
        {linkInput ? (
          <div className="flex flex-col gap-1 px-4 py-2 bg-background/85 rounded-2xl">
            <div className="flex items-center gap-2">
              <LinkIcon className="size-4 text-muted-foreground shrink-0" />
              <input
                value={linkValue}
                onChange={(e) => { setLinkValue(e.target.value); setLinkError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddLink();
                  } else if (e.key === 'Escape') {
                    setLinkInput(false);
                    setLinkValue('');
                    setLinkError('');
                  }
                }}
                placeholder="URL, npub1..., iso3166:US, ..."
                className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                autoFocus
              />
            </div>
            {linkError && <p className="text-xs text-destructive pl-6">{linkError}</p>}
            <div className="flex items-center gap-1.5 pl-6">
              <button
                onClick={handleAddLink}
                className="text-xs font-medium text-primary hover:underline"
              >
                Add
              </button>
              <button
                onClick={() => { setLinkInput(false); setLinkValue(''); setLinkError(''); }}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLinkInput(true)}
            className={`flex items-center gap-4 px-3 py-3 rounded-full transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/40 bg-background/85 ${sizeClass}`}
          >
            <LinkIcon className="size-6" />
            <span>Add link</span>
          </button>
        )}
        <button onClick={onDoneEditing} className={`flex items-center gap-4 px-3 py-3 rounded-full transition-colors text-primary font-medium hover:bg-primary/10 bg-background/85 ${sizeClass}`}>
          <Check className="size-6" />
          <span>Done editing</span>
        </button>
      </div>
    );
  }

  // Non-editing mode: inline collapsible list (no popover)
  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`flex items-center gap-4 px-3 py-3 rounded-full transition-colors text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40 bg-background/85 ${sizeClass}`}
      >
        {expanded ? <ChevronUp className="size-6" /> : <ChevronDown className="size-6" />}
        <span>{expanded ? 'Less...' : 'More...'}</span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-0.5">
          {hiddenItems.map((item) => (
            <Link
              key={item.id}
              to={itemPath(item.id, undefined, homePage)}
              onClick={() => { setExpanded(false); onNavigate?.(); }}
              className={`flex items-center gap-4 px-3 py-3 rounded-full font-normal text-foreground transition-colors hover:bg-secondary/40 bg-background/85 ${sizeClass}`}
            >
              {sidebarItemIcon(item.id)}
              <span className="truncate">{item.label}</span>
            </Link>
          ))}

          {hiddenItems.length === 0 && (
            <p className={`px-3 py-3 text-muted-foreground ${sizeClass}`}>All items are in the sidebar</p>
          )}
          <button
            onClick={() => { setExpanded(false); onStartEditing(); }}
            className={`flex items-center gap-4 px-3 py-3 rounded-full transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/40 bg-background/85 ${sizeClass}`}
          >
            <Pencil className="size-6" />
            <span>Edit sidebar</span>
          </button>
        </div>
      )}
    </div>
  );
}
