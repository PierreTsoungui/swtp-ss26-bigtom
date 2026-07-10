import { describe, expect, it } from "vitest";

import { faqCategoryId } from "./faqCategoryId";

describe("faqCategoryId", () => {
  it("prefixes and lowercases the title", () => {
    expect(faqCategoryId("Analysis Process")).toBe("faq-analysis-process");
  });

  it("replaces every space with a hyphen", () => {
    expect(faqCategoryId("Data Privacy & Security")).toBe("faq-data-privacy-&-security");
  });

  it("handles a single-word title", () => {
    expect(faqCategoryId("Visualizations")).toBe("faq-visualizations");
  });
});
