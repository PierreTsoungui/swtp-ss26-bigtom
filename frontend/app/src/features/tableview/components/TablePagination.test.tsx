import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TablePagination } from "./TablePagination";

describe("TablePagination", () => {
  it("renders page information and entries count correctly", () => {
    render(
      <TablePagination
        page={1}
        totalPages={10}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByText("Page 1 of 10")).toBeInTheDocument();
    expect(screen.getByText("100 entries per page")).toBeInTheDocument();
  });

  it("calls onPageChange with next page index when next button is clicked", () => {
    const onPageChangeMock = vi.fn();
    render(
      <TablePagination
        page={1}
        totalPages={10}
        pageSize={100}
        onPageChange={onPageChangeMock}
      />
    );

    const nextButton = screen.getByTitle("Next page");
    fireEvent.click(nextButton);

    expect(onPageChangeMock).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with previous page index when previous button is clicked", () => {
    const onPageChangeMock = vi.fn();
    render(
      <TablePagination
        page={2}
        totalPages={10}
        pageSize={100}
        onPageChange={onPageChangeMock}
      />
    );

    const prevButton = screen.getByTitle("Previous page");
    fireEvent.click(prevButton);

    expect(onPageChangeMock).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange with bound targets when first and last buttons are clicked", () => {
    const onPageChangeMock = vi.fn();
    render(
      <TablePagination
        page={3}
        totalPages={10}
        pageSize={100}
        onPageChange={onPageChangeMock}
      />
    );

    // Test first page click
    fireEvent.click(screen.getByTitle("First page"));
    expect(onPageChangeMock).toHaveBeenCalledWith(1);

    // Test last page click
    fireEvent.click(screen.getByTitle("Last page"));
    expect(onPageChangeMock).toHaveBeenCalledWith(10);
  });

  it("disables first and previous buttons on the first page", () => {
    render(
      <TablePagination
        page={1}
        totalPages={10}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByTitle("First page")).toBeDisabled();
    expect(screen.getByTitle("Previous page")).toBeDisabled();
    expect(screen.getByTitle("Next page")).not.toBeDisabled();
    expect(screen.getByTitle("Last page")).not.toBeDisabled();
  });

  it("disables next and last buttons on the last page", () => {
    render(
      <TablePagination
        page={10}
        totalPages={10}
        pageSize={100}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByTitle("First page")).not.toBeDisabled();
    expect(screen.getByTitle("Previous page")).not.toBeDisabled();
    expect(screen.getByTitle("Next page")).toBeDisabled();
    expect(screen.getByTitle("Last page")).toBeDisabled();
  });

  it("calls onPageChange when a specific numbered page button is clicked", () => {
    const onPageChangeMock = vi.fn();
    render(
        <TablePagination
            page={1}
            totalPages={10}
            pageSize={100}
            onPageChange={onPageChangeMock}
        />
    );

    const pageFourButton = screen.getByRole("button", { name: /page 4/i });

    fireEvent.click(pageFourButton);

    expect(onPageChangeMock).toHaveBeenCalledWith(4);
  });

  //COVERAGE TESTS FOR THE GETPAGENUMBERS SLIDING WINDOW ALGORITHM

  it("shifts the pagination sliding window correctly when page is near the end", () => {
    const onPageChangeMock = vi.fn();

    render(
        <TablePagination
            page={10}
            totalPages={10}
            pageSize={50}
            onPageChange={onPageChangeMock}
        />
    );

    const pageSixButton = screen.getByRole("button", { name: /page 6/i });

    fireEvent.click(pageSixButton);

    expect(onPageChangeMock).toHaveBeenCalledWith(6);
  });


  it('handles situations where totalPages is smaller than maxVisible pages width', () => {
    render(
        <TablePagination
            page={1}
            totalPages={3}
            pageSize={50}
            onPageChange={vi.fn()}
        />
    );
    expect(screen.getByRole('button', { name: /page 3/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /page 4/i })).not.toBeInTheDocument();
  });

});
