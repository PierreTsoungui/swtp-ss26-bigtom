import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MethodCard from "./MethodCard";
import type {MethodPreview} from "../utils/types.ts";


const methodPreview : MethodPreview = {
    method: "noob",
    density_url: "/density.png",
    pca: {
        points: [
            { sample: "s1", group: "A", pc1: 1, pc2: 2 },
        ],
        error: undefined,
    },
};


describe("MethodCard", () => {
    it("renders semantic preview buttons with accessible names", () => {
        render(
            <MethodCard
                method={methodPreview}
                isSelected={false}
                onSelect={() => {}}
                onPcaClick={() => {}}
            />,
        );

        expect(
            screen.getByRole("button", { name: /enlarge noob – density plot/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: /open noob pca interactively/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/density/i)).toBeInTheDocument();
    });

    it("opens previews through the native button controls", () => {
        const onImageClick = vi.fn();

        render(
            <MethodCard
                method={methodPreview}
                isSelected={false}
                onSelect={() => {}}
                onPcaClick={onImageClick}
            />,
        );

        // 1. Find the interactive PCA button
        const pcaButton = screen.getByRole("button", {
            name: /open noob pca interactively/i,
        });

        // Optional: Keep the focus test if needed
        pcaButton.focus();
        expect(pcaButton).toHaveFocus();

        // 2. Trigger the click event on the PCA button
        fireEvent.click(pcaButton);

        // 3. Verify it was called exactly with the method data object
        expect(onImageClick).toHaveBeenCalledTimes(1);
        expect(onImageClick).toHaveBeenCalledWith(methodPreview);
    });


    it("does not submit a surrounding form when opening a preview", () => {
        const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

        render(
            <form onSubmit={onSubmit}>
                <MethodCard
                    method={methodPreview}
                    isSelected={false}
                    onSelect={() => {}}
                    onPcaClick={() => {}}
                />
            </form>,
        );

        // Fixed: Using the actual English aria-label found in the DOM output
        fireEvent.click(screen.getByRole("button", { name: /enlarge noob – density plot/i }));

        expect(onSubmit).not.toHaveBeenCalled();
    });
});
