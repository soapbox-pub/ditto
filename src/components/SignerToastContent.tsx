import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Toast description content for the signer nudge toast.
 *
 * On Android, includes an "Approve in signer" link that opens the signer via
 * the `nostrsigner:` URI scheme (keeps the WebSocket alive), plus a
 * Skip/Cancel button. On desktop, shows a description with a Skip button.
 */
export function NudgeToastContent({
  description,
  android,
  relayOk,
  onCancel,
}: {
  description: string;
  android: boolean;
  relayOk: boolean;
  onCancel: () => void;
}): ReactNode {
  return (
    <span>
      <span className="block text-sm opacity-80">{description}</span>
      {android && relayOk ? (
        <AndroidApproveRow onCancel={onCancel} />
      ) : (
        <span className="block mt-1.5">
          <SkipButton onClick={onCancel} />
        </span>
      )}
    </span>
  );
}

/**
 * Toast description for the phase-transition toast (encrypt done, now sign).
 * On Android includes the "Approve in signer" link.
 */
export function PhaseToastContent({
  message,
  android,
}: {
  message: string;
  android: boolean;
}): ReactNode {
  return (
    <span>
      {message}
      {android && (
        <AndroidApproveRow onCancel={() => { /* phase toast auto-expires */ }} />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Internal components
// ---------------------------------------------------------------------------

function AndroidApproveRow({ onCancel, onApprove }: { onCancel: () => void; onApprove?: () => void }) {
  const [waiting, setWaiting] = useState(false);

  return (
    <span className="flex items-center gap-3 mt-2">
      {waiting ? (
        <span className="text-sm opacity-80 inline-flex items-center gap-1.5">
          <Loader2 className="size-4 animate-spin" />
          Waiting for signer...
        </span>
      ) : (
        <a
          href="nostrsigner:"
          className="text-sm font-semibold border border-current rounded px-3 py-1.5 no-underline inline-flex items-center gap-1.5 min-h-[44px]"
          onClick={() => {
            setWaiting(true);
            onApprove?.();
          }}
        >
          Approve in signer
        </a>
      )}
      {waiting ? (
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold border border-current rounded px-3 py-1.5 min-h-[44px]"
        >
          Cancel
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
      Skip
    </button>
  );
}
