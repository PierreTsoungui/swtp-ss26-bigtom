import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FaqSection } from "./FaqSection";
import type { FaqCategory } from "../types";

const categories: FaqCategory[] = [
  {
    title: "Group One",
    questions: [
      { question: "Question A?", answer: "Answer A." },
      { question: "Question B?", answer: "Answer B." },
    ],
  },
  {
    title: "Group Two",
    questions: [{ question: "Question C?", answer: "Answer C." }],
  },
];

describe("FaqSection", () => {
  it("renders the section heading", () => {
    render(<FaqSection categories={categories} />);
    expect(screen.getByRole("heading", { name: "Frequently asked questions" })).toBeInTheDocument();
  });

  it("renders every category and its questions and answers", () => {
    render(<FaqSection categories={categories} />);

    expect(screen.getByRole("heading", { name: "Group One" })).toBeInTheDocument();
    expect(screen.getByText("Question A?")).toBeInTheDocument();
    expect(screen.getByText("Answer B.")).toBeInTheDocument();
    expect(screen.getByText("Question C?")).toBeInTheDocument();
  });

  it("uses native <details> so answers are collapsed by default", () => {
    const { container } = render(<FaqSection categories={categories} />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(3);
    details.forEach((el) => expect(el).not.toHaveAttribute("open"));
  });

  it("links each category heading to its labelled section via a derived id", () => {
    const { container } = render(<FaqSection categories={categories} />);

    const labelledSection = container.querySelector('[aria-labelledby="faq-group-one"]');
    expect(labelledSection).not.toBeNull();
    expect(container.querySelector("#faq-group-one")).toHaveTextContent("Group One");
  });

  it("exposes the 'help' anchor for header navigation", () => {
    const { container } = render(<FaqSection categories={categories} />);
    expect(container.querySelector("#help")).not.toBeNull();
  });
});
