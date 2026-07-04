import { renderHook, act } from "@testing-library/react"; // waitFor delete
import { describe, beforeEach, it, expect, vi } from "vitest";
import { useJobCancel } from "../hooks/useJobCancel.ts";


global.fetch = vi.fn();

describe("useJobCancel Hook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should successfully trigger the API cancel call and execute the success callback", async () => {
        // Arrange
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ reset: true, status: "canceled" }),
        });
        const onCancelSuccessMock = vi.fn();
        const { result } = renderHook(() => useJobCancel("job-123", onCancelSuccessMock));

        // Act & Verify loading phase transitions
        let cancellationPromise: Promise<void>;
        act(() => {
            cancellationPromise = result.current.cancelJob();
        });

        expect(result.current.isLoading).toBe(true);
        expect(result.current.error).toBeNull();

        await act(async () => {
            await cancellationPromise;
        });

        // Assert post-execution states
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(onCancelSuccessMock).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(
            "/api/v1/reset/job-123",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("should gracefully handle bad server responses and capture specific API error structures", async () => {
        // Arrange
        const mockErrorDetails = {
            type: "about:blank",
            title: "Bad Request",
            status: 400,
            detail: "Job is already terminated.",
            instance: "/api/v1/reset/job-123"
        };
        (fetch as any).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ details: mockErrorDetails }),
        });
        const onCancelSuccessMock = vi.fn();
        const { result } = renderHook(() => useJobCancel("job-123", onCancelSuccessMock));

        // Act
        await act(async () => {
            await result.current.cancelJob();
        });

        // Assert
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toEqual(mockErrorDetails);
        expect(onCancelSuccessMock).not.toHaveBeenCalled();
    });

    it("should safely intercept general connection or network failures into a structured local fallback error profile", async () => {
        // Arrange
        (fetch as any).mockRejectedValueOnce(new Error("Network Failure"));
        const onCancelSuccessMock = vi.fn();
        const { result } = renderHook(() => useJobCancel("job-123", onCancelSuccessMock));

        // Act
        await act(async () => {
            await result.current.cancelJob();
        });

        // Assert
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toEqual({
            title: "Connection Error",
            status: 503,
            detail: "The connection to the server was interrupted.",
            instance: "/api/v1/reset/job-123",
        });
        expect(onCancelSuccessMock).not.toHaveBeenCalled();
    });
});
