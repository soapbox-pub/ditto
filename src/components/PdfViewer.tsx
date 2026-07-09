/**
 * Inline PDF viewer with a fullscreen "expand" mode.
 *
 * Renders the PDF using the browser's built-in viewer via an `<iframe>`
 * (which works in WKWebView / Android WebView and under Apple Lockdown Mode,
 * where `navigator.pdfViewerEnabled` is `true`). A toolbar offers fullscreen
 * expansion (a Dialog covering the viewport), opening in a new tab / share
 * sheet, and downloading.
 *
 * The `url` passed here MUST already be sanitized (https-only) by the caller —
 * see `parsePublication()` / `sanitizeUrl()`.
 */

import { useState } from 'react';
import { Expand, ExternalLink, Download, FileText } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

interface PdfViewerProps {
  /** Sanitized https PDF URL. */
  url: string;
  /** Accessible title / filename base for the document. */
  title: string;
  className?: string;
}

/** The actual embedded PDF frame. Kept as a component so it can be reused in the dialog. */
function PdfFrame({ url, title, className }: { url: string; title: string; className?: string }) {
  // Render via <object type="application/pdf"> rather than an <iframe>. Unlike an
  // iframe (which loads whatever the server returns — arbitrary HTML/JS if a
  // malicious publisher swaps the file), <object> is gated by the declared MIME:
  // browsers only instantiate the built-in PDF viewer, and non-PDF responses fall
  // back to the child content below instead of executing as a document.
  // Allowed by the app CSP's `object-src https:` (see index.html). `url` is
  // already https-only via sanitizeUrl().
  return (
    <object
      data={url}
      type="application/pdf"
      title={title}
      aria-label={title}
      className={cn('w-full border-0 bg-muted', className)}
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center">
        <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-xs text-sm text-muted-foreground">
          This PDF can't be displayed inline.
        </p>
        <Button asChild variant="outline">
          <a href={url} download target="_blank" rel="noopener noreferrer">
            <Download className="mr-2 size-4" />
            Download PDF
          </a>
        </Button>
      </div>
    </object>
  );
}

export function PdfViewer({ url, title, className }: PdfViewerProps) {
  const [expanded, setExpanded] = useState(false);
  // On native the inline WebView PDF experience is inconsistent; prefer the
  // native open/share sheet there instead of an embedded frame.
  const isNative = Capacitor.isNativePlatform();

  const filename = /\.pdf($|\?)/i.test(url) ? undefined : `${title}.pdf`;

  const openExternally = () => {
    void openUrl(url);
  };

  if (isNative) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center',
          className,
        )}
      >
        <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-xs text-sm text-muted-foreground">
          Open the PDF to read it in your device's viewer.
        </p>
        <Button onClick={openExternally}>
          <ExternalLink className="mr-2 size-4" />
          Open PDF
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="truncate text-sm font-medium text-muted-foreground">{title}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
            aria-label="Expand PDF to fullscreen"
          >
            <Expand className="size-4" />
            <span className="ml-1.5 hidden sm:inline">Expand</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openExternally}
            aria-label="Open PDF in new tab"
          >
            <ExternalLink className="size-4" />
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Download PDF">
            <a href={url} download={filename} target="_blank" rel="noopener noreferrer">
              <Download className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Inline viewer */}
      <PdfFrame url={url} title={title} className="h-[70vh] max-h-[900px] min-h-[480px]" />

      {/* Fullscreen dialog */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 p-0 sm:h-[95vh] sm:w-[95vw] sm:max-w-[95vw] sm:rounded-xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2 border-b bg-background px-4 py-3 pr-14">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <DialogTitle className="truncate text-base">{title}</DialogTitle>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={openExternally}
                aria-label="Open PDF in new tab"
              >
                <ExternalLink className="size-4" />
              </Button>
              <Button asChild variant="ghost" size="icon" aria-label="Download PDF">
                <a href={url} download={filename} target="_blank" rel="noopener noreferrer">
                  <Download className="size-4" />
                </a>
              </Button>
            </div>
          </div>
          <PdfFrame url={url} title={title} className="h-full flex-1" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
