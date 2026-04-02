import { Link } from 'react-router-dom';

interface LinkFooterProps {
  /** Optional callback fired when an internal (React Router) link is clicked. */
  onNavigate?: () => void;
}

/** Shared footer links used in both sidebars. */
export function LinkFooter({ onNavigate }: LinkFooterProps) {
  return (
    <footer className="mt-auto pt-4 pb-4 text-left bg-background/85 rounded-xl p-3 -mx-1">
      <p className="text-xs text-muted-foreground">
        <a
          href="https://about.ditto.pub"
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          About
        </a>
        {' · '}
        <a
          href="https://about.ditto.pub/docs/"
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Docs
        </a>
        {' · '}
        <Link to="/privacy" className="text-primary hover:underline" onClick={onNavigate}>
          Privacy
        </Link>
        {' · '}
        <a
          href="https://gitlab.com/soapbox-pub/ditto"
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source
        </a>
        {' · '}
        <Link to="/changelog" className="text-primary hover:underline" onClick={onNavigate}>
          Changelog
        </Link>
        {' · '}
        <a
          href="https://shakespeare.diy/clone?url=https%3A%2F%2Fgitlab.com%2Fsoapbox-pub%2Fditto.git"
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Edit with Shakespeare
        </a>
      </p>
    </footer>
  );
}
