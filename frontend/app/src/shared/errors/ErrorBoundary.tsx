import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router";
import { FallbackPage } from "../components/FallbackPage";
import { logger } from "../utils/logger";

/**
 * Props for the error boundary.
 */
interface ErrorBoundaryProps {
  /** The subtree protected by the boundary. */
  children: ReactNode;
  /** When this value changes, the boundary clears a previously caught error. */
  resetKey?: string;
  /** Notified whenever the caught-error state toggles (e.g. to hide chrome). */
  onErrorStateChange?: (hasError: boolean) => void;
}

/**
 * Internal state of the error boundary.
 */
interface ErrorBoundaryState {
  /** Whether a render error is currently being displayed. */
  hasError: boolean;
}

/**
 * Class-based error boundary that catches rendering errors in its subtree and
 * shows a controlled fallback instead of a blank page. It resets automatically
 * when {@link ErrorBoundaryProps.resetKey} changes (used to recover on
 * navigation). React only supports error boundaries as class components, which
 * is why this base class exists behind the {@link ErrorBoundary} wrapper.
 */
class ErrorBoundaryBase extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Unexpected frontend rendering error", error, errorInfo);
    this.props.onErrorStateChange?.(true);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
      this.props.onErrorStateChange?.(false);
    }
  }

  reset = () => {
    this.setState({ hasError: false });
    this.props.onErrorStateChange?.(false);
  };

  render() {
    if (this.state.hasError) {
      return <FallbackPage variant="error" onReset={this.reset} />;
    }

    return this.props.children;
  }
}


/**
 * Props for the {@link ErrorBoundary} component.
 */
interface ErrorBoundaryProps {
  /**
   * The child components to be rendered and monitored for errors.
   */
  children: ReactNode;

  /**
   * Optional callback triggered when the error state changes.
   * Useful for hiding layout elements like sidebars or headers during an error.
   *
   * @param hasError - True if an error was caught, false if reset.
   */
  onErrorStateChange?: (hasError: boolean) => void;
}



/**
 * Application error boundary.
 *
 * Wraps {@link ErrorBoundaryBase} and derives its reset key from the current
 * route, so navigating to another page automatically clears a caught error and
 * re-renders the target page.
 */
export function ErrorBoundary({
  children,
  onErrorStateChange,
}: ErrorBoundaryProps) {
  const location = useLocation();

  return (
    <ErrorBoundaryBase resetKey={location.pathname} onErrorStateChange={onErrorStateChange}>
      {children}
    </ErrorBoundaryBase>
  );
}

export { ErrorBoundaryBase };
