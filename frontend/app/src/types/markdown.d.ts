// Vite's `?raw` suffix imports a file's contents as a string.
// This declaration lets TypeScript understand Markdown raw imports used by the
// help system (see src/shared/help).
declare module "*.md?raw" {
    const content: string;
    export default content;
}
