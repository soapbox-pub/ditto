import { ErrorHandler } from '@hono/hono';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error(err);

  if (err.message === 'canceling statement due to statement timeout') {
    return c.json({ error: 'The server was unable to respond in a timely manner' }, 500);
  }

  return c.json({ error: 'Something went wrong' }, 500);
};
