import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Command } from 'commander';
import { NostrEvent } from 'nostr-tools';
import { nostrNow } from '@/utils.ts';
import { Buffer } from 'node:buffer';
import { Conf } from '@/config.ts';
import pngToIco from 'png-to-ico';
import { Storages } from '@/storages.ts';

function die(code: number, ...args: any[]) {
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
    .option('-i --image <string>', 'Image URL to use for OpenGraph previews and favicon.')
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

      const signer = new AdminSigner();
      const bare: Omit<NostrEvent, 'id' | 'sig' | 'pubkey'> = {
        created_at: nostrNow(),
        kind: 0,
        tags: [],
        content: JSON.stringify(content),
      };
      const signed = await signer.signEvent(bare);
      if (image) {
        try {
          await fetch(image)
            .then((res) => {
              if (!res.ok) throw new Error('Error attempting to fetch favicon.');
              if (res.headers.get('content-type') !== 'image/png') throw new Error('Non-png images are not supported!');
              return res.blob();
            })
            .then(async (blob) =>
              await pngToIco(Buffer.from(await blob.arrayBuffer()))
                .then(async (buf) => await Deno.writeFile('./public/favicon.ico', new Uint8Array(buf)))
            );
        } catch (e) {
          die(1, `Error generating favicon from url ${image}: "${e}". Please check this or try again without --image.`);
        }
      }
      console.log({ content, signed });
      await Storages.db().then((store) => store.event(signed));
    });

  await kind0.parseAsync();
}
