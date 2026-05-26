import { useState } from "react"
import type {FilterSettings} from "../utils/types.ts";

/**
 * Type für den Upload-Status, enthält die Antwortdaten, Ladezustand und Fehlernachricht.
 * Wird von useUpload zurückgegeben und in der UploadView-Komponente verwendet.
 * @typedef {Object} UploadState
 * @property {Object|null} data - Die Antwortdaten vom Server, z.B. die job_id.
 * @property {boolean} isLoading - Gibt an, ob der Upload gerade läuft.
 * @property {string|null} error - Enthält die Fehlermeldung, falls der Upload fehlschlägt.
 * @property {function} upload - Funktion zum Starten des Uploads, nimmt IDAT-Dateien und Sample Sheet als Argumente.
 */
type UploadState = {
  // data: { job_id: string } | null
  isLoading: boolean
  error: string | null
  upload: (idatFiles: File[], sampleSheet: File, filterSettings : FilterSettings) => Promise<string | null>
}

/**
 * Custom Hook für den Upload von IDAT-Dateien und Sample Sheet. Verwaltet den Upload-Status, Fehler und die Antwortdaten.
 * Integriert die API-Call-Logik und ermöglicht eine einfache Wiederverwendung in der UploadView-Komponente.
 * @returns {UploadState} Der Upload-Status und die zugehörigen Funktionen.
 */
export function useUpload() : UploadState {
  // const [data, setData] = useState<{ job_id: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (idatFiles: File[], sampleSheet: File, filterSettings : FilterSettings): Promise<string | null> => {
    setIsLoading(true)
    setError(null)
    // setData(null)

    const formData = new FormData()
    idatFiles.forEach((file) => formData.append("idat_files", file))
    formData.append("sample_sheet", sampleSheet)
    formData.append("filter_settings", JSON.stringify(filterSettings))

    try {
      const response = await fetch("/api/v1/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const err: unknown = await response.json()
        setError(getUploadErrorMessage(err))
        return null;
      }
      const data: unknown = await response.json()
      if (!isUploadResponse(data)) {
        setError("Upload-Antwort konnte nicht verarbeitet werden")
        return null
      }

      return data.job_id;

    } catch {
      setError("Server nicht erreichbar")
      return null
    } finally {
      setIsLoading(false)
    }
  }

  return { isLoading, error, upload }
}

function getUploadErrorMessage(value: unknown): string {
  if (!isRecord(value)) return "Upload fehlgeschlagen"

  const detail = value.detail

  if (typeof detail === "string") {
    return detail
  }

  if (isRecord(detail) && typeof detail.message === "string") {
    return detail.message
  }

  if (typeof value.message === "string") {
    return value.message
  }

  return "Upload fehlgeschlagen"
}

function isUploadResponse(value: unknown): value is { job_id: string } {
  return isRecord(value) && typeof value.job_id === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
