import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioVisualizer } from '@/components/AudioVisualizer';
import { TestApp } from '@/test/TestApp';

const URL_UNDER_TEST = 'https://media.example/audio';
const KEY = new Uint8Array(32).fill(7);
const NONCE = new Uint8Array(12).fill(9);

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Encrypt a payload the way an uploader would, tag appended. */
async function encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', KEY, { name: 'AES-GCM' }, false, ['encrypt']);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: NONCE }, key, plaintext);
  return new Uint8Array(buf);
}

describe('AudioVisualizer with an encrypted source', () => {
  let objectUrls = 0;

  beforeEach(() => {
    objectUrls = 0;
    // jsdom implements neither of these.
    URL.createObjectURL = vi.fn(() => `blob:test/${++objectUrls}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wires up playback state once decryption finishes', async () => {
    const ciphertext = await encrypt(new TextEncoder().encode('fake mp3 bytes'));

    vi.stubGlobal('fetch', vi.fn(async () => new Response(ciphertext, {
      status: 200,
      headers: { 'content-length': String(ciphertext.byteLength) },
    })));

    const { container } = render(
      <TestApp>
        <AudioVisualizer
          src={URL_UNDER_TEST}
          mime="audio/mpeg"
          encryption={{ algorithm: 'aes-gcm', key: hex(KEY), nonce: hex(NONCE) }}
        />
      </TestApp>,
    );

    // The <audio> element must already exist while the file is decrypting: the
    // component attaches its listeners on mount and never re-attaches them, so
    // an element that only showed up afterwards would play sound while leaving
    // the controls frozen.
    expect(await screen.findByText('Decrypting…')).toBeInTheDocument();
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();

    await waitFor(() => {
      expect(container.querySelector('audio source')).not.toBeNull();
    });
    expect(screen.queryByText('Decrypting…')).not.toBeInTheDocument();
    // Same element throughout — remounting it would drop the listeners.
    expect(container.querySelector('audio')).toBe(audio);

    // The browser fires this when playback actually begins.
    act(() => {
      audio!.dispatchEvent(new Event('play'));
    });

    // Controls only appear once the component has seen the play event, so this
    // failing means the listeners never got attached.
    expect(await screen.findByLabelText('Pause')).toBeInTheDocument();
  });

  it('keeps the element mounted when the file cannot be decrypted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));

    const { container } = render(
      <TestApp>
        <AudioVisualizer
          src={URL_UNDER_TEST}
          encryption={{ algorithm: 'aes-gcm', key: hex(KEY), nonce: hex(NONCE) }}
        />
      </TestApp>,
    );

    expect(await screen.findByText(/couldn't be decrypted/)).toBeInTheDocument();
    // Never point the element at the original URL — it serves ciphertext.
    expect(container.querySelector('audio source')).toBeNull();
  });
});
