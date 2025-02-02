// Starts up applications required to run before the HTTP server is on.
import { Conf } from '@/config.ts';
import { cron } from '@/cron.ts';
import { startFirehose } from '@/firehose.ts';
import { startNotify } from '@/notify.ts';

if (Conf.firehoseEnabled) {
  startFirehose();
}

if (Conf.notifyEnabled) {
  startNotify();
}

if (Conf.cronEnabled) {
  cron();
}
