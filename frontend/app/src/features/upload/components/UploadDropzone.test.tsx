import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import UploadDropzone from "./UploadDropzone";

/** Sets a FileList on a hidden input and fires its change event. */
function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

describe("UploadDropzone", () => {
  it("emits only accepted files and reports the rejected count", () => {
    const onFiles = vi.fn();
    const { container } = render(<UploadDropzone onFiles={onFiles} />);

    const fileInput = container.querySelector(
      'input[type="file"]:not([webkitdirectory])',
    ) as HTMLInputElement;
    selectFiles(fileInput, [
      new File(["a"], "sample.idat"),
      new File(["b"], "notes.txt"), // rejected
    ]);

    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "sample.idat" })]);
    expect(screen.getByText(/1 file ignored/)).toBeInTheDocument();
  });

  it("passes folder selections through without client-side filtering", () => {
    const onFiles = vi.fn();
    const { container } = render(<UploadDropzone onFiles={onFiles} />);

    const folderInput = container.querySelector("input[webkitdirectory]") as HTMLInputElement;
    selectFiles(folderInput, [new File(["a"], "anything.txt")]);

    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "anything.txt" })]);
  });

  it("emits files dropped onto the zone", () => {
    const onFiles = vi.fn();
    const { container } = render(<UploadDropzone onFiles={onFiles} />);

    const zone = container.firstChild as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["a"], "s.csv")] } });

    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "s.csv" })]);
  });

  it("does not emit dropped files when disabled", () => {
    const onFiles = vi.fn();
    const { container } = render(<UploadDropzone onFiles={onFiles} disabled />);

    const zone = container.firstChild as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["a"], "s.csv")] } });

    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Select files / ZIP" })).toBeDisabled();
  });

  it("renders the compact 'add more' variant", () => {
    render(<UploadDropzone onFiles={vi.fn()} compact />);
    expect(screen.getByText(/Add more files/)).toBeInTheDocument();
  });
});
