import { ErrorHandler } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';

export const errorHandler: ErrorHandler = (err, c) => {
  c.header('Cache-Control', 'no-store');

  if (err instanceof HTTPException) {
    if (err.res) {
      return err.res;
    } else {
      return c.json({ error: err.message }, err.status);
    }
  }

  if (err.message === 'canceling statement due to statement timeout') {
    return c.json({ error: 'The server was unable to respond in a timely manner' }, 500);
  }

  console.error(err);

  return c.json({ error: 'Something went wrong' }, 500);
};
