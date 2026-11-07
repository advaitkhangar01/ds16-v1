// client/src/components/ui/ErrorBoundary.jsx
// React ErrorBoundary component to protect the application from white-screen crashes

import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isInline = this.props.inline;

      if (isInline) {
        return (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 flex items-center justify-between my-2 text-sm">
            <div>
              <p className="font-bold">Failed to load this section.</p>
              <p className="text-xs text-red-600 mt-0.5">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            </div>
            <button
              onClick={this.handleReset}
              className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <div className="min-h-[400px] w-full flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-xl font-bold">
              ⚠️
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Something went wrong</h3>
              <p className="text-xs text-gray-500 mt-1">
                {this.state.error?.message || 'An unexpected error occurred while rendering this view.'}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-[#E05A1E] hover:bg-[#c94d17] text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
