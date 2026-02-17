import { Clapperboard, BarChart3, MapPin, Palette } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import type { FeedSettings } from '@/contexts/AppContext';

interface ContentTypeConfig {
  id: keyof FeedSettings;
  feedId: keyof FeedSettings;
  label: string;
  description: string;
  icon: React.ReactNode;
  kindLabel: string;
}

const contentTypes: ContentTypeConfig[] = [
  {
    id: 'showVines',
    feedId: 'feedIncludeVines',
    label: 'Vines',
    description: 'Short-form videos (kind 34236)',
    icon: <Clapperboard className="size-5" />,
    kindLabel: 'NIP-71',
  },
  {
    id: 'showPolls',
    feedId: 'feedIncludePolls',
    label: 'Polls',
    description: 'Community polls and votes (kind 1068)',
    icon: <BarChart3 className="size-5" />,
    kindLabel: 'NIP-88',
  },
  {
    id: 'showTreasures',
    feedId: 'feedIncludeTreasures',
    label: 'Treasures',
    description: 'Geocache listings (kind 37516)',
    icon: <MapPin className="size-5" />,
    kindLabel: 'Geocaching',
  },
  {
    id: 'showColors',
    feedId: 'feedIncludeColors',
    label: 'Colors',
    description: 'Color moment palettes (kind 3367)',
    icon: <Palette className="size-5" />,
    kindLabel: 'Espy',
  },
];

export function FeedSettingsForm() {
  const { feedSettings, updateFeedSettings } = useFeedSettings();

  return (
    <div className="space-y-8">
      {/* Sidebar Links section */}
      <section>
        <h2 className="text-base font-semibold mb-1">Sidebar Links</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Choose which content types appear in the navigation sidebar.
        </p>

        <div className="space-y-1">
          {contentTypes.map((type) => (
            <div
              key={type.id}
              className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{type.icon}</span>
                <div>
                  <Label htmlFor={`sidebar-${type.id}`} className="text-sm font-medium cursor-pointer">
                    {type.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                </div>
              </div>
              <Switch
                id={`sidebar-${type.id}`}
                checked={feedSettings[type.id]}
                onCheckedChange={(checked) => updateFeedSettings({ [type.id]: checked })}
              />
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Feed Inclusion section */}
      <section>
        <h2 className="text-base font-semibold mb-1">Feed Content</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Include these content types in your Follows and Global feeds alongside regular posts.
        </p>

        <div className="space-y-1">
          {contentTypes.map((type) => (
            <div
              key={type.feedId}
              className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{type.icon}</span>
                <div>
                  <Label htmlFor={`feed-${type.feedId}`} className="text-sm font-medium cursor-pointer">
                    {type.label}
                  </Label>
                  <span className="inline-block ml-2 text-[10px] font-mono text-muted-foreground/70 bg-secondary/60 px-1.5 py-0.5 rounded">
                    {type.kindLabel}
                  </span>
                </div>
              </div>
              <Switch
                id={`feed-${type.feedId}`}
                checked={feedSettings[type.feedId]}
                onCheckedChange={(checked) => updateFeedSettings({ [type.feedId]: checked })}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
