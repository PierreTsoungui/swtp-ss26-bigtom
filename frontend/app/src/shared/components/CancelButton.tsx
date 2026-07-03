import type {JSX} from "react";

/**
 * Props for the CancelButton component.
 */
type CancelButtonProps = {
    /** Callback function called when the button is clicked. */
    onCancel: () => void;

    /**
     * Indicates whether the button is disabled.
     * @default false
     */
    disabled?: boolean;
}

/**
 * A button component that allows the user to cancel an action.
 */
function CancelButton({ onCancel, disabled = false, }: CancelButtonProps) : JSX.Element {
    return (
        <div className="flex justify-center">
            <button
                onClick={onCancel}
                disabled={disabled}
                className="rounded-full border-2 border-danger bg-danger px-10 py-3 font-bold text-danger-text transition-colors hover:bg-danger-hover disabled:cursor-not-allowed disabled:border-neutral-textSecondary disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
            >
                Cancel
            </button>
        </div>
    );
}

export default CancelButton;
