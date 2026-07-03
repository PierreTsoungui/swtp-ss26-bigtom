import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MethodCard from "./MethodCard";
import type { MethodPlotGroup } from "../utils/types";

const plotGroup: MethodPlotGroup = {
    method: "noob",
    plots: [
        { plot_kind: "density", url: "/density.png" },
        { plot_kind: "pca", url: "/pca.png" },
    ],
};

describe("MethodCard", () => {
    it("renders semantic preview buttons with accessible names", () => {
        render(
            <MethodCard
                group={plotGroup}
                isSelected={false}
                onSelect={() => {}}
                onImageClick={() => {}}
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
                group={plotGroup}
                isSelected={false}
                onSelect={() => {}}
                onImageClick={onImageClick}
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
                    group={plotGroup}
                    isSelected={false}
                    onSelect={() => {}}
                    onImageClick={() => {}}
                />
            </form>,
        );

        fireEvent.click(screen.getByRole("button", { name: "NOOB Dichteplot Vorschau öffnen" }));

        expect(onSubmit).not.toHaveBeenCalled();
    });
});
