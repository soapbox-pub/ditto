import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';

export function MagicSettingsPage() {
  const { config, updateConfig } = useAppContext();

  useSeoMeta({
    title: `Magic | Settings | ${config.appName}`,
    description: 'Magical cursor effects and enchanted interface settings',
  });

  function toggleMagicMouse(checked: boolean) {
    updateConfig((c) => ({ ...c, magicMouse: checked }));
  }

  return (
    <main className="">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Magic</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Harness the mystical energies of your device. Imbue your cursor with elemental fire.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Ornament */}
        <div className="flex items-center gap-3 px-2 pb-5">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-primary/60" />
          <span className="text-primary/50 text-xs tracking-[0.3em] select-none">✦</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/40 to-primary/60" />
        </div>

        {/* Magic Mouse toggle */}
        <div
          className="flex items-start gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-muted/40"
          style={{ background: config.magicMouse ? 'radial-gradient(ellipse 120% 80% at 50% 50%, hsl(var(--primary) / 0.07), transparent)' : undefined }}
        >
          <div className="flex-1 min-w-0">
            <Label htmlFor="magic-mouse-toggle" className="text-sm font-semibold cursor-pointer flex items-center gap-1.5">
              Magic Mouse
            </Label>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Your cursor (or finger on touch devices) will emanate magical fire in the glow of your primary color. Move with purpose — every path you trace becomes a trail of flame.
            </p>
          </div>
          <Switch
            id="magic-mouse-toggle"
            checked={config.magicMouse}
            onCheckedChange={toggleMagicMouse}
            className="mt-0.5 shrink-0"
          />
        </div>

        {/* Bottom ornament */}
        <div className="flex items-center gap-3 px-2 pt-6 pb-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/20 to-primary/30" />
          <span className="text-primary/30 text-[10px] tracking-[0.4em] select-none">◆</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/20 to-primary/30" />
        </div>
      </div>
    </main>
  );
}
