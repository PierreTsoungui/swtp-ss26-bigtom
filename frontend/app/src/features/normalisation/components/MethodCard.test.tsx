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
            screen.getByRole("button", { name: "NOOB Dichteplot Vorschau öffnen" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "NOOB PCA Streudiagramm Vorschau öffnen" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Dichte - Klick für Vorschau")).toBeInTheDocument();
        expect(screen.getByText("PCA - Klick für Vorschau")).toBeInTheDocument();
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

        const densityButton = screen.getByRole("button", {
            name: "NOOB Dichteplot Vorschau öffnen",
        });
        const pcaButton = screen.getByRole("button", {
            name: "NOOB PCA Streudiagramm Vorschau öffnen",
        });

        densityButton.focus();
        expect(densityButton).toHaveFocus();

        fireEvent.click(densityButton);
        fireEvent.click(pcaButton);

        expect(onImageClick).toHaveBeenNthCalledWith(1, "/density.png", "NOOB - Dichteplot");
        expect(onImageClick).toHaveBeenNthCalledWith(2, "/pca.png", "NOOB - PCA Streudiagramm");
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

        fireEvent.click(screen.getByRole("button", { name: "NOOB Dichteplot Vorschau öffnen" }));

        expect(onSubmit).not.toHaveBeenCalled();
    });
});
