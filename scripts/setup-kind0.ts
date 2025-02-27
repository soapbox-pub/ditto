import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { Command } from 'commander';
import { NostrEvent } from 'nostr-tools';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });

function die(code: number, ...args: unknown[]) {
  console.error(...args);
  Deno.exit(code);
}

if (import.meta.main) {
  const kind0 = new Command()
    .name('setup:kind0')
    .description('Set up / change the kind 0 for a Ditto instance.')
    .version('0.1.0')
    .showHelpAfterError();

  kind0
    .argument('<name>', 'The name of the Ditto instance. Can just be your hostname.')
    .option(
      '-l --lightning <lud16 address>',
      'Lightning address for the server. Can just be your own lightning address.',
    )
    .option('-a --about <string>', 'About text. This shows up whenever a description for your server is needed.')
    .action(async (name, args) => {
      const { lightning, about, image } = args;
      const content: Record<string, string | boolean> = {};
      if (!name || !name.trim()) die(1, 'You must atleast supply a name!');
      content.bot = true;
      content.about = about;
      content.lud16 = lightning;
      content.name = name;
      content.picture = image;
      content.website = conf.localDomain;

      const signer = conf.signer;
      const bare: Omit<NostrEvent, 'id' | 'sig' | 'pubkey'> = {
        kind: 0,
        tags: [],
        content: JSON.stringify(content),
        created_at: Math.floor(Date.now() / 1000),
      };
      const signed = await signer.signEvent(bare);

      console.log({ content, signed });
      await relay.event(signed);
    });

  await kind0.parseAsync();
}
