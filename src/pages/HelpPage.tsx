import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, HelpCircle, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { TeamSoapboxCard } from '@/components/TeamSoapboxCard';
import { HelpFAQSection } from '@/components/HelpFAQSection';

export function HelpPage() {
  const { config } = useAppContext();
  useLayoutOptions({});

  useSeoMeta({
    title: `Help | ${config.appName}`,
    description: `Get help with ${config.appName} — Nostr 101, FAQs, and support`,
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      {/* Page header */}
      <div className="sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4 px-4 pt-4 pb-3">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            <HelpCircle className="size-5" />
            <h1 className="text-xl font-bold">Help</h1>
          </div>
        </div>
      </div>

      {/* Team Soapbox follow pack */}
      <TeamSoapboxCard className="px-4 pt-2 pb-4" />

      {/* FAQ heading */}
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-lg font-bold">Frequently Asked Questions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Everything you need to know about Nostr, Ditto, and how it all works.
        </p>
      </div>

      {/* FAQ accordion sections */}
      <HelpFAQSection className="px-4 pb-8" />

      {/* Privacy policy link */}
      <div className="px-4 pb-8">
        <Link
          to="/privacy"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Shield className="size-4" />
          <span>Privacy Policy</span>
        </Link>
      </div>
    </main>
  );
}
