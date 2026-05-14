import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { TrainingDataset, TrainingExample } from "../types/api.js";

interface Props {
  onClose: () => void;
}

export function TrainingDataPanel({ onClose }: Props) {
  const [datasets, setDatasets] = useState<TrainingDataset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    void api.listExamples(selected ?? undefined).then(setExamples);
  }, [selected]);

  const refresh = async () => {
    const all = await api.listDatasets();
    setDatasets(all);
  };

  const create = async () => {
    if (!newName.trim()) return;
    await api.createDataset(newName.trim());
    setNewName("");
    await refresh();
  };

  return (
    <div className="panel">
      <header>
        <h2>Training data</h2>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="row">
        <label>Datasets</label>
        <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
          <option value="">All examples</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <label>Create dataset</label>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dataset name" />
        <button className="primary" onClick={create} style={{ marginTop: 4 }}>
          Create
        </button>
      </div>

      <div className="row">
        <label>Examples ({examples.length})</label>
        <a className="primary" href={api.exportJsonlUrl(selected ?? undefined)} download style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}>
          Export JSONL
        </a>
      </div>

      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {examples.map((ex) => (
          <div
            key={ex.id}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: 8,
              fontSize: 12,
            }}
          >
            <div style={{ color: "var(--color-muted)", marginBottom: 4 }}>
              {new Date(ex.createdAt).toLocaleString()}
            </div>
            <div>
              <strong>Input:</strong> {ex.inputText.slice(0, 200)}
            </div>
            <div>
              <strong>Output:</strong> {ex.expectedOutputText.slice(0, 200)}
            </div>
          </div>
        ))}
        {examples.length === 0 && <p style={{ color: "var(--color-muted)" }}>No examples saved yet.</p>}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: "var(--color-muted)" }}>
        Storing examples here does not fine-tune a model. Export the JSONL and feed it into your fine-tuning or
        evaluation pipeline.
      </p>
    </div>
  );
}
