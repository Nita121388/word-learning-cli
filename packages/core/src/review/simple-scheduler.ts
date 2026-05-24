import type { Rating, Schedule } from "../types.js";
import { addMinutes } from "../utils.js";
import type { NextSchedule, ReviewScheduler } from "./scheduler.js";

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
    algorithm: "simple_v1",
    dueAt: addMinutes(reviewedAt, intervalMinutes).toISOString(),
    intervalMinutes,
    lapseCount,
    reviewCount: (current?.reviewCount ?? 0) + 1,
    stateJson: current?.stateJson ?? null
  };
}

export class SimpleScheduler implements ReviewScheduler {
  readonly algorithm = "simple_v1";

  schedule(current: Schedule | null, rating: Rating, reviewedAt: Date): NextSchedule {
    return calculateSimpleSchedule(current, rating, reviewedAt);
  }
}
