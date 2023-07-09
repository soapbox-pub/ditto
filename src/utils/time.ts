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

export { Time };
