import { describe, expect, it } from "vitest";

import { beginnerTopics, biologyDictionary, faqCategories, workflowSteps } from "./landingContent";

/** Collects any values that occur more than once in the given list. */
function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      dupes.add(value);
    }
    seen.add(value);
  }
  return [...dupes];
}

describe("landing content integrity", () => {
  it("exposes non-empty content for every section", () => {
    expect(biologyDictionary.length).toBeGreaterThan(0);
    expect(workflowSteps.length).toBeGreaterThan(0);
    expect(beginnerTopics.length).toBeGreaterThan(0);
    expect(faqCategories.length).toBeGreaterThan(0);
  });

  it("has unique, non-empty glossary terms with definitions", () => {
    expect(duplicates(biologyDictionary.map((entry) => entry.term))).toEqual([]);
    for (const { term, definition } of biologyDictionary) {
      expect(term.trim()).not.toBe("");
      expect(definition.trim()).not.toBe("");
    }
  });

  it("has unique workflow and beginner card titles with an icon each", () => {
    expect(duplicates(workflowSteps.map((step) => step.title))).toEqual([]);
    expect(duplicates(beginnerTopics.map((topic) => topic.title))).toEqual([]);
    for (const card of [...workflowSteps, ...beginnerTopics]) {
      expect(card.description.trim()).not.toBe("");
      expect(card.icon).toBeTruthy();
    }
  });

  it("has unique FAQ categories and globally unique questions", () => {
    expect(duplicates(faqCategories.map((category) => category.title))).toEqual([]);

    const allQuestions = faqCategories.flatMap((category) =>
      category.questions.map((item) => item.question),
    );
    expect(duplicates(allQuestions)).toEqual([]);

    for (const category of faqCategories) {
      expect(category.questions.length).toBeGreaterThan(0);
      for (const { question, answer } of category.questions) {
        expect(question.trim()).not.toBe("");
        expect(answer.trim()).not.toBe("");
      }
    }
  });
});
