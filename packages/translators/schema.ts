import ISO6391 from 'iso-639-1';
import z from 'zod';

/** Value is a ISO-639-1 language code. */
export const languageSchema = z.string().refine(
  (val) => ISO6391.validate(val),
  { message: 'Not a valid language in ISO-639-1 format' },
);
