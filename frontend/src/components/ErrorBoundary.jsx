import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback" role="alert">
          <p className="error-fallback__message">Something went wrong.</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => (window.location.href = "/")}
          >
            Go back to Stay
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
