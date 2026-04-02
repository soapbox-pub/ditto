import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Image,
  Minus,
  HelpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

function MarkdownHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Markdown Quick Reference</h4>
          <div className="text-xs space-y-1.5 font-mono text-muted-foreground">
            <div className="flex justify-between"><span>**bold**</span><span className="font-sans font-bold">bold</span></div>
            <div className="flex justify-between"><span>*italic*</span><span className="font-sans italic">italic</span></div>
            <div className="flex justify-between"><span># Heading 1</span><span className="font-sans">H1</span></div>
            <div className="flex justify-between"><span>## Heading 2</span><span className="font-sans">H2</span></div>
            <div className="flex justify-between"><span>- list item</span><span className="font-sans">* item</span></div>
            <div className="flex justify-between"><span>1. numbered</span><span className="font-sans">1. item</span></div>
            <div className="flex justify-between"><span>[text](url)</span><span className="font-sans text-primary">link</span></div>
            <div className="flex justify-between"><span>![alt](url)</span><span className="font-sans">image</span></div>
            <div className="flex justify-between"><span>&gt; quote</span><span className="font-sans border-l-2 pl-1">quote</span></div>
            <div className="flex justify-between"><span>`code`</span><span className="font-sans bg-muted px-1 rounded">code</span></div>
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Drag & drop or paste images to upload
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const hasPointerFine = typeof window !== 'undefined'
  && window.matchMedia('(pointer: fine)').matches;

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
}

function ToolbarButton({ icon, label, shortcut, onClick, active }: ToolbarButtonProps) {
  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "h-8 w-8 text-muted-foreground hover:text-foreground",
        active && "bg-muted text-foreground"
      )}
    >
      {icon}
    </Button>
  );

  if (!hasPointerFine) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent>
        <span>{label}</span>
        {shortcut && <span className="ml-2 text-muted-foreground text-xs">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

interface MilkdownToolbarProps {
  onCommand: (command: string) => void;
  onImageUpload?: () => void;
  sourceMode?: boolean;
  onToggleSource?: () => void;
  className?: string;
}

export function MilkdownToolbar({ onCommand, onImageUpload, sourceMode, onToggleSource, className }: MilkdownToolbarProps) {
  return (
    <div className={cn(
      "flex items-center gap-0.5 p-1.5 border-b border-border bg-card/95 backdrop-blur-sm flex-wrap sticky top-0 z-10 rounded-t-xl",
      className
    )}>
      {!sourceMode && (
        <>
          {/* Text formatting */}
          <ToolbarButton
            icon={<Bold className="h-4 w-4" />}
            label="Bold"
            shortcut="Ctrl+B"
            onClick={() => onCommand('toggleBold')}
          />
          <ToolbarButton
            icon={<Italic className="h-4 w-4" />}
            label="Italic"
            shortcut="Ctrl+I"
            onClick={() => onCommand('toggleItalic')}
          />
          <ToolbarButton
            icon={<Strikethrough className="h-4 w-4" />}
            label="Strikethrough"
            onClick={() => onCommand('toggleStrikethrough')}
          />
          <ToolbarButton
            icon={<Code className="h-4 w-4" />}
            label="Inline Code"
            onClick={() => onCommand('toggleInlineCode')}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Headings */}
          <ToolbarButton
            icon={<Heading1 className="h-4 w-4" />}
            label="Heading 1"
            onClick={() => onCommand('heading1')}
          />
          <ToolbarButton
            icon={<Heading2 className="h-4 w-4" />}
            label="Heading 2"
            onClick={() => onCommand('heading2')}
          />
          <ToolbarButton
            icon={<Heading3 className="h-4 w-4" />}
            label="Heading 3"
            onClick={() => onCommand('heading3')}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Lists */}
          <ToolbarButton
            icon={<List className="h-4 w-4" />}
            label="Bullet List"
            onClick={() => onCommand('bulletList')}
          />
          <ToolbarButton
            icon={<ListOrdered className="h-4 w-4" />}
            label="Numbered List"
            onClick={() => onCommand('orderedList')}
          />
          <ToolbarButton
            icon={<Quote className="h-4 w-4" />}
            label="Blockquote"
            onClick={() => onCommand('blockquote')}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Links and media */}
          <ToolbarButton
            icon={<Link className="h-4 w-4" />}
            label="Insert Link"
            onClick={() => onCommand('link')}
          />
          {onImageUpload && (
            <ToolbarButton
              icon={<Image className="h-4 w-4" />}
              label="Insert Image"
              onClick={onImageUpload}
            />
          )}
          <ToolbarButton
            icon={<Minus className="h-4 w-4" />}
            label="Horizontal Rule"
            onClick={() => onCommand('hr')}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />

          <MarkdownHelpPopover />
        </>
      )}

      {sourceMode && (
        <>
          <span className="text-xs text-muted-foreground px-1.5">Markdown Source</span>
          <span className="flex-1" />
        </>
      )}

      {onToggleSource && (
        <ToolbarButton
          icon={sourceMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          label={sourceMode ? 'Rich text editor' : 'Markdown source'}
          active={sourceMode}
          onClick={onToggleSource}
        />
      )}
    </div>
  );
}
