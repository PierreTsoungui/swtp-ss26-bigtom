import BackButton from "../components/BackButton.tsx";

/** Shared style for inline links within the policy text. */
const LINK_CLASS =
  "text-primary underline underline-offset-2 hover:text-primary-hover";

/**
 * Privacy Policy page for the MethylAnalyzer application.
 *
 * Application-specific data protection notice that supplements the general data
 * protection information of the Technische Hochschule Mittelhessen (THM). It
 * describes the controller, the categories of data processed, the purpose,
 * storage location and duration, disclosure, the data subjects' rights (with the
 * competent supervisory authority), and the legal basis for processing under the
 * GDPR and the applicable Hessian law.
 *
 * @returns The rendered privacy policy page.
 */
export function PrivacyPolicyPage() {
  return (
      <>
          <div className="mx-auto max-w-4xl px-6 py-4">
              <BackButton />
          </div>
          <article className="mx-auto max-w-4xl px-6 py-10 text-neutral-textPrimary">
              <h1 className="mb-2 text-3xl font-bold text-neutral-textPrimary">Privacy Policy</h1>
              <p className="mb-6 text-sm text-neutral-textSecondary">Last updated: 5 July 2026</p>

              <p className="mb-8 leading-7 text-neutral-textSecondary">
                  This notice describes how personal data is processed specifically within the
                  MethylAnalyzer application. The application was developed by the student project
                  group BigTom and is operated and hosted by the Technische Hochschule Mittelhessen
                  (THM) on its own infrastructure. This notice supplements THM&apos;s general data
                  protection information, which applies in addition and is available at{" "}
                  <a
                      href="https://www.thm.de/datenschutz/datenschutz.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={LINK_CLASS}
                  >
                      thm.de/datenschutz
                  </a>
                  .
              </p>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Controller</h2>
                  <p className="leading-7">
                      The controller for the operation of this application within the meaning of
                      Art. 4 No. 7 GDPR is the Technische Hochschule Mittelhessen (THM), Wiesenstraße
                      14, 35390 Gießen, Germany, legally represented by its President, Prof. Dr.
                      Matthias Willems, which hosts and operates the application on its own servers.
                      The BigTom project group developed the software but does not operate it and is
                      not the controller. You can reach the THM data protection officer at{" "}
                      <a href="mailto:datenschutz@thm.de" className={LINK_CLASS}>
                          datenschutz@thm.de
                      </a>
                      . Further contact details are available in the imprint and in THM&apos;s general
                      data protection information.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Which data is processed?
                  </h2>
                  <p className="leading-7">
                      The application processes only the data that you actively upload for an
                      analysis, namely IDAT files and a sample sheet, together with the intermediate
                      and result files derived from them during processing. This data may contain
                      information about biological samples that allows conclusions to be drawn about
                      individuals and may therefore constitute special categories of personal data
                      (health data) within the meaning of Art. 9 GDPR. In addition, technically
                      necessary connection data (such as the IP address) is processed transiently to
                      deliver the application and to maintain its operational security. The application
                      does not use tracking or advertising cookies and does not create user profiles.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Purpose of the processing
                  </h2>
                  <p className="leading-7">
                      Uploaded data is processed exclusively to carry out the methylation analysis you
                      initiate and to make its results available to you. It is not processed for any
                      other purpose, and in particular not for advertising, market research, automated
                      decision-making, or profiling.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Storage location and access
                  </h2>
                  <p className="leading-7">
                      Data is processed and stored exclusively on servers operated by THM in Germany.
                      The application is not publicly accessible; it can be reached only from within the
                      THM network (for example via VPN) by authorised members of the university. Each
                      analysis runs in its own isolated working directory, and the data of one analysis
                      is not made accessible to other users through the application.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      How long is the data stored?
                  </h2>
                  <p className="leading-7">
                      Uploaded files and the results generated from them are stored only temporarily,
                      for the duration of the analysis. Each analysis is automatically and permanently
                      deleted approximately 24 hours after it was created or last used; files staged
                      during an upload that is not completed are removed even sooner, within a few
                      hours. You can also delete an analysis and all of its data immediately at any
                      time using the &quot;Reset&quot; action in the application. The data is not
                      written to a database and is not archived or backed up, and no permanent copies
                      are retained.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Disclosure and international transfers
                  </h2>
                  <p className="leading-7">
                      Your uploaded data and the results are not disclosed to third parties, not sold,
                      and not used for any purpose other than the analysis you initiate. No third-party
                      analytics or advertising services are integrated, and no data is transferred to
                      recipients in a third country outside the European Union or the European Economic
                      Area.
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Your responsibility as the uploading party
                  </h2>
                  <p className="leading-7">
                      Because uploaded data may contain health data, you (and, where applicable, the
                      research institution on whose behalf you act) are responsible for ensuring that
                      there is a valid legal basis to process it and to upload it to this application,
                      for example a statutory research permission or the consent of the data subjects,
                      and that the data has been pseudonymised or anonymised where required. You
                      determine the purpose of your own analysis and remain responsible for the
                      lawfulness of the data you upload. Please upload only data that is necessary for
                      your analysis (data minimisation).
                  </p>
              </section>

              <section className="mb-6">
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                      Rights of data subjects
                  </h2>
                  <p className="leading-7">
                      Under the GDPR, data subjects have the right to access (Art. 15), rectification
                      (Art. 16), erasure (Art. 17) and restriction of processing (Art. 18), the right
                      to data portability (Art. 20), and the right to object to processing (Art. 21).
                      Because data is processed only transiently, is deleted automatically within
                      approximately 24 hours, and no user accounts are maintained, these rights can in
                      practice be exercised by resetting the analysis or by refraining from re-uploading
                      the affected data; for any further request, please contact the controller or the
                      data protection officer at{" "}
                      <a href="mailto:datenschutz@thm.de" className={LINK_CLASS}>
                          datenschutz@thm.de
                      </a>
                      .
                  </p>
                  <p className="mt-3 leading-7">
                      Data subjects also have the right to lodge a complaint with a supervisory
                      authority. The authority competent for THM is the Hessian Commissioner for Data
                      Protection and Freedom of Information (Der Hessische Beauftragte für Datenschutz
                      und Informationsfreiheit), Postfach 3163, 65021 Wiesbaden, Germany.
                  </p>
              </section>

              <section>
                  <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Legal basis</h2>
                  <p className="leading-7">
                      Processing is carried out for the performance of a task carried out in the public
                      interest (research and teaching) pursuant to Art. 6 Para. 1 lit. e GDPR, in
                      conjunction with the Hessian Higher Education Act (Hessisches Hochschulgesetz,
                      HHG) and the Hessian Data Protection and Freedom of Information Act (Hessisches
                      Datenschutz- und Informationsfreiheitsgesetz, HDSIG). Where the data constitutes
                      special categories of personal data (health data), processing is additionally
                      based on Art. 9 Para. 2 lit. j GDPR in conjunction with Art. 89 Para. 1 GDPR and
                      the corresponding provisions of the HDSIG (scientific research purposes with
                      appropriate safeguards).
                  </p>
              </section>
          </article>
      </>
  );
}
