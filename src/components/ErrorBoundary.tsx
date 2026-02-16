import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}



export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Something went wrong
              </h2>
              <p className="text-muted-foreground">
                An unexpected error occurred. The error has been reported.
              </p>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-foreground">
                  Error details
                </summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <strong className="text-foreground">Message:</strong>
                    <p className="text-muted-foreground mt-1">
                      {this.state.error?.message}
                    </p>
                  </div>
                  {this.state.error?.stack && (
                    <div>
                      <strong className="text-foreground">Stack trace:</strong>
                      <pre className="text-xs text-muted-foreground mt-1 overflow-auto max-h-32">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            </div>

            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}