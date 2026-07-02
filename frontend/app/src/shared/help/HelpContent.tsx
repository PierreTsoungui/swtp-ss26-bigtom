import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Tailwind-styled element mapping for the Markdown renderer.
 *
 * react-markdown does not render raw HTML by default, so help content is safe
 * from injection. Styling is applied explicitly per element (instead of relying
 * on a `prose` plugin) to stay in full control of the look inside the dialog.
 */
const components: Components = {
    h1: ({ children }) => (
        <h2 className="mt-6 text-lg font-semibold text-zinc-900 first:mt-0">
            {children}
        </h2>
    ),
    h2: ({ children }) => (
        <h2 className="mt-6 text-base font-semibold text-zinc-900 first:mt-0">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="mt-5 text-sm font-semibold text-indigo-700 first:mt-0">
            {children}
        </h3>
    ),
    p: ({ children }) => (
        <p className="mt-3 text-sm leading-7 text-zinc-700 first:mt-0">
            {children}
        </p>
    ),
    ul: ({ children }) => (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-zinc-700 marker:text-zinc-400">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-7 text-zinc-700 marker:text-zinc-400">
            {children}
        </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    strong: ({ children }) => (
        <strong className="font-semibold text-zinc-900">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ children, href }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-800"
        >
            {children}
        </a>
    ),
    code: ({ children }) => (
        <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-800">
            {children}
        </code>
    ),
    blockquote: ({ children }) => (
        <blockquote className="mt-4 border-l-4 border-indigo-200 bg-indigo-50/60 px-4 py-2 text-sm leading-7 text-zinc-700">
            {children}
        </blockquote>
    ),
};

interface HelpContentProps {
    /** Markdown source to render. */
    markdown: string;
}

/**
 * Renders a help topic's Markdown body into the styled dialog layout.
 */
function HelpContent({ markdown }: HelpContentProps) {
    return (
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
            {markdown}
        </Markdown>
    );
}

export default HelpContent;
