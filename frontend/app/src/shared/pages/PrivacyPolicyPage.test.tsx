import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage.tsx";
import { MemoryRouter } from "react-router";

describe("PrivacyPolicyPage Component", () => {
  it("contains all critical and required regulatory privacy information in English", () => {
    // Arrange & Act
    render(
        <MemoryRouter>
          <PrivacyPolicyPage />
        </MemoryRouter>
    );

    // Assert that the navigation back button trigger is present in layout view
    const backButton = screen.getByRole('button');
    expect(backButton).toBeInTheDocument();

    // Assert localized English header titles and critical content descriptors
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();

    // Verify regulatory policy strings are present in the rendered body
    expect(document.body).toHaveTextContent("Technische Hochschule Mittelhessen (THM)");
    expect(document.body).toHaveTextContent("datenschutz@thm.de");
    expect(document.body).toHaveTextContent("IDAT files");
    expect(document.body).toHaveTextContent("sample sheet");
    expect(document.body).toHaveTextContent("health data");
    expect(document.body).toHaveTextContent("Art. 9 GDPR");

    // Access is internal-only (THM network / VPN) and stored on THM servers.
    expect(document.body).toHaveTextContent("only from within the THM network");

    // The retention statement: data lives on the server for ~24h and is not
    // permanently stored.
    expect(document.body).toHaveTextContent("automatically and permanently deleted");
    expect(document.body).toHaveTextContent("24 hours");
    expect(document.body).toHaveTextContent("not archived or backed up");

    // Legal bases (GDPR + Hessian law) and the competent supervisory authority.
    expect(document.body).toHaveTextContent("Art. 6 Para. 1 lit. e GDPR");
    expect(document.body).toHaveTextContent("Art. 9 Para. 2 lit. j GDPR");
    expect(document.body).toHaveTextContent("HDSIG");
    expect(document.body).toHaveTextContent("Hessische Beauftragte für Datenschutz");
  });
});
