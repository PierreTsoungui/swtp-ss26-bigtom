// useJobPolling + navigate hier hin

// import { useEffect } from "react";
import { useParams /*, useNavigate*/ } from "react-router";
// import ErrorMessage from "../../shared/error-handling/components/ErrorMessage";
// import { useJobPolling } from "./hooks/useJobPolling";
// import type { JobStatus } from "./utils/types";
// import ProgressBar from "./components/Progressbar";

// TODO: Hier muss letztendlich die Progressbar und anschließende Filterstatistik angezeigt werden (UserStory von Yvan)

export function AnalysisPage() {
  const { job_id } = useParams<{ job_id: string }>();

  /*
  const navigate = useNavigate();
  const jobStatus : JobStatus | null = useJobPolling(job_id ?? null);

  useEffect(() => {
    if (!jobStatus) return;

    // Spezialfall: Normalisierungsvorschau bereit
    if (
      jobStatus.status === "waiting" &&
      jobStatus.phase === "waiting_selection"
    ) {
      navigate(`/normalization/${job_id}`);
    }

    // Pipeline komplett abgeschlossen
    if (jobStatus.status === "completed") {
      navigate(`/results/${job_id}`);
    }
  }, [jobStatus?.status, jobStatus?.phase]);


  // Fehlerfall
  if (jobStatus?.status === "failed" && jobStatus.error) {
    return (
      <ErrorMessage
        open={true}
        vertical="top"
        horizontal="center"
        error={jobStatus.error}
      />
    );
  }

  // Ladescreen
  return (
    <div className="flex justify-center items-center min-h-screen">
      {jobStatus && <ProgressBar jobStatus={jobStatus} />}
    </div>
  );
     */

  return (
      <div>
        <p>AnalysisPage geladen </p>
        <p>job_id: {job_id}</p>
      </div>
  );
}