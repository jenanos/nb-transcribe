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
      // 1) Opprett jobb (får job_id)
      const create = await fetch("/api/jobs", { method: "POST", body: formData });
      if (!(create.status === 202 || create.status === 200)) {
        const t = await create.text();
        throw new Error(`${create.status} ${create.statusText} – ${t}`);
      }
      const { job_id } = await create.json();

      // 2) Poll status
      const poll = async () => {
        const res = await fetch(`/api/jobs/${job_id}`);
        const data = await res.json();
        if (data.status === "done") {
          setResult(data.result);
          setLoading(false);
          return true;
        }
        if (data.status === "error") {
          throw new Error(data.error || "Ukjent job-feil");
        }
        return false;
      };

      // poll hvert 2. sekund til ferdig
      const interval = setInterval(async () => {
        try {
          const done = await poll();
          if (done) clearInterval(interval);
        } catch (err: any) {
          clearInterval(interval);
          setError(err.message || "Ukjent feil");
          setLoading(false);
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Ukjent feil");
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