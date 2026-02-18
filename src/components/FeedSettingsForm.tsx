import { Clapperboard, BarChart3, Palette, PartyPopper } from 'lucide-react';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import type { ExtraKindDef, SubKindDef } from '@/lib/extraKinds';

/** Map route name → lucide icon. */
const ICONS: Record<string, React.ReactNode> = {
  vines: <Clapperboard className="size-5" />,
  polls: <BarChart3 className="size-5" />,
  treasures: <ChestIcon className="size-5" />,
  colors: <Palette className="size-5" />,
  packs: <PartyPopper className="size-5" />,
};

function SubKindRow({ sub, section }: { sub: SubKindDef; section: 'sidebar' | 'feed' }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const key = section === 'sidebar' ? sub.showKey : sub.feedKey;
  const htmlId = `${section}-${key}`;

  return (
    <div className="flex items-center justify-between py-2.5 px-3 pl-12 rounded-lg hover:bg-secondary/30 transition-colors">
      <div>
        <Label htmlFor={htmlId} className="text-sm font-medium cursor-pointer">
          {sub.label}
        </Label>
        <span className="inline-block ml-2 text-[10px] font-mono text-muted-foreground/70 bg-secondary/60 px-1.5 py-0.5 rounded">
          kind {sub.kind}
        </span>
        <p className="text-xs text-muted-foreground mt-0.5">{sub.description}</p>
      </div>
      <Switch
        id={htmlId}
        checked={feedSettings[key]}
        onCheckedChange={(checked) => updateFeedSettings({ [key]: checked })}
      />
    </div>
  );
}

function SidebarRow({ def }: { def: ExtraKindDef }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const icon = ICONS[def.route] ?? <Palette className="size-5" />;

  return (
    <div>
      <div className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{icon}</span>
          <div>
            <Label htmlFor={`sidebar-${def.showKey}`} className="text-sm font-medium cursor-pointer">
              {def.label}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
          </div>
        </div>
        <Switch
          id={`sidebar-${def.showKey}`}
          checked={feedSettings[def.showKey]}
          onCheckedChange={(checked) => updateFeedSettings({ [def.showKey]: checked })}
        />
      </div>
      {/* Sub-kind toggles (only shown when parent is enabled) */}
      {def.subKinds && feedSettings[def.showKey] && (
        <div className="space-y-0.5">
          {def.subKinds.map((sub) => (
            <SubKindRow key={sub.showKey} sub={sub} section="sidebar" />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedRow({ def }: { def: ExtraKindDef }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const icon = ICONS[def.route] ?? <Palette className="size-5" />;

  // Entries with sub-kinds show a parent label + nested sub-kind toggles
  if (def.subKinds) {
    return (
      <div>
        <div className="flex items-center gap-3 py-3 px-3">
          <span className="text-muted-foreground">{icon}</span>
          <div>
            <span className="text-sm font-medium">{def.label}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
          </div>
        </div>
        <div className="space-y-0.5">
          {def.subKinds.map((sub) => (
            <SubKindRow key={sub.feedKey} sub={sub} section="feed" />
          ))}
        </div>
      </div>
    );
  }

  // Simple entries (no sub-kinds)
  return (
    <div className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <Label htmlFor={`feed-${def.feedKey}`} className="text-sm font-medium cursor-pointer">
            {def.label}
          </Label>
          <span className="inline-block ml-2 text-[10px] font-mono text-muted-foreground/70 bg-secondary/60 px-1.5 py-0.5 rounded">
            kind {def.kind}
          </span>
        </div>
      </div>
      <Switch
        id={`feed-${def.feedKey}`}
        checked={def.feedKey ? feedSettings[def.feedKey] : false}
        onCheckedChange={(checked) => def.feedKey && updateFeedSettings({ [def.feedKey]: checked })}
      />
    </div>
  );
}

export function FeedSettingsForm() {
  return (
    <div className="space-y-8">
      {/* Sidebar Links section */}
      <section>
        <h2 className="text-base font-semibold mb-1">Sidebar Links</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Choose which content types appear in the navigation sidebar.
        </p>

        <div className="space-y-1">
          {EXTRA_KINDS.map((def) => (
            <SidebarRow key={def.showKey} def={def} />
          ))}
        </div>
      </section>

      <Separator />

      {/* Feed Inclusion section */}
      <section>
        <h2 className="text-base font-semibold mb-1">Feed Content</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Include these content types alongside regular posts in all feeds (home, search, profiles, hashtags).
        </p>

        <div className="space-y-1">
          {EXTRA_KINDS.map((def) => (
            <FeedRow key={def.feedKey ?? def.showKey} def={def} />
          ))}
        </div>
      </section>
    </div>
  );
}
