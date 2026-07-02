/**
 * ProblemDetail entspricht dem Standardformat für Fehlerantworten, wie es in der Spezifikation "Problem Details for HTTP APIs" (RFC 7807) definiert ist. Es enthält Informationen über den Fehler, einschließlich
 * @property type Optionales Feld: Ein URI, der die Art des Fehlers beschreibt (z.B. "https://example.com/probs/out-of-credit").
 * @property title Eine kurze, menschenlesbare Zusammenfassung des Fehlers (z.B. "You do not have enough credit.").
 * @property status Der HTTP-Statuscode, der mit diesem Fehler verbunden ist (z.B. 403).
 * @property detail Eine ausführlichere Beschreibung des Fehlers, die zusätzliche Informationen enthalten kann (z.B. "Your current balance is 30, but that costs 50.").
 * @property instance Ein URI, der die spezifische Instanz des Fehlers identifiziert (z.B. "/account/12345/msgs/abc").
 * @property errors Optionales Feld, das ein Objekt enthält, in dem die Schlüssel die Namen der fehlerhaften Felder sind und die Werte Arrays von Fehlermeldungen für diese Felder sind (z.B. { "email": ["Email is invalid"], "password": ["Password is too short"] }).
 */
export interface ProblemDetail {
  type?: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: Record<string, string[]>;
}


/**
 * Zusätzlicher Type für Error Responses, da im Backend aktuell die Fehlermeldungen
 * zusätzlich in einem weiteren details Feld verschachtelt sind
 * @property details ProblemDetail Typ das dem RFC 7807 entspricht.
 */
export type ApiProblemDetail = {
  details: ProblemDetail;
}