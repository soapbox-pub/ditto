import { setNostrWasm } from 'nostr-tools/wasm';
import { initNostrWasm } from 'nostr-wasm';

await initNostrWasm().then(setNostrWasm);
