import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 18, marginBottom: 12 }}>Something went wrong.</p>
          <button type="button" onClick={() => (window.location.href = "/")}>
            Go back to Stay
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
