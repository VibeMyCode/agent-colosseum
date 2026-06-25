import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    console.error("[ErrorBoundary] Caught:", error);
    return { error };
  }

  componentDidCatch(_error: Error, info: { componentStack?: string }) {
    console.error("[ErrorBoundary] Stack:", info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#fbbf24", background: "#08080a", minHeight: "100vh" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>⚠️ Something crashed</h2>
          <pre style={{ color: "#ef4444", fontSize: 13, whiteSpace: "pre-wrap", maxWidth: "100%", overflow: "auto" }}>
            {this.state.error.message}
          </pre>
          <details style={{ marginTop: 12 }}>
            <summary style={{ color: "#888", cursor: "pointer" }}>Stack trace</summary>
            <pre style={{ color: "#666", fontSize: 11, whiteSpace: "pre-wrap", marginTop: 8 }}>
              {this.state.error.stack}
            </pre>
          </details>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 20, padding: "8px 20px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
              color: "#ccc", cursor: "pointer", fontSize: 14
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
