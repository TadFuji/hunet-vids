import { Component } from 'react';
import type { ReactNode } from 'react';

/** Shows a recoverable error screen instead of a blank page when rendering fails. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>表示中にエラーが起きました</h2>
          <p className="error">{this.state.error.message}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="primary"
              onClick={() => {
                location.hash = '';
                this.setState({ error: null });
              }}
            >
              一覧へ戻る
            </button>
            <button onClick={() => location.reload()}>再読み込み</button>
          </div>
        </div>
      </div>
    );
  }
}
