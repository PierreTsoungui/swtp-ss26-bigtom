/**
 * Props for the LoadingScreen component.
 */
interface LoadingScreenProps {
    /** The message to be displayed. */
    message: string;
    /**
     * If true, applies error styling to the message.
     * @default false
     */
    isError?: boolean;
}

/**
 * A minimalist full-screen placeholder for loading and error states.
 *
 * Used as a fallback UI while asynchronous data is being fetched or
 * to display critical errors when no other layout is available.
 */
function LoadingScreen({ message, isError = false }: LoadingScreenProps) {
    return (
        <main className="flex min-h-screen items-center justify-center">
            <p className={isError ? "text-danger" : "text-neutral-textSecondary"}>{message}</p>
        </main>
    );
}

export default LoadingScreen;
