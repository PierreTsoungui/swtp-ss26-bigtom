import BackButton from "../components/BackButton.tsx";

export function DatenschutzPage() {
  return (
      <>
          <div className="mx-auto max-w-4xl px-6 py-4">
              <BackButton />
          </div>
          <article className="mx-auto max-w-4xl px-6 py-10 text-neutral-textPrimary">
              <h1 className="mb-8 text-3xl font-bold text-neutral-textPrimary">Datenschutzerklärung</h1>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Verantwortliche Stelle</h2>
                  <p>
                      Verantwortliche Stelle ist die Technische Hochschule Mittelhessen (THM).
                      Zuständig ist der betreuende Fachbereich im Rahmen des BigTom-Projekts.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Welche Daten werden verarbeitet?
                  </h2>
                  <p>
                      Beim Upload werden IDAT-Dateien und ein Samplesheet entgegengenommen. Diese
                      können Informationen zu biologischen Proben enthalten, die potenziell
                      Rückschlüsse auf Personen erlauben. Dabei kann es sich um Patientendaten im
                      Sinne von Art. 9 DSGVO handeln.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Wie lange werden die Daten gespeichert?
                  </h2>
                  <p>
                      Alle hochgeladenen und verarbeiteten Daten werden ausschließlich temporär im
                      Arbeitsspeicher bzw. in einem temporären Verzeichnis des Servers gehalten.
                      Nach Beenden der Browser-Sitzung werden alle Daten automatisch und
                      unwiderruflich gelöscht. Es erfolgt keine dauerhafte Speicherung.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Werden Daten weitergegeben?
                  </h2>
                  <p>
                      Nein. Die Daten werden nicht an Dritte weitergegeben, nicht in einer
                      Datenbank gespeichert und nicht protokolliert.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Zugriff</h2>
                  <p>
                      Die Anwendung ist ausschließlich im internen Netz der THM erreichbar. Ein
                      öffentlicher Zugriff ist nicht vorgesehen.
                  </p>
              </section>

              <section>
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Rechtsgrundlage</h2>
                  <p>
                      Die Verarbeitung erfolgt auf Basis von Art. 6 Abs. 1 lit. e DSGVO sowie Art.
                      9 Abs. 2 lit. j DSGVO.
                  </p>
              </section>
          </article>
      </>
  );
}
