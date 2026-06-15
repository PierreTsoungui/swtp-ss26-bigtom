# app/services/samplesheet_utils.py
#
# Gemeinsam genutzte SampleSheet-Hilfsfunktionen.
# Ausgelagert aus batch_service.py, damit heatmap_service.py und andere
# Module sie importieren können, ohne einen Zirkelimport zu erzeugen.

import csv
from collections import Counter
from pathlib import Path

from app.core.error_types import AppException, ErrorTypes
from app.services.batch_service import find_sample_sheet_name


def get_grouping_options_from_samplesheet(job_dir: Path) -> list:
    """
    Parst das SampleSheet und wendet die vier Heatmap-Filterregeln an:

      REGEL 1 – Kein Wert darf einzigartig sein (jeder Wert mind. 2×)
      REGEL 2 – Spalte darf nicht leer sein
      REGEL 3 – Mind. 2 unterschiedliche Werte
      REGEL 4 – Anzahl der Gruppen ≤ 50 % der Probenanzahl

    Gibt eine Liste von Header-Namen zurück, die alle Regeln bestehen.
    Wirft AppException(SAMPLE_SHEET_NOT_FOUND) wenn keine Datei gefunden wird.
    """
    sample_sheet_name = find_sample_sheet_name(str(job_dir))
    sheet_path = job_dir / sample_sheet_name

    try:
        with open(sheet_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        # [Data]-Sektion finden (Illumina-Standard)
        data_index = -1
        for i, line in enumerate(lines):
            if "[Data]" in line:
                data_index = i
                break

        data_lines = lines[data_index + 1:] if data_index != -1 else lines
        data_lines = [line.strip() for line in data_lines if line.strip()]

        if not data_lines:
            return []

        header_line = data_lines[0]
        delimiter   = ";" if ";" in header_line else ","

        reader    = csv.reader(data_lines, delimiter=delimiter)
        rows      = list(reader)
        headers   = [h.strip() for h in rows[0] if h.strip()]
        data_rows = rows[1:]
        total_samples = len(data_rows)

        if total_samples == 0:
            return []

        num_cols   = len(headers)
        col_values = {i: [] for i in range(num_cols)}

        for row in data_rows:
            while len(row) < num_cols:
                row.append("")
            for i in range(num_cols):
                val = row[i].strip()
                if val:
                    col_values[i].append(val)

        eligible_columns = []

        for i, header in enumerate(headers):
            values = col_values[i]

            # REGEL 2 – Nicht leer
            if not values:
                continue

            counter      = Counter(values)
            unique_count = len(counter)

            # REGEL 3 – Mind. 2 verschiedene Werte
            if unique_count < 2:
                continue

            # REGEL 1 – Kein Wert darf nur einmal vorkommen
            if any(count < 2 for count in counter.values()):
                continue

            # REGEL 4 – Nicht mehr Gruppen als 50 % der Probenanzahl
            if unique_count > (0.5 * total_samples):
                continue

            eligible_columns.append(header)

        return eligible_columns

    except Exception as e:
        raise AppException(
            ErrorTypes.INVALID_CSV_CONTENT,
            detail=f"SampleSheet konnte für die Heatmap nicht analysiert werden: {e}",
        )