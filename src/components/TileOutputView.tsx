import type { TileOutput } from '@soapbox.pub/nostr-canvas';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface TileOutputViewProps {
  output: TileOutput;
  tileId?: string;
  onInput?: (handler: string, payload?: Record<string, unknown>) => void;
}

/** Renders a tile's declarative output using Ditto-owned UI primitives. */
export function TileOutputView(_props: TileOutputViewProps) {
  return <TileNode node={_props.output} onInput={_props.onInput} />;
}

function TileNode({ node, onInput, inForm = false }: { node: TileOutput; onInput?: TileOutputViewProps['onInput']; inForm?: boolean }) {
  switch (node.type) {
    case 'stack':
      return <TileLayout node={node} onInput={onInput} />;
    case 'row':
      return <TileLayout node={node} onInput={onInput} row />;
    case 'spoiler':
      return (
        <Collapsible defaultOpen={node.open}>
          <CollapsibleTrigger className="text-sm font-medium">{node.title}</CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">{node.children.map((child, index) => <TileNode key={child.id ?? index} node={child} onInput={onInput} />)}</CollapsibleContent>
        </Collapsible>
      );
    case 'text':
      return node.md ? <TileMarkdown content={node.text} /> : <p title={node.title} className={cn('text-sm whitespace-pre-wrap break-words', node.style === 'bold' && 'font-semibold', node.style === 'italic' && 'italic', node.variant === 'muted' && 'text-muted-foreground', node.truncate && 'truncate')}>{node.text}</p>;
    case 'markdown':
      return <TileMarkdown content={node.content} />;
    case 'image': {
      const url = sanitizeUrl(node.url);
      return url ? <img src={url} alt="Tile image" className={cn('max-w-full rounded-md object-contain', node.avatar && 'size-10 rounded-full')} style={{ maxWidth: node.max_width, maxHeight: node.max_height }} /> : <UnsupportedTileFeature />;
    }
    case 'button':
      return <Button type={node.submit_form && inForm ? 'submit' : 'button'} variant={node.variant === 'danger' ? 'destructive' : node.variant === 'ghost' ? 'ghost' : 'default'} data-canvas-handler={node.onclick} onClick={node.submit_form && inForm ? undefined : () => onInput?.(node.onclick, asPayload(node.payload))}>{node.text}</Button>;
    case 'divider':
      return <Separator />;
    case 'color':
      return <span className="font-mono text-xs text-muted-foreground">{node.hex}</span>;
    case 'form':
      return <TileForm node={node} onInput={onInput} />;
    case 'input':
      return <label className={cn('grid gap-1 text-sm', node.hidden && 'hidden')}><span>{node.label}</span><Input name={node.name} placeholder={node.placeholder} defaultValue={node.default_value} /></label>;
    case 'dropdown':
      return <label className="grid gap-1 text-sm"><span>{node.label}</span><select name={node.name} defaultValue={node.default_value} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{node.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
    case 'checkbox':
      return <label className="flex items-center gap-2 text-sm"><input name={node.name} type={node.radio ? 'radio' : 'checkbox'} value={node.radio} defaultChecked={node.default_value} />{node.label}</label>;
    case 'color_picker':
      return <label className="grid gap-1 text-sm"><span>{node.label}</span><Input name={node.name} type="color" defaultValue={toColorValue(node.default_value)} /></label>;
    case 'image_upload':
      return <p className="text-sm text-muted-foreground">{node.label ?? node.text ?? 'Image upload is not supported yet.'}</p>;
    case 'feed':
    case 'comments':
    case 'nevent':
      return <UnsupportedTileFeature />;
  }
}

function TileLayout({ node, onInput, row = false }: { node: Extract<TileOutput, { type: 'stack' | 'row' }>; onInput?: TileOutputViewProps['onInput']; row?: boolean }) {
  const content = <div className={cn(row ? 'flex flex-row' : 'flex flex-col', node.grow && 'flex-1', node.gap === 'sm' ? 'gap-2' : node.gap === 'lg' ? 'gap-6' : 'gap-4', node.align === 'center' && 'items-center', node.align === 'end' && 'items-end', node.justify === 'center' && 'justify-center', node.justify === 'end' && 'justify-end', node.justify === 'between' && 'justify-between', node.scroll && (row ? 'overflow-x-auto' : 'overflow-y-auto'))}>{node.children.map((child, index) => <TileNode key={child.id ?? index} node={child} onInput={onInput} />)}</div>;
  return node.surface ? <Card><CardContent className="p-3">{content}</CardContent></Card> : content;
}

function TileForm({ node, onInput }: { node: Extract<TileOutput, { type: 'form' }>; onInput?: TileOutputViewProps['onInput'] }) {
  return <form className="grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    const submitter = event.nativeEvent.submitter;
    if (!(submitter instanceof HTMLElement)) return;
    const handler = submitter.dataset.canvasHandler;
    if (!handler) return;
    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(data.entries());
    for (const checkbox of event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) payload[checkbox.name] = checkbox.checked;
    onInput?.(handler, payload);
  }}>{node.children.map((child, index) => <TileNode key={child.id ?? index} node={child} onInput={onInput} inForm />)}</form>;
}

function TileMarkdown({ content }: { content: string }) {
  return <div className="prose prose-sm max-w-none break-words dark:prose-invert"><Markdown rehypePlugins={[rehypeSanitize]} components={{ a: ({ href, children }) => {
    const url = sanitizeUrl(href);
    return url ? <a href={url} rel="noreferrer">{children}</a> : <span>{children}</span>;
  } }}>{content}</Markdown></div>;
}

function UnsupportedTileFeature() {
  return <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">This tile feature is not supported yet.</p>;
}

function asPayload(payload: unknown): Record<string, unknown> | undefined {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : undefined;
}

function toColorValue(color: { r: number; g: number; b: number } | undefined): string | undefined {
  if (!color) return undefined;
  return `#${[color.r, color.g, color.b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`;
}
