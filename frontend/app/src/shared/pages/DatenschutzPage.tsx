import BackButton from "../components/BackButton.tsx";

export function DatenschutzPage() {
  return (
      <>
          <div className="mx-auto max-w-4xl px-6 py-4">
              <BackButton />
          </div>
          <article className="mx-auto max-w-4xl px-6 py-10 text-neutral-textPrimary">
              <h1 className="mb-8 text-3xl font-bold text-neutral-textPrimary">Privacy Policy</h1>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Controller</h2>
                  <p>
                      The data controller is the Technische Hochschule Mittelhessen (THM).
                      The department supervising the BigTom project is responsible.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Which data is processed?
                  </h2>
                  <p>
                      During upload, IDAT files and a sample sheet are accepted. These
                      may contain information on biological samples that could potentially
                      allow conclusions to be drawn about individuals. This may include patient data
                      within the meaning of Art. 9 GDPR.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      How long is the data stored?
                  </h2>
                  <p>
                      All uploaded and processed data is kept exclusively temporarily in
                      the main memory or in a temporary directory on the server.
                      After ending the browser session, all data is automatically and
                      irrevocably deleted. There is no permanent storage.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Is data passed on to third parties?
                  </h2>
                  <p>
                      No. The data is not passed on to third parties, is not stored in a
                      database, and is not logged.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Access Restrictions</h2>
                  <p>
                      The application is exclusively accessible within the internal network of the THM.
                      Public access is not provided.
                  </p>
              </section>

              <section>
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Legal Basis</h2>
                  <p>
                      Processing is carried out on the basis of Art. 6 Para. 1 lit. e GDPR as well as Art.
                      9 Para. 2 lit. j GDPR.
                  </p>
              </section>
          </article>
      </>
  );
}
