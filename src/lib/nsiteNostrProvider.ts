/**
 * Generates the injected NIP-07 provider script for nsite sandboxed iframes.
 *
 * The script defines `window.nostr` conforming to the NIP-07 interface.
 * `getPublicKey()` returns the embedded pubkey instantly (always allowed).
 * All other methods (`signEvent`, `nip04.*`, `nip44.*`) send JSON-RPC 2.0
 * requests to the parent frame via `postMessage` and await responses.
 *
 * A serial queue ensures only one RPC is in flight at a time, preventing
 * the parent from being overwhelmed with concurrent permission prompts.
 */
export function getNsiteNostrProviderScript(pubkey: string): string {
  return `(function() {
  'use strict';

  // ------------------------------------------------------------------
  // Serial queue — one RPC at a time to avoid concurrent prompts
  // ------------------------------------------------------------------
  var _queue = [];
  var _running = false;

  function enqueue(fn) {
    return new Promise(function(resolve, reject) {
      _queue.push({ fn: fn, resolve: resolve, reject: reject });
      drain();
    });
  }

  function drain() {
    if (_running || _queue.length === 0) return;
    _running = true;
    var item = _queue.shift();
    item.fn().then(
      function(v) { _running = false; item.resolve(v); drain(); },
      function(e) { _running = false; item.reject(e); drain(); }
    );
  }

  // ------------------------------------------------------------------
  // JSON-RPC transport over postMessage
  // ------------------------------------------------------------------
  var _nextId = 1;
  var _pending = {};

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;
    if (msg.id === undefined || msg.id === null) return;
    var cb = _pending[msg.id];
    if (!cb) return;
    delete _pending[msg.id];
    if (msg.error) {
      cb.reject(new Error(msg.error.message || 'RPC error'));
    } else {
      cb.resolve(msg.result);
    }
  });

  function rpc(method, params) {
    return enqueue(function() {
      return new Promise(function(resolve, reject) {
        var id = _nextId++;
        _pending[id] = { resolve: resolve, reject: reject };
        window.parent.postMessage({
          jsonrpc: '2.0',
          id: id,
          method: method,
          params: params || {}
        }, '*');
      });
    });
  }

  // ------------------------------------------------------------------
  // NIP-07 provider
  // ------------------------------------------------------------------
  var pubkey = ${JSON.stringify(pubkey)};

  window.nostr = {
    getPublicKey: function() {
      return Promise.resolve(pubkey);
    },

    signEvent: function(event) {
      return rpc('nostr.signEvent', { event: event });
    },

    getRelays: function() {
      return Promise.resolve({});
    },

    nip04: {
      encrypt: function(pubkey, plaintext) {
        return rpc('nostr.nip04.encrypt', { pubkey: pubkey, plaintext: plaintext });
      },
      decrypt: function(pubkey, ciphertext) {
        return rpc('nostr.nip04.decrypt', { pubkey: pubkey, ciphertext: ciphertext });
      }
    },

    nip44: {
      encrypt: function(pubkey, plaintext) {
        return rpc('nostr.nip44.encrypt', { pubkey: pubkey, plaintext: plaintext });
      },
      decrypt: function(pubkey, ciphertext) {
        return rpc('nostr.nip44.decrypt', { pubkey: pubkey, ciphertext: ciphertext });
      }
    }
  };

  // Signal availability to the nsite.
  try {
    window.dispatchEvent(new Event('nostr:ready'));
  } catch(e) {}
})();`;
}
