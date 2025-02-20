import { Command } from 'commander';
import { NostrEvent } from 'nostr-tools';

import { nostrNow } from '../packages/ditto/utils.ts';
import { Conf } from '../packages/ditto/config.ts';
import { Storages } from '../packages/ditto/storages.ts';

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
      content.website = Conf.localDomain;

      const signer = Conf.signer;
      const bare: Omit<NostrEvent, 'id' | 'sig' | 'pubkey'> = {
        created_at: nostrNow(),
        kind: 0,
        tags: [],
        content: JSON.stringify(content),
      };
      const signed = await signer.signEvent(bare);

      console.log({ content, signed });
      await Storages.db().then((store) => store.event(signed));
    });

  await kind0.parseAsync();
}
