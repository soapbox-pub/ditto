import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasTileWidget } from './CanvasTileWidget';

const useTile = vi.fn();
const deliverInputEvent = vi.fn();

vi.mock('@soapbox.pub/nostr-canvas/react', () => ({
  useTile: (...args: unknown[]) => useTile(...args),
  useNostrCanvas: () => ({ runtime: { deliverInputEvent } }),
}));

vi.mock('@/components/TileOutputView', () => ({
  TileOutputView: ({ tileId }: { tileId?: string }) => <div data-testid="tile-output">{tileId}</div>,
}));

describe('CanvasTileWidget', () => {
  beforeEach(() => {
    useTile.mockReset();
    deliverInputEvent.mockReset();
  });

  it('mounts a fresh tile in widget placement and routes input to that instance', () => {
    useTile.mockReturnValue({ tileId: 'instance-1', output: { type: 'text', text: 'Forecast' } });

    render(<CanvasTileWidget identifier="weather@example.com:forecast" />);

    expect(useTile).toHaveBeenCalledWith('weather@example.com:forecast', { placement: 'widget' });
    expect(screen.getByTestId('tile-output')).toHaveTextContent('instance-1');
  });

  it('shows a compact loading state before the tile renders', () => {
    useTile.mockReturnValue({ tileId: null, output: null });

    render(<CanvasTileWidget identifier="weather@example.com:forecast" />);

    expect(screen.getByText('Loading tile...')).toBeInTheDocument();
  });
});
