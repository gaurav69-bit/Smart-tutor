import React, { useEffect, useState } from "react";
import { apiMode, getHealth } from "../api/health.js";

export default function ApiStatus() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    setState({ loading: true });
    getHealth(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) setState({ data });
      })
      .catch((error) => {
        if (active)
          setState({
            error: controller.signal.aborted
              ? "Request timed out. Try again."
              : error.message,
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  return (
    <section className="api-panel" aria-labelledby="api-heading">
      <div>
        <h2 id="api-heading">Sample API connection</h2>
        <p>
          {apiMode === "mock"
            ? "Mock response · backend integration pending"
            : "Live request · GET /api/health"}
        </p>
      </div>
      <div className="api-result" aria-live="polite" aria-atomic="true">
        {state.loading && <p role="status">Checking connection…</p>}
        {state.data && (
          <p className="success">
            {apiMode === "mock" ? "Mock" : "Backend"} status {state.data.status}{" "}
            · database {state.data.database}
          </p>
        )}
        {state.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
      </div>
      <button
        className="button secondary"
        disabled={state.loading}
        onClick={() => setAttempt(attempt + 1)}
      >
        Retry connection
      </button>
    </section>
  );
}
