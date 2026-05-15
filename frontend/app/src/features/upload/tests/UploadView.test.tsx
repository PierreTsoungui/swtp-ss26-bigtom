import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import UploadView from "../UploadView";
import { describe, it, expect } from "vitest";

describe("UploadView", () => {

    it("Button ist am Anfang deaktiviert", () => {
        render(
            <MemoryRouter>
                <UploadView />
            </MemoryRouter>
        );

        const button = screen.getByRole("button", { name: /analyse starten/i });

        expect(button).toBeDisabled();
    });

});
