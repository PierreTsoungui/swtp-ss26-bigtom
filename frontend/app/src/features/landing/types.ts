import type { ReactNode } from "react";

/**
 * Type definitions for the static, educational content shown on the landing
 * page (glossary, workflow, getting-started tiles, and FAQ). These types are the
 * contract between the content data ({@link ./content/landingContent}) and the
 * section components that render it.
 */

/**
 * A single entry in the glossary of terms.
 */
export interface DictionaryItem {
  /** The technical or biological term. */
  term: string;
  /** A concise, human-readable definition of the term. */
  definition: string;
}

/**
 * Data structure for informational tiles displayed on the landing page (used by
 * both the workflow steps and the getting-started topics).
 */
export interface InformationCard {
  /** Short, descriptive heading of the tile. */
  title: string;
  /** Body text explaining the step or concept. */
  description: string;
  /** Visual representation, typically an icon from Material UI. */
  icon: ReactNode;
}

/**
 * A single question-and-answer pair for the FAQ section.
 */
export interface FaqItem {
  /** The question, shown in the accordion summary. */
  question: string;
  /** The answer, revealed when the accordion entry is expanded. */
  answer: string;
}

/**
 * A grouped collection of FAQ items, categorized by topic.
 */
export interface FaqCategory {
  /** The name of the category (e.g., "Upload & Files"). */
  title: string;
  /** List of questions belonging to this category. */
  questions: FaqItem[];
}
