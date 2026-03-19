/**
 * Lightweight discriminated-union Result type for expected/recoverable errors.
 * See ADR-0015 for design rationale.
 */

import type { AppError } from './errors';

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
