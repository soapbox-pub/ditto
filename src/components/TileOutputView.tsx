import type { ImageUploadNode, InputNode, TileOutput } from '@soapbox.pub/nostr-canvas';
import { decodeQrHandle, isQrHandle } from '@soapbox.pub/nostr-canvas';
import { useNostrCanvas } from '@soapbox.pub/nostr-canvas/react';
import { useRef, useState } from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { QRCodeCanvas } from '@/components/ui/qrcode';
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
      if (isQrHandle(node.url)) {
        const qrPayload = decodeQrHandle(node.url);
        if (qrPayload === null) return null;
        return (
          <div className={cn(node.avatar && 'size-10 rounded-full overflow-hidden')} style={{ maxWidth: node.max_width, maxHeight: node.max_height }}>
            <QRCodeCanvas value={qrPayload} className="max-w-full rounded-md object-contain" />
          </div>
        );
      }
      const url = sanitizeUrl(node.url);
      return url ? <img src={url} alt="Tile image" className={cn('max-w-full rounded-md object-contain', node.avatar && 'size-10 rounded-full')} style={{ maxWidth: node.max_width, maxHeight: node.max_height }} /> : <UnsupportedTileFeature />;
    }
    case 'button': {
      const handler = node.onclick;
      return <Button type={node.submit_form && inForm ? 'submit' : 'button'} variant={node.variant === 'danger' ? 'destructive' : node.variant === 'ghost' ? 'ghost' : 'default'} data-canvas-handler={handler} onClick={node.submit_form && inForm ? undefined : handler ? () => onInput?.(handler, asPayload(node.payload)) : undefined}>{node.text}</Button>;
    }
    case 'divider':
      return <Separator />;
    case 'color':
      return <span className="font-mono text-xs text-muted-foreground">{node.hex}</span>;
    case 'form':
      return <TileForm node={node} onInput={onInput} />;
    case 'input':
      return <TileInput node={node} />;
    case 'dropdown':
      return <label className="grid gap-1 text-sm"><span>{node.label}</span><select name={node.name} defaultValue={node.default_value} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{node.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
    case 'checkbox':
      return <label className="flex items-center gap-2 text-sm"><input name={node.name} type={node.radio ? 'radio' : 'checkbox'} value={node.radio} defaultChecked={node.default_value} />{node.label}</label>;
    case 'color_picker':
      return <label className="grid gap-1 text-sm"><span>{node.label}</span><Input name={node.name} type="color" defaultValue={toColorValue(node.default_value)} /></label>;
    case 'image_upload':
      return <TileImageUpload node={node} inForm={inForm} />;
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

function TileInput({ node }: { node: InputNode }) {
  const inputAttrs = inputAttrsFor(node);
  return (
    <label className="grid gap-1 text-sm">
      <span>{node.label}</span>
      <Input name={node.name} placeholder={node.placeholder} defaultValue={node.default_value} {...inputAttrs} />
    </label>
  );
}

/** Translate an input node's `input_type` hint into DOM attributes. */
function inputAttrsFor(node: InputNode): Record<string, string | boolean | undefined> {
  const inputType = node.input_type ?? 'text';
  switch (inputType) {
    case 'password':
      return { type: 'password' };
    case 'number':
      return { type: 'text', inputMode: 'numeric', autoComplete: 'off' };
    case 'bitcoin_address':
    case 'nostr_address':
      return { type: 'text', autoCapitalize: 'none', autoComplete: 'off', spellCheck: false };
    default:
      return { type: 'text' };
  }
}

function TileImageUpload({ node, inForm }: { node: ImageUploadNode; inForm?: boolean }) {
  const { runtime } = useNostrCanvas();
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  if (!inForm) {
    return (
      <div className="grid gap-1">
        {node.label && <span className="text-sm">{node.label}</span>}
        <Button type="button" variant="secondary" disabled>
          {node.text ?? 'Upload image'}
        </Button>
      </div>
    );
  }

  const handleUpload = () => {
    if (!runtime || loading) return;
    setLoading(true);
    runtime.requestImageUpload().then((uploadedUrl) => {
      if (!aliveRef.current) return;
      setUrl(sanitizeUrl(uploadedUrl) ?? '');
      setLoading(false);
    }, () => {
      if (!aliveRef.current) return;
      setLoading(false);
    });
  };

  return (
    <div className="grid gap-1">
      {node.label && <span className="text-sm">{node.label}</span>}
      <input type="hidden" name={node.name} value={url} />
      <Button type="button" variant="secondary" onClick={handleUpload} disabled={loading}>
        {node.text ?? 'Upload image'}
      </Button>
      {url && <img src={url} alt="" className="max-w-full rounded-md object-contain max-h-40" />}
    </div>
  );
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
