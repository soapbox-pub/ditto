import { Reqmeister } from '@/reqmeister.ts';
import { Time } from '@/utils/time.ts';

const reqmeister = new Reqmeister({
  delay: Time.seconds(1),
  timeout: Time.seconds(1),
});

export { reqmeister };
