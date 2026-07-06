import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlossarySection } from "./GlossarySection";
import type { DictionaryItem } from "../types";

const entries: DictionaryItem[] = [
  { term: "Alpha", definition: "The first definition." },
  { term: "Beta", definition: "The second definition." },
];

describe("GlossarySection", () => {
  it("renders the section heading", () => {
    render(<GlossarySection entries={entries} />);
    expect(
      screen.getByRole("heading", { name: "Biological & Technical Glossary" }),
    ).toBeInTheDocument();
  });

  it("renders each entry's term and definition", () => {
    render(<GlossarySection entries={entries} />);

    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("The first definition.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beta" })).toBeInTheDocument();
  });

  it("exposes the 'glossary' anchor for header navigation", () => {
    const { container } = render(<GlossarySection entries={entries} />);
    expect(container.querySelector("#glossary")).not.toBeNull();
  });
});
