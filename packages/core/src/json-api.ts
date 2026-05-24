import type { ApiResponse } from "./types.js";

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiResponse<never> {
  return { ok: false, error: { code, message, details } };
}

