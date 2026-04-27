/**
 * TileView — Ditto renderer for TileOutput trees from `@soapbox.pub/nostr-canvas`.
 *
 * Two modes:
 *   - `<TileView identifier="…" />` — mount a live tile via `useTile`, apply
 *     incremental patches with a reducer, and re-render on each update.
 *   - `<TileView output={…} />` — render a static TileOutput subtree (used for
 *     debugging / storybooks / previews). Buttons in static mode are no-ops.
 *
 * Security note (see Ditto's `nostr-security` skill): TileOutput trees come
 * from sandboxed tile scripts, but the library surfaces raw strings authored
 * by Nostr users (URLs, markdown, hex colors, nip19 pointers). This file runs
 * every untrusted URL through `sanitizeUrl()` and uses `react-markdown` +
 * `rehype-sanitize` for markdown rendering instead of `dangerouslySetInnerHTML`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { nip19, type NostrEvent } from 'nostr-tools';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { ChevronDown } from 'lucide-react';

import { useNostr } from '@nostrify/react';
import { useNostrCanvas, useTile } from '@soapbox.pub/nostr-canvas/react';
import {
  applyPatches as applyPatchSeq,
  type PatchOp,
  type TileOutput,
} from '@soapbox.pub/nostr-canvas';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type TileInstanceContextValue = { tileId: string | null };

/** Flows the runtime tile ID down so buttons/forms can deliver input events. */
const TileInstanceContext = createContext<TileInstanceContextValue>({
  tileId: null,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type TileViewProps =
  | {
      identifier: string;
      placement?: string;
      props?: Record<string, unknown>;
      output?: never;
    }
  | {
      output: TileOutput;
      identifier?: never;
      placement?: never;
      props?: never;
    };

export function TileView(p: TileViewProps): ReactNode {
  if (p.output !== undefined) {
    return <TileNode node={p.output} />;
  }
  return (
    <LiveTile
      identifier={p.identifier}
      placement={p.placement}
      props={p.props}
    />
  );
}

// ---------------------------------------------------------------------------
// LiveTile — mounts a tile instance and merges full re-renders + patches.
// ---------------------------------------------------------------------------

type TileState = TileOutput | null;
type TileAction =
  | { type: 'reset'; output: TileOutput }
  | { type: 'patch'; ops: PatchOp[] };

function tileReducer(state: TileState, action: TileAction): TileState {
  if (action.type === 'reset') return action.output;
  if (!state) return state;
  return applyPatchSeq(state, action.ops);
}

function LiveTile({
  identifier,
  placement,
  props,
}: {
  identifier: string;
  placement?: string;
  props?: Record<string, unknown>;
}): ReactNode {
  const { tileId, output, patches, clearPatches } = useTile(identifier, {
    placement,
    props,
  });

  const [current, dispatch] = useReducer(tileReducer, null);

  // Re-seed from a full render. Mirrors reference TileView.tsx:60 which
  // depends on `output` only; we also include `identifier` so a consumer
  // swapping tiles gets a clean reset.
  useEffect(() => {
    if (output) dispatch({ type: 'reset', output });
  }, [identifier, output]);

  useEffect(() => {
    if (patches.length === 0) return;
    for (const ops of patches) dispatch({ type: 'patch', ops });
    clearPatches();
  }, [patches, clearPatches]);

  if (!current) {
    return <Skeleton className="h-20 w-full" />;
  }

  return (
    <TileInstanceContext.Provider value={{ tileId }}>
      <TileNode node={current} />
    </TileInstanceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stable React key for a child node — prefers its `id`, falls back to index. */
function nodeKey(child: TileOutput, i: number): string | number {
  return 'id' in child && child.id ? child.id : i;
}

/** Tailwind gap class for a TileOutput `gap` hint. */
function gapClass(g?: 'sm' | 'md' | 'lg'): string {
  if (g === 'sm') return 'gap-1';
  if (g === 'lg') return 'gap-4';
  if (g) return 'gap-2';
  return '';
}

/** Tailwind `items-*` class for a flex-alignment hint. */
function alignClass(a?: 'start' | 'center' | 'end', fallback = 'items-stretch'): string {
  if (a === 'center') return 'items-center';
  if (a === 'end') return 'items-end';
  if (a === 'start') return 'items-start';
  return fallback;
}

/** Tailwind `justify-*` class for a flex-justify hint. */
function justifyClass(j?: 'start' | 'center' | 'end' | 'between'): string {
  if (j === 'center') return 'justify-center';
  if (j === 'end') return 'justify-end';
  if (j === 'between') return 'justify-between';
  if (j === 'start') return 'justify-start';
  return '';
}

/** Parse `#rrggbb` into `{r,g,b}`. Returns null for anything else. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

/** Validate a CSS hex color. Accepts #rgb/#rgba/#rrggbb/#rrggbbaa. */
function isSafeHex(hex: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(hex.trim());
}

/**
 * Walk a form subtree and collect every `color_picker` field name.
 * Needed because NIP-mandated form payloads encode color_picker values as
 * `{r,g,b}` objects, not the raw hex string that `FormData` returns.
 */
function collectColorPickerNames(children: TileOutput[]): Set<string> {
  const names = new Set<string>();
  const walk = (nodes: TileOutput[]): void => {
    for (const node of nodes) {
      if (node.type === 'color_picker') {
        names.add(node.name);
      } else if ('children' in node && Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  };
  walk(children);
  return names;
}

/** Map TileOutput button variant → shadcn Button variant. */
function buttonVariant(
  v: 'primary' | 'danger' | 'ghost' | undefined,
): 'default' | 'destructive' | 'ghost' | 'outline' {
  if (v === 'primary') return 'default';
  if (v === 'danger') return 'destructive';
  if (v === 'ghost') return 'ghost';
  return 'outline';
}

// ---------------------------------------------------------------------------
// TileNode — recursive renderer
// ---------------------------------------------------------------------------

function TileNode({ node }: { node: TileOutput }): ReactNode {
  const { tileId } = useContext(TileInstanceContext);
  const { runtime } = useNostrCanvas();

  /** Dispatch an input event back to the tile runtime, or no-op if static. */
  function deliver(emit: string, payload: unknown): void {
    if (!tileId) return;
    runtime.deliverInputEvent(
      tileId,
      emit,
      (payload ?? {}) as Record<string, unknown>,
    );
  }

  const growClass = node.grow ? 'flex-grow' : '';

  switch (node.type) {
    case 'stack': {
      const scroll = node.scroll
        ? node.axis === 'x'
          ? 'overflow-x-auto'
          : 'overflow-y-auto'
        : '';
      const inner = (
        <div
          id={node.id}
          className={cn(
            'flex flex-col',
            gapClass(node.gap),
            alignClass(node.align, 'items-stretch'),
            justifyClass(node.justify),
            scroll,
            growClass,
          )}
        >
          {node.children.map((c, i) => (
            <TileNode key={nodeKey(c, i)} node={c} />
          ))}
        </div>
      );
      return node.surface ? <Card className="p-3">{inner}</Card> : inner;
    }

    case 'row': {
      const scroll = node.scroll ? 'overflow-x-auto' : '';
      const inner = (
        <div
          id={node.id}
          className={cn(
            'flex flex-row',
            gapClass(node.gap),
            alignClass(node.align, 'items-start'),
            justifyClass(node.justify),
            scroll,
            growClass,
          )}
        >
          {node.children.map((c, i) => (
            <TileNode key={nodeKey(c, i)} node={c} />
          ))}
        </div>
      );
      return node.surface ? <Card className="p-3">{inner}</Card> : inner;
    }

    case 'spoiler':
      return (
        <Collapsible defaultOpen={node.open}>
          <div id={node.id} className={cn(growClass)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 font-medium text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                <ChevronDown className="size-4 transition-transform data-[state=closed]:-rotate-90" />
                <span>{node.title}</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div
                className={cn(
                  'flex flex-col gap-2',
                  alignClass(node.align, 'items-stretch'),
                  justifyClass(node.justify),
                )}
              >
                {node.children.map((c, i) => (
                  <TileNode key={nodeKey(c, i)} node={c} />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      );

    case 'text':
      return renderTextNode(node, growClass);

    case 'markdown':
      return (
        <div id={node.id} className={cn('prose prose-sm dark:prose-invert max-w-none', growClass)}>
          <Markdown rehypePlugins={[rehypeSanitize]}>{node.content}</Markdown>
        </div>
      );

    case 'image': {
      const src = sanitizeUrl(node.url);
      if (!src) return null;
      const style: React.CSSProperties = {};
      if (node.avatar) {
        const size = node.max_width ?? node.max_height ?? 40;
        style.width = size;
        style.height = size;
      } else {
        if (node.max_width) style.maxWidth = node.max_width;
        if (node.max_height) style.maxHeight = node.max_height;
      }
      return (
        <img
          id={node.id}
          src={src}
          alt=""
          style={style}
          className={cn(
            node.avatar ? 'rounded-full object-cover' : 'max-w-full h-auto',
            growClass,
          )}
        />
      );
    }

    case 'button':
      return (
        <Button
          id={node.id}
          title={node.title}
          type="button"
          variant={buttonVariant(node.variant)}
          onClick={() =>
            node.onclick && deliver(node.onclick.emit, node.onclick.payload)
          }
          className={cn(growClass)}
        >
          {node.text}
        </Button>
      );

    case 'divider':
      return (
        <div id={node.id} className={cn(growClass)}>
          <Separator />
        </div>
      );

    case 'color':
      if (!isSafeHex(node.hex)) {
        return (
          <span id={node.id} title={node.hex} className="text-xs font-mono">
            {node.hex}
          </span>
        );
      }
      return (
        <span
          id={node.id}
          title={node.hex}
          className="inline-block size-4 rounded-sm border border-border/50 shrink-0"
          style={{ backgroundColor: node.hex }}
        />
      );

    case 'nevent':
      return (
        <NEventCard
          id={node.id}
          nip19str={node.nip19}
          className={growClass}
        />
      );

    case 'embedded': {
      const inner = (
        <TileView
          identifier={node.identifier}
          props={node.props as Record<string, unknown> | undefined}
          placement="widget"
        />
      );
      if (node.onclick) {
        const { emit, payload } = node.onclick;
        return (
          <div
            id={node.id}
            onClick={() => deliver(emit, payload)}
            role="button"
            tabIndex={0}
            className={cn('cursor-pointer', growClass)}
          >
            {inner}
          </div>
        );
      }
      return (
        <div id={node.id} className={cn(growClass)}>
          {inner}
        </div>
      );
    }

    case 'form':
      return <FormNode node={node} tileId={tileId} />;

    case 'input':
      return (
        <div id={node.id} className={cn('flex flex-col gap-1', growClass)}>
          {node.label && (
            <label className="text-sm text-muted-foreground">{node.label}</label>
          )}
          <Input
            name={node.name}
            placeholder={node.placeholder}
            defaultValue={node.default_value}
            type={node.hidden ? 'password' : 'text'}
          />
        </div>
      );

    case 'dropdown':
      return (
        <div id={node.id} className={cn('flex flex-col gap-1', growClass)}>
          {node.label && (
            <label className="text-sm text-muted-foreground">{node.label}</label>
          )}
          <select
            name={node.name}
            defaultValue={node.default_value}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {node.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'checkbox':
      // Inside a radio group → render a native radio input.
      if (node.radio) {
        return (
          <label
            id={node.id}
            className={cn('flex items-center gap-2 cursor-pointer', growClass)}
          >
            <input
              type="radio"
              name={node.radio}
              value={node.name}
              defaultChecked={node.default_value}
              className="accent-primary size-4"
            />
            {node.label && <span className="text-sm">{node.label}</span>}
          </label>
        );
      }
      // Standalone non-form context → use the shadcn Checkbox (Radix).
      // But inside a <form> Radix doesn't participate in FormData. To keep
      // form extraction trivial the reference uses a plain <input>; we do too.
      // We keep the shadcn Checkbox available as a dead-code reference.
      void Checkbox;
      return (
        <label
          id={node.id}
          className={cn('flex items-center gap-2 cursor-pointer', growClass)}
        >
          <input
            type="checkbox"
            name={node.name}
            defaultChecked={node.default_value}
            className="accent-primary size-4"
          />
          {node.label && <span className="text-sm">{node.label}</span>}
        </label>
      );

    case 'color_picker':
      return (
        <div id={node.id} className={cn('flex flex-col gap-1', growClass)}>
          {node.label && (
            <label className="text-sm text-muted-foreground">{node.label}</label>
          )}
          <input
            type="color"
            name={node.name}
            defaultValue={node.default_value ?? '#000000'}
            className="h-10 w-16 rounded-md border border-input bg-background cursor-pointer"
          />
        </div>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Text node renderer
// ---------------------------------------------------------------------------

/** Render a `text` node with all its style variants + optional markdown. */
function renderTextNode(
  node: Extract<TileOutput, { type: 'text' }>,
  growClass: string,
): ReactNode {
  // Badge branch — render as shadcn <Badge> with mapped variant.
  if (node.badge) {
    const variant =
      node.variant === 'danger'
        ? 'destructive'
        : node.variant === 'muted'
          ? 'secondary'
          : 'default';
    return (
      <Badge
        id={node.id}
        title={node.title}
        variant={variant}
        className={cn(growClass)}
      >
        {node.md ? (
          <Markdown
            rehypePlugins={[rehypeSanitize]}
            components={{ p: ({ children }) => <span>{children}</span> }}
          >
            {node.text}
          </Markdown>
        ) : (
          node.text
        )}
      </Badge>
    );
  }

  const variantClass =
    node.variant === 'accent'
      ? 'text-primary'
      : node.variant === 'muted'
        ? 'text-muted-foreground'
        : node.variant === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : node.variant === 'warning'
            ? 'text-amber-600 dark:text-amber-400'
            : node.variant === 'danger'
              ? 'text-destructive'
              : '';

  const sizeClass =
    node.text_size === 1 ? 'text-xs' : node.text_size === 3 ? 'text-lg' : 'text-sm';

  const styleClass =
    node.style === 'bold' ? 'font-semibold' : node.style === 'italic' ? 'italic' : '';

  const truncateClass = node.truncate ? 'truncate min-w-0' : '';

  return (
    <span
      id={node.id}
      title={node.title}
      className={cn(variantClass, sizeClass, styleClass, truncateClass, growClass)}
    >
      {node.md ? (
        <Markdown
          rehypePlugins={[rehypeSanitize]}
          components={{ p: ({ children }) => <span>{children}</span> }}
        >
          {node.text}
        </Markdown>
      ) : (
        node.text
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FormNode — collects field values on any submit_form button click.
// ---------------------------------------------------------------------------

function FormNode({
  node,
  tileId,
}: {
  node: Extract<TileOutput, { type: 'form' }>;
  tileId: string | null;
}): ReactNode {
  const { runtime } = useNostrCanvas();
  const formRef = useRef<HTMLFormElement>(null);
  const colorPickerNames = collectColorPickerNames(node.children);

  function submitForm(emit: string, buttonPayload: unknown): void {
    if (!tileId || !formRef.current) return;
    const data = new FormData(formRef.current);
    const fields: Record<string, unknown> = {};
    data.forEach((v, k) => {
      if (colorPickerNames.has(k) && typeof v === 'string') {
        // NIP requires color_picker values as {r,g,b}, not hex strings.
        fields[k] = hexToRgb(v) ?? v;
      } else {
        fields[k] = v;
      }
    });
    const payload = {
      ...fields,
      ...((buttonPayload as Record<string, unknown> | undefined) ?? {}),
    };
    runtime.deliverInputEvent(tileId, emit, payload);
  }

  return (
    <form
      ref={formRef}
      id={node.id}
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-3"
    >
      {node.children.map((child, i) => {
        const k = nodeKey(child, i);
        // Submit buttons collect field values via FormData before delivering.
        if (
          child.type === 'button' &&
          child.onclick &&
          child.submit_form
        ) {
          const { emit, payload } = child.onclick;
          return (
            <Button
              key={k}
              id={child.id}
              title={child.title}
              type="button"
              variant={buttonVariant(child.variant)}
              onClick={() => submitForm(emit, payload)}
              className={cn(child.grow ? 'flex-grow' : '')}
            >
              {child.text}
            </Button>
          );
        }
        return <TileNode key={k} node={child} />;
      })}
    </form>
  );
}

// ---------------------------------------------------------------------------
// NEventCard — fetches a Nostr event by its nip19 pointer, renders a NoteCard.
// ---------------------------------------------------------------------------

function NEventCard({
  id,
  nip19str,
  className,
}: {
  id?: string;
  nip19str: string;
  className?: string;
}): ReactNode {
  const { nostr } = useNostr();
  const [event, setEvent] = useState<NostrEvent | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setEvent(null);
    setMissing(false);

    let eventId: string | null = null;
    try {
      const decoded = nip19.decode(nip19str);
      if (decoded.type === 'note') eventId = decoded.data;
      else if (decoded.type === 'nevent') eventId = decoded.data.id;
    } catch {
      setMissing(true);
      return;
    }

    if (!eventId) {
      setMissing(true);
      return;
    }

    const controller = new AbortController();
    nostr
      .query([{ ids: [eventId], limit: 1 }], { signal: controller.signal })
      .then((evts) => {
        if (controller.signal.aborted) return;
        if (evts[0]) setEvent(evts[0]);
        else setMissing(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMissing(true);
      });

    return () => controller.abort();
  }, [nostr, nip19str]);

  if (missing) {
    return (
      <div
        id={id}
        className={cn(
          'text-xs font-mono text-muted-foreground bg-muted rounded-md px-2 py-1',
          className,
        )}
      >
        {nip19str.slice(0, 16)}…
      </div>
    );
  }

  if (!event) {
    return <Skeleton className={cn('h-16 w-full rounded-md', className)} />;
  }

  return (
    <div id={id} className={cn(className)}>
      <NoteCard event={event} compact />
    </div>
  );
}
