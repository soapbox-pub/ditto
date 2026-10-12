import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { loadTarotText, type TarotText } from "@/lib/tarot/text";

/**
 * Card names, meanings, and fortunes in the current locale, loaded on first
 * use. Undefined until the text chunk arrives.
 */
export function useTarotText(): TarotText | undefined {
  const { locale } = useIntl();
  const { data } = useQuery({
    queryKey: ["tarot-text", locale],
    queryFn: () => loadTarotText(locale),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data;
}
