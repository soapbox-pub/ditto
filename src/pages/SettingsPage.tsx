import { useSeoMeta } from '@/hooks/useSeoMeta';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { ChevronRight, Languages, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { PageHeader } from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { IntroImage } from '@/components/IntroImage';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { toast } from '@/hooks/useToast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LANGUAGE_OPTIONS, useLanguage } from '@/i18n/language';

const RequestToVanishDialog = lazy(() => import('@/components/RequestToVanishDialog').then(m => ({ default: m.RequestToVanishDialog })));

interface SettingsSection {
  id: string;
  label: string;
  description: string;
  illustration?: string;
  path: string;
  requiresAuth?: boolean;
}

const settingsSections: SettingsSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Edit your display name, bio, and avatar',
    illustration: '/profile-intro.png',
    path: '/settings/profile',
    requiresAuth: true,
  },
  {
    id: 'feed',
    label: 'Home Feed',
    description: 'Choose what types of posts appear in your home feed',
    illustration: '/community-intro.png',
    path: '/settings/feed',
  },
  {
    id: 'content',
    label: 'Content',
    description: 'Muted users, hashtags, and sensitive content settings',
    illustration: '/mute-intro.png',
    path: '/settings/content',
  },
  {
    id: 'network',
    label: 'Network',
    description: 'Relays and file upload servers',
    illustration: '/relay-intro.png',
    path: '/settings/network',
    requiresAuth: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Configure push notification preferences',
    illustration: '/notification-intro.png',
    path: '/settings/notifications',
    requiresAuth: true,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Wallet, system, and power user settings',
    illustration: '/advanced-intro.png',
    path: '/settings/advanced',
  },
  {
    id: 'magic',
    label: 'Magic',
    description: 'Enchanted cursor effects and mystical interface powers',
    illustration: '/magic-intro.png',
    path: '/settings/magic',
  },
];

export function SettingsPage() {
  const intl = useIntl();
  const { locale, system, setLanguage } = useLanguage();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const navigate = useNavigate();
  const [sigilFlash, setSigilFlash] = useState(false);
  const [sigilVisible, setSigilVisible] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (config.magicMouse) return;
    inactivityTimer.current = setTimeout(() => setSigilVisible(true), 2 * 60 * 1000);
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [config.magicMouse]);
  useLayoutOptions({});

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.metaDescription', defaultMessage: "Manage your {appName} settings" }, { appName: config.appName }),
  });

  // Magic section only appears in the menu once unlocked
  const visibleSections = settingsSections.filter(
    (section) => (!section.requiresAuth || user) && (section.id !== 'magic' || config.magicMouse),
  );

  function unlockMagic() {
    if (config.magicMouse) {
      navigate('/settings/magic');
      return;
    }
    setSigilFlash(true);
    setTimeout(() => setSigilFlash(false), 1000);
    updateConfig((c) => ({ ...c, magicMouse: true }));
    toast({
      title: intl.formatMessage({ id: 'settings.magicUnlocked', defaultMessage: "✨ Magical potential unlocked" }),
      description: intl.formatMessage({ id: 'settings.magicUnlockedDescription', defaultMessage: "You have awakened the arcane. Your cursor now burns with enchanted fire." }),
    });
  }

  return (
    <main className="relative min-h-screen pb-16 sidebar:pb-0">
      {/* Page header */}
      <PageHeader title={intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} icon={<Settings className="size-5" />} backTo="/" />

      {/* Codex heading + exposition */}
      <div className="px-7 pb-4 pt-4 text-center space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed select-none">
          {intl.formatMessage({ id: 'settings.intro', defaultMessage: "Shape your identity, tune your feed, and manage how you connect to the Nostr network." })}<br />{intl.formatMessage({ id: 'settings.introSub', defaultMessage: "Everything you need to make this place feel like yours." })}
        </p>
        <p className="text-[10px] tracking-[0.5em] uppercase text-primary/60 select-none pt-6">{intl.formatMessage({ id: 'settings.codex', defaultMessage: "Codex of Configuration" })}</p>
      </div>

      {/* Tome ornament */}
      <div className="flex items-center gap-3 px-6 pb-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-primary/60" />
        <span className="text-primary/50 text-xs tracking-[0.3em] select-none">✦</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/40 to-primary/60" />
      </div>

      {/* Settings menu */}
      <div className="px-4">
        {visibleSections.map((section, i) => {
          return (
            <div key={section.id}>
              <div
                className="flex items-center gap-4 px-3 py-2 my-1 cursor-pointer rounded-xl transition-colors hover:bg-muted/60 active:bg-muted/80 group"
                onClick={() => navigate(section.path)}
              >
                <div className="flex items-center justify-center size-20 shrink-0">
                  {section.illustration && (
                    <IntroImage src={section.illustration} size="w-22" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{intl.formatMessage({ id: `settings.sections.${section.id}.label`, defaultMessage: section.label })}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {intl.formatMessage({ id: `settings.sections.${section.id}.description`, defaultMessage: section.description })}
                  </p>
                </div>
                <ChevronRight className="size-4 text-primary/40 shrink-0 group-hover:text-primary/70 transition-colors" strokeWidth={4} />
              </div>
              {i < visibleSections.length - 1 && (
                <div className="mx-6 h-px bg-primary/10" />
              )}
            </div>
          );
        })}
      </div>

      {/* Language picker */}
      <div className="px-4 pt-5">
        <div className="flex items-center gap-4 px-3 py-2 rounded-xl">
          <div className="flex items-center justify-center size-20 shrink-0">
            <Languages className="size-8 text-primary/70" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{intl.formatMessage({ id: 'settings.language.label', defaultMessage: "Language" })}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {intl.formatMessage({ id: 'settings.language.description', defaultMessage: "Choose your preferred interface language" })}
            </p>
          </div>
          <Select
            value={system ? 'system' : locale}
            onValueChange={setLanguage}
          >
            <SelectTrigger className="w-[9.5rem] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{intl.formatMessage({ id: 'settings.language.system', defaultMessage: "System default" })}</SelectItem>
              {LANGUAGE_OPTIONS.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Delete Account */}
      {user && (
        <div className="flex justify-center pt-4 pb-1">
          <button
            onClick={() => setDeleteAccountOpen(true)}
            className="text-xs text-destructive-foreground bg-destructive/80 hover:bg-destructive rounded-full px-4 py-1.5 transition-colors"
          >
            {intl.formatMessage({ id: 'settings.deleteAccount', defaultMessage: "Delete Account" })}
          </button>
        </div>
      )}

      {user && (
        <Suspense fallback={null}>
          <RequestToVanishDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen} />
        </Suspense>
      )}

      {/* Bottom ornament */}
      <div className="flex items-center gap-3 px-6 pt-4 pb-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/20 to-primary/30" />
        <span className="text-primary/30 text-[10px] tracking-[0.4em] select-none">◆</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/20 to-primary/30" />
      </div>

      {/* Version footer */}
      <Link to="/changelog" className="block text-center text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors select-none pt-1 pb-2">
        v{import.meta.env.VERSION}{import.meta.env.COMMIT_TAG ? '' : '+'} ({new Date(import.meta.env.BUILD_DATE).toLocaleDateString()})
      </Link>

      {/* Magic sigil — appears after 2 min inactivity, only when magic is locked */}
      {!config.magicMouse && sigilVisible && (<div className="flex justify-center pt-16 pb-12">
        <button
          onClick={unlockMagic}
          className="relative group focus:outline-none"
          aria-label={config.magicMouse ? intl.formatMessage({ id: 'settings.openMagic', defaultMessage: "Open Magic settings" }) : intl.formatMessage({ id: 'settings.unlockMagic', defaultMessage: "Unlock magical potential" })}
        >
          {/* Ambient radial glow pool — tight, close to the image */}
          <div
            className="absolute inset-0 rounded-full blur-xl animate-pulse-slow"
            style={{
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.2), transparent 60%)',
              opacity: sigilFlash ? 1 : undefined,
              transform: sigilFlash ? 'scale(1.5)' : undefined,
              transition: 'opacity 0.8s, transform 0.8s',
            }}
          />
          <div
            className={!sigilFlash && !config.magicMouse ? 'animate-sigil-glow' : undefined}
            style={sigilFlash || config.magicMouse ? {
              opacity: sigilFlash ? 1 : 0.55,
              filter: sigilFlash
                ? 'drop-shadow(0 0 20px hsl(var(--primary))) drop-shadow(0 0 40px hsl(var(--primary) / 0.4))'
                : 'drop-shadow(0 0 8px hsl(var(--primary) / 0.7))',
              transform: sigilFlash ? 'scale(1.12)' : 'scale(1)',
              transition: 'opacity 0.8s, filter 0.8s, transform 0.5s',
            } : undefined}
          >
            <IntroImage src="/magic-intro.png" size="w-72" />
          </div>
        </button>
      </div>)}
    </main>
  );
}
