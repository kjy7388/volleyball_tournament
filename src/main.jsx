import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TournamentProvider } from "./context/TournamentContext";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="panel recovery">
        <h1>화면을 표시하지 못했습니다</h1>
        <p>새로고침 후 다시 시도해주세요. 저장된 데이터는 유지됩니다.</p>
        <button onClick={() => window.location.reload()}>새로고침</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <TournamentProvider>
          <App />
        </TournamentProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
