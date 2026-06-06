import {
  render,
  screen,
  fireEvent,
} from "@testing-library/react";

import {
  describe,
  it,
  expect,
  vi,
} from "vitest";

import { TablePagination }
from "./TablePagination";

describe(
  "TablePagination",
  () => {

    it(
      "renders page information",
      () => {
        render(
          <TablePagination
            page={1}
            totalPages={10}
            pageSize={100}
            onPageChange={
              () => {}
            }
          />
        );

        expect(
          screen.getByText(
            "Page 1 of 10"
          )
        ).toBeInTheDocument();
      }
    );

    it(
      "calls next page",
      () => {
        const fn = vi.fn();

        render(
          <TablePagination
            page={1}
            totalPages={10}
            pageSize={100}
            onPageChange={
              fn
            }
          />
        );

        fireEvent.click(
          screen.getByText(
            "Next"
          )
        );

        expect(fn)
          .toHaveBeenCalledWith(
            2
          );
      }
    );

    it(
      "calls previous page",
      () => {
        const fn = vi.fn();

        render(
          <TablePagination
            page={2}
            totalPages={10}
            pageSize={100}
            onPageChange={
              fn
            }
          />
        );

        fireEvent.click(
          screen.getByText(
            "Previous"
          )
        );

        expect(fn)
          .toHaveBeenCalledWith(
            1
          );
      }
    );

    it(
      "disables previous button on first page",
      () => {
        render(
          <TablePagination
            page={1}
            totalPages={10}
            pageSize={100}
            onPageChange={
              () => {}
            }
          />
        );

        expect(
          screen.getByText(
            "Previous"
          )
        ).toBeDisabled();
      }
    );

    it(
      "disables next button on last page",
      () => {
        render(
          <TablePagination
            page={10}
            totalPages={10}
            pageSize={100}
            onPageChange={
              () => {}
            }
          />
        );

        expect(
          screen.getByText(
            "Next"
          )
        ).toBeDisabled();
      }
    );
    it("calls page number button", () => {
    const fn = vi.fn();

    render(
        <TablePagination
        page={1}
        totalPages={10}
        pageSize={100}
        onPageChange={fn}
        />
    );

    fireEvent.click(
        screen.getByText("5")
    );

    expect(fn).toHaveBeenCalledWith(5);
    });

    it("shows page size", () => {
    render(
        <TablePagination
        page={1}
        totalPages={10}
        pageSize={100}
        onPageChange={() => {}}
        />
    );

    expect(
        screen.getByText(
        "100 entries/page"
        )
    ).toBeInTheDocument();
    });

    it("renders correct page number", () => {
    render(
        <TablePagination
        page={5}
        totalPages={10}
        pageSize={100}
        onPageChange={() => {}}
        />
    );

    expect(
        screen.getByText(
        "Page 5 of 10"
        )
    ).toBeInTheDocument();
    });
  }
);