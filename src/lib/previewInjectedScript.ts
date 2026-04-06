/**
 * Script injected into preview iframe HTML responses.
 *
 * When using iframe.diy as the preview domain, the outer frame handles
 * service worker registration and document loading. This script provides
 * additional capabilities inside the rendered app:
 *
 * 1. Console interception - forward console.log/warn/error/info/debug to parent
 * 2. Navigation handling - track SPA navigation and handle navigate/refresh commands
 * 3. Global error handlers - capture uncaught errors and unhandled rejections
 *
 * This script is injected into <head> of HTML responses served by the fetch handler.
 * It communicates with the parent via window.parent.postMessage using JSON-RPC 2.0.
 *
 * Note: In iframe.diy's architecture, the "parent" of the inner iframe is the
 * outer frame, which transparently relays non-runtime JSON-RPC messages to the
 * actual parent. So posting to window.parent works correctly.
 */

/**
 * Returns the injectable script as a string.
 * This runs inside the inner iframe of iframe.diy.
 */
export function getPreviewInjectedScript(): string {
  return `(function() {
  'use strict';

  // =========================================================================
  // Path normalization
  //
  // iframe.diy loads the inner iframe at /index.html. Normalize this to /
  // before any SPA router initializes, so React Router etc. see the correct
  // path.
  // =========================================================================

  if (window.location.pathname === '/index.html') {
    history.replaceState(null, '', '/');
  }

  // =========================================================================
  // JSON-RPC ID generator
  //
  // iframe.diy's outer frame only relays JSON-RPC *requests* (messages with
  // an "id" field) between inner iframe and parent. Notifications (no "id")
  // are silently dropped. So all messages to the parent must include an id.
  // =========================================================================

  function rpcId() {
    return crypto.randomUUID();
  }

  // =========================================================================
  // Console Interceptor
  // =========================================================================

  var originalConsole = {};
  var consoleMethods = ['log', 'warn', 'error', 'info', 'debug'];

  consoleMethods.forEach(function(method) {
    if (typeof console[method] === 'function') {
      originalConsole[method] = console[method];

      console[method] = function() {
        var args = Array.prototype.slice.call(arguments);

        // Call original method
        try {
          originalConsole[method].apply(console, args);
        } catch (e) {
          // Continue if original fails
        }

        // Serialize arguments
        var message = args.map(function(arg) {
          if (arg === undefined) return 'undefined';
          if (arg === null) return 'null';
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, function(key, value) {
                if (value instanceof Error) {
                  return {
                    name: value.name,
                    message: value.message,
                    stack: value.stack
                  };
                }
                return value;
              });
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');

        // Send to parent (must include id for iframe.diy relay)
        try {
          window.parent.postMessage({
            jsonrpc: '2.0',
            id: rpcId(),
            method: 'console',
            params: { level: method, message: message }
          }, '*');
        } catch (e) {
          // Ignore postMessage errors
        }
      };
    }
  });

  // =========================================================================
  // Navigation Handler
  // =========================================================================

  var currentSemanticPath = '/';

  // Try to restore initial path from sessionStorage (after refresh)
  try {
    var storedPath = sessionStorage.getItem('iframe_initial_path');
    if (storedPath) {
      currentSemanticPath = storedPath;
      sessionStorage.removeItem('iframe_initial_path');
    }
  } catch (e) {
    // Ignore sessionStorage errors
  }

  function extractSemanticPath(urlOrString) {
    try {
      var url = typeof urlOrString === 'string'
        ? new URL(urlOrString, window.location.origin)
        : urlOrString;
      return url.pathname + url.search + url.hash;
    } catch (e) {
      return window.location.pathname + window.location.search + window.location.hash;
    }
  }

  function updateNavigationState() {
    var semanticPath = currentSemanticPath || extractSemanticPath(window.location);

    try {
      window.parent.postMessage({
        jsonrpc: '2.0',
        id: rpcId(),
        method: 'updateNavigationState',
        params: {
          currentUrl: semanticPath,
          canGoBack: false,
          canGoForward: false
        }
      }, '*');
    } catch (e) {
      // Ignore postMessage errors
    }
  }

  function handleNavigate(url) {
    try {
      var targetUrl = new URL(url, window.location.origin);
      if (targetUrl.origin !== window.location.origin) {
        return;
      }

      var semanticPath = extractSemanticPath(targetUrl);
      currentSemanticPath = semanticPath;
      updateNavigationState();

      // Use the original pushState to trigger SPA navigation
      originalPushState.call(window.history, {}, '', semanticPath);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    } catch (e) {
      // Ignore invalid URLs
    }
  }

  function handleRefresh() {
    var path = currentSemanticPath || '/';
    try {
      sessionStorage.setItem('iframe_initial_path', path);
    } catch (e) {
      // Ignore sessionStorage errors
    }
    window.location.reload();
  }

  // Listen for commands from parent (navigate, refresh)
  window.addEventListener('message', function(event) {
    // Only accept messages from parent window
    if (event.source !== window.parent) return;

    var message = event.data;
    if (message && message.jsonrpc === '2.0') {
      switch (message.method) {
        case 'navigate':
          handleNavigate(message.params.url);
          break;
        case 'refresh':
          handleRefresh();
          break;
      }
    }
  });

  // Listen for popstate events (back/forward navigation)
  window.addEventListener('popstate', function() {
    currentSemanticPath = extractSemanticPath(window.location);
    updateNavigationState();
  });

  // Listen for hash changes
  window.addEventListener('hashchange', function() {
    currentSemanticPath = extractSemanticPath(window.location);
    updateNavigationState();
  });

  // Override history.pushState and history.replaceState to detect SPA navigation
  var originalPushState = window.history.pushState;
  var originalReplaceState = window.history.replaceState;

  window.history.pushState = function() {
    var result = originalPushState.apply(window.history, arguments);
    var semanticPath = arguments[2]
      ? extractSemanticPath(arguments[2])
      : extractSemanticPath(window.location);
    currentSemanticPath = semanticPath;
    updateNavigationState();
    return result;
  };

  window.history.replaceState = function() {
    var result = originalReplaceState.apply(window.history, arguments);
    var semanticPath = arguments[2]
      ? extractSemanticPath(arguments[2])
      : extractSemanticPath(window.location);
    currentSemanticPath = semanticPath;
    updateNavigationState();
    return result;
  };

  // Send initial navigation state
  updateNavigationState();

  // After a short delay, navigate to initial path if needed (for refresh support)
  if (currentSemanticPath && currentSemanticPath !== '/') {
    setTimeout(function() {
      var current = window.location.pathname + window.location.search + window.location.hash;
      if (current !== currentSemanticPath) {
        handleNavigate(currentSemanticPath);
      }
    }, 150);
  }

  // =========================================================================
  // Global Error Handlers
  // =========================================================================

  window.addEventListener('error', function(event) {
    try {
      window.parent.postMessage({
        jsonrpc: '2.0',
        id: rpcId(),
        method: 'console',
        params: {
          level: 'error',
          message: 'Uncaught Error: ' + event.message,
          source: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error ? event.error.stack : undefined
        }
      }, '*');
    } catch (e) {
      // Ignore postMessage errors
    }
  });

  window.addEventListener('unhandledrejection', function(event) {
    try {
      window.parent.postMessage({
        jsonrpc: '2.0',
        id: rpcId(),
        method: 'console',
        params: {
          level: 'error',
          message: 'Unhandled Promise Rejection: ' + (event.reason ? (event.reason.message || String(event.reason)) : 'Unknown'),
          reason: event.reason,
          promise: event.promise ? 'Promise object' : 'No promise object'
        }
      }, '*');
    } catch (e) {
      // Ignore postMessage errors
    }
  });

})();`;
}
