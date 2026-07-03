/**
 * NIP-24 `birthday` field helpers for kind 0 profile metadata.
 *
 * Per NIP-24, kind 0 content may include:
 *
 *     "birthday": { "year": number, "month": number, "day": number }
 *
 * where **each field MAY be omitted** — a user can share just month/day
 * without revealing their birth year. Celebrating "today is their birthday"
 * therefore only requires `month` and `day`.
 */

import { z } from 'zod';

export interface Birthday {
  year?: number;
  month?: number;
  day?: number;
}

/** Days in each month (index 0 = January). February allows 29 for leap years. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** NIP-24 specifies numbers, but some clients publish numeric strings —
 *  coerce those rather than dropping the whole birthday. */
const numericField = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v),
    z.number().int().min(1).max(max).optional(),
  ).catch(undefined);

const birthdaySchema = z.object({
  year: numericField(9999),
  month: numericField(12),
  day: numericField(31),
});

/** Max days for a given 1-based month (29 for February — leap-year tolerant). */
export function daysInMonth(month: number | undefined): number {
  if (!month || month < 1 || month > 12) return 31;
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Parse the NIP-24 `birthday` object from an unknown value (typically
 * `metadata.birthday` or the parsed kind-0 content JSON's `birthday` key).
 *
 * Returns `undefined` when absent or malformed. Individual out-of-range
 * fields are dropped rather than failing the whole object, and a day
 * beyond the month's length (e.g. Feb 31) invalidates the day.
 */
export function parseBirthday(value: unknown): Birthday | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const parsed = birthdaySchema.safeParse(value);
  if (!parsed.success) return undefined;

  const { year, month, day } = parsed.data;

  const birthday: Birthday = { year, month, day };

  // Drop a day that can't exist in the stated month (e.g. April 31).
  if (birthday.month !== undefined && birthday.day !== undefined && birthday.day > daysInMonth(birthday.month)) {
    delete birthday.day;
  }

  if (birthday.year === undefined && birthday.month === undefined && birthday.day === undefined) {
    return undefined;
  }

  return birthday;
}

/** Parse the `birthday` field straight from raw kind-0 event content. */
export function parseBirthdayFromContent(content: string | undefined): Birthday | undefined {
  if (!content) return undefined;
  try {
    const json: unknown = JSON.parse(content);
    if (typeof json !== 'object' || json === null) return undefined;
    return parseBirthday((json as Record<string, unknown>).birthday);
  } catch {
    return undefined;
  }
}

/**
 * Whether the given birthday falls on today's (local) date.
 *
 * Requires both `month` and `day` — a year alone isn't enough to celebrate.
 */
export function isBirthdayToday(birthday: Birthday | undefined, now: Date = new Date()): boolean {
  if (!birthday || birthday.month === undefined || birthday.day === undefined) {
    return false;
  }

  const { month } = birthday;
  let { day } = birthday;

  // Feb 29 birthdays celebrate on Feb 28 in non-leap years.
  if (month === 2 && day === 29) {
    const year = now.getFullYear();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!isLeap) day = 28;
  }

  return now.getMonth() + 1 === month && now.getDate() === day;
}
