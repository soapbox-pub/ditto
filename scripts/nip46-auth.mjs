#!/usr/bin/env node

/**
 * NIP-46 Client-Initiated Auth Script
 *
 * Generates an ephemeral client keypair and a `nostrconnect://` URI.
 * Import the URI into a remote signer app (e.g. Amber) to authorize
 * the client key. Once authorized, the script outputs:
 *
 *   - bunker:// URI (for ZAPSTORE_BUNKER_URL)
 *   - client secret key hex (for ZAPSTORE_CLIENT_KEY)
 *
 * It also writes the client key to ~/.config/zsp/bunker-keys/<bunkerPubkey>.key
 * so that `zsp` can use it immediately.
 *
 * Usage:
 *   node scripts/nip46-auth.mjs [--relay wss://relay.example.com] [--name MyApp] [--timeout 300]
 */

import { NPool, NRelay1, NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    relays: [],
    name: 'Ditto',
    timeout: 300, // seconds
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--relay':
        result.relays.push(args[++i]);
        break;
      case '--name':
        result.name = args[++i];
        break;
      case '--timeout':
        result.timeout = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/nip46-auth.mjs [options]

Options:
  --relay <url>    Relay URL for NIP-46 communication (repeatable)
                   Default: wss://relay.ditto.pub
  --name <name>    Application name shown to the signer
                   Default: Ditto
  --timeout <sec>  How long to wait for signer approval (seconds)
                   Default: 300 (5 minutes)
  --help, -h       Show this help message
`);
        process.exit(0);
    }
  }

  if (result.relays.length === 0) {
    result.relays.push('wss://relay.ditto.pub');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  // 1. Generate ephemeral client keypair
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  const clientHex = bytesToHex(clientSecretKey);

  console.log('');
  console.log('=== NIP-46 Client-Initiated Auth ===');
  console.log('');
  console.log(`Client pubkey: ${clientPubkey}`);
  console.log(`Relay(s):      ${opts.relays.join(', ')}`);
  console.log(`Timeout:       ${opts.timeout}s`);
  console.log('');

  // 2. Generate random secret
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const secret = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // 3. Build nostrconnect:// URI
  const searchParams = new URLSearchParams();
  for (const relay of opts.relays) {
    searchParams.append('relay', relay);
  }
  searchParams.set('secret', secret);
  searchParams.set('name', opts.name);

  const nostrConnectURI = `nostrconnect://${clientPubkey}?${searchParams.toString()}`;

  console.log('Scan this QR code with your signer app (e.g. Amber):');
  console.log('');
  console.log(await QRCode.toString(nostrConnectURI, { type: 'terminal', small: true }));
  console.log('Or import this URI manually:');
  console.log('');
  console.log(`  ${nostrConnectURI}`);
  console.log('');
  console.log('Waiting for signer to approve the connection...');
  console.log('');

  // 4. Set up relay pool
  const pool = new NPool({
    open: (url) => new NRelay1(url),
    reqRouter: async (filters) => new Map(opts.relays.map((r) => [r, filters])),
    eventRouter: async () => opts.relays,
  });

  const clientSigner = new NSecSigner(clientSecretKey);
  const relayGroup = pool.group(opts.relays);

  // 5. Subscribe and wait for the signer's response
  const signal = AbortSignal.timeout(opts.timeout * 1000);

  const sub = relayGroup.req(
    [{ kinds: [24133], '#p': [clientPubkey], limit: 1 }],
    { signal },
  );

  let bunkerPubkey;
  let userPubkey;

  try {
    for await (const msg of sub) {
      if (msg[0] === 'CLOSED') {
        throw new Error('Relay closed the subscription before signer responded');
      }
      if (msg[0] === 'EVENT') {
        const event = msg[2];

        let decrypted;
        try {
          decrypted = await clientSigner.nip44.decrypt(event.pubkey, event.content);
        } catch {
          // Could not decrypt -- not for us, skip
          continue;
        }

        let response;
        try {
          response = JSON.parse(decrypted);
        } catch {
          continue;
        }

        if (response.result !== secret && response.result !== 'ack') {
          continue;
        }

        bunkerPubkey = event.pubkey;

        console.log(`Signer responded! Bunker pubkey: ${bunkerPubkey}`);
        console.log('');

        // 6. Get user pubkey via the now-established connection
        const signer = new NConnectSigner({
          relay: relayGroup,
          pubkey: bunkerPubkey,
          signer: clientSigner,
          timeout: 60_000,
        });

        console.log('Requesting user public key...');
        userPubkey = await signer.getPublicKey();
        console.log(`User pubkey:   ${userPubkey}`);
        console.log('');

        break;
      }
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.error(`Timed out after ${opts.timeout}s waiting for signer approval.`);
      console.error('Make sure you imported the nostrconnect:// URI into your signer app.');
      process.exit(1);
    }
    throw err;
  }

  if (!bunkerPubkey || !userPubkey) {
    console.error('Failed to establish connection with remote signer.');
    process.exit(1);
  }

  // 7. Build bunker:// URI (for CI)
  const bunkerParams = new URLSearchParams();
  for (const relay of opts.relays) {
    bunkerParams.append('relay', relay);
  }
  const bunkerURI = `bunker://${bunkerPubkey}?${bunkerParams.toString()}`;

  // 8. Write client key to zsp config
  const zspDir = path.join(os.homedir(), '.config', 'zsp', 'bunker-keys');
  const zspKeyFile = path.join(zspDir, `${bunkerPubkey}.key`);

  fs.mkdirSync(zspDir, { recursive: true });
  fs.writeFileSync(zspKeyFile, clientHex + '\n', { mode: 0o600 });

  // 9. Print results
  console.log('=== Connection Established ===');
  console.log('');
  console.log('Bunker URI (ZAPSTORE_BUNKER_URL):');
  console.log(`  ${bunkerURI}`);
  console.log('');
  console.log('Client secret key hex (ZAPSTORE_CLIENT_KEY):');
  console.log(`  ${clientHex}`);
  console.log('');
  console.log(`User pubkey:   ${userPubkey}`);
  console.log(`User npub:     ${nip19.npubEncode(userPubkey)}`);
  console.log('');
  console.log(`zsp client key written to: ${zspKeyFile}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Update ZAPSTORE_BUNKER_URL in GitLab CI/CD variables');
  console.log('  2. Update ZAPSTORE_CLIENT_KEY in GitLab CI/CD variables');
  console.log('');

  // Clean up
  pool.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
