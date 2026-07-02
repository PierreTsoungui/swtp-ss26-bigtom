import BackButton from "../components/BackButton.tsx";

/**
 * Privacy policy page ("Datenschutzerklärung") for the BigTom application.
 *
 * Displays information about the data controller, the types of data
 * processed, storage duration, data sharing practices, access
 * restrictions, and the legal basis for processing under the GDPR.
 *
 * @returns The rendered privacy policy page.
 */
export function DatenschutzPage() {
    return (
        <>
            <div className="mx-auto max-w-4xl px-6 py-4">
                <BackButton />
            </div>
            <article className="mx-auto max-w-4xl px-6 py-10 text-neutral-textPrimary">
                <h1 className="mb-8 text-3xl font-bold text-neutral-textPrimary">Privacy Policy</h1>
                <section className="mb-6">
                    <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Data Controller</h2>
                    <p>
                        The data controller is the Technische Hochschule Mittelhessen (THM).
                        Responsibility lies with the supervising department within the scope of
                        the BigTom project.
                    </p>
                </section>
                <section className="mb-6">
                    <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                        What data is processed?
                    </h2>
                    <p>
                        During upload, IDAT files and a sample sheet are received. These may
                        contain information about biological samples that could potentially
                        allow conclusions to be drawn about individuals. This may constitute
                        patient data within the meaning of Art. 9 GDPR.
                    </p>
                </section>
                <section className="mb-6">
                    <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                        How long is the data stored?
                    </h2>
                    <p>
                        All uploaded and processed data is held exclusively temporarily in memory
                        or in a temporary directory on the server. Once the browser session ends,
                        all data is automatically and irrevocably deleted. No permanent storage
                        takes place.
                    </p>
                </section>
                <section className="mb-6">
                    <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">
                        Is data shared with third parties?
                    </h2>
                    <p>
                        No. The data is not shared with third parties, not stored in a database,
                        and not logged.
                    </p>
                </section>
                <section className="mb-6">
                    <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Access</h2>
                    <p>
                        The application is accessible exclusively within the internal network of
                        the THM. Public access is not provided.
                    </p>
                </section>
                <section>
                    <h2 className="mb-2 text-xl font-semibold text-neutral-textPrimary">Legal Basis</h2>
                    <p>
                        Processing is carried out on the basis of Art. 6 (1) (e) GDPR and Art. 9
                        (2) (j) GDPR.
                    </p>
                </section>
            </article>
        </>
    );
}