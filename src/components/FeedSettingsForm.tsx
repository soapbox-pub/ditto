import { Clapperboard, BarChart3, Palette, PartyPopper } from 'lucide-react';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { Switch } from '@/components/ui/switch';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import type { ExtraKindDef, SubKindDef } from '@/lib/extraKinds';
import { cn } from '@/lib/utils';

/** Map route name → lucide icon. */
const ICONS: Record<string, React.ReactNode> = {
  vines: <Clapperboard className="size-5" />,
  polls: <BarChart3 className="size-5" />,
  treasures: <ChestIcon className="size-5" />,
  colors: <Palette className="size-5" />,
  packs: <PartyPopper className="size-5" />,
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
            onCheckedChange={(checked) => updateFeedSettings({ [sub.showKey]: checked })}
            className="scale-90"
          />
        </div>
        <div className="w-[52px] flex justify-center">
          <Switch
            checked={feedSettings[sub.feedKey]}
            onCheckedChange={(checked) => updateFeedSettings({ [sub.feedKey]: checked })}
            className="scale-90"
          />
        </div>
      </div>
    </div>
  );
}

function ContentTypeRow({ def }: { def: ExtraKindDef }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const icon = ICONS[def.route] ?? <Palette className="size-5" />;
  const hasSubKinds = !!def.subKinds;

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
          <div className="w-[52px] flex justify-center">
            <Switch
              checked={feedSettings[def.showKey]}
              onCheckedChange={(checked) => updateFeedSettings({ [def.showKey]: checked })}
            />
          </div>
          <div className="w-[52px] flex justify-center">
            {!hasSubKinds && def.feedKey ? (
              <Switch
                checked={feedSettings[def.feedKey]}
                onCheckedChange={(checked) => updateFeedSettings({ [def.feedKey]: checked })}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Sub-kind toggles */}
      {hasSubKinds && def.subKinds!.map((sub) => (
        <SubKindRow
          key={sub.showKey}
          sub={sub}
          parentEnabled={feedSettings[def.showKey]}
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
          className="w-28 shrink-0 mix-blend-difference opacity-40"
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Other Stuff</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Nostr isn't just text posts — people publish all kinds of things. Pick what shows up in your sidebar and feed.
          </p>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-end gap-2 px-3 pb-2 border-b border-border">
        <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Sidebar</span>
        <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Feed</span>
      </div>

      {/* Content type rows */}
      {EXTRA_KINDS.map((def) => (
        <ContentTypeRow key={def.showKey} def={def} />
      ))}
    </div>
  );
}
