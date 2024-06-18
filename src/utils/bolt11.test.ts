import { assertEquals } from '@std/assert';
import { getAmount } from '@/utils/bolt11.ts';

Deno.test('Invoice is invalid', () => {
  assertEquals(getAmount('hello'), undefined);
});

Deno.test('Invoice is undefined', () => {
  assertEquals(getAmount(undefined), undefined);
});

Deno.test('Amount is 200000', () => {
  assertEquals(
    getAmount(
      'lnbc2u1pn8qatypp5dweqaltlry2vgpxxyc0puxnc50335yznevj2g46wrhfm2694lhgqhp576ekte7lhhtsxdk6tfvkpyp8gdk2xccmuccdxwjd0fqdh34wfseqcqzzsxqyz5vqsp5n44zva7xndawg5l2r9d85v0tszwejtfzkc7v90d6c7d3nsdt0qds9qxpqysgqx2v2artsxmnfkpapdm9f5pahjs8etlpe7kcjue2kffhjg3jrtearstjvenr6lxzhpw3es4hpchzzeet7ul88elurfmvr9v94v0655rgpy7m7r5',
    ),
    '200000',
  );
});
