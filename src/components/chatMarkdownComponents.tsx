import type { Components } from 'react-markdown';

/**
 * react-markdown component overrides shared by the AI chat markdown renderers
 * (assistant bubbles and tool-call results).
 *
 * Tailwind's typography plugin scrolls wide `<pre>` blocks horizontally
 * (`prose-pre:overflow-x-auto`), but it does not wrap a `<table>` in a scroll
 * container. Without this override a wide table overflows the chat bubble, so
 * wrap the table in a scrollable div here.
 */
export const chatMarkdownComponents: Components = {
  table: ({ children, node: _node, ...rest }) => (
    <div className="overflow-x-auto">
      <table {...rest}>{children}</table>
    </div>
  ),
};
