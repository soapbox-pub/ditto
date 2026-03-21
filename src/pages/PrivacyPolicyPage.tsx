import { useSeoMeta } from '@unhead/react';
import { Shield } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';

export function PrivacyPolicyPage() {
  const { config } = useAppContext();
  useLayoutOptions({});

  useSeoMeta({
    title: `Privacy Policy | ${config.appName}`,
    description: `Privacy policy for ${config.appName} — how your data is handled on the Nostr network`,
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      {/* Page header */}
      <PageHeader title="Privacy Policy" icon={<Shield className="size-5" />} backTo="/" />

      <article className="px-4 pb-8 space-y-6 text-sm text-foreground/90 leading-relaxed">
        <p className="text-xs text-muted-foreground">Last updated: March 18, 2026</p>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Overview</h2>
          <p>
            {config.appName} is a client application for the <strong>Nostr protocol</strong>, an open, decentralized
            communication network. This privacy policy explains how {config.appName} handles your data and what
            information is shared when you use the app.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">How Nostr Works</h2>
          <p>
            Nostr is a decentralized protocol. When you publish content, it is sent to one or more <strong>relays</strong> (independent
            servers) that you choose. {config.appName} does not operate these relays and has no control over data
            stored on them. Content published to Nostr relays is <strong>public by default</strong> and may be visible to anyone.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Data We Collect</h2>
          <p>{config.appName} is designed to minimize data collection. Here is what the app accesses:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Public key:</strong> Your Nostr public key is used to identify your account. It is not considered private information on the Nostr network.
            </li>
            <li>
              <strong>Relay connections:</strong> The app connects to Nostr relays on your behalf to fetch and publish events. Relay operators may log connection metadata such as your IP address.
            </li>
            <li>
              <strong>Local storage:</strong> Preferences, account information, and cached data are stored locally in your browser. This data does not leave your device unless you explicitly publish it.
            </li>
            <li>
              <strong>Published events:</strong> Any content you publish (posts, reactions, profile updates, etc.) is sent to your configured relays and becomes part of the public Nostr network.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Private Keys</h2>
          <p>
            {config.appName} supports signing via browser extensions (NIP-07) and other external signers. When using
            these methods, your private key is managed by the signer and is <strong>never</strong> accessed or stored
            by {config.appName}. We strongly recommend using a browser extension or hardware signer to protect your
            private key.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Direct Messages</h2>
          <p>
            Direct messages on Nostr are encrypted between sender and recipient using the NIP-04 or NIP-44
            encryption standards. While message content is encrypted, metadata such as the sender and recipient
            public keys and timestamps are visible on relays.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">File Uploads</h2>
          <p>
            When you upload files (images, videos, etc.), they are sent to Blossom-compatible file servers. These
            servers are operated by third parties and may have their own privacy policies. Uploaded files are
            generally publicly accessible via their URLs.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Analytics</h2>
          <p>
            {config.appName} may use privacy-friendly analytics (such as Plausible) to understand general usage
            patterns. These analytics do not use cookies, do not track individual users, and do not collect
            personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Third-Party Services</h2>
          <p>The app may interact with the following third-party services:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Nostr relays:</strong> For reading and publishing events</li>
            <li><strong>Blossom servers:</strong> For file uploads and media hosting</li>
            <li><strong>Lightning Network / NWC:</strong> For processing zap payments, if you choose to use them</li>
            <li><strong>NIP-05 providers:</strong> For verifying Nostr addresses</li>
          </ul>
          <p>
            Each of these services is operated independently and may have its own data handling practices.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Data Removal</h2>
          <p>
            Because Nostr is a decentralized protocol, {config.appName} cannot guarantee the deletion of content
            once it has been published to relays. You can request deletion by publishing a delete event (NIP-09),
            but individual relays are not obligated to honor these requests. To clear local data, you can clear
            your browser's storage for this site.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. Changes will be reflected on this page with an
            updated date. Continued use of {config.appName} after changes constitutes acceptance of the revised policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Contact</h2>
          <p>
            If you have questions about this privacy policy, you can reach the team behind {config.appName} at{' '}
            <a href="https://soapbox.pub" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              soapbox.pub
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}
