import { FaqSection } from "./components/FaqSection";
import { GettingStartedSection } from "./components/GettingStartedSection";
import { GlossarySection } from "./components/GlossarySection";
import { HeroSection } from "./components/HeroSection";
import { WorkflowSection } from "./components/WorkflowSection";
import {
  beginnerTopics,
  biologyDictionary,
  faqCategories,
  workflowSteps,
} from "./content/landingContent";

/**
 * Main landing page and application entry point.
 *
 * Composes the landing sections in the order the header navigation expects
 * (overview → workflow → getting-started → help → glossary). Each section is a
 * self-contained component fed by the static content in
 * {@link ./content/landingContent}; the anchors rendered here must stay in sync
 * with `LANDING_SECTIONS` in `./sections`.
 */
export function LandingPage() {
  return (
    <div className="bg-neutral-background text-neutral-textPrimary">
      <HeroSection />
      <WorkflowSection steps={workflowSteps} />
      <GettingStartedSection topics={beginnerTopics} />
      <FaqSection categories={faqCategories} />
      <GlossarySection entries={biologyDictionary} />
    </div>
  );
}
