"use client";
import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState("summary");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ raw: string; clean: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);
    formData.append("rewrite", String(rewrite));

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
    <main className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 flex flex-col items-center justify-center p-4">
      <form
        className="bg-white shadow-2xl border border-gray-200 rounded-xl p-10 w-full max-w-xl space-y-6"
        onSubmit={handleSubmit}
      >
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">NB-Whisper + Gemma-3</h1>
        <p className="text-gray-700 text-center mb-4">Transkriber og eventuelt renskriv lydfiler med norsk tale</p>
        <input
          type="file"
          accept="audio/*"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="block w-full text-gray-800 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <div className="flex gap-6 justify-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="summary"
              checked={mode === "summary"}
              onChange={() => setMode("summary")}
              className="accent-blue-600"
            />
            <span className="text-gray-800">Oppsummering</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="email"
              checked={mode === "email"}
              onChange={() => setMode("email")}
              className="accent-blue-600"
            />
            <span className="text-gray-800">E-post</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="document"
              checked={mode === "document"}
              onChange={() => setMode("document")}
              className="accent-blue-600"
            />
            <span className="text-gray-800">Dokument</span>
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={rewrite}
            onChange={e => setRewrite(e.target.checked)}
            className="accent-blue-600"
          />
          <span className="text-gray-800">Renskriv med Gemma-3</span>
        </label>
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
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
          <pre className="bg-white text-gray-900 p-4 rounded border border-gray-200 whitespace-pre-wrap text-base leading-relaxed">{result.raw}</pre>
          {result.clean && (
            <>
              <h2 className="font-semibold mt-4 mb-2">Renskrevet tekst:</h2>
              <pre className="bg-white text-gray-900 p-4 rounded border border-green-200 whitespace-pre-wrap text-base leading-relaxed">{result.clean}</pre>
            </>
          )}
        </div>
      )}
    </main>
  );
}