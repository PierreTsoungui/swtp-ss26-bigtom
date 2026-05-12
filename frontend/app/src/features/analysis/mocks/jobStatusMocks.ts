// mocks/jobStatusMocks.ts
import { type JobStatus } from "../utils/types";

export const JOB_STATUS_SEQUENCE: JobStatus[] = [
  // Phase 1: Upload bestätigt
  {
    job_id: "mock-uuid-1234",
    status: "queued",
    phase: "uploaded",
    progress_percent: 0,
    current_step: "Warte auf Start...",
    steps_total: 6,
    steps_completed: 0,
    filter_stats: null,
    estimated_seconds_remaining: 120,
  },

  // Phase 2: Validierung
  {
    job_id: "mock-uuid-1234",
    status: "running",
    phase: "validating",
    progress_percent: 8,
    current_step: "Überprüfe IDAT-Dateien und Sample Sheet...",
    steps_total: 6,
    steps_completed: 0,
    filter_stats: null,
    estimated_seconds_remaining: 110,
  },

  // Phase 3: Konvertierung
  {
    job_id: "mock-uuid-1234",
    status: "running",
    phase: "converting",
    progress_percent: 16,
    current_step: "Sample Sheet wird konvertiert (Excel → CSV)...",
    steps_total: 6,
    steps_completed: 1,
    filter_stats: null,
    estimated_seconds_remaining: 95,
  },

  // Phase 4: Filterung startet
  {
    job_id: "mock-uuid-1234",
    status: "running",
    phase: "filtering",
    progress_percent: 25,
    current_step: "IDAT-Dateien werden eingelesen...",
    steps_total: 6,
    steps_completed: 2,
    filter_stats: null,
    estimated_seconds_remaining: 75,
  },

  // Phase 4: Filterung Schritt 1
  {
    job_id: "mock-uuid-1234",
    status: "running",
    phase: "filtering",
    progress_percent: 38,
    current_step: "Detection p-value Filter wird angewendet...",
    steps_total: 6,
    steps_completed: 2,
    filter_stats: null,
    estimated_seconds_remaining: 60,
  },

  // Phase 4: Filterung Schritt 2
  {
    job_id: "mock-uuid-1234",
    status: "running",
    phase: "filtering",
    progress_percent: 50,
    current_step: "SNP-Filter wird angewendet...",
    steps_total: 6,
    steps_completed: 2,
    filter_stats: null,
    estimated_seconds_remaining: 45,
  },

  // Phase 4: Filterung abgeschlossen, Stats verfügbar
  {
    job_id: "mock-uuid-1234",
    status: "running",
    phase: "filtering",
    progress_percent: 60,
    current_step: "Filterung abgeschlossen",
    steps_total: 6,
    steps_completed: 3,
    filter_stats: {
      total_before: 500491,
      steps: [
        { name: "Detection p-value Filter", removed: 12450 },
        { name: "SNP-Filter", removed: 3201 },
        { name: "Multi-Hit Filter", removed: 891 },
      ],
      remaining: 483949,
    },
    estimated_seconds_remaining: 30,
  },

  // Phase 5: Normalisierungsvorschau wird berechnet
  {
    job_id: "mock-uuid-1234",
    status: "running",
    phase: "normalization_preview",
    progress_percent: 75,
    current_step: "Normalisierungsmethoden werden berechnet...",
    steps_total: 6,
    steps_completed: 4,
    filter_stats: {
      total_before: 500491,
      steps: [
        { name: "Detection p-value Filter", removed: 12450 },
        { name: "SNP-Filter", removed: 3201 },
        { name: "Multi-Hit Filter", removed: 891 },
      ],
      remaining: 483949,
    },
    estimated_seconds_remaining: 20,
  },

  // Spezialfall: wartet auf Benutzerauswahl
  {
    job_id: "mock-uuid-1234",
    status: "waiting",
    phase: "waiting_selection",
    progress_percent: 80,
    current_step: "Warte auf Auswahl der Normalisierungsmethode...",
    steps_total: 6,
    steps_completed: 4,
    filter_stats: {
      total_before: 500491,
      steps: [
        { name: "Detection p-value Filter", removed: 12450 },
        { name: "SNP-Filter", removed: 3201 },
        { name: "Multi-Hit Filter", removed: 891 },
      ],
      remaining: 483949,
    },
    estimated_seconds_remaining: null,
  },
];

// ── Fehlerfälle ───────────────────────────────────────────────
export const JOB_STATUS_FAILED: JobStatus = {
  job_id: "mock-uuid-1234",
  status: "failed",
  phase: "filtering",
  progress_percent: 38,
  current_step: "Fehler beim Einlesen der IDAT-Dateien",
  steps_total: 6,
  steps_completed: 2,
  filter_stats: null,
  estimated_seconds_remaining: null,
  error: {
    type: "https://example.com/errors/idat-parse-error",
    title: "IDAT Parse Error",
    status: 500,
    detail: "Datei '206891110001_R01C01_Grn.idat' konnte nicht gelesen werden.",
    instance: "/status/mock-uuid-1234",
  },
};

export const JOB_STATUS_COMPLETED: JobStatus = {
  job_id: "mock-uuid-1234",
  status: "completed",
  phase: "completed",
  progress_percent: 100,
  current_step: "Analyse abgeschlossen",
  steps_total: 6,
  steps_completed: 6,
  filter_stats: {
    total_before: 500491,
    steps: [
      { name: "Detection p-value Filter", removed: 12450 },
      { name: "SNP-Filter", removed: 3201 },
      { name: "Multi-Hit Filter", removed: 891 },
    ],
    remaining: 483949,
  },
  estimated_seconds_remaining: 0,
};