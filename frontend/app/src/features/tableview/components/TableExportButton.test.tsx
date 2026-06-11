import {render,screen,fireEvent,} from "@testing-library/react";

import {describe,expect,it,vi,} from "vitest";

import {TableExportButton,} from "./TableExportButton";

describe(
  "TableExportButton",
  () => {
    it(
      "renders button",
      () => {
        render(
          <TableExportButton
            onDownload={() => {}}
          />
        );

        expect(
          screen.getByText(
            "Download CSV"
          )
        ).toBeInTheDocument();
      }
    );


    it("downloads CSV on click", async () => {
        const onDownload = vi.fn();

        render(<TableExportButton onDownload={onDownload} />);

        fireEvent.click(screen.getByText("Download CSV"));

        expect(onDownload).toHaveBeenCalled();
        });

    it(
      "calls onDownload",
      () => {
        const onDownload =
          vi.fn();

        render(
          <TableExportButton
            onDownload={
              onDownload
            }
          />
        );

        fireEvent.click(
          screen.getByText(
            "Download CSV"
          )
        );

        expect(
          onDownload
        ).toHaveBeenCalledTimes(1);
      }
    );
  }
);