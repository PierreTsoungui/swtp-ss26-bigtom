/**
 * Global Vitest setup, loaded once before the test suite runs.
 *
 * Importing `@testing-library/jest-dom` registers its custom DOM matchers
 * (e.g. `toBeInTheDocument`, `toHaveFocus`) on Vitest's `expect`, so every
 * co-located test can use them without a per-file import.
 */
import "@testing-library/jest-dom";
