// Starts up applications required to run before the HTTP server is on.

import { Conf } from '@/config.ts';
import { seedZapSplits } from '@/utils/zap-split.ts';
import { cron } from '@/cron.ts';
import { startFirehose } from '@/firehose.ts';

if (Conf.firehoseEnabled) {
  startFirehose();
}

if (Conf.cronEnabled) {
  cron();
}

await seedZapSplits();
