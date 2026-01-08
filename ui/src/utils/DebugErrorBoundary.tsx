// =============================================================================
// SENTINEL UI - DEBUG ERROR BOUNDARY
// =============================================================================
// Error boundary component that catches React errors and displays
// detailed debug information when debug mode is enabled.
// =============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { DEBUG_ENABLED, debug } from './debug';

interface Props {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * DebugErrorBoundary - Catches errors and shows debug info
 * 
 * Usage:
 *   <DebugErrorBoundary name="Leaderboard">
 *     <Leaderboard />
 *   </DebugErrorBoundary>
 */
export class DebugErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { name } = this.props;
    
    this.setState({ errorInfo });
    
    // Log to debug system
    debug.error(
      `ErrorBoundary${name ? `:${name}` : ''}`,
      error,
      {
        componentStack: errorInfo.componentStack,
      }
    );
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, name, fallback } = this.props;

    if (hasError) {
      // Show detailed debug info in debug mode
      if (DEBUG_ENABLED) {
        return (
          <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg m-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-red-400 text-lg">⚠️</span>
              <h3 className="text-red-400 font-semibold">
                Error in {name || 'Component'}
              </h3>
            </div>
            
            <div className="bg-black/30 rounded p-3 mb-3 overflow-auto">
              <p className="text-red-300 font-mono text-sm mb-2">
                {error?.message}
              </p>
              
              {error?.stack && (
                <details className="mt-2">
                  <summary className="text-gray-400 text-xs cursor-pointer hover:text-gray-300">
                    Stack Trace
                  </summary>
                  <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">
                    {error.stack}
                  </pre>
                </details>
              )}
              
              {errorInfo?.componentStack && (
                <details className="mt-2">
                  <summary className="text-gray-400 text-xs cursor-pointer hover:text-gray-300">
                    Component Stack
                  </summary>
                  <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">
                    {errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
            
            <button
              onClick={this.handleReset}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm rounded transition-colors"
            >
              Try Again
            </button>
          </div>
        );
      }
      
      // Show simple fallback in production
      return fallback || (
        <div className="p-4 bg-sentinel-card border border-sentinel-border rounded-lg m-2 text-center">
          <p className="text-sentinel-muted">Something went wrong</p>
          <button
            onClick={this.handleReset}
            className="mt-2 px-3 py-1 text-sm text-sentinel-accent hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}

/**
 * withErrorBoundary - HOC to wrap components with error boundary
 * 
 * Usage:
 *   export default withErrorBoundary(MyComponent, 'MyComponent');
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  name?: string
): React.FC<P> {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <DebugErrorBoundary name={name || WrappedComponent.displayName}>
      <WrappedComponent {...props} />
    </DebugErrorBoundary>
  );
  
  WithErrorBoundary.displayName = `WithErrorBoundary(${name || WrappedComponent.displayName || 'Component'})`;
  
  return WithErrorBoundary;
}