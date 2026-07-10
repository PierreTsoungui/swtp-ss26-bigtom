import { type DependencyList, useEffect, useState } from "react";

/**
 * State returned by {@link useAsyncResource}.
 *
 * @typeParam T - The resource payload type.
 * @typeParam E - The exposed error type (defaults to a `string` message).
 */
export interface UseAsyncResourceResult<T, E> {
  /** The last successfully loaded value, or `null` before the first success. */
  data: T | null;
  /** Whether a request is currently in flight. */
  isLoading: boolean;
  /** The mapped error of the last failed request, or `null`. */
  error: E | null;
  /** Manually override the error (e.g. to clear it after displaying it). */
  setError: (error: E | null) => void;
}

/**
 * Options for {@link useAsyncResource}.
 */
export interface UseAsyncResourceOptions<T, E> {
  /**
   * When `false`, the request is skipped and the state is reset to idle. Any
   * value that toggles this must be included in the dependency list so the hook
   * re-evaluates. Defaults to `true`.
   */
  enabled?: boolean;
  /** Value exposed as `data` before the first successful load. Defaults to `null`. */
  initialData?: T | null;
  /**
   * Maps a caught error to the exposed error value. Defaults to the error's
   * message (or a generic fallback), which requires `E` to be assignable from
   * `string`; supply this when `E` is a richer type.
   */
  mapError?: (error: unknown) => E;
  /** Side effect run on failure (e.g. logging) before the error is exposed. */
  onError?: (error: unknown) => void;
}

/** Default error mapper: a human-readable message string. */
const defaultMapError = (error: unknown): string =>
  error instanceof Error ? error.message : "An unknown error occurred";

/** Whether a caught value is the abort signalled by a superseding request. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * The single, canonical data-fetching hook for the application.
 *
 * It owns the loading/data/error lifecycle of an asynchronous resource and the
 * correctness details that are easy to get wrong: it resets when its inputs
 * change, and an {@link AbortController} guarantees no state update lands after
 * unmount or after a newer request supersedes an in-flight one. Feature hooks
 * provide only the `fetcher` and their dependency list — the boilerplate (and
 * the `react-hooks/set-state-in-effect` exception) lives here, once.
 *
 * The `fetcher` receives the request's {@link AbortSignal} (pass it to `fetch`
 * to cancel the network call too) and may resolve to `null` to represent a
 * valid "no data yet" outcome without raising an error.
 *
 * @typeParam T - The resource payload type.
 * @typeParam E - The exposed error type (defaults to a `string` message).
 * @param fetcher - Performs the request; resolves the value or throws on failure.
 * @param deps - Reactive inputs; a change re-runs the request (like `useEffect`).
 * @param options - See {@link UseAsyncResourceOptions}.
 * @returns The resource {@link UseAsyncResourceResult state}.
 */
export function useAsyncResource<T, E = string>(
  fetcher: (signal: AbortSignal) => Promise<T | null>,
  deps: DependencyList,
  options: UseAsyncResourceOptions<T, E> = {},
): UseAsyncResourceResult<T, E> {
  const {
    enabled = true,
    initialData = null,
    mapError = defaultMapError as (error: unknown) => E,
    onError,
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<E | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(initialData);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void fetcher(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbortError(caught)) {
          return;
        }
        onError?.(caught);
        setError(mapError(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, deps);

  return { data, isLoading, error, setError };
}
