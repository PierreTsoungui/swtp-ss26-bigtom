/**
 * Validiert IDAT-Dateien auf korrekte Grn/Red-Paare anhand der Dateinamen.
 * Die Prüfung ist case-insensitive für die Dateiendung und den Farbkanal.
 */
const grnPattern = /_Grn\.idat$/i;
const redPattern = /_Red\.idat$/i;

export const validateIdatPairs = (files: File[]): string[] => {
  const errors: string[] = [];
  const grn = files.filter((f) => grnPattern.test(f.name));
  const red = files.filter((f) => redPattern.test(f.name));
  const validPairNames = new Set([...grn, ...red].map((f) => f.name));
  const lowerCaseGrnNames = new Set(grn.map((f) => f.name.toLowerCase()));
  const lowerCaseRedNames = new Set(red.map((f) => f.name.toLowerCase()));

  files
    .filter((f) => !validPairNames.has(f.name))
    .forEach((file) => {
      errors.push(`Ungültiges IDAT-Dateinamensmuster: ${file.name}`);
    });

  grn.forEach((grnFile) => {
    const prefix = grnFile.name.replace(grnPattern, "");
    const hasPartner = lowerCaseRedNames.has(`${prefix}_Red.idat`.toLowerCase());

    if (!hasPartner) {
      errors.push(`Kein Red-Partner für: ${grnFile.name}`);
    }
  });

  red.forEach((redFile) => {
    const prefix = redFile.name.replace(redPattern, "");
    const hasPartner = lowerCaseGrnNames.has(`${prefix}_Grn.idat`.toLowerCase());

    if (!hasPartner) {
      errors.push(`Kein Grn-Partner für: ${redFile.name}`);
    }
  });

  if (files.length % 2 !== 0 && files.length > 0) {
    errors.push("Ungerade Anzahl an IDAT-Dateien, es sollten Paare von Grn/Red vorliegen.");
  }

  return errors;
};
