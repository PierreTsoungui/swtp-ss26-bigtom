import { renderHook, waitFor } from "@testing-library/react";
import {useJobCancel} from "../hooks/useJobCancel.ts";


global.fetch = vi.fn();

describe("useJobCancel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("soll API call machen und success callback ausführen", async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ reset: true, status: "canceled" }),
        });

        const onSuccess = vi.fn();

        const { result } = renderHook(() =>
            useJobCancel("job-123", onSuccess)
        );

        await result.current.cancelJob();

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalled();
        });

        expect(fetch).toHaveBeenCalledWith(
            "/api/v1/reset/job-123",
            expect.objectContaining({ method: "POST" })
        );
    });

});