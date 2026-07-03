import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TablePagination } from "./TablePagination";

describe("TablePagination", () => {
  it("renders page information", () => {
    render(<TablePagination page={1} totalPages={10} pageSize={100} onPageChange={() => {}} />);

    expect(screen.getByText("Seite 1 von 10")).toBeInTheDocument();
  });

  it("calls next page", () => {
    const onPageChange = vi.fn();

    render(<TablePagination page={1} totalPages={10} pageSize={100} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Zur nächsten Seite" }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls previous page", () => {
    const onPageChange = vi.fn();

    render(<TablePagination page={2} totalPages={10} pageSize={100} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Zur vorherigen Seite" }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables first and previous buttons on first page", () => {
    render(<TablePagination page={1} totalPages={10} pageSize={100} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Zur ersten Seite" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zur vorherigen Seite" })).toBeDisabled();
  });

  it("disables next and last buttons on last page", () => {
    render(<TablePagination page={10} totalPages={10} pageSize={100} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Zur nächsten Seite" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zur letzten Seite" })).toBeDisabled();
  });

  it("calls page number button", () => {
    const onPageChange = vi.fn();

    render(<TablePagination page={1} totalPages={10} pageSize={100} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Seite 5" }));

    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it("marks the current page semantically", () => {
    render(<TablePagination page={5} totalPages={10} pageSize={100} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Seite 5", current: "page" })).toBeInTheDocument();
  });

  it("shows page size", () => {
    render(<TablePagination page={1} totalPages={10} pageSize={100} onPageChange={() => {}} />);

    expect(screen.getByText("100 Einträge pro Seite")).toBeInTheDocument();
  });

  it("renders correct page number", () => {
    render(<TablePagination page={5} totalPages={10} pageSize={100} onPageChange={() => {}} />);

    expect(screen.getByText("Seite 5 von 10")).toBeInTheDocument();
  });
});
