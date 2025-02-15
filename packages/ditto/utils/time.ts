const Time = {
  milliseconds: (ms: number) => ms,
  seconds: (s: number) => s * 1000,
  minutes: (m: number) => m * Time.seconds(60),
  hours: (h: number) => h * Time.minutes(60),
  days: (d: number) => d * Time.hours(24),
  weeks: (w: number) => w * Time.days(7),
  months: (m: number) => m * Time.days(30),
  years: (y: number) => y * Time.days(365),
};

/** Strips the time off the date, giving 12am UTC. */
function stripTime(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Strips times off the dates and generates all 24h intervals between them, inclusive of both inputs. */
function generateDateRange(since: Date, until: Date): Date[] {
  const dates = [];

  const sinceDate = stripTime(since);
  const untilDate = stripTime(until);

  while (sinceDate <= untilDate) {
    dates.push(new Date(sinceDate));
    sinceDate.setUTCDate(sinceDate.getUTCDate() + 1);
  }

  return dates;
}

export { generateDateRange, stripTime, Time };
