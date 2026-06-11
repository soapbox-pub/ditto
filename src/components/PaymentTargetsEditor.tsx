import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PaymentMethodIcon } from '@/components/PaymentMethodIcon';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePaymentTargets, useUpdatePaymentTargets } from '@/hooks/usePaymentTargets';
import { useToast } from '@/hooks/useToast';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LIST,
  type PaymentTarget,
  type PaymentTargetType,
} from '@/lib/paymentTargets';

/** A draft row in the editor. The method type is fixed at add time. */
interface DraftTarget {
  /** Stable key for React list rendering. */
  key: string;
  type: PaymentTargetType;
  authority: string;
}

let draftSeq = 0;
function newDraft(type: PaymentTargetType, authority = ''): DraftTarget {
  return { key: `pt-${draftSeq++}`, type, authority };
}

/** Imperative handle the parent profile form uses to persist on submit. */
export interface PaymentTargetsEditorHandle {
  /**
   * Validate and publish the current payment targets (kind 10133). Returns
   * `true` on success, `false` if validation failed or the publish errored —
   * letting the parent abort its "saved" confirmation. Surfaces its own
   * error toasts.
   */
  save: () => Promise<boolean>;
}

/**
 * "Accept Donations" editor for NIP-A3 payment targets (kind 10133).
 *
 * Users add at most one entry per recognized payment method (Bitcoin,
 * Lightning, Monero, …). Bitcoin and Lightning entries override the values
 * Ditto would otherwise derive when zapping this user (a Taproot address from
 * the pubkey, and the kind-0 `lud16` respectively).
 *
 * The editor has no save button of its own — it's persisted alongside the
 * profile via the parent form's single "Save" button, through the imperative
 * {@link PaymentTargetsEditorHandle.save} handle.
 */
export const PaymentTargetsEditor = forwardRef<PaymentTargetsEditorHandle>(
  function PaymentTargetsEditor(_props, ref) {
    const { user } = useCurrentUser();
    const { toast } = useToast();
    const { targets, isLoading } = usePaymentTargets(user?.pubkey);
    const { mutateAsync: updateTargets } = useUpdatePaymentTargets();

    const [drafts, setDrafts] = useState<DraftTarget[]>([]);

    // Seed drafts from the loaded targets once they arrive. We only reset when
    // the stored set changes identity (e.g. after a successful save / reload),
    // not on every keystroke.
    const seed = useMemo(
      () => targets.map((t) => newDraft(t.type, t.authority)),
      [targets],
    );
    useEffect(() => {
      setDrafts(seed);
    }, [seed]);

    // Methods not yet added — offered in the "Add method" dropdown.
    const usedTypes = useMemo(() => new Set(drafts.map((d) => d.type)), [drafts]);
    const availableMethods = useMemo(
      () => PAYMENT_METHOD_LIST.filter((m) => !usedTypes.has(m.type)),
      [usedTypes],
    );

    const updateDraft = (key: string, authority: string) => {
      setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, authority } : d)));
    };

    const removeDraft = (key: string) => {
      setDrafts((prev) => prev.filter((d) => d.key !== key));
    };

    const addDraft = (type: PaymentTargetType) => {
      setDrafts((prev) => [...prev, newDraft(type)]);
    };

    useImperativeHandle(ref, () => ({
      async save() {
        if (!user) return false;

        const cleaned: PaymentTarget[] = [];
        for (const d of drafts) {
          const authority = d.authority.trim();
          // Skip fully-empty rows silently; they're just unfinished drafts.
          if (!authority) continue;
          const method = PAYMENT_METHODS[d.type];
          if (!method.validate(authority)) {
            toast({
              title: `Invalid ${method.label} address`,
              description: `"${authority}" doesn't look like a valid ${method.label} ${
                d.type === 'lightning' ? 'address' : 'address/handle'
              }.`,
              variant: 'destructive',
            });
            return false;
          }
          cleaned.push({ type: d.type, authority });
        }

        try {
          await updateTargets(cleaned);
          return true;
        } catch (err) {
          toast({
            title: 'Error',
            description:
              err instanceof Error ? err.message : 'Failed to save payment methods.',
            variant: 'destructive',
          });
          return false;
        }
      },
    }), [user, drafts, updateTargets, toast]);

    if (!user) return null;

    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Accept Donations</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Let supporters send you crypto and tips.
          </p>
        </div>

        {isLoading && drafts.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : drafts.length > 0 ? (
          <>
            <div className="space-y-2">
              {drafts.map((draft) => {
                const method = PAYMENT_METHODS[draft.type];
                return (
                  <div
                    key={draft.key}
                    className="flex items-center gap-3 rounded-lg border bg-card/50 p-3"
                  >
                    <div className="flex items-center gap-2 w-28 shrink-0 text-sm font-medium">
                      <PaymentMethodIcon method={method} className="text-muted-foreground" />
                      <span className="truncate">{method.label}</span>
                    </div>
                    <Input
                      value={draft.authority}
                      onChange={(e) => updateDraft(draft.key, e.target.value)}
                      placeholder={method.placeholder}
                      className="h-9 flex-1 min-w-0 font-mono text-xs"
                      aria-label={`${method.label} address`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDraft(draft.key)}
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      title={`Remove ${method.label}`}
                      aria-label={`Remove ${method.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={availableMethods.length === 0}
                  className="h-8 text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add method
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {availableMethods.map((m) => (
                  <DropdownMenuItem key={m.type} onSelect={() => addDraft(m.type)} className="gap-2">
                    <PaymentMethodIcon method={m} />
                    <span>{m.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={availableMethods.length === 0}
                className="w-full h-11 gap-2 border-dashed"
              >
                <Plus className="h-4 w-4" />
                Add donation
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {availableMethods.map((m) => (
                <DropdownMenuItem key={m.type} onSelect={() => addDraft(m.type)} className="gap-2">
                  <PaymentMethodIcon method={m} />
                  <span>{m.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  },
);
