import { assertThrows } from '@std/assert';

import { RelayError } from '@/RelayError.ts';

Deno.test('Construct a RelayError from the reason message', () => {
  assertThrows(
    () => {
      throw RelayError.fromReason('duplicate: already exists');
    },
    RelayError,
    'duplicate: already exists',
  );
});

Deno.test('Throw a new RelayError if the OK message is false', () => {
  assertThrows(
    () => {
      RelayError.assert(['OK', 'yolo', false, 'error: bla bla bla']);
    },
    RelayError,
    'error: bla bla bla',
  );
});
