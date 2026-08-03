import type { JSX, ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { diffLines } from 'diff';
import { ChevronDown, Palette, Type } from 'lucide-react';

import type { ToolCall } from '@/hooks/useChatSessions';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { parseAskQuestionsData, parseQuestionsAnswerText } from '@/lib/pendingInput';

/** Markdown tool results above this length start collapsed. */
const MARKDOWN_COLLAPSE_THRESHOLD = 1200;

/**
 * Render one tool call's outcome inside a chat message. Each known tool gets
 * a tailored summary plus a collapsible detail section; anything unknown (or
 * a known tool whose payload failed to parse) falls back to pretty JSON.
 */
export function ToolCallDetails({ toolCall, previousCode }: { toolCall: ToolCall; previousCode?: string }): JSX.Element {
  switch (toolCall.name) {
    case 'set_theme':
      return <SetThemeDetails toolCall={toolCall} />;
    case 'ask_questions':
      return <AskQuestionsDetails toolCall={toolCall} />;
    case 'nak':
      return <NakDetails toolCall={toolCall} />;
    case 'read_spec':
    case 'read_examples':
    case 'fetch_nip':
    case 'search_nips':
      return <MarkdownDetails toolCall={toolCall} />;
    case 'read_code':
      return <ReadCodeDetails toolCall={toolCall} />;
    case 'write_code':
      return <WriteCodeDetails toolCall={toolCall} previousCode={previousCode} />;
    case 'edit_code':
      return <EditCodeDetails toolCall={toolCall} />;
    default:
      return <FallbackDetails toolCall={toolCall} />;
  }
}

// ─── Shared shell ───────────────────────────────────────────────────────────

/** Collapsed-by-default expander with the "Show details" trigger. */
function DetailsCollapsible({ defaultOpen = false, children }: { defaultOpen?: boolean; children: ReactNode }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="w-full">
      <CollapsibleTrigger className="group flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
        <ChevronDown className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        <FormattedMessage id="ai-chat.tool.showDetails" defaultMessage="Show details" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Monospace block for raw tool output inside an expander. */
function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-64 overflow-auto text-xs font-mono whitespace-pre-wrap break-words bg-muted/60 rounded-lg p-2">
      {children}
    </pre>
  );
}

/** Card shell wrapping a tool summary line plus its expandable detail. */
function ToolCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-2 space-y-1">
      {children}
    </div>
  );
}

// ─── set_theme ──────────────────────────────────────────────────────────────

function SetThemeDetails({ toolCall }: { toolCall: ToolCall }) {
  let parsed: {
    success?: boolean;
    error?: string;
    colors?: { background?: string; text?: string; primary?: string };
    font?: string;
  } = {};
  try {
    parsed = JSON.parse(toolCall.result ?? '{}');
  } catch {
    // Non-JSON result: treat as a failure like the original badge did.
  }

  if (parsed.success !== true) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20">
        <Palette className="size-3" />
        {parsed.error || toolCall.name}
      </span>
    );
  }

  const colors = parsed.colors;
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
      {colors && (
        <span className="flex items-center gap-0.5">
          <span className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: `hsl(${colors.background})` }} />
          <span className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: `hsl(${colors.text})` }} />
          <span className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: `hsl(${colors.primary})` }} />
        </span>
      )}
      <FormattedMessage id="ai-chat.themeApplied" defaultMessage="Theme applied" />
      {parsed.font && (
        <span className="inline-flex items-center gap-0.5 opacity-80">
          <Type className="size-2.5" />
          {parsed.font}
        </span>
      )}
    </span>
  );
}

// ─── ask_questions ──────────────────────────────────────────────────────────

/** Historical answers are read-only text; the live answer flow is the PendingQuestionsCard. */
function AskQuestionsDetails({ toolCall }: { toolCall: ToolCall }) {
  const questions = parseAskQuestionsData(toolCall.arguments);
  const answers = questions ? parseQuestionsAnswerText(toolCall.result ?? '', questions.length) : null;
  if (!questions || !answers) return <FallbackDetails toolCall={toolCall} />;

  return (
    <div className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-3 space-y-3">
      {questions.map((q, i) => (
        <div key={i} className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{q.text}</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{answers[i]}</p>
        </div>
      ))}
    </div>
  );
}

// ─── nak ────────────────────────────────────────────────────────────────────

function NakDetails({ toolCall }: { toolCall: ToolCall }) {
  const intl = useIntl();
  const args = toolCall.arguments;
  const action = typeof args.action === 'string' ? args.action : '';
  const result = toolCall.result ?? '';

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(result);
  } catch {
    parsed = null;
  }

  // Every action can fail with a JSON {"error": "..."}; show it verbatim.
  if (parsed && typeof parsed.error === 'string') {
    return (
      <ToolCard>
        <p className="text-xs text-orange-700 dark:text-orange-400">{parsed.error}</p>
        <DetailsCollapsible>
          <CodeBlock>{result}</CodeBlock>
        </DetailsCollapsible>
      </ToolCard>
    );
  }

  let summary: ReactNode;
  switch (action) {
    case 'req':
    case 'fetch': {
      const found = result.match(/Found (\d+) event\(s\)/);
      summary = found
        ? intl.formatMessage(
            { id: 'ai-chat.tool.nakEventCount', defaultMessage: 'Found {count} event(s)' },
            { count: found[1] },
          )
        : result;
      break;
    }
    case 'profile': {
      if (parsed) {
        const name = typeof parsed.name === 'string' ? parsed.name : undefined;
        summary = name
          ? intl.formatMessage(
              { id: 'ai-chat.tool.nakProfile', defaultMessage: 'Profile: {name}' },
              { name },
            )
          : intl.formatMessage({ id: 'ai-chat.tool.nakProfileFound', defaultMessage: 'Profile found' });
      } else {
        summary = result;
      }
      break;
    }
    case 'decode': {
      summary = parsed && typeof parsed.type === 'string'
        ? intl.formatMessage(
            { id: 'ai-chat.tool.nakDecoded', defaultMessage: 'Decoded {type}' },
            { type: parsed.type },
          )
        : result;
      break;
    }
    default:
      // encode returns a bare NIP-19 string on success and plain text on
      // error; either way the string itself is the summary.
      summary = result;
  }

  return (
    <ToolCard>
      <p className="text-xs text-foreground">{summary}</p>
      <DetailsCollapsible>
        <CodeBlock>{result}</CodeBlock>
      </DetailsCollapsible>
    </ToolCard>
  );
}

// ─── read_spec / read_examples / fetch_nip / search_nips ────────────────────

function MarkdownDetails({ toolCall }: { toolCall: ToolCall }) {
  const result = toolCall.result ?? '';
  return (
    <ToolCard>
      <DetailsCollapsible defaultOpen={result.length <= MARKDOWN_COLLAPSE_THRESHOLD}>
        <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-a:text-primary">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{result}</Markdown>
        </div>
      </DetailsCollapsible>
    </ToolCard>
  );
}

// ─── read_code ──────────────────────────────────────────────────────────────

function ReadCodeDetails({ toolCall }: { toolCall: ToolCall }) {
  const result = toolCall.result ?? '';

  // An empty file has no hashline body, so there is nothing to expand.
  if (result.startsWith('(empty file')) {
    return (
      <ToolCard>
        <p className="text-xs text-foreground">{result}</p>
      </ToolCard>
    );
  }

  const firstNewline = result.indexOf('\n');
  const rangeNote = firstNewline === -1 ? result : result.slice(0, firstNewline);
  const body = firstNewline === -1 ? '' : result.slice(firstNewline + 1);

  return (
    <ToolCard>
      <p className="text-xs text-foreground">{rangeNote}</p>
      <DetailsCollapsible>
        <CodeBlock>{body}</CodeBlock>
      </DetailsCollapsible>
    </ToolCard>
  );
}

// ─── write_code ─────────────────────────────────────────────────────────────

function WriteCodeDetails({ toolCall, previousCode }: { toolCall: ToolCall; previousCode?: string }) {
  const result = toolCall.result ?? '';
  const status = result.split('\n')[0];
  const code = typeof toolCall.arguments.code === 'string' ? toolCall.arguments.code : '';

  return (
    <ToolCard>
      <p className="text-xs text-foreground">{status}</p>
      <DetailsCollapsible>
        {previousCode !== undefined ? (
          <DiffView previous={previousCode} next={code} />
        ) : (
          <CodeBlock>{code}</CodeBlock>
        )}
      </DetailsCollapsible>
    </ToolCard>
  );
}

/** Line-by-line diff between two whole-file versions, additions in green. */
function DiffView({ previous, next }: { previous: string; next: string }) {
  const lines = diffLines(previous, next).flatMap((change) => {
    const type = change.added ? 'add' : change.removed ? 'remove' : 'same';
    const parts = change.value.split('\n');
    if (change.value.endsWith('\n')) parts.pop();
    return parts.map((text) => ({ text, type }));
  });

  return (
    <div className="max-h-64 overflow-auto text-xs font-mono leading-relaxed bg-muted/60 rounded-lg p-2">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            line.type === 'add' && 'bg-green-500/10 text-green-700 dark:text-green-400',
            line.type === 'remove' && 'bg-red-500/10 text-red-700 dark:text-red-400',
            line.text === '' && 'min-h-4',
          )}
        >
          {line.text === '' ? '\u00A0' : line.text}
        </div>
      ))}
    </div>
  );
}

// ─── edit_code ──────────────────────────────────────────────────────────────

function EditCodeDetails({ toolCall }: { toolCall: ToolCall }) {
  const result = toolCall.result ?? '';
  const operations = Array.isArray(toolCall.arguments.operations)
    ? toolCall.arguments.operations
    : [];

  // A hash-not-found result carries no code-version tag; show it directly.
  if (result.startsWith('Error: ')) {
    return (
      <ToolCard>
        <p className="text-xs text-orange-700 dark:text-orange-400">{result}</p>
      </ToolCard>
    );
  }

  const status = result.split('\n')[0];

  return (
    <ToolCard>
      <p className="text-xs text-foreground">{status}</p>
      <DetailsCollapsible>
        <div className="space-y-1">
          {operations.map((op, i) => (
            <OperationRow key={i} operation={op} />
          ))}
        </div>
      </DetailsCollapsible>
    </ToolCard>
  );
}

function OperationRow({ operation }: { operation: unknown }) {
  if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
    return null;
  }
  const op = operation as Record<string, unknown>;
  const kind = typeof op.op === 'string' ? op.op : 'unknown';
  const hashes = [op.hash, op.from_hash, op.to_hash]
    .filter((h): h is string => typeof h === 'string');
  const content = typeof op.content === 'string' ? op.content : undefined;
  const lines = Array.isArray(op.lines)
    ? (op.lines as unknown[]).filter((l): l is string => typeof l === 'string')
    : [];

  return (
    <div className="text-xs font-mono leading-relaxed break-words">
      <span className="font-medium text-foreground">{kind}</span>
      {hashes.length > 0 && <span className="text-muted-foreground"> {hashes.join(' ')}</span>}
      {content !== undefined && <span className="text-muted-foreground"> → {content}</span>}
      {lines.length > 0 && <span className="text-muted-foreground"> → {lines.join(' ')}</span>}
    </div>
  );
}

// ─── Fallback ───────────────────────────────────────────────────────────────

function FallbackDetails({ toolCall }: { toolCall: ToolCall }) {
  let result: unknown = toolCall.result;
  if (typeof toolCall.result === 'string') {
    try {
      result = JSON.parse(toolCall.result);
    } catch {
      result = toolCall.result;
    }
  }

  const pretty = JSON.stringify({ arguments: toolCall.arguments, result }, null, 2);

  return (
    <ToolCard>
      <DetailsCollapsible>
        <CodeBlock>{pretty}</CodeBlock>
      </DetailsCollapsible>
    </ToolCard>
  );
}
