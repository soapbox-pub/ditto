import { useSeoMeta } from '@/hooks/useSeoMeta';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { ChevronRight, Languages, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { IntroImage } from '@/components/IntroImage';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { toast } from '@/hooks/useToast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isUsingSystemLanguage, LANGUAGE_OPTIONS, setLanguage } from '@/i18n';

const RequestToVanishDialog = lazy(() => import('@/components/RequestToVanishDialog').then(m => ({ default: m.RequestToVanishDialog })));

interface SettingsSection {
  id: string;
  illustration?: string;
  path: string;
  requiresAuth?: boolean;
}

const settingsSections: SettingsSection[] = [
  {
    id: 'profile',
    illustration: '/profile-intro.png',
    path: '/settings/profile',
    requiresAuth: true,
  },
  {
    id: 'feed',
    illustration: '/community-intro.png',
    path: '/settings/feed',
  },
  {
    id: 'content',
    illustration: '/mute-intro.png',
    path: '/settings/content',
  },
  {
    id: 'network',
    illustration: '/relay-intro.png',
    path: '/settings/network',
    requiresAuth: true,
  },
  {
    id: 'notifications',
    illustration: '/notification-intro.png',
    path: '/settings/notifications',
    requiresAuth: true,
  },
  {
    id: 'advanced',
    illustration: '/advanced-intro.png',
    path: '/settings/advanced',
  },
  {
    id: 'magic',
    illustration: '/magic-intro.png',
    path: '/settings/magic',
  },
];

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const navigate = useNavigate();
  const [sigilFlash, setSigilFlash] = useState(false);
  const [sigilVisible, setSigilVisible] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [systemLanguage, setSystemLanguage] = useState(isUsingSystemLanguage());
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
    title: `${t('settings.title')} | ${config.appName}`,
    description: t('settings.metaDescription', { appName: config.appName }),
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
      title: t('settings.magicUnlocked'),
      description: t('settings.magicUnlockedDescription'),
    });
  }

  return (
    <main className="relative min-h-screen pb-16 sidebar:pb-0">
      {/* Page header */}
      <PageHeader title={t('settings.title')} icon={<Settings className="size-5" />} backTo="/" />

      {/* Codex heading + exposition */}
      <div className="px-7 pb-4 pt-4 text-center space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed select-none">
          {t('settings.intro')}<br />{t('settings.introSub')}
        </p>
        <p className="text-[10px] tracking-[0.5em] uppercase text-primary/60 select-none pt-6">{t('settings.codex')}</p>
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
                  <p className="text-sm font-semibold">{t(`settings.sections.${section.id}.label`)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`settings.sections.${section.id}.description`)}
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
            <p className="text-sm font-semibold">{t('settings.language.label')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.language.description')}
            </p>
          </div>
          <Select
            value={systemLanguage ? 'system' : (i18n.resolvedLanguage ?? 'en').split('-')[0]}
            onValueChange={(value) => {
              setLanguage(value);
              setSystemLanguage(value === 'system');
            }}
          >
            <SelectTrigger className="w-[9.5rem] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('settings.language.system')}</SelectItem>
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
            {t('settings.deleteAccount')}
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
          aria-label={config.magicMouse ? t('settings.openMagic') : t('settings.unlockMagic')}
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
