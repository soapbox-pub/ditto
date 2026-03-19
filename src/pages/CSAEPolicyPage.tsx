import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';

export function CSAEPolicyPage() {
  const { config } = useAppContext();
  useLayoutOptions({});

  useSeoMeta({
    title: `Child Safety Policy | ${config.appName}`,
    description: `${config.appName}'s policy on child sexual abuse and exploitation (CSAE) — our commitment to child safety on the Nostr network`,
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
            <ShieldAlert className="size-5" />
            <h1 className="text-xl font-bold">Child Safety Policy</h1>
          </div>
        </div>
      </div>

      <article className="px-4 pb-8 space-y-6 text-sm text-foreground/90 leading-relaxed">
        <p className="text-xs text-muted-foreground">Last updated: March 19, 2026</p>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Our Commitment</h2>
          <p>
            {config.appName} has a <strong>zero-tolerance policy</strong> toward child sexual abuse and exploitation
            (CSAE) material. The safety of children is paramount, and we are committed to doing everything within
            our power as a client application to prevent the distribution, promotion, or facilitation of CSAE
            content through our app.
          </p>
          <p>
            This policy applies to all content accessible through {config.appName}, including text, images, videos,
            links, and any other media. It covers all forms of CSAE, including but not limited to imagery,
            solicitation, grooming, trafficking, and the sexualization of minors.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">How {config.appName} Works</h2>
          <p>
            {config.appName} is a <strong>client application</strong> for the Nostr protocol, an open, decentralized
            communication network. Understanding the architecture is important context for this policy:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Our infrastructure:</strong> We operate the <strong>Ditto relay</strong> and{' '}
              <strong>Ditto Blossom server</strong>, which serve as the default relay and file host for
              {' '}{config.appName}. We have full moderation control over content stored on these services.
            </li>
            <li>
              <strong>Third-party relays:</strong> Users may also connect to additional Nostr relays operated by
              independent third parties. {config.appName} fetches and renders content from whatever relays the
              user is connected to. We do not have moderation control over third-party relays, but we control
              what the app displays.
            </li>
            <li>
              <strong>Third-party media servers:</strong> Users may upload images and videos to third-party
              Blossom-compatible file servers. We do not operate or moderate these external services.
            </li>
          </ul>
          <p>
            We take full responsibility for the experience within our app. On our own infrastructure (Ditto relay
            and Ditto Blossom server), we can directly remove content and ban offending accounts. For content
            originating from third-party services, we actively block it from being displayed within
            {' '}{config.appName}.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Prohibited Content and Behavior</h2>
          <p>
            The following is strictly prohibited on {config.appName}. Users found engaging in any of the following
            will be subject to immediate action:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>CSAM (Child Sexual Abuse Material):</strong> Any visual depiction of sexually explicit
              conduct involving a minor, including photographs, videos, and digitally or AI-generated images.
            </li>
            <li>
              <strong>Grooming:</strong> Any attempt to build a relationship with a minor for the purpose of
              sexual exploitation or abuse.
            </li>
            <li>
              <strong>Solicitation:</strong> Requesting, offering, or facilitating the exchange of CSAE material
              or sexual contact with minors.
            </li>
            <li>
              <strong>Sexualization of minors:</strong> Content that sexualizes minors, including suggestive or
              sexual commentary about children, even if no explicit imagery is involved.
            </li>
            <li>
              <strong>Trafficking:</strong> Any content that facilitates, promotes, or coordinates the trafficking
              of minors for sexual purposes.
            </li>
            <li>
              <strong>Links and references:</strong> Sharing links to external sites or resources containing CSAE
              material, or providing instructions on how to find or produce such material.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Detection and Prevention</h2>
          <p>
            {config.appName} implements multiple layers of protection to combat CSAE:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Content filtering:</strong> We maintain and enforce content filtering mechanisms within the
              app to block known CSAE material from being displayed, regardless of which relay it originates from.
            </li>
            <li>
              <strong>User reporting:</strong> We provide in-app reporting tools that allow users to flag
              suspected CSAE content for immediate review.
            </li>
            <li>
              <strong>Ditto relay moderation:</strong> On our own Ditto relay, we actively moderate content and
              will immediately remove any CSAE material and permanently ban associated accounts.
            </li>
            <li>
              <strong>Ditto Blossom server moderation:</strong> On our own Ditto Blossom file server, we will
              immediately delete any CSAE media and ban the uploading account.
            </li>
            <li>
              <strong>Third-party relay blocking:</strong> Third-party relays known to host or tolerate CSAE
              material may be removed from {config.appName}'s default relay list and blocked from being added by
              users.
            </li>
            <li>
              <strong>Mute and block tools:</strong> Users can mute or block accounts at the client level,
              preventing content from those accounts from appearing in their feed.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Enforcement Actions</h2>
          <p>
            When CSAE content or behavior is identified, {config.appName} will take the following actions as
            applicable:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Immediate content blocking:</strong> Known CSAE content will be blocked from rendering in
              the app through content filters and blocklists.
            </li>
            <li>
              <strong>Removal from Ditto infrastructure:</strong> CSAE content on the Ditto relay and Ditto
              Blossom server will be immediately deleted, and the associated accounts permanently banned.
            </li>
            <li>
              <strong>Account blocking:</strong> Nostr public keys associated with CSAE activity will be added to
              app-level blocklists, preventing their content from appearing in {config.appName} regardless of
              which relay it is fetched from.
            </li>
            <li>
              <strong>Relay blocking:</strong> Third-party relays that fail to address CSAE content may be
              removed from {config.appName}'s default relay list and blocked from being added by users.
            </li>
            <li>
              <strong>Reporting to authorities:</strong> We will report identified CSAE material to the{' '}
              <a
                href="https://www.missingkids.org/gethelpnow/cybertipline"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                National Center for Missing & Exploited Children (NCMEC)
              </a>{' '}
              via the CyberTipline, and to applicable law enforcement agencies.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Reporting CSAE Content</h2>
          <p>
            If you encounter any content on {config.appName} that you believe constitutes child sexual abuse or
            exploitation, please report it immediately:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>In-app reporting:</strong> Use the report button available on any post or user profile to
              flag content for review.
            </li>
            <li>
              <strong>Contact us directly:</strong> Reach out to our team at{' '}
              <a href="https://soapbox.pub" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                soapbox.pub
              </a>{' '}
              with details of the content, including any relevant Nostr event IDs or public keys.
            </li>
            <li>
              <strong>Report to NCMEC:</strong> You can also file a report directly with the{' '}
              <a
                href="https://www.missingkids.org/gethelpnow/cybertipline"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                NCMEC CyberTipline
              </a>.
            </li>
            <li>
              <strong>Contact law enforcement:</strong> If you believe a child is in immediate danger, contact
              your local law enforcement or call <strong>911</strong> (US) immediately.
            </li>
          </ul>
          <p>
            All reports of CSAE content are treated with the highest priority and will be reviewed as quickly as
            possible.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Cooperation with Law Enforcement</h2>
          <p>
            {config.appName} is committed to cooperating fully with law enforcement agencies investigating CSAE.
            While {config.appName} does not store user content on its own servers, we will:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              Provide any information available to us -- including data from the Ditto relay and Ditto Blossom
              server -- that may assist in investigations, in accordance with applicable law.
            </li>
            <li>
              Identify and share the specific relay URLs and file server URLs where offending content was
              observed, so law enforcement can contact those operators directly.
            </li>
            <li>
              Preserve any available evidence or information upon receiving a valid legal request.
            </li>
            <li>
              Report identified CSAE material to NCMEC and other relevant authorities proactively.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Decentralized Architecture Considerations</h2>
          <p>
            Nostr's decentralized nature means that no single entity has complete control over all content on the
            network. {config.appName} acknowledges the following realities and our approach to each:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Full control over our own infrastructure:</strong> We can and do remove content from the
              Ditto relay and Ditto Blossom server. CSAE material found on our infrastructure is deleted
              immediately and accounts are permanently banned.
            </li>
            <li>
              <strong>Limited control over third-party relays:</strong> We cannot delete content from third-party
              relays. However, we block such content from being displayed within our app through client-level
              filters and blocklists.
            </li>
            <li>
              <strong>Users control their relay connections:</strong> While users can connect to relays of their
              choice, {config.appName} reserves the right to block connections to relays known to host CSAE
              content.
            </li>
            <li>
              <strong>Public keys are pseudonymous:</strong> Nostr accounts are identified by cryptographic key
              pairs rather than verified identities. We will still block and report offending keys and cooperate
              with law enforcement to identify individuals behind them.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Appeals</h2>
          <p>
            If you believe your content or account has been incorrectly flagged or blocked under this policy,
            you may contact us at{' '}
            <a href="https://soapbox.pub" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              soapbox.pub
            </a>{' '}
            to request a review. We will evaluate appeals on a case-by-case basis. However, we err on the side
            of child safety in all decisions, and our determination is final.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Changes to This Policy</h2>
          <p>
            We may update this child safety policy as our tools, processes, and the Nostr ecosystem evolve.
            Changes will be reflected on this page with an updated date. We are committed to continuously
            improving our ability to detect, prevent, and respond to CSAE content.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-foreground">Contact</h2>
          <p>
            For questions about this policy or to report CSAE content, contact the team behind
            {' '}{config.appName} at{' '}
            <a href="https://soapbox.pub" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              soapbox.pub
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}
