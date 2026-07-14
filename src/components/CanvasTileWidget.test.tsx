import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasTileWidget } from './CanvasTileWidget';

const { useTile, deliverInputEvent, canUseCanvasTiles } = vi.hoisted(() => ({
  useTile: vi.fn(),
  deliverInputEvent: vi.fn(),
  canUseCanvasTiles: vi.fn(),
}));

vi.mock('@soapbox.pub/nostr-canvas/react', () => ({
  useTile: (...args: unknown[]) => useTile(...args),
  useNostrCanvas: () => ({ runtime: { deliverInputEvent } }),
}));

vi.mock('@/components/TileOutputView', () => ({
  TileOutputView: ({ tileId }: { tileId?: string }) => <div data-testid="tile-output">{tileId}</div>,
}));

vi.mock('@/lib/canvasPlatform', () => ({ canUseCanvasTiles }));

describe('CanvasTileWidget', () => {
  beforeEach(() => {
    useTile.mockReset();
    deliverInputEvent.mockReset();
    canUseCanvasTiles.mockReturnValue(true);
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

  it('does not mount a tile engine in a native app', () => {
    canUseCanvasTiles.mockReturnValue(false);

    render(<CanvasTileWidget identifier="weather@example.com:forecast" />);

    expect(useTile).not.toHaveBeenCalled();
    expect(screen.getByText('Tiles on mobile apps are coming soon.')).toBeInTheDocument();
  });
});
