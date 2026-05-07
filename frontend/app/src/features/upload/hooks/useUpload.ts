import { useState } from "react"

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
  data: { job_id: string } | null
  isLoading: boolean
  error: string | null
  upload: (idatFiles: File[], sampleSheet: File) => Promise<void>
}

/**
 * Custom Hook für den Upload von IDAT-Dateien und Sample Sheet. Verwaltet den Upload-Status, Fehler und die Antwortdaten.
 * Integriert die API-Call-Logik und ermöglicht eine einfache Wiederverwendung in der UploadView-Komponente.
 * @returns {UploadState} Der Upload-Status und die zugehörigen Funktionen.
 */
export function useUpload() : UploadState {
  const [data, setData] = useState<{ job_id: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (idatFiles: File[], sampleSheet: File) => {
    setIsLoading(true)
    setError(null)
    setData(null)

    const formData = new FormData()
    idatFiles.forEach((file) => formData.append("idat_files", file))
    formData.append("sample_sheet", sampleSheet)

    try {
      const response = await fetch("http://localhost:8000/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        setError(err.detail || "Upload fehlgeschlagen")
        return
      }

      const result = await response.json()
      setData(result)

    } catch {
      setError("Server nicht erreichbar")
    } finally {
      setIsLoading(false)
    }
  }

  return { data, isLoading, error, upload }
}