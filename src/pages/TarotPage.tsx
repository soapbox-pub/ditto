import { useSeoMeta } from "@unhead/react";
import { MoonStar } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TarotReader } from "@/components/tarot/TarotReader";
import { useAppContext } from "@/hooks/useAppContext";

export function TarotPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Tarot | ${config.appName}`,
    description:
      "Draw your daily three-card tarot spread and share your fortune on Nostr",
  });

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <PageHeader title="Tarot" icon={<MoonStar className="size-5" />} />
      <TarotReader />
    </main>
  );
}
