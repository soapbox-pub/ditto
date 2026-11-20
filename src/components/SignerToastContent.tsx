import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

export interface SignerAppLink {
  href: string;
  label: ReactNode;
}

/**
 * Toast description content for the signer nudge toast (see signerWithNudge).
 *
 * For a remote signer on mobile, includes links that bring the signer app to
 * the front, plus a Skip/Cancel button. Otherwise shows a Skip button.
 */
export function NudgeToastContent({
  description,
  openSigner,
  onCancel,
}: {
  description: ReactNode;
  openSigner?: SignerAppLink[];
  onCancel: () => void;
}): ReactNode {
  return (
    <span>
      <span className="block text-sm opacity-80">{description}</span>
      {openSigner && openSigner.length > 0 ? (
        <OpenSignerRow links={openSigner} onCancel={onCancel} />
      ) : (
        <span className="block mt-1.5">
          <SkipButton onClick={onCancel} />
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Internal components
// ---------------------------------------------------------------------------

function OpenSignerRow({ links, onCancel }: { links: SignerAppLink[]; onCancel: () => void }) {
  const [waiting, setWaiting] = useState(false);

  return (
    <span className="flex flex-wrap items-center gap-3 mt-2">
      {waiting ? (
        <span className="text-sm opacity-80 inline-flex items-center gap-1.5">
          <Loader2 className="size-4 animate-spin" />
          <FormattedMessage id="signerToast.waiting" defaultMessage="Waiting for signer..." />
        </span>
      ) : (
        links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm font-semibold border border-current rounded px-3 py-1.5 no-underline inline-flex items-center gap-1.5 min-h-[44px]"
            onClick={() => {
              setWaiting(true);
            }}
          >
            {link.label}
          </a>
        ))
      )}
      {waiting ? (
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold border border-current rounded px-3 py-1.5 min-h-[44px]"
        >
          <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
        </button>
      ) : (
        <SkipButton onClick={onCancel} />
      )}
    </span>
  );
}

function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm bg-transparent border-none p-0 cursor-pointer opacity-80 underline underline-offset-2 min-h-[44px] inline-flex items-center"
    >
      <FormattedMessage id="signerToast.skip" defaultMessage="Skip" />
    </button>
  );
}
