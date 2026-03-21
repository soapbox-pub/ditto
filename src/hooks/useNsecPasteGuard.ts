import { useEffect } from "react";
import { toast } from "@/hooks/useToast";

const NSEC_PATTERN = /nsec1[a-z0-9]{58}/i;

export function useNsecPasteGuard() {
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const text = e.clipboardData?.getData("text");
      if (!text || !NSEC_PATTERN.test(text)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      toast({
        title: "Private key detected",
        description:
          "You just tried to paste an nsec (private key). This should never be shared publicly — it gives full control of your account.",
        variant: "destructive",
      });
    }

    document.addEventListener("paste", handlePaste, { capture: true });
    return () => document.removeEventListener("paste", handlePaste, { capture: true });
  }, []);
}
