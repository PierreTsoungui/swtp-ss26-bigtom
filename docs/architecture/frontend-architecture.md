# Architecture Specification: Frontend

**Scope:** `frontend/app/`, the React single-page application (SPA) that provides the user interface for the MethylAnalyzer platform: upload, filtering, normalization, batch correction, and result exploration (tables, plots, heatmaps).

> This document is the **reference architecture** for the frontend: it defines the intended structure, conventions, and boundaries that the code is organized around.

---

## Table of Contents

- [1. Purpose & Architectural Principles](#1-purpose--architectural-principles)
- [2. Technology Stack](#2-technology-stack)
- [3. Repository Structure](#3-repository-structure)
- [4. Feature Anatomy](#4-feature-anatomy)
- [5. Public API per Feature](#5-public-api-per-feature)
- [6. Types](#6-types)
- [7. Server Communication & State Management](#7-server-communication--state-management)
- [8. Tests](#8-tests)
- [9. Naming Conventions](#9-naming-conventions)
- [10. Component Grouping](#10-component-grouping)
- [11. Shared Module](#11-shared-module)
- [12. Path Aliases](#12-path-aliases)
- [13. Routing](#13-routing)
- [14. Styling & Theming](#14-styling--theming)
- [15. Development & Testing](#15-development--testing)

---

## 1. Purpose & Architectural Principles

The frontend follows a **feature-based architecture**: code is organized by business feature rather than by technical type (there is no global `components/` or `hooks/` bucket that grows without bound). Each feature owns everything it needs, including its pages, components, hooks, types, and helper functions, in one directory.

Two principles drive every structural decision:

1. **High cohesion.** Everything that belongs together functionally lives together physically. A change to the upload flow is made in one place.
2. **Loose coupling.** Features do not know about each other's internals and never reach into another feature's files. Cross-feature reuse happens only through a feature's public API ([§5](#5-public-api-per-feature)) or through the `shared/` module ([§11](#11-shared-module)).

The practical benefit is that a feature can be understood, tested, refactored, or removed in isolation, and the blast radius of a change stays inside its directory.

---

## 2. Technology Stack

| Technology | Role |
|---|---|
| [React](https://react.dev/) 19 | UI component model |
| [TypeScript](https://www.typescriptlang.org/) 6 | Static typing across the whole codebase |
| [Vite](https://vitejs.dev/) 8 | Dev server and build tool |
| [React Router](https://reactrouter.com/) 7 | Client-side routing |
| [Tailwind CSS](https://tailwindcss.com/) 4 | Utility-first styling with design tokens ([§14](#14-styling--theming)) |
| [Material UI](https://mui.com/) 9 | Pre-built, customizable UI components |
| [Vitest](https://vitest.dev/) 4 | Unit and component testing |
| [ESLint](https://eslint.org/) | Linting and convention enforcement |

Concrete versions are pinned in `package.json`; the table lists the major version that the architecture assumes.

---

## 3. Repository Structure

At the top level the application separates **features** (business capabilities) from **shared** building blocks (cross-feature infrastructure and generic UI).

```text
frontend/app/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig*.json
└── src/
    ├── main.tsx                 # React root / application bootstrap
    ├── App.tsx                  # Route table; composes AppLayout + ErrorBoundary
    ├── App.css                  # Tailwind entry and base layer
    ├── setupTests.ts            # Vitest global setup
    ├── assets/                  # Static assets (images, fonts)
    ├── types/                   # Ambient TS declarations only (*.d.ts): module/asset augmentations
    │
    ├── features/                # Self-contained business features (§4)
    │   ├── landing/             # Marketing/entry page and in-page navigation
    │   ├── upload/              # File/folder/ZIP upload, inspect → commit, filter setup
    │   ├── analysis/            # Live job progress (polling) after a job starts
    │   ├── normalization/       # Normalization method selection + preview plots
    │   ├── batch/              # Batch-effect diagnostics (SVD) and correction
    │   └── results/            # DMP/DMR tables, filters, and heatmap
    │
    └── shared/                 # Cross-feature building blocks (§11)
        ├── components/         # Generic UI (buttons, dialogs, fallback pages, progress)
        ├── hooks/             # Cross-feature hooks
        ├── layout/            # AppLayout, AppHeader, AppFooter, StepIndicator
        ├── plots/             # Shared plot rendering + export (PNG/PDF)
        ├── theme/             # Design tokens (colors, spacing)
        ├── errors/            # ErrorBoundary + typed API error handling
        ├── utils/             # Cross-feature pure helpers
        └── types/             # Types shared by two or more features
```

Each entry under `features/` is a single business capability; the mapping to routes is listed in [§13](#13-routing). The internal layout of a feature is defined in [§4](#4-feature-anatomy).

The top-level `src/types/` folder is reserved exclusively for **ambient TypeScript declarations** (`*.d.ts`) that augment third-party or platform types — for example teaching JSX about non-standard attributes or declaring `*.md?raw` imports. It contains no runtime code; feature- and cross-feature types live in a feature's `types` ([§6](#6-types)) or in `shared/types`, never here.

---

## 4. Feature Anatomy

Each feature has its own folder under `features/`. All files belonging to that feature are grouped there. The internal structure is adapted to the feature's needs; the following elements are standard:

| Folder / File | Content |
|---|---|
| `<Feature>Page.tsx` | Entry point / main component of the feature (rendered by the router) |
| `index.ts` | Public API of the feature (see [§5](#5-public-api-per-feature)) |
| `components/` | UI components used only within this feature |
| `hooks/` | Feature-specific custom hooks, including backend calls (see [§7](#7-server-communication--state-management)) |
| `types.ts` or `types/` | Type definitions for the feature (see [§6](#6-types)) |
| `utils/` | Pure helper functions without side effects (no API code, no types) |
| additional folders as needed | e.g. `content/` for static Markdown |

A fully expanded feature, using the `results` feature as a concrete example:

```text
features/results/
├── index.ts                    # Public API: exports ResultsPage and shared types only
├── ResultsPage.tsx             # Feature entry point (rendered at /results/:jobId)
├── ResultsPage.test.tsx        # Co-located test (§8)
├── components/
│   ├── table/                  # A self-contained UI sub-domain (§10)
│   │   ├── AnalysisTable.tsx
│   │   ├── TableContainer.tsx
│   │   ├── TableFilters.tsx
│   │   └── TableExportButton.tsx
│   └── heatmap/
│       ├── HeatMap.tsx
│       └── HeatMap.test.tsx
├── hooks/
│   ├── useTableData.ts         # fetch + state for the result table
│   └── useGenerateHeatMap.ts   # fetch + state for heatmap generation
├── types/
│   ├── index.ts                # re-exports the type groups below
│   ├── table.ts
│   └── heatmap.ts
└── utils/
    └── tableFilters.ts         # pure transforms, no I/O
```

---

## 5. Public API per Feature

Each feature exposes its publicly usable elements through an `index.ts` at the feature root. Other features, `App.tsx`, and the router import **exclusively** through this file, never directly from another feature's internal subfolders.

```ts
// features/upload/index.ts
export { UploadPage } from './UploadPage';
export type { UploadRequest, UploadResponse } from './types';
```

```tsx
// Avoid: reaching into another feature's internals
import { UploadDropzone } from '../upload/components/UploadDropzone';

// Prefer: accessing it through the public API
import { UploadPage } from '../upload';
```

This rule is the single most important lever for loose coupling: internal refactors within a feature (moving files, renaming components) can never break another feature, because the only surface other code depends on is the `index.ts`.

The rule is enforced technically rather than by convention alone: ESLint's `@typescript-eslint/no-restricted-imports` forbids importing a feature through a deep alias path (`@features/*/*`), so cross-feature imports must go through the feature root (`@features/<feature>`, i.e. its `index.ts`). A dedicated boundary plugin (e.g. `eslint-plugin-boundaries`) can be layered on for stricter, relative-path-aware enforcement.

---

## 6. Types

Type definitions are the **contract model** of a feature, not a utility. They therefore do not live in `utils/`, but instead:

- as a single `types.ts` file at the feature root, as long as it stays manageable (rule of thumb: below ~150 lines);
- as a `types/` folder with multiple files once the file grows or clearly separable domain groups emerge (e.g. `types/table.ts`, `types/heatmap.ts`), with an `index.ts` that re-exports them.

**Basic rule:** not "one type = one file", but "whatever changes together belongs in the same file." Grouping follows functional relatedness, not the raw number of types.

```text
features/results/
  types/
    index.ts        // re-exports: export * from './table'; export * from './heatmap';
    table.ts        // DmpRow, DmrRow, TableFilterState, ...
    heatmap.ts      // HeatMapRequest, HeatMapResponse, AnnotationColumn, ...
```

A type needed by more than one feature moves to `shared/types/`, but only once that need actually arises and not preemptively.

---

## 7. Server Communication & State Management

**State.** The application deliberately uses **no global state store**. State is local React state, lifted only as far as needed and encapsulated in feature-specific custom hooks. This keeps each feature self-contained and avoids a shared mutable surface across features.

**Network calls.** Fetch calls and request/response mapping live together with the logic that uses them, inside the relevant custom hooks (`hooks/`), without a separate `api/` folder. This keeps the number of levels per feature small and is sufficient as long as a backend call is used by a single hook.

```text
features/upload/
  hooks/
    useUploadFlow.ts     // contains both the fetch call and the associated state
  utils/
    filterValidation.ts  // pure function, no network access
```

The important boundary is against `utils/`: a hook may contain network calls; a file in `utils/` may not. Once a backend call is needed by multiple hooks or multiple features, that is the signal to extract it into its own module (e.g. `hooks/uploadApi.ts`, or `shared/` for cross-feature needs), but only at that point.

**Long-running jobs (polling).** The analysis pipeline runs asynchronously on the backend (fire-and-forget). The frontend starts a job, then **polls** its status until a terminal state is reached, driven by a dedicated hook (e.g. `useJobPolling`). The status/progress payload and its terminal states are defined by [`pipeline-progress.md`](./pipeline-progress.md); polling logic must stop on the terminal states defined there and surface progress to the UI.

**Error handling.** The application root wraps its routes in a shared `ErrorBoundary` so an unexpected render error degrades to a controlled fallback rather than a blank page. API errors are returned by the backend as RFC-9457 `problem+json` ([`api-contract.md`](./api-contract.md)); hooks parse that shape defensively and expose a user-readable message rather than a raw response. Shared error types and helpers live in `shared/errors/`.

---

## 8. Tests

Tests are **co-located**, placed directly next to the file they test, with the extension `.test.tsx` or `.test.ts`:

```text
features/upload/components/
  UploadDropzone.tsx
  UploadDropzone.test.tsx
```

Advantages over a separate `tests/` tree:

- when a component is moved or deleted, its test is immediately visible as moved along or missing;
- no searching across two parallel folder trees;
- import paths in tests stay short (`./UploadDropzone` instead of `../components/UploadDropzone`).

A test may **only** test code from its own feature. Tests for `shared/` components belong in `shared/`, not in a feature that happens to use them.

---

## 9. Naming Conventions

To keep the project consistent, the following rules apply:

- The main component of a feature is `<FeatureName>Page.tsx`, using one suffix per project (not `View`, `Screen`, etc.).
- The feature folder name and its main component match (`features/results/ResultsPage.tsx`, not `features/tableview/ResultsPage.tsx`).
- Subfolders (`components`, `hooks`, `utils`, `types`) are lowercase.
- Component files: PascalCase (`UploadDropzone.tsx`).
- Hook files: camelCase with a `use` prefix (`useUploadFlow.ts`).
- Util / API files: camelCase (`filterValidation.ts`, `uploadApi.ts`).
- Domain spelling is fixed once per project and used everywhere (folder, route, and identifiers use the same term, e.g. `normalization`).

---

## 10. Component Grouping

When a feature accumulates many components, the question is whether `components/` should be split into subfolders. The rule is: **do not split by count, split by functional grouping.**

A subfolder is justified when several components together form a self-contained piece of UI that is also conceptually treated as a unit:

```text
features/results/components/
  heatmap/
    HeatMap.tsx
    HeatMap.test.tsx
  table/
    AnalysisTable.tsx
    TableContainer.tsx
    TableExportButton.tsx
```

No subfolder is needed when components live in the same feature but do not form a shared sub-domain; they are simply the building blocks of one page, not a standalone subsystem. Extra folders without a real functional boundary only add navigation depth without increasing cohesion.

Rules of thumb for the decision:

1. **Standalone test.** Could this cluster theoretically exist as its own mini-feature (own hooks, own types, own tests)? If so, it deserves its own subfolder, possibly including its own `index.ts`.
2. **Naming as a signal.** Components sharing a prefix (`Table*`, `Filter*`, `Plot*`) often already hint at a natural group.
3. **Size as a trigger, not a rule.** Once a flat `components/` folder reaches roughly 7 to 8 files, review whether groups emerge, though count alone is never a reason to split without a functional boundary.
4. **No nesting for its own sake.** A subfolder with only one or two files is rarely worth it; prefer a self-explanatory filename (`HeatmapChart.tsx` over `heatmap/Chart.tsx`).

Subfolder names follow the same lowercase convention as all other folders ([§9](#9-naming-conventions)).

---

## 11. Shared Module

Alongside `features/` there is a global `shared/` module for reusable, feature-independent elements used across multiple features:

```text
shared/
  components/   # generic UI (buttons, dialogs, layout primitives, fallback pages)
  hooks/        # cross-feature hooks
  layout/       # application shell (AppLayout, AppHeader, AppFooter, StepIndicator)
  plots/        # shared plot rendering and export
  theme/        # design tokens
  errors/       # ErrorBoundary and typed error handling
  utils/        # general pure helpers
  types/        # types needed by two or more features
```

**Basic rule:**
- Feature-specific → `features/`
- Reusable (used by two or more features) → `shared/`

Something moves to `shared/` only once a concrete need arises from a second feature, not preemptively just in case.

---

## 12. Path Aliases

To avoid long relative import paths (`../../../shared/components/Button`), path aliases are configured in `tsconfig` and `vite.config.ts`:

```jsonc
// tsconfig.app.json (moduleResolution: "bundler"; paths resolve relative to
// this file, so no deprecated "baseUrl" is required on TypeScript 6+)
{
  "compilerOptions": {
    "paths": {
      "@features/*": ["./src/features/*"],
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

```ts
// vite.config.ts
resolve: {
  alias: {
    '@features': path.resolve(__dirname, './src/features'),
    '@shared': path.resolve(__dirname, './src/shared'),
  },
},
```

Aliases make imports robust against files being moved within a folder and keep them readable. Note that a feature's public API is still imported through its root (`@features/upload`), never through an internal path.

---

## 13. Routing

Routing uses React Router. Routes are defined centrally in `App.tsx`, which wraps the page components in the application shell (`AppLayout`) and the root `ErrorBoundary`. Each route imports its page component exclusively through the feature's public API ([§5](#5-public-api-per-feature)).

| Path | Page component | Feature |
|---|---|---|
| `/` | `LandingPage` | `landing` |
| `/upload` | `UploadPage` | `upload` |
| `/analysis/:jobId` | `AnalysisPage` | `analysis` |
| `/normalization/:jobId` | `NormalizationPage` | `normalization` |
| `/batch/:jobId` | `BatchPage` | `batch` |
| `/results/:jobId` | `ResultsPage` | `results` |
| `/privacy` | `PrivacyPolicyPage` | `shared/pages` |
| `*` | `FallbackPage` | `shared` |

```tsx
import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './features/landing';
import { UploadPage } from './features/upload';

<Routes>
  <Route path="/" element={<LandingPage />} />
  <Route path="/upload" element={<UploadPage />} />
  <Route path="*" element={<FallbackPage variant="not-found" />} />
</Routes>
```

Cross-cutting pages that do not belong to a business feature (e.g. the privacy policy) live under `shared/pages/`.

---

## 14. Styling & Theming

Styling uses **Tailwind CSS** utility classes directly in JSX, rather than separate CSS files. Colours and other visual constants are not hard-coded per component; they come from a central set of **design tokens** (`shared/theme/`) exposed as semantic Tailwind classes, so the palette can change in one place.

```tsx
// Prefer semantic tokens over raw colour values
<button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-text hover:bg-primary-hover">
  Start analysis
</button>
```

For richer interactive components, **Material UI** is used and customized to fit the design. When MUI and Tailwind are combined, the two must agree on the token system so components stay visually consistent.

```tsx
import { Button } from '@mui/material';

<Button variant="contained" color="primary">Start analysis</Button>
```

Recommended tooling in VS Code: the Tailwind CSS IntelliSense extension for class autocompletion, and the Material UI extension for browsing component props.

---

## 15. Development & Testing

Install dependencies once:

```bash
npm install
```

Start the Vite development server with hot-module reloading:

```bash
npm run dev
```

Run the test suite (Vitest discovers all co-located `.test.ts`/`.test.tsx` files):

```bash
npm run test
```

Lint the codebase and produce a production build:

```bash
npm run lint
npm run build
```

The production build type-checks the project (`tsc`) and then bundles it with Vite.