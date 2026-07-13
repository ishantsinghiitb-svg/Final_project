import { Component, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    reportLovableError(error, { boundary: "ErrorBoundary" });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Something went wrong.</p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
