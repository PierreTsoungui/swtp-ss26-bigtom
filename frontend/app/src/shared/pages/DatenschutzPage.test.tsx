import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatenschutzPage } from "./DatenschutzPage.tsx";
import { MemoryRouter } from "react-router";

describe("DatenschutzPage Component", () => {
  it("contains all critical and required regulatory privacy information in internationalized English", () => {
    // Arrange & Act
    render(
        <MemoryRouter>
          <DatenschutzPage />
        </MemoryRouter>
    );

    // Assert that the navigation back button trigger is present in layout view
    const backButton = screen.getByRole('button');
    expect(backButton).toBeInTheDocument();

    // Assert localized English header titles and critical content descriptors
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    
    // Verify regulatory policy strings are safely compiled into the body canvas
    expect(document.body).toHaveTextContent("THM");
    expect(document.body).toHaveTextContent("IDAT files");
    expect(document.body).toHaveTextContent("sample sheet");
    expect(document.body).toHaveTextContent("patient data");
    expect(document.body).toHaveTextContent("Art. 9 GDPR");
    expect(document.body).toHaveTextContent(
      "After ending the browser session, all data is automatically and irrevocably deleted."
    );
    expect(document.body).toHaveTextContent("no permanent storage");
    expect(document.body).toHaveTextContent("not passed on to third parties");
    expect(document.body).toHaveTextContent("internal network of the THM");
    expect(document.body).toHaveTextContent("Art. 6 Para. 1 lit. e GDPR");
    expect(document.body).toHaveTextContent("Art. 9 Para. 2 lit. j GDPR");
  });
});
