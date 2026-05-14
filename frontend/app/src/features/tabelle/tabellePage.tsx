import AnalysisTable from "./components/AnalysisTable";
import { analysisMock } from "./mocks/analysisMock";

export default function TabellePage() {
  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "#2c3e50",
          marginBottom: "5px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        🔬 Biologische Analyse
      </h1>

      <p
        style={{
          fontSize: "16px",
          color: "#555",
          marginBottom: "20px",
        }}
      >
        Anzeige der Proben
      </p>

      <div
        style={{
          width: "60px",
          height: "4px",
          background: "#3498db",
          borderRadius: "4px",
          marginBottom: "25px",
        }}
      ></div>

      <AnalysisTable
        columns={analysisMock.columns}
        rows={analysisMock.rows}
      />
    </div>
  );
}

