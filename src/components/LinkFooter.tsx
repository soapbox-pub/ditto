import { Link } from 'react-router-dom';

/** Shared footer links used in both sidebars. */
export function LinkFooter() {
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
        <Link to="/privacy" className="text-primary hover:underline">
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
