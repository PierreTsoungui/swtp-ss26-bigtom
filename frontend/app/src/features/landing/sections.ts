/**
 * Single source of truth for the landing page's in-page sections.
 *
 * Both the landing page (which renders each `<section id=...>`) and the header
 * navigation (which renders the anchor links) consume this list, so adding,
 * renaming, or reordering a section is a one-line change here and stays in sync
 * automatically. `id` must match the `id` attribute of the corresponding
 * section element on the landing page.
 */
export interface LandingSection {
  /** Anchor target; must equal the section element's `id` on the landing page. */
  id: string;
  /** Short label shown in the header navigation. */
  label: string;
}

export const LANDING_SECTIONS: LandingSection[] = [
  { id: "overview", label: "Overview" },
  { id: "workflow", label: "Workflow" },
  { id: "getting-started", label: "Getting Started" },
  { id: "help", label: "FAQ" },
  { id: "glossary", label: "Glossary" },
];
