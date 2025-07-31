"use client";
import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState("summary");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ raw: string; clean: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    try {
      const res = await fetch("http://localhost:8000/process/", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Noe gikk galt på serveren.");
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <form
        className="bg-white shadow-md rounded p-6 w-full max-w-lg space-y-4"
        onSubmit={handleSubmit}
      >
        <h1 className="text-2xl font-bold mb-2">NB-Whisper + Gemma-3 Transkribering</h1>
        <input
          type="file"
          accept="audio/*"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="block w-full"
          required
        />
        <div className="flex gap-4">
          <label>
            <input
              type="radio"
              name="mode"
              value="summary"
              checked={mode === "summary"}
              onChange={() => setMode("summary")}
            />
            <span className="ml-1">Oppsummering</span>
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="email"
              checked={mode === "email"}
              onChange={() => setMode("email")}
            />
            <span className="ml-1">E-post</span>
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="document"
              checked={mode === "document"}
              onChange={() => setMode("document")}
            />
            <span className="ml-1">Dokument</span>
          </label>
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          disabled={loading}
        >
          {loading ? "Behandler..." : "Last opp og transkriber"}
        </button>
      </form>

      {error && (
        <div className="mt-4 text-red-600">{error}</div>
      )}

      {result && (
        <div className="mt-8 w-full max-w-3xl">
          <h2 className="font-semibold mb-2">Rå transkripsjon:</h2>
          <pre className="bg-gray-100 p-2 rounded whitespace-pre-wrap">{result.raw}</pre>
          <h2 className="font-semibold mt-4 mb-2">Renskrevet tekst:</h2>
          <pre className="bg-green-50 p-2 rounded whitespace-pre-wrap">{result.clean}</pre>
        </div>
      )}
    </main>
  );
}