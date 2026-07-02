import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginArea } from "@/components/auth/LoginArea";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { getDisplayName } from "@/lib/getDisplayName";
import {
  buildCardHashtags,
  CARD_POSITIONS,
  type ReadingType,
  type TarotCardData,
} from "@/lib/tarot/cards";

interface TarotShareDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cards: TarotCardData[];
  generatedImage: string | null;
  readingType: ReadingType;
  onSuccess: () => void;
}

function buildShareContent(
  cards: TarotCardData[],
  readingType: ReadingType,
): string {
  const lines = cards.map((card, index) => {
    const position = CARD_POSITIONS[index];
    const label = position.charAt(0).toUpperCase() + position.slice(1);
    const fortune = card.isReversed
      ? card.fortune_telling_rev[index]
      : card.fortune_telling[index];
    return `• ${label}: ${card.name}${card.isReversed ? " (Reversed)" : ""} - ${fortune}`;
  });

  return `My ${readingType} tarot reading ✨ #nostrdamus #${readingType}

${lines.join("\n")}

${buildCardHashtags(cards)}
`;
}

/**
 * Compose and publish a tarot reading as a Nostrdamus-compatible kind 1 note:
 * `t` tags for discovery, card hashtags in the content, and an `imeta` tag
 * whose summary lets clients reconstruct the spread from the note alone.
 */
export function TarotShareDialog({
  isOpen,
  onOpenChange,
  cards,
  generatedImage,
  readingType,
  onSuccess,
}: TarotShareDialogProps) {
  const [content, setContent] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const { mutate: createEvent } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey);
  const { toast } = useToast();

  const metadata = author.data?.metadata;
  const displayName = user ? getDisplayName(metadata, user.pubkey) : "";

  useEffect(() => {
    if (cards.length === 3) {
      setContent(buildShareContent(cards, readingType));
    }
  }, [cards, readingType]);

  const handleShare = async () => {
    if (!generatedImage || !user) return;

    setIsPosting(true);
    try {
      const blob = await (await fetch(generatedImage)).blob();
      const file = new File([blob], "tarot-reading.png", {
        type: "image/png",
      });
      const uploadTags = await uploadFile(file);
      const imageUrl = uploadTags[0][1];

      const cardHashtags = buildCardHashtags(cards);
      const alt = `${readingType === "daily" ? "Daily" : "Weekly"} tarot reading with three cards: ${cards.map((c) => c.name + (c.isReversed ? " (Reversed)" : "")).join(", ")}`;

      createEvent(
        {
          kind: 1,
          content: `${content} ${imageUrl}`,
          tags: [
            ["t", "nostrdamus"],
            ["t", readingType],
            [
              "imeta",
              `url ${imageUrl}`,
              "m image/png",
              `summary ${readingType}_reading ${cardHashtags}`,
              `alt ${alt}`,
            ],
          ],
        },
        {
          onSuccess: () => {
            setIsPosting(false);
            onSuccess();
            onOpenChange(false);
            toast({ title: "Your fortune has been shared ✨" });
          },
          onError: () => {
            setIsPosting(false);
            toast({
              title: "Failed to share",
              description: "Your reading could not be posted. Try again.",
              variant: "destructive",
            });
          },
        },
      );
    } catch (error) {
      console.error("Error sharing tarot reading:", error);
      setIsPosting(false);
      toast({
        title: "Failed to share",
        description: "The reading image could not be uploaded. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share your fortune</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              aria-label="Post text"
            />
            <Button
              onClick={handleCopyText}
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              aria-label="Copy text"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <div className="w-full rounded-lg overflow-hidden">
            {generatedImage ? (
              <img
                src={generatedImage}
                alt="Tarot reading"
                className="w-full h-auto"
              />
            ) : (
              <Skeleton className="w-full h-48" />
            )}
          </div>
        </div>
        <DialogFooter>
          {user ? (
            <div className="flex justify-between items-center gap-3 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar>
                  <AvatarImage src={metadata?.picture} />
                  <AvatarFallback>{displayName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-muted-foreground">
                    Posting as
                  </span>
                  <span className="font-bold truncate">{displayName}</span>
                </div>
              </div>
              <Button
                onClick={handleShare}
                disabled={isPosting || !generatedImage}
              >
                {isPosting ? "Posting…" : "Post to Nostr"}
              </Button>
            </div>
          ) : (
            <div className="flex justify-center w-full">
              <LoginArea />
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
