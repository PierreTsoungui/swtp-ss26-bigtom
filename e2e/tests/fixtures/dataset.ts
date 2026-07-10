import fs from "node:fs";
import path from "node:path";

/** Repo root, relative to this file (e2e/tests/fixtures/dataset.ts). */
export const REPO_ROOT = path.resolve(__dirname, "../../..");

export interface Dataset {
  dir: string;
  sampleSheet: string;
  idats: string[];
}

/**
 * Locate a complete IDAT dataset to upload. Order of preference:
 *   1. $E2E_DATASET_DIR (a directory containing *.idat + a SampleSheet CSV)
 *   2. any `jobs/<id>/` directory that already contains a full dataset
 *
 * Returns null if none is found (the pipeline test then skips with a clear
 * reason instead of failing).
 */
export function findDataset(): Dataset | null {
  const candidates: string[] = [];
  if (process.env.E2E_DATASET_DIR) {
    candidates.push(process.env.E2E_DATASET_DIR);
  }
  const jobsDir = path.join(REPO_ROOT, "jobs");
  if (fs.existsSync(jobsDir)) {
    for (const entry of fs.readdirSync(jobsDir)) {
      candidates.push(path.join(jobsDir, entry));
    }
  }

  for (const dir of candidates) {
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      const files = fs.readdirSync(dir);
      const idats = files
        .filter((f) => f.toLowerCase().endsWith(".idat"))
        .map((f) => path.join(dir, f));
      const sheet = files.find((f) => /samplesheet.*\.csv$/i.test(f));
      // A usable set needs at least one Grn/Red pair and a sample sheet.
      if (idats.length >= 2 && sheet) {
        return { dir, sampleSheet: path.join(dir, sheet), idats };
      }
    } catch {
      // ignore unreadable candidates
    }
  }
  return null;
}

/** Reads a sample sheet from disk for reuse as a synthetic-job fixture. */
export function readSampleSheet(): string | null {
  const ds = findDataset();
  return ds ? fs.readFileSync(ds.sampleSheet, "utf8") : null;
}
