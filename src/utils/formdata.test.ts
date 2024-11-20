import { assertEquals, assertThrows } from '@std/assert';

import { parseFormData } from '@/utils/formdata.ts';

Deno.test('parseFormData', () => {
  const formData = new FormData();

  formData.append('foo', 'bar');
  formData.append('fields_attributes[0][name]', 'baz');
  formData.append('fields_attributes[0][value]', 'qux');
  formData.append('fields_attributes[1][name]', 'quux');
  formData.append('fields_attributes[1][value]', 'corge');

  const result = parseFormData(formData);

  assertEquals(result, {
    foo: 'bar',
    fields_attributes: [
      { name: 'baz', value: 'qux' },
      { name: 'quux', value: 'corge' },
    ],
  });

  assertThrows(() => {
    const formData = new FormData();
    formData.append('fields_attributes[1]', 'unexpected');
    formData.append('fields_attributes[1][extra]', 'extra_value');
    parseFormData(formData);
  });
});
