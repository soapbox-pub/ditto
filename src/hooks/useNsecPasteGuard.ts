import { useEffect } from "react";
import { toast } from "@/hooks/useToast";

const NSEC_PATTERN = /nsec1[a-z0-9]{58}/i;

export function useNsecPasteGuard() {
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
        title: "Secret key detected",
        description:
          "Your clipboard contains a secret key. Posting it publicly could give someone else full access to your account.",
        variant: "destructive",
      });
    }

    document.addEventListener("paste", handlePaste, { capture: true });
    return () => document.removeEventListener("paste", handlePaste, { capture: true });
  }, []);
}
