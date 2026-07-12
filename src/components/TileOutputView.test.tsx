import type { TileOutput } from '@soapbox.pub/nostr-canvas';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TileOutputView } from './TileOutputView';

describe('TileOutputView', () => {
  it('renders supported layout, text, sanitized images, markdown, forms, and buttons', () => {
    const onInput = vi.fn();
    const output: TileOutput = {
      type: 'stack',
      surface: true,
      children: [
        { type: 'text', text: 'Weather station', style: 'bold' },
        { type: 'image', url: 'https://images.example/weather.png', max_width: 320 },
        { type: 'markdown', content: '[Forecast](https://weather.example)' },
        {
          type: 'form',
          children: [
            { type: 'input', name: 'city', label: 'City', default_value: 'Austin' },
            { type: 'checkbox', name: 'alerts', label: 'Alerts', default_value: true },
            { type: 'button', text: 'Save', onclick: 'save_city', submit_form: true },
          ],
        },
      ],
    };

    render(<TileOutputView output={output} tileId="tile-1" onInput={onInput} />);

    expect(screen.getByText('Weather station')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://images.example/weather.png');
    expect(screen.getByRole('link', { name: 'Forecast' })).toHaveAttribute('href', 'https://weather.example/');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onInput).toHaveBeenCalledWith('save_city', { city: 'Austin', alerts: true });
  });

  it.each<TileOutput>([
    { type: 'feed', filters: [{ kinds: [1] }], render_tile: 'SELF' },
    { type: 'comments', event: 'note1unsupported' },
    { type: 'nevent', nip19: 'nevent1unsupported' },
  ])('fails closed for unsupported $type nodes without fetching or routing', (output) => {
    render(<TileOutputView output={output} />);

    expect(screen.getByText('This tile feature is not supported yet.')).toBeInTheDocument();
  });
});
