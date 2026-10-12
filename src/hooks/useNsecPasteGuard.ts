import { useEffect } from "react";
import { useIntl } from "react-intl";
import { toast } from "@/hooks/useToast";

const NSEC_PATTERN = /nsec1[a-z0-9]{58}/i;

/** Blocks pasting an nsec outside the login field. Must render inside `I18nProvider`. */
export function useNsecPasteGuard() {
  const intl = useIntl();

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const text = e.clipboardData?.getData("text");
      if (!text || !NSEC_PATTERN.test(text)) return;

      // Allow pasting nsec into the login field
      const target = e.target as HTMLElement;
      if (target.id === "nsec" || target.closest?.("[data-nsec-allowed]")) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      toast({
        title: intl.formatMessage({ id: "nsecPasteGuard.title", defaultMessage: "Secret key detected" }),
        description: intl.formatMessage({
          id: "nsecPasteGuard.description",
          defaultMessage:
            "Your clipboard contains a secret key. Posting it publicly could give someone else full access to your account.",
        }),
        variant: "destructive",
      });
    }

    document.addEventListener("paste", handlePaste, { capture: true });
    return () => document.removeEventListener("paste", handlePaste, { capture: true });
  }, [intl]);
}
