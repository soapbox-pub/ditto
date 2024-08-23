import { Storages } from '@/storages.ts';
import { Command } from 'commander';

const store = await Storages.db();

interface ExportFilter {
  authors: string[];
}

if (import.meta.main) {
  const exporter = new Command()
    .name('db:export')
    .description('Export the specified set of events from the Ditto database.')
    .version('0.1.0')
    .showHelpAfterError();

  exporter
    // .option('')
    .action(async (args: ExportFilter) => {
      console.warn('Exporting events...');
      let count = 0;

      for await (const msg of store.req([{}])) {
        if (msg[0] === 'EOSE') {
          break;
        }
        if (msg[0] === 'EVENT') {
          console.log(JSON.stringify(msg[2]));
          count++;
        }
        if (msg[0] === 'CLOSED') {
          console.error('Database closed unexpectedly');
          break;
        }
      }

      console.warn(`Exported ${count} events`);
    });

  exporter.parse(Deno.args, { from: 'user' });
}

Deno.exit();
