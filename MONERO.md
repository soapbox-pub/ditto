# Monero Wallet

This document explains how Ditto's Monero wallet works, and why it is built
differently from the [Bitcoin wallet](./WALLET.md).

## Why Monero can't work like Bitcoin

Ditto's Bitcoin wallet has no setup step and no stored keys. A Nostr public key
is a 32-byte x-only secp256k1 point, which is byte-for-byte a Taproot internal
key, so every Nostr identity *already is* a Bitcoin wallet — the address is
derived, and the same key signs both.

Monero shares none of that:

| Property | Nostr / Bitcoin | Monero |
|---|---|---|
| Curve | secp256k1 | Ed25519 |
| Keys per wallet | one | two (view + spend) |
| Address derivation | from the identity key | from generated keys |
| Balance discovery | scan an address on a public index | trial-decrypt every output locally |

So a Monero wallet has key material that exists nowhere else. It has to be
generated once, shown to the user, and stored — which is why Monero is the only
part of Ditto with a wallet setup flow.

## Architecture

```
  React UI                     src/components/Monero*.tsx
      │
  Hooks                        useMoneroWallet · useMoneroRecord · useWalletCurrency
      │
  Session manager              src/lib/monero/wallet.ts
      │
  monero-ts (lazy)             src/lib/monero/client.ts
      │
  wallet2 (WebAssembly)        monero-project v0.18.5.1
      │
  monerod JSON-RPC             configurable, see Settings → Wallet
```

### The library

[`monero-ts`](https://github.com/woodser/monero-ts) is monero-project's own
`wallet2` compiled to WebAssembly via emscripten. Ditto does **not** use a
light-wallet server: the wallet scans the chain itself and trial-decrypts every
output locally, exactly as Cake Wallet, Feather, Monerujo and the official GUI
do. No server ever receives a view key.

Two consequences follow, and both are visible in the UI:

- **First sync is slow.** The emscripten build is single-threaded (pthreads are
  disabled), so scanning a long history takes minutes. The wallet panel shows
  block-level progress rather than an indeterminate spinner, because pretending
  otherwise would be dishonest.
- **Very few public nodes are usable from a browser.** Two requirements that
  native wallets don't have: a publicly-trusted TLS certificate (most public
  nodes are self-signed on a non-standard port, which Chrome rejects outright
  with `ERR_CERT_AUTHORITY_INVALID` and no override), and CORS headers on the
  binary `/getblocks.bin` endpoint. Of ten widely-recommended nodes measured
  from a real browser, **two** worked. Settings → Wallet has a **Test** button,
  because `fetch` reports every one of these failures as a bare `TypeError`.

Creating a wallet, though, needs **no node at all** — see below.

### Generating a wallet is offline, local work

A Monero wallet is 32 random bytes reduced to an ed25519 scalar (the spend
key), a Keccak hash of that (the view key), and base58 for the address. None
of it touches the network, and `createWallet()` / `restoreWallet()` in
`src/lib/monero/wallet.ts` pass no `server`.

The restore height for a new wallet is the chain tip *at the moment it was
generated*, since such a wallet cannot have received anything earlier. It is
estimated locally from a measured checkpoint at 120s/block
(`src/lib/monero/heights.ts`), the same interpolation Monerujo and Feather
ship, minus a one-day safety margin. `wallet2` has its own daemon-free
estimate but it is baked in at build time and runs about a month stale, which
would mean scanning ~21,500 blocks looking for transactions a new wallet
cannot have; we floor our estimate at `wallet2`'s so we never do worse than it
would. Measured in a browser: 720 blocks to scan, against a live tip.

The margin is deliberately lopsided. Overshooting the real tip is the failure
that loses money — outputs received in the skipped window are never scanned —
while undershooting costs a few seconds on empty blocks.

An earlier version passed a node and read the chain tip for the restore
height, which quietly made key generation depend on the network and stranded
users behind whichever public node happened to be down. Don't reintroduce
that: nothing in the setup flow should await a node.

We use `wallet2` rather than hand-rolling the derivation with WebCrypto, even
though the maths is simple, because address encoding is precisely where a
subtle bug produces a valid-*looking* address whose funds are unrecoverable.
That is worth the WebAssembly.

### Lazy loading

`monero-ts` is ~3 MB of wasm plus a ~3.6 MB Web Worker. Everything goes through
`loadMonero()` in `src/lib/monero/client.ts`, which `import()`s the module on
first use so Vite emits it as a separate chunk. The Monero panel is only
mounted when the user selects the Monero tab, so a user who never opens it
downloads none of it.

**Never add a top-level `import ... from 'monero-ts'`** — it would pull the
whole thing into the entry chunk.

## Storage

Wallet data is split across two places, by size.

### The encrypted record (NIP-78, kind 30078)

`d` tag: `<appId>/monero-wallet`. NIP-44-encrypted to the user's own pubkey.
Schema in `src/lib/monero/record.ts`.

| Field | Purpose |
|---|---|
| `seed` | 25-word mnemonic — the only thing that recovers funds |
| `hasPassphrase` | Whether a seed offset is required (the passphrase itself is **never** stored) |
| `cachePassword` | Random password encrypting the local `.keys` blob |
| `restoreHeight` | Block to begin scanning from |
| `address` | Denormalized, so the UI can render before wasm loads |
| `state` | Cached balance + recent transactions from the last sync |

This is a **separate event** from `useEncryptedSettings`, not a field inside
it. Settings are rewritten on every theme toggle through a read-modify-write
cycle; putting irreplaceable key material in that blob would make each of those
writes a chance to clobber a seed.

### The local cache (IndexedDB)

`wallet2`'s transaction/output cache lives in the `ditto-monero` database,
keyed by pubkey (`src/lib/monero/cache.ts`).

It is **not** in the Nostr event because it can't be: the cache is the output
set needed to select transaction inputs, it grows with history into the
megabytes, and relays commonly cap events at 64–256 KB.

Losing it is never fatal — it costs a resync from `restoreHeight`, nothing
more — so every function in that module degrades to a no-op when IndexedDB is
unavailable (iOS Lockdown Mode, some private-browsing modes).

### What this split buys, and what it doesn't

The cached `state` snapshot means a **balance appears instantly** on a new
device, before any wasm loads or any block is scanned. The UI marks it as
cached when it's more than five minutes old.

**Sending from a device that has never synced still requires a sync**, because
the outputs aren't there. There is no way around that short of handing a view
key to a light-wallet server, which is the trade this design exists to avoid.

## Security

The record is encrypted to the user's own Nostr key, so **the Monero wallet is
exactly as secure as the Nostr key**. For an `nsec` login that key sits in
`localStorage`, which means an XSS that reaches it also reaches the Monero
seed.

This is the same exposure the derived Bitcoin wallet already has — there the
Nostr key *is* the spending key — so Monero introduces no new class of risk.
It does put a second balance behind the same door.

Extension (NIP-07) and bunker (NIP-46) logins are strictly better: the Nostr
key never enters the page, and every read of the record costs a signer
round-trip. A signer without NIP-44 support cannot use the Monero wallet at
all, and the setup flow says so rather than failing later.

## Sending

Monero fees can't be estimated before a transaction is built — they depend on
the ring members and output count `wallet2` actually selects. So the send flow
is build-then-confirm, not estimate-then-build:

1. **Form** — recipient and amount. "Send max" uses `sweepUnlocked`, because
   subtracting an estimated fee from the balance (what the Bitcoin flow does)
   can't work here.
2. **Confirm** — `createTxs({ relay: false })` builds the transaction locally
   and reports the **real** fee. Nothing has touched the network yet.
3. **Send** — `relayTxs` broadcasts it, and the cache is persisted immediately
   so the spent outputs are recorded and a later send can't double-spend them.

Available in two places: the wallet page (`SendMoneroDialog`) and the NIP-A3
zap dialog (`MoneroZapContent`).

## NIP-A3 integration

Monero was already a recognized [NIP-A3](https://github.com/ATXMJ/nips)
payment-target type (`payto` type `monero` in a kind 10133 event). It has been
promoted from `generic` to a **native** `PaymentMethodKind`:

- **Sender has a Ditto Monero wallet** — the zap dialog shows a real in-app
  send flow.
- **Sender doesn't** — it falls back to `GenericPaymentContent`: a QR code, a
  copyable address, and a `monero:` handoff button, so the payment can still be
  made from Cake, Feather or Monerujo.

### The address is published automatically

Finishing setup — whether you created a wallet or restored one — publishes
your primary address as a `payto` tag on your kind 10133 event, so people can
send you Monero from your profile without you having to copy it into Settings.

`useEnsurePaymentTarget` is additive and only fills a gap:

- If **any** `payto monero` tag already exists it publishes nothing, even if
  Ditto considers that tag malformed. Anything you put there by hand is yours.
- It copies the previous event's tags verbatim and appends one, rather than
  re-serializing from the parsed set the way `useUpdatePaymentTargets` does.
  That distinction matters: the parsing path drops any `payto` type outside
  Ditto's curated allowlist, which is fine in an editor you can see but not in
  something that runs on its own. A `payto dogecoin` tag survives this.
- Failure never fails setup. The seed is already saved by that point, and a
  relay hiccup while announcing a donation address must not look like the
  wallet itself broke.

The toast says which happened, because publishing links your Nostr identity to
a payment address in public and shouldn't be silent.

### No attribution event

On-chain Bitcoin zaps publish a kind 8333 referencing `bitcoin:tx:<txid>` (see
[`NIP.md`](./NIP.md)). There is **no Monero equivalent**, deliberately.

Kind 8333 works because a Bitcoin transaction is publicly verifiable: any
client can check the txid, the amount and the destination against the chain. A
Monero transaction is not — that's the entire point of the chain. A "Monero zap
receipt" would therefore be an unverifiable claim that anyone could forge,
which is exactly the spoofing that NIP.md's kind-8333 verification rules exist
to prevent. Publishing one would look like attribution while providing none.

## Configuration

Two `AppConfig` fields, both editable in Settings → Wallet and overridable in
`ditto.json`:

| Field | Default |
|---|---|
| `moneroNodes` | `xmr-node.cakewallet.com:18081`, `node.sethforprivacy.com:443` |
| `moneroPriceApi` | Kraken's public ticker |

The price source follows Monerujo's approach (read a public exchange directly)
rather than Cake Wallet's (route every quote through a vendor API behind a
key). For a wallet whose purpose is not leaking to third parties, fewer
operators is better. A failed price fetch is not an error — the wallet shows
XMR only.

## Build integration

Three changes in `vite.config.ts` are required and load-bearing:

1. **`vite-plugin-node-polyfills`** for `http`, `https`, `fs`, `stream`,
   `util`, `path`. `monero-ts` reaches for Node builtins the way the upstream
   C++ does. Only these six — the wider default set shadows browser globals the
   rest of Ditto relies on.
2. **`commonjsOptions.transformMixedEsModules`** — `monero-ts` mixes
   `require()` with ES syntax, and without this its
   `require("#monero-ts/monero.js")` wasm loader throws at runtime.
3. **The LibreJS banner must cover `.js` *assets*, not just chunks.** The
   Monero worker is emitted by Vite as an asset, so the original
   `output.type !== "chunk"` guard skipped it. An unlabelled script has its
   body replaced with a comment by LibreJS, and the worker then never boots.

### There is no filesystem

`monero-ts` expects Node's `fs`. In a browser bundle that import resolves to
`node-stdlib-browser`'s empty mock, which is `null`, so
`MoneroWalletFull.getFs()` throws *"Cannot read properties of null (reading
'promises')"*. `openWallet()` calls it unconditionally, before it notices the
wallet was handed explicit `keysData` / `cacheData` and an empty path — so the
failure appears only when **reopening** a cached wallet, never when creating
one. The symptom is a wallet that works the day you make it and is broken on
every visit after.

Every wallet Ditto opens therefore passes an explicit `fs` (`NO_FILESYSTEM` in
`src/lib/monero/wallet.ts`), which keeps `getFs()` from ever being reached. Its
methods reject rather than no-op: with `path: ''` none of them can legitimately
run, so anything that starts depending on path-based persistence should fail
loudly instead of silently reading and writing nothing.

### The worker must be a classic worker

emscripten's HTTP glue in `monero.js` reads its collaborators off `this`
(`const HttpClient = this.HttpClient`), which only resolves to `globalThis` in
sloppy mode. A module worker is always strict, so `{ type: 'module' }` makes
the wallet die with *"Cannot read properties of undefined (reading
'HttpClient')"* on the first request to a node. `monero.js` carries no
`"use strict"` precisely because it depends on this.

That also rules out letting Vite process the file at all, which is what the
`ditto:monero-worker` plugin exists for. It serves the prebuilt bundle
straight from `node_modules` in dev and emits it as a root-level asset in
build, byte-for-byte in both, and the app gets the URL from the virtual module
`virtual:monero-worker-url`. Neither Vite mechanism works:

- `new Worker(new URL(...))` re-bundles 3.6 MB of someone else's webpack
  output, and the format is then governed by `worker.format`.
- `import '...?url'` is fine in a production build, but in dev it resolves to
  `/node_modules/monero-ts/dist/monero.worker.js`, which the dev server hands
  to the transform pipeline and returns as ESM — the classic worker then dies
  on `Cannot use import statement outside a module`.

The plugin emits during `generateBundle` at default order, so
`librejsLicense()` (which runs `post`) still sees the result as a `.js` asset
and gives it the AGPL banner and a Web Labels row.

## Content Security Policy

Ditto's CSP (the meta tag in `index.html`) is
`script-src 'self' 'wasm-unsafe-eval'`. That keyword permits compiling and
instantiating WebAssembly — all the wasm wallet2 build needs — but not
`unsafe-eval`, so no string can be evaluated as JavaScript. In a client where
an `nsec` sits in `localStorage`, that distinction is the difference between an
XSS being contained and it being instant key theft. **Do not add
`unsafe-eval` to make Monero work.**

`monero-ts` ships one call that violates it. `GenUtils.isBrowser()` detects its
environment by building throwaway functions from source:

```js
new Function("try {return this===window;}catch(e){return false;}")()
```

The `try`/`catch` is *inside* the generated body, so it catches nothing — the
refusal happens at construction and the `EvalError` escapes. And `LibraryUtils`
calls `isBrowser()` from a **static class field** (`WORKER_DIST_PATH_DEFAULT`),
which is evaluated when the class is defined, so `await import('monero-ts')`
throws on its own, before any wallet code runs. The symptom is the wallet
setup flow failing with:

```
Evaluating a string as JavaScript violates the following Content Security
Policy directive because 'unsafe-eval' is not an allowed source of script:
script-src 'self' 'wasm-unsafe-eval'
```

`scripts/patch-monero-csp.mjs` rewrites both calls to equivalent CSP-safe
expressions, and runs from `postinstall`. It patches two files: the readable
CommonJS source, and the inlined copy inside the prebuilt webpack bundle
`dist/monero.worker.js`.

It is a postinstall patch rather than a Vite plugin because a Rollup
`transform` hook would catch both in a production build but miss the dev
server, where Vite pre-bundles CommonJS deps with esbuild and plugin transforms
don't run. Every Ditto npm script starts with `npm i`, so the patch is always
current. The script is idempotent and **exits non-zero if it finds neither the
original code nor its own replacement**, so a `monero-ts` bump that moves this
code fails the install loudly instead of shipping a build that dies under CSP.

The same fix is submitted upstream as
[woodser/monero-ts#330](https://github.com/woodser/monero-ts/pull/330). If it
lands, bumping `monero-ts` past it makes the script redundant — the patch will
fail the install, which is the signal to delete it and its `postinstall` entry
rather than re-point it at new line numbers.

Three other `Function(...)` call sites survive into the bundle and are all
harmless: lodash's `freeGlobal || freeSelf || Function('return this')()`
short-circuits on `self` in every browser and worker; `function-bind`'s shim is
unreachable because `Function.prototype.bind` is native; and
`is-generator-function`'s probe is wrapped in a real `try`/`catch`. The last
one still logs a CSP violation from inside the worker — noisy, but caught, so
sync is unaffected.

## Known limitations

- **iOS WKWebView is unverified.** The build is correct and the wasm loads in a
  standard browser, but running a multi-minute single-threaded wasm scan inside
  WKWebView has not been tested on a device.
- **No background sync.** Syncing only runs while the wallet page is open.
  Native wallets use a foreground service (Monerujo) or a background isolate
  (Cake); neither is available to a web view.
- **No subaddresses.** Everything uses account 0, subaddress 0. Per-payment
  subaddresses would improve recipient privacy and are the natural next step.
- **No Polyseed.** The setup flow accepts a 16-word Polyseed on restore and
  passes it to `monero-ts`, but new wallets generate the 25-word legacy seed.
- **Bundle size.** Monero adds ~6.6 MB to `dist/`. Lazy on web; unconditional
  in the APK/AAB/IPA, since Capacitor bundles all of `dist/`.
