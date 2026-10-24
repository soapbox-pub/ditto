import { Link } from 'react-router-dom';
import { Info, BookOpen, Shield, Code, ScrollText } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

interface LinkFooterProps {
  /** Optional callback fired when an internal (React Router) link is clicked. */
  onNavigate?: () => void;
}

const chipClass =
  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors';
const iconClass = 'size-3 shrink-0';

/** Shared footer links used in both sidebars. */
export function LinkFooter({ onNavigate }: LinkFooterProps) {
  const intl = useIntl();

  return (
    <footer className="mt-auto pt-3 pb-3 sidebar:bg-background/85 sidebar:rounded-2xl sidebar:px-1.5 sidebar:py-2">
      <nav className="flex items-center justify-center gap-0.5 flex-wrap" aria-label={intl.formatMessage({ id: 'linkFooter.ariaLabel', defaultMessage: 'Footer links' })}>
        <a
          href="https://about.ditto.pub"
          className={chipClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Info className={iconClass} />
          <FormattedMessage id="linkFooter.about" defaultMessage="About" />
        </a>

        <a
          href="https://about.ditto.pub/docs/"
          className={chipClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BookOpen className={iconClass} />
          <FormattedMessage id="linkFooter.docs" defaultMessage="Docs" />
        </a>

        <Link to="/privacy" className={chipClass} onClick={onNavigate}>
          <Shield className={iconClass} />
          <FormattedMessage id="linkFooter.privacy" defaultMessage="Privacy" />
        </Link>

        <a
          href="https://gitlab.com/soapbox-pub/ditto"
          className={chipClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Code className={iconClass} />
          <FormattedMessage id="linkFooter.source" defaultMessage="Source" />
        </a>

        <Link to="/changelog" className={chipClass} onClick={onNavigate}>
          <ScrollText className={iconClass} />
          <FormattedMessage id="linkFooter.changelog" defaultMessage="Changelog" />
        </Link>

        <a
          href="https://shakespeare.diy/clone?url=https%3A%2F%2Fgitlab.com%2Fsoapbox-pub%2Fditto.git"
          className={chipClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="text-xs leading-none" aria-hidden>🎭</span>
          <FormattedMessage id="linkFooter.editWithShakespeare" defaultMessage="Edit with Shakespeare" />
        </a>
      </nav>
    </footer>
  );
}
