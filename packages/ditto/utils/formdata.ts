import { parseFormData as _parseFormData } from 'formdata-helper';

/** Parse formData into JSON, simulating the way Mastodon does it. */
export function parseFormData(formData: FormData): unknown {
  const json = _parseFormData(formData);

  const parsed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(json)) {
    deepSet(parsed, key, value);
  }

  return parsed;
}

/** Deeply sets a value in an object based on a Rails-style nested key. */
function deepSet(
  /** The target object to modify. */
  // deno-lint-ignore no-explicit-any
  target: Record<string, any>,
  /** The Rails-style key (e.g., "fields_attributes[0][name]"). */
  key: string,
  /** The value to set. */
  // deno-lint-ignore no-explicit-any
  value: any,
): void {
  const keys = key.match(/[^[\]]+/g); // Extract keys like ["fields_attributes", "0", "name"]
  if (!keys) return;

  let current = target;

  keys.forEach((k, index) => {
    const isLast = index === keys.length - 1;

    if (isLast) {
      current[k] = value; // Set the value at the final key
    } else {
      if (!current[k]) {
        // Determine if the next key is numeric, then create an array; otherwise, an object
        current[k] = /^\d+$/.test(keys[index + 1]) ? [] : {};
      }
      current = current[k];
    }
  });
}
