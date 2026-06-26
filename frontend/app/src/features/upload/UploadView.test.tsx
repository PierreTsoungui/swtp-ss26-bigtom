import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect } from "vitest";
import UploadView from "./UploadView.tsx";

const renderUploadView = () =>
  render(
    <MemoryRouter>
      <UploadView />
    </MemoryRouter>,
  );

describe("UploadView", () => {
  it("shows a single upload dropzone in the idle state", () => {
    renderUploadView();

    expect(
      screen.getByText(/Drop a folder, a .zip or individual files/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select files \/ ZIP/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select folder/i })).toBeInTheDocument();
  });

  it("opens the upload help from the specification", () => {
    renderUploadView();

    fireEvent.click(screen.getByRole("button", { name: "Open upload help" }));

    expect(
      screen.getByText(/For every biological sample, two files are required/i),
    ).toBeInTheDocument();
  });
});
