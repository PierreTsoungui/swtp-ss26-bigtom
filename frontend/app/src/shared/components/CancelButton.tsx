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
                className="bg-danger hover:bg-danger-hover text-danger-text font-bold py-3 px-10 rounded-full transition-colors"
            >
                Cancel
            </button>
        </div>
    );
}

export default CancelButton;
