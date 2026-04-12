/**
 * SandboxPlugin — Capacitor plugin for native sandbox iframe support.
 *
 * On iOS, a single WKURLSchemeHandler for the `sbx` scheme is registered on
 * the main Capacitor WKWebView. Iframes load from `sbx://<sandbox-id>/path`
 * — each hostname is a different web origin with isolated storage.
 *
 * On Android, a custom BridgeWebViewClient subclass intercepts requests to
 * `https://<sandbox-id>.sandbox.native/path` from iframes in the main WebView.
 *
 * Both platforms forward intercepted requests to the JS layer as `fetch`
 * events. JS resolves the file and responds with `respondToFetch()`.
 *
 * This replaces the old approach of creating separate native WebView overlays.
 * Sandbox content now lives in regular `<iframe>` elements, so web UI
 * (permission prompts, popovers) naturally layers on top.
 */

import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Plugin method options
// ---------------------------------------------------------------------------

/** A serialised fetch response sent back to the native scheme handler. */
export interface SandboxRespondToFetchOptions {
  /** Unique request ID from the fetch event. */
  requestId: string;
  /** The serialised HTTP response. */
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string | null;
  };
}

// ---------------------------------------------------------------------------
// Plugin event payloads
// ---------------------------------------------------------------------------

/** A fetch request forwarded from the native scheme handler. */
export interface SandboxFetchEvent {
  /** The sandbox ID (hostname) this request belongs to. */
  id: string;
  /** Unique request ID — pass back to `respondToFetch`. */
  requestId: string;
  /** The serialised HTTP request. */
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
  };
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

export interface SandboxPluginInterface {
  /** Send a fetch response back to the native scheme handler for a pending request. */
  respondToFetch(options: SandboxRespondToFetchOptions): Promise<void>;

  /** Listen for fetch requests from sandbox iframes intercepted by native code. */
  addListener(
    eventName: 'fetch',
    handler: (event: SandboxFetchEvent) => void,
  ): Promise<PluginListenerHandle>;
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

/**
 * The SandboxPlugin Capacitor plugin.
 * Only usable on native platforms (iOS/Android). On web, SandboxFrame
 * uses the iframe.diy service worker sandbox.
 */
export const SandboxPlugin = registerPlugin<SandboxPluginInterface>('SandboxPlugin');
