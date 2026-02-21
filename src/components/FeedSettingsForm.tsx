import { Clapperboard, BarChart3, Palette, PartyPopper, Radio, MessageSquare, Repeat2, FileText } from 'lucide-react';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { Switch } from '@/components/ui/switch';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { EXTRA_KINDS, SECTION_ORDER, SECTION_LABELS } from '@/lib/extraKinds';
import type { ExtraKindDef, SubKindDef } from '@/lib/extraKinds';
import { cn } from '@/lib/utils';

/** Map route name or kind → lucide icon. */
const ICONS: Record<string, React.ReactNode> = {
  vines: <Clapperboard className="size-5" />,
  polls: <BarChart3 className="size-5" />,
  treasures: <ChestIcon className="size-5" />,
  colors: <Palette className="size-5" />,
  packs: <PartyPopper className="size-5" />,
  streams: <Radio className="size-5" />,
  articles: <FileText className="size-5" />,
  // Feed-only items (keyed by kind number)
  '1': <MessageSquare className="size-5" />,
  '6': <Repeat2 className="size-5" />,
};

function KindBadge({ kind }: { kind: number }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
      [{kind}]
    </span>
  );
}

function SubKindRow({ sub, parentEnabled }: { sub: SubKindDef; parentEnabled: boolean }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const handleToggle = async (key: string, value: boolean) => {
    // Update local settings immediately
    updateFeedSettings({ [key]: value });
    
    // Sync to encrypted storage if logged in
    if (user) {
      const updatedFeedSettings = { ...feedSettings, [key]: value };
      await updateSettings.mutateAsync({ feedSettings: updatedFeedSettings });
    }
  };

  return (
    <div className={cn(
      'flex items-center justify-between py-2.5 pl-12 pr-3 transition-colors',
      !parentEnabled && 'opacity-40 pointer-events-none',
    )}>
      <div className="min-w-0">
        <span className="text-sm">{sub.label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">
          <KindBadge kind={sub.kind} />{' '}{sub.description}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-[52px] flex justify-center">
          <Switch
            checked={feedSettings[sub.showKey]}
            onCheckedChange={(checked) => handleToggle(sub.showKey, checked)}
            className="scale-90"
          />
        </div>
        <div className="w-[52px] flex justify-center">
          <Switch
            checked={feedSettings[sub.feedKey]}
            onCheckedChange={(checked) => handleToggle(sub.feedKey, checked)}
            className="scale-90"
          />
        </div>
      </div>
    </div>
  );
}

function ContentTypeRow({ def }: { def: ExtraKindDef }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const icon = ICONS[def.route ?? String(def.kind)] ?? <Palette className="size-5" />;
  const hasSubKinds = !!def.subKinds;
  const isFeedOnly = !!def.feedOnly;

  const handleToggle = async (key: string, value: boolean) => {
    // Update local settings immediately
    updateFeedSettings({ [key]: value });
    
    // Sync to encrypted storage if logged in
    if (user) {
      const updatedFeedSettings = { ...feedSettings, [key]: value };
      await updateSettings.mutateAsync({ feedSettings: updatedFeedSettings });
    }
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between py-3.5 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-muted-foreground shrink-0">{icon}</span>
          <div className="min-w-0">
            <span className="text-sm font-medium">{def.label}</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              <KindBadge kind={def.kind} />{' '}{def.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isFeedOnly ? (
            /* Feed-only items: single centered toggle spanning both columns */
            <>
              <div className="w-[52px]" />
              <div className="w-[52px] flex justify-center">
                {def.feedKey ? (
                  <Switch
                    checked={feedSettings[def.feedKey]}
                    onCheckedChange={(checked) => handleToggle(def.feedKey!, checked)}
                  />
                ) : null}
              </div>
            </>
          ) : (
            /* Regular items: sidebar + feed toggles */
            <>
              <div className="w-[52px] flex justify-center">
                {def.showKey ? (
                  <Switch
                    checked={feedSettings[def.showKey]}
                    onCheckedChange={(checked) => handleToggle(def.showKey!, checked)}
                  />
                ) : null}
              </div>
              <div className="w-[52px] flex justify-center">
                {!hasSubKinds && def.feedKey ? (
                  <Switch
                    checked={feedSettings[def.feedKey]}
                    onCheckedChange={(checked) => handleToggle(def.feedKey!, checked)}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sub-kind toggles */}
      {hasSubKinds && def.showKey && def.subKinds!.map((sub) => (
        <SubKindRow
          key={sub.showKey}
          sub={sub}
          parentEnabled={feedSettings[def.showKey!]}
        />
      ))}
    </div>
  );
}

export function FeedSettingsForm() {
  return (
    <div>
      {/* Intro */}
      <div className="flex items-center gap-4 px-3 pt-2 pb-4">
        <img
          src="/feed-intro.png"
          alt=""
          className="w-40 shrink-0 mix-blend-difference opacity-80"
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Other Stuff</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Nostr isn't just text posts — people publish all kinds of things. Pick what shows up in your sidebar and feed.
          </p>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-end gap-2 px-3 pb-2">
        <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Sidebar</span>
        <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Feed</span>
      </div>

      {/* Content type rows grouped by section */}
      {SECTION_ORDER.map((section) => {
        const sectionKinds = EXTRA_KINDS.filter((def) => def.section === section);
        if (sectionKinds.length === 0) return null;
        return (
          <div key={section}>
            <div className="px-3 pt-4 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {SECTION_LABELS[section]}
              </span>
            </div>
            {sectionKinds.map((def) => (
              <ContentTypeRow key={def.feedKey ?? def.showKey ?? String(def.kind)} def={def} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
