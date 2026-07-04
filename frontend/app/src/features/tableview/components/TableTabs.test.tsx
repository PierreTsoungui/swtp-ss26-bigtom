import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { TableTabs } from "./TableTabs";

describe("TableTabs", () => {
  it("renders both tabs", () => {
    render(<TableTabs activeTab="dmp" onChange={vi.fn()} />);

    expect(screen.getByText("DMP Analysis")).toBeInTheDocument();
    expect(screen.getByText("DMR Analysis")).toBeInTheDocument();
  });

  it("highlights the active DMP tab correctly", () => {
    render(<TableTabs activeTab="dmp" onChange={vi.fn()} />);

    const dmpTab = screen.getByRole("tab", { name: "DMP Analysis" });
    const dmrTab = screen.getByRole("tab", { name: "DMR Analysis" });

    expect(dmpTab).toHaveAttribute("aria-selected", "true");
    expect(dmrTab).toHaveAttribute("aria-selected", "false");
  });

  it("highlights the active DMR tab correctly", () => {
    render(<TableTabs activeTab="dmr" onChange={vi.fn()} />);

    const dmpTab = screen.getByRole("tab", { name: "DMP Analysis" });
    const dmrTab = screen.getByRole("tab", { name: "DMR Analysis" });

    expect(dmpTab).toHaveAttribute("aria-selected", "false");
    expect(dmrTab).toHaveAttribute("aria-selected", "true");
  });

  it("calls onChange when clicking an inactive tab", () => {
    const onChangeMock = vi.fn();
    render(<TableTabs activeTab="dmp" onChange={onChangeMock} />);

    fireEvent.click(screen.getByText("DMR Analysis"));

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith("dmr");
  });

  it("calls onChange when clicking an already active tab", () => {
    const onChangeMock = vi.fn();
    render(<TableTabs activeTab="dmp" onChange={onChangeMock} />);

    fireEvent.click(screen.getByText("DMP Analysis"));

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith("dmp");
  });

  it("shows the help button with correct english aria-label for active DMP analysis", () => {
    render(<TableTabs activeTab="dmp" onChange={vi.fn()} />);

    const helpButton = screen.getByRole("button", { name: "Open help for DMP analysis" });
    expect(helpButton).toBeInTheDocument();
  });

  it("shows the help button with correct english aria-label for active DMR analysis", () => {
    render(<TableTabs activeTab="dmr" onChange={vi.fn()} />);

    const helpButton = screen.getByRole("button", { name: "Open help for DMR analysis" });
    expect(helpButton).toBeInTheDocument();
  });
});
