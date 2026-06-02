import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatenschutzPage } from "./DatenschutzPage.tsx";
import {MemoryRouter} from "react-router";

describe("DatenschutzPage", () => {
  it("enthält die wichtigen Datenschutzinformationen", () => {
    render(
        <MemoryRouter>
          <DatenschutzPage />
        </MemoryRouter>
        );

    const backButton = screen.getByRole('button');
    expect(backButton).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Datenschutzerklärung" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("THM");
    expect(document.body).toHaveTextContent("IDAT-Dateien");
    expect(document.body).toHaveTextContent("Samplesheet");
    expect(document.body).toHaveTextContent("Patientendaten");
    expect(document.body).toHaveTextContent("Art. 9 DSGVO");
    expect(document.body).toHaveTextContent(
      "Nach Beenden der Browser-Sitzung werden alle Daten automatisch und unwiderruflich gelöscht.",
    );
    expect(document.body).toHaveTextContent("keine dauerhafte Speicherung");
    expect(document.body).toHaveTextContent("nicht an Dritte weitergegeben");
    expect(document.body).toHaveTextContent("internen Netz der THM");
    expect(document.body).toHaveTextContent("Art. 6 Abs. 1 lit. e DSGVO");
    expect(document.body).toHaveTextContent("Art. 9 Abs. 2 lit. j DSGVO");
  });
});
