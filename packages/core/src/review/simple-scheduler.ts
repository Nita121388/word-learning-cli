import type { Rating, Schedule } from "../types.js";
import { addMinutes } from "../utils.js";

export interface NextSchedule {
  dueAt: string;
  intervalMinutes: number;
  lapseCount: number;
  reviewCount: number;
}

const oneDay = 24 * 60;

export function calculateSimpleSchedule(
  current: Schedule | null,
  rating: Rating,
  reviewedAt: Date
): NextSchedule {
  const oldInterval = current?.intervalMinutes ?? 0;
  let intervalMinutes: number;
  let lapseCount = current?.lapseCount ?? 0;

  if (rating === "again") {
    intervalMinutes = 10;
    lapseCount += 1;
  } else if (rating === "hard") {
    intervalMinutes = oldInterval > 0 ? Math.max(oneDay, Math.round(oldInterval * 1.5)) : oneDay;
  } else {
    intervalMinutes = oldInterval > 0 ? Math.round(oldInterval * 2.5) : 3 * oneDay;
  }

  return {
    dueAt: addMinutes(reviewedAt, intervalMinutes).toISOString(),
    intervalMinutes,
    lapseCount,
    reviewCount: (current?.reviewCount ?? 0) + 1
  };
}

