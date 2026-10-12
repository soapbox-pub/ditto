import { useSeoMeta } from "@/hooks/useSeoMeta";
import { MoonStar } from "lucide-react";
import { useIntl } from "react-intl";
import { PageHeader } from "@/components/PageHeader";
import { TarotReader } from "@/components/tarot/TarotReader";
import { useAppContext } from "@/hooks/useAppContext";

export function TarotPage() {
  const { config } = useAppContext();
  const intl = useIntl();

  useSeoMeta({
    title: intl.formatMessage({ id: "tarotPage.seoTitle", defaultMessage: "Tarot | {appName}" }, { appName: config.appName }),
    description: intl.formatMessage({
      id: "tarotPage.metaDescription",
      defaultMessage: "Draw your daily three-card tarot spread and share your fortune on Nostr",
    }),
  });

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <PageHeader title={intl.formatMessage({ id: "tarotPage.title", defaultMessage: "Tarot" })} icon={<MoonStar className="size-5" />} />
      <TarotReader />
    </main>
  );
}
