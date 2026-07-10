import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAsyncResource } from "./useAsyncResource";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAsyncResource", () => {
  it("loads data and clears loading on success", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 42 });

    const { result } = renderHook(() => useAsyncResource(fetcher, ["k"]));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ value: 42 }));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("passes an AbortSignal to the fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    renderHook(() => useAsyncResource(fetcher, ["k"]));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(fetcher.mock.calls[0]![0]).toBeInstanceOf(AbortSignal);
  });

  it("skips the request and resets to idle when disabled", async () => {
    const fetcher = vi.fn().mockResolvedValue("x");

    const { result } = renderHook(() => useAsyncResource(fetcher, [false], { enabled: false }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("maps a thrown error to a message by default", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useAsyncResource(fetcher, ["k"]));

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("supports a custom error mapper and onError side effect", async () => {
    const cause = { code: "E_BAD" };
    const fetcher = vi.fn().mockRejectedValue(cause);
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAsyncResource<string, { code: string }>(fetcher, ["k"], {
        mapError: (e) => e as { code: string },
        onError,
      }),
    );

    await waitFor(() => expect(result.current.error).toEqual(cause));
    expect(onError).toHaveBeenCalledWith(cause);
  });

  it("ignores AbortError from a superseded request", async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));

    const { result } = renderHook(() => useAsyncResource(fetcher, ["k"]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("refetches when the dependency list changes", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");

    const { rerender } = renderHook(
      ({ key }: { key: string }) => useAsyncResource(fetcher, [key]),
      {
        initialProps: { key: "a" },
      },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ key: "b" });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("treats a null resolution as a valid empty result, not an error", async () => {
    const fetcher = vi.fn().mockResolvedValue(null);

    const { result } = renderHook(() => useAsyncResource(fetcher, ["k"]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("lets the caller clear the error via setError", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useAsyncResource(fetcher, ["k"]));
    await waitFor(() => expect(result.current.error).toBe("boom"));

    result.current.setError(null);
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
