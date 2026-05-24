import type { Rating, Schedule } from "../types.js";

export interface NextSchedule {
  algorithm: string;
  dueAt: string;
  intervalMinutes: number;
  lapseCount: number;
  reviewCount: number;
  stateJson: string | null;
}

export interface ReviewScheduler {
  readonly algorithm: string;
  schedule(current: Schedule | null, rating: Rating, reviewedAt: Date): NextSchedule;
}

export class SchedulerRegistry {
  private readonly schedulers = new Map<string, ReviewScheduler>();

  register(scheduler: ReviewScheduler): void {
    this.schedulers.set(scheduler.algorithm, scheduler);
  }

  get(algorithm: string): ReviewScheduler {
    const scheduler = this.schedulers.get(algorithm);
    if (!scheduler) {
      throw new Error(`review scheduler not registered: ${algorithm}`);
    }
    return scheduler;
  }
}

