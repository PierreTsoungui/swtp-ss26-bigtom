import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import UploadView from "../UploadView";
import { describe, it, expect } from "vitest";

const renderUploadView = () => {
    render(
        <MemoryRouter>
            <UploadView />
        </MemoryRouter>
    );
};

const createFile = (name: string, content = "content", type = "application/octet-stream") =>
    new File([content], name, { type, lastModified: 1 });

const createFolderFile = (relativePath: string, content = "content") => {
    const fileName = relativePath.split("/").at(-1) ?? relativePath;
    const file = createFile(fileName, content);

    Object.defineProperty(file, "webkitRelativePath", {
        value: relativePath,
    });

    return file;
};

describe("UploadView", () => {

    it("Button ist am Anfang deaktiviert", () => {
        renderUploadView();

        const button = screen.getByRole("button", { name: /analyse starten/i });

        expect(button).toBeDisabled();
    });

    it("ignoriert Nicht-IDAT-Dateien beim Ordnerimport", () => {
        renderUploadView();

        const folderInput = screen.getByLabelText(/IDAT-Ordner/i);

        fireEvent.change(folderInput, {
            target: {
                files: [
                    createFolderFile("run/sample_Grn.idat"),
                    createFolderFile("run/sample_Red.idat"),
                    createFolderFile("run/readme.txt"),
                    createFolderFile("run/report.pdf"),
                ],
            },
        });

        expect(screen.getByText("run/sample_Grn.idat")).toBeInTheDocument();
        expect(screen.getByText("run/sample_Red.idat")).toBeInTheDocument();
        expect(screen.queryByText("run/readme.txt")).not.toBeInTheDocument();
        expect(screen.queryByText("run/report.pdf")).not.toBeInTheDocument();
    });

    it("validiert fehlende IDAT-Paare weiterhin", () => {
        renderUploadView();

        const fileInput = screen.getByLabelText(/IDAT-Dateien/i);

        fireEvent.change(fileInput, {
            target: {
                files: [createFile("sample_Grn.idat")],
            },
        });

        expect(screen.getByText(/Kein Red-Partner/i)).toBeInTheDocument();
        expect(screen.getByText(/Ungerade Anzahl/i)).toBeInTheDocument();
    });

    it("behandelt Dateien mit gleichem Namen in unterschiedlichen Unterordnern nicht als Duplikate", () => {
        renderUploadView();

        const folderInput = screen.getByLabelText(/IDAT-Ordner/i);

        fireEvent.change(folderInput, {
            target: {
                files: [
                    createFolderFile("run-a/sample_Grn.idat", "a"),
                    createFolderFile("run-a/sample_Red.idat", "a"),
                    createFolderFile("run-b/sample_Grn.idat", "b"),
                    createFolderFile("run-b/sample_Red.idat", "b"),
                ],
            },
        });

        expect(screen.getByText("run-a/sample_Grn.idat")).toBeInTheDocument();
        expect(screen.getByText("run-b/sample_Grn.idat")).toBeInTheDocument();
        expect(screen.getByText(/4 Dateien \(2 Paare\)/i)).toBeInTheDocument();
    });

    it("aktiviert den Analyse-Button bei validem IDAT-Paar und validem Sample Sheet", () => {
        renderUploadView();

        fireEvent.change(screen.getByLabelText(/IDAT-Dateien/i), {
            target: {
                files: [
                    createFile("sample_Grn.IDAT"),
                    createFile("sample_Red.IDAT"),
                ],
            },
        });

        fireEvent.change(screen.getByLabelText(/Sample Sheet/i), {
            target: {
                files: [createFile("samples.csv", "sample", "text/csv")],
            },
        });

        expect(screen.getByRole("button", { name: /analyse starten/i })).toBeEnabled();
    });

});
