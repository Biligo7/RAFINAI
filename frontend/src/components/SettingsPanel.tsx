import type { AppConfigResponse } from "../types/api.js";

interface Props {
  config: AppConfigResponse | null;
  onClose: () => void;
}

export function SettingsPanel({ config, onClose }: Props) {
  return (
    <div className="panel">
      <header>
        <h2>Settings</h2>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </header>

      {!config ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="row">
            <label>App name</label>
            <code>{config.appName}</code>
          </div>
          <div className="row">
            <label>Environment</label>
            <code>{config.environment}</code>
          </div>
          <div className="row">
            <label>AI provider</label>
            <code>{config.aiProvider}</code>
          </div>
          <div className="row">
            <label>Model</label>
            <code>{config.model}</code>
          </div>
          <div className="row">
            <label>Streaming</label>
            <code>{config.streamingEnabled ? "enabled" : "disabled"}</code>
          </div>
          <div className="row">
            <label>Authentication</label>
            <code>{config.authEnabled ? "enabled" : "placeholder"}</code>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: "var(--color-muted)" }}>
            This panel only ever shows safe values. API keys, SQL connection strings, and other secrets are never sent
            to the browser. Change provider settings via Terraform variables and redeploy.
          </p>
        </>
      )}
    </div>
  );
}
