/**
 * PDF reader launched from a "Read" button. Clicking opens a full-screen dialog
 * containing the reader: a toolbar (open externally, download) above the
 * embedded PDF.
 *
 * Renders the PDF via `<object type="application/pdf">` — the browser's built-in
 * viewer, gated by the declared MIME so a swapped-in non-PDF response can't
 * execute as a document (see `PdfFrame`). Works in WKWebView / Android WebView
 * and under Apple Lockdown Mode, where `navigator.pdfViewerEnabled` is `true`.
 *
 * The `url` passed here MUST already be sanitized (https-only) by the caller —
 * see `parsePublication()` / `sanitizeUrl()`.
 */

import { useState } from 'react';
import { ExternalLink, Download, FileText, BookOpen } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

interface PdfViewerProps {
  /** Sanitized https PDF URL. */
  url: string;
  /** Accessible title / filename base for the document. */
  title: string;
  /** Text for the launch button (e.g. "Read eBook", "Read Issue"). */
  label?: string;
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

export function PdfViewer({ url, title, label = 'Read', className }: PdfViewerProps) {
  const [open, setOpen] = useState(false);
  // On native the inline WebView PDF experience is inconsistent; prefer the
  // native open/share sheet there instead of an embedded frame.
  const isNative = Capacitor.isNativePlatform();

  const filename = /\.pdf($|\?)/i.test(url) ? undefined : `${title}.pdf`;

  const openExternally = () => {
    void openUrl(url);
  };

  // Native: the "Read" button opens the PDF in the device's viewer directly.
  if (isNative) {
    return (
      <Button className={className} onClick={openExternally}>
        <BookOpen className="mr-2 size-4" />
        {label}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className}>
          <BookOpen className="mr-2 size-4" />
          {label}
        </Button>
      </DialogTrigger>

      {/* Reader dialog */}
      <DialogContent
        className="flex h-[95dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:h-[95vh] sm:w-[95vw] sm:max-w-[95vw] sm:rounded-xl"
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
        <PdfFrame url={url} title={title} className="min-h-0 flex-1" />
      </DialogContent>
    </Dialog>
  );
}
