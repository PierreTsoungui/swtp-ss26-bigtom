import "react";

/**
 * Module augmentation that teaches React's typings about the non-standard
 * `webkitdirectory` / `directory` input attributes.
 *
 * These attributes enable folder selection on `<input type="file">` (used by the
 * upload dropzone). They are widely supported by browsers but absent from the
 * standard DOM/React types, so this declaration adds them without an `any` cast.
 */
declare module "react" {
  // `T` is required to match React's generic `InputHTMLAttributes<T>` arity for
  // declaration merging; it is intentionally not referenced in the body.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface InputHTMLAttributes<T> {
    /** When present, lets the file input pick an entire directory. */
    webkitdirectory?: string;
    /** Legacy alias of {@link webkitdirectory} for older engines. */
    directory?: string;
  }
}
