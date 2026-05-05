  /**
   * Validiert die IDAT-Dateien auf korrekte Paare (Grn/Red) basierend auf den Dateinamen.
   * Es wird geprüft, ob für jede Grn-Datei eine entsprechende Red-Datei existiert und umgekehrt.
   * Zusätzlich wird überprüft, ob die Anzahl der Dateien gerade ist (da sie in Paaren vorliegen sollten).
   * @note Diese Validierung basiert ausschließlich auf den Dateinamen und berücksichtigt nicht den Inhalt der Dateien.
   * @param files Array von IDAT-Dateien, die validiert werden sollen.
   * @returns Array von Fehlern, falls Validierungsfehler vorliegen.
   */
  export const validateIdatPairs = (files: File[]): string[] => {
    const errors: string[] = [];
    const grn = files.filter((f) => f.name.includes("_Grn.idat"));
    const red = files.filter((f) => f.name.includes("_Red.idat"));

    grn.forEach((grnFile) => {
      const prefix = grnFile.name.replace("_Grn.idat", "");
      const hasPartner = red.some((r) => r.name === `${prefix}_Red.idat`);
      if (!hasPartner)
        errors.push(`Kein Red-Partner für: ${grnFile.name}`);
    });

    red.forEach((redFile) => {
      const prefix = redFile.name.replace("_Red.idat", "");
      const hasPartner = grn.some((g) => g.name === `${prefix}_Grn.idat`);
      if (!hasPartner)
        errors.push(`Kein Grn-Partner für: ${redFile.name}`);
    });

    if (files.length % 2 !== 0 && files.length > 0) {
      errors.push("Ungerade Anzahl an IDAT-Dateien, es sollten Paare von Grn/Red vorliegen.");
    }

    return errors;
  };