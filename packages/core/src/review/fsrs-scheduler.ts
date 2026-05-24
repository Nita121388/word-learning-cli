import { createEmptyCard, fsrs, Rating as FsrsRating, type Card, type Grade } from "ts-fsrs";
import type { Rating, Schedule } from "../types.js";
import type { NextSchedule, ReviewScheduler } from "./scheduler.js";

interface FsrsState {
  card: PersistedCard;
}

type PersistedCard = Omit<Card, "due" | "last_review"> & {
  due: string;
  last_review?: string | null;
};

export class FsrsScheduler implements ReviewScheduler {
  readonly algorithm = "fsrs_v1";
  private readonly scheduler = fsrs();

  schedule(current: Schedule | null, rating: Rating, reviewedAt: Date): NextSchedule {
    const card = this.loadCard(current, reviewedAt);
    const result = this.scheduler.next(card, reviewedAt, toFsrsRating(rating));
    const nextCard = result.card;
    const dueAt = nextCard.due.toISOString();
    const intervalMinutes = Math.max(1, Math.round((nextCard.due.getTime() - reviewedAt.getTime()) / 60_000));

    return {
      algorithm: this.algorithm,
      dueAt,
      intervalMinutes,
      lapseCount: nextCard.lapses,
      reviewCount: nextCard.reps,
      stateJson: JSON.stringify({ card: serializeCard(nextCard) })
    };
  }

  private loadCard(current: Schedule | null, reviewedAt: Date): Card {
    if (current?.stateJson) {
      try {
        const state = JSON.parse(current.stateJson) as FsrsState;
        return deserializeCard(state.card);
      } catch {
        return createEmptyCard(reviewedAt);
      }
    }
    return createEmptyCard(reviewedAt);
  }
}

function toFsrsRating(rating: Rating): Grade {
  if (rating === "again") return FsrsRating.Again;
  if (rating === "hard") return FsrsRating.Hard;
  return FsrsRating.Good;
}

function serializeCard(card: Card): PersistedCard {
  const { due, last_review, ...rest } = card;
  const result: PersistedCard = {
    ...rest,
    due: due.toISOString()
  };
  if (last_review) {
    result.last_review = last_review.toISOString();
  }
  return result;
}

function deserializeCard(card: PersistedCard): Card {
  const { due, last_review, ...rest } = card;
  const result: Card = {
    ...rest,
    due: new Date(due)
  };
  if (last_review) {
    result.last_review = new Date(last_review);
  }
  return result;
}
