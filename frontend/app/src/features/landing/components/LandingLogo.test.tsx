import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingLogo } from "./LandingLogo";

describe("LandingLogo", () => {
  it("renders an accessible branding image", () => {
    render(<LandingLogo />);

    const logo = screen.getByRole("img", {
      name: "BigTom DNA methylation analysis platform logo",
    });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src");
  });
});
