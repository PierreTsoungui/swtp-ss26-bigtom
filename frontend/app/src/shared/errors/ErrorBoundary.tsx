import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router";
import { FallbackPage } from "../components/FallbackPage";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
  onErrorStateChange?: (hasError: boolean) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryBase extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unexpected frontend rendering error", error, errorInfo);
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

export function ErrorBoundary({
  children,
  onErrorStateChange,
}: Pick<ErrorBoundaryProps, "children" | "onErrorStateChange">) {
  const location = useLocation();

  return (
    <ErrorBoundaryBase resetKey={location.pathname} onErrorStateChange={onErrorStateChange}>
      {children}
    </ErrorBoundaryBase>
  );
}

export { ErrorBoundaryBase };
