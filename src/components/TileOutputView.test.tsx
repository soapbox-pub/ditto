import type { TileOutput } from '@soapbox.pub/nostr-canvas';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TileOutputView } from './TileOutputView';

const { requestImageUpload } = vi.hoisted(() => ({
  requestImageUpload: vi.fn<() => Promise<string>>(),
}));

vi.mock('@soapbox.pub/nostr-canvas/react', () => ({
  useNostrCanvas: () => ({ runtime: { requestImageUpload } }),
}));

vi.mock('@/components/ui/qrcode', () => ({
  QRCodeCanvas: ({ value, className }: { value: string; className?: string }) => (
    <canvas data-testid="qr-canvas" data-value={value} className={className} role="img" aria-label="QR code" />
  ),
}));

const VALID_QR_HANDLE = 'ncqr1:48656c6c6f'; // hex for "Hello"
const CORRUPT_QR_HANDLE = 'ncqr1:bad';

describe('TileOutputView', () => {
  beforeEach(() => {
    requestImageUpload.mockReset();
  });

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

  it('renders a QR code for a valid QR handle image node and does not render an img with the handle as src', () => {
    const output: TileOutput = { type: 'image', url: VALID_QR_HANDLE };
    const { container } = render(<TileOutputView output={output} />);

    // Should render the QR canvas with the decoded payload, not an <img> with the handle as src
    const qrCanvas = screen.getByTestId('qr-canvas');
    expect(qrCanvas).toBeInTheDocument();
    expect(qrCanvas).toHaveAttribute('data-value', 'Hello');
    expect(container.querySelector('img[src]')).toBeNull();
  });

  it('renders nothing for a corrupt QR handle', () => {
    const output: TileOutput = { type: 'image', url: CORRUPT_QR_HANDLE };
    const { container } = render(<TileOutputView output={output} />);

    expect(screen.queryByTestId('qr-canvas')).toBeNull();
    expect(container.querySelector('img[src]')).toBeNull();
  });

  it('renders a password input with type="password"', () => {
    const output: TileOutput = { type: 'input', name: 'secret', label: 'Secret', input_type: 'password' };
    render(<TileOutputView output={output} />);

    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
  });

  it('falls back to type="text" for an unknown input_type', () => {
    const output: TileOutput = { type: 'input', name: 'q', label: 'Query', input_type: 'custom_hint' as never };
    render(<TileOutputView output={output} />);

    expect(screen.getByLabelText('Query')).toHaveAttribute('type', 'text');
  });

  it('renders an image_upload node outside a form as a disabled button with default text', () => {
    const output: TileOutput = { type: 'image_upload', name: 'photo' };
    render(<TileOutputView output={output} />);

    const button = screen.getByRole('button', { name: 'Upload image' });
    expect(button).toBeDisabled();
  });

  it('renders an image_upload node outside a form with custom text', () => {
    const output: TileOutput = { type: 'image_upload', name: 'photo', text: 'Choose photo' };
    render(<TileOutputView output={output} />);

    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeDisabled();
  });

  it('renders an image_upload node inside a form with a clickable button and hidden input, and shows preview after upload', async () => {
    requestImageUpload.mockResolvedValue('https://blossom.example/photo.png');
    const output: TileOutput = {
      type: 'form',
      children: [{ type: 'image_upload', name: 'photo', label: 'Photo', text: 'Pick photo' }],
    };
    const { container } = render(<TileOutputView output={output} />);

    const button = screen.getByRole('button', { name: 'Pick photo' });
    expect(button).not.toBeDisabled();

    const hiddenInput = screen.getByDisplayValue('');
    expect(hiddenInput).toHaveAttribute('type', 'hidden');
    expect(hiddenInput).toHaveAttribute('name', 'photo');
    expect(container.querySelector('img')).toBeNull();

    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://blossom.example/photo.png')).toBeInTheDocument();
    });
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://blossom.example/photo.png');
  });

  it('does not set preview or hidden input value for a javascript: URL returned from upload', async () => {
    requestImageUpload.mockResolvedValue('javascript:alert(1)');
    const output: TileOutput = {
      type: 'form',
      children: [{ type: 'image_upload', name: 'photo' }],
    };
    const { container } = render(<TileOutputView output={output} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }));
    await waitFor(() => {
      expect(requestImageUpload).toHaveBeenCalled();
    });

    // Hidden input should remain empty and no <img> should appear
    expect(screen.getByDisplayValue('')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('disables the upload button while an upload is in flight and re-enables it on resolve', async () => {
    let resolveUpload!: (url: string) => void;
    requestImageUpload.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    const output: TileOutput = {
      type: 'form',
      children: [{ type: 'image_upload', name: 'photo', text: 'Pick photo' }],
    };
    render(<TileOutputView output={output} />);

    const button = screen.getByRole('button', { name: 'Pick photo' });
    fireEvent.click(button);
    expect(button).toBeDisabled();

    resolveUpload('https://blossom.example/photo.png');
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
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
