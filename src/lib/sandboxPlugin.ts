/**
 * SandboxPlugin — Capacitor plugin for native sandboxed WebViews.
 *
 * On iOS, each sandbox gets a WKWebView with a custom URL scheme handler
 * (`sbx-<id>://`) that intercepts all resource requests and forwards them
 * to the JS layer. On Android, the same is achieved via
 * `shouldInterceptRequest`. This replaces iframe.diy on native platforms.
 *
 * The plugin is registered as "SandboxPlugin" and is only usable on native
 * platforms. On web, SandboxFrame uses iframe.diy directly.
 */

import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Plugin method options
// ---------------------------------------------------------------------------

/** Options for creating a new sandbox WebView. */
export interface SandboxCreateOptions {
  /** Unique identifier for this sandbox (the HMAC-derived subdomain ID). */
  id: string;
  /** Absolute position and size of the WebView within the app window. */
  frame: { x: number; y: number; width: number; height: number };
}

/** Options for updating the WebView frame (position/size). */
export interface SandboxUpdateFrameOptions {
  id: string;
  frame: { x: number; y: number; width: number; height: number };
}

/** A serialised fetch response sent back to the native WebView. */
export interface SandboxRespondToFetchOptions {
  id: string;
  requestId: string;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string | null;
  };
}

/** Options for posting a message into the sandbox (to injected scripts). */
export interface SandboxPostMessageOptions {
  id: string;
  message: Record<string, unknown>;
}

/** Options for destroying a sandbox. */
export interface SandboxDestroyOptions {
  id: string;
}

// ---------------------------------------------------------------------------
// Plugin event payloads
// ---------------------------------------------------------------------------

/** A fetch request forwarded from the native WebView's URL scheme handler. */
export interface SandboxFetchEvent {
  /** The sandbox ID this request belongs to. */
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

/** A JSON-RPC message from an injected script inside the sandbox. */
export interface SandboxScriptMessageEvent {
  /** The sandbox ID this message came from. */
  id: string;
  /** The JSON-RPC message body. */
  message: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

/** Options for navigating the sandbox WebView to its entry point. */
export interface SandboxNavigateOptions {
  id: string;
}

export interface SandboxPluginInterface {
  /** Create a new sandbox WebView with a loading spinner (does not navigate). */
  create(options: SandboxCreateOptions): Promise<void>;

  /** Navigate the sandbox WebView to its entry point (triggers resource loading). */
  navigate(options: SandboxNavigateOptions): Promise<void>;

  /** Update the position/size of an existing sandbox WebView. */
  updateFrame(options: SandboxUpdateFrameOptions): Promise<void>;

  /** Send a fetch response back to the native WebView for a pending request. */
  respondToFetch(options: SandboxRespondToFetchOptions): Promise<void>;

  /** Post a JSON-RPC message to injected scripts inside the sandbox. */
  postMessage(options: SandboxPostMessageOptions): Promise<void>;

  /** Destroy a sandbox WebView and clean up all resources. */
  destroy(options: SandboxDestroyOptions): Promise<void>;

  /** Listen for fetch requests from the native WebView. */
  addListener(
    eventName: 'fetch',
    handler: (event: SandboxFetchEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** Listen for JSON-RPC messages from injected scripts inside the sandbox. */
  addListener(
    eventName: 'scriptMessage',
    handler: (event: SandboxScriptMessageEvent) => void,
  ): Promise<PluginListenerHandle>;
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

/**
 * The SandboxPlugin Capacitor plugin.
 * Only usable on native platforms (iOS/Android). On web, SandboxFrame
 * falls back to the iframe.diy service worker sandbox.
 */
export const SandboxPlugin = registerPlugin<SandboxPluginInterface>('SandboxPlugin');
