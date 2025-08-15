"use client";
import { useState } from "react";
import Image from "next/image";
import bgImage from "@/public/nb-transcribe-background.png"; // Plasser bildet i public/

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState("summary");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ raw: string; clean: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState(true);
  const [page, setPage] = useState<"upload" | "results">("upload");

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
      const create = await fetch("/api/jobs", { method: "POST", body: formData });
      if (!(create.status === 202 || create.status === 200)) {
        const t = await create.text();
        throw new Error(`${create.status} ${create.statusText} – ${t}`);
      }
      const { job_id } = await create.json();

      const poll = async () => {
        const res = await fetch(`/api/jobs/${job_id}`);
        const data = await res.json();
        if (data.status === "done") {
          setResult(data.result);
          setLoading(false);
          setPage("results");
          return true;
        }
        if (data.status === "error") {
          throw new Error(data.error || "Ukjent job-feil");
        }
        return false;
      };

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
    <div className="min-h-screen flex flex-col text-white font-sans">
      {/* Bakgrunn kun for opplastingssiden */}
      {page === "upload" && (
        <div className="absolute inset-0 -z-10">
          <Image
            src={bgImage}
            alt="Synthwave background"
            fill
            style={{ objectFit: "cover" }}
          />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        </div>
      )}

      {/* Opplastingsside */}
      {page === "upload" && (
        <main className="flex-grow flex flex-col justify-center items-center p-6 space-y-6">
          <h1 className="font-orbitron text-4xl text-pink-400 drop-shadow-[0_0_10px_#ff33a8]">
            Transkriber
          </h1>
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md p-6 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 space-y-6"
          >
            <div>
              <label className="font-orbitron text-lg text-cyan-300" htmlFor="upload-file">
                Last opp lydfil
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="mt-2 block w-full text-white border border-pink-400 rounded px-3 py-2 bg-black/50 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                required
              />
            </div>

            <div>
              <label className="font-orbitron text-lg text-cyan-300" htmlFor="mode">
                Type omskriving
              </label>
              <select
                id="mode"
                value={mode}
                onChange={e => setMode(e.target.value)}
                className="mt-2 block w-full pl-3 pr-10 py-3 rounded-md bg-black/50 text-white border border-pink-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <option value="summary">Sammendrag</option>
                <option value="email">E-post</option>
                <option value="document">Dokument</option>
              </select>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rewrite}
                onChange={e => setRewrite(e.target.checked)}
                className="accent-pink-500"
              />
              <span>Renskriv med Gemma-3</span>
            </label>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-pink-500 text-white font-bold shadow-[0_0_10px_#ff33a8] hover:bg-pink-600 transition"
              disabled={loading}
            >
              {loading ? "Behandler..." : "Start Transkribering"}
            </button>
          </form>
          {error && <div className="text-red-400">{error}</div>}
        </main>
      )}

      {/* Resultatside */}
      {page === "results" && (
        <main className="flex-grow p-6 space-y-6 bg-gradient-to-br from-gray-900 to-black">
          <h1 className="font-orbitron text-4xl text-center text-cyan-300 drop-shadow-[0_0_10px_#00e5ff]">
            Resultater
          </h1>
          {result && (
            <div className="w-full max-w-3xl mx-auto p-6 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 space-y-6">
              <div>
                <h2 className="font-orbitron text-xl text-pink-400 mb-3">Transkripsjon</h2>
                <p className="whitespace-pre-wrap">{result.raw}</p>
              </div>
              {result.clean && (
                <div>
                  <h2 className="font-orbitron text-xl text-cyan-300 mb-3">Omskrevet versjon</h2>
                  <p className="whitespace-pre-wrap">{result.clean}</p>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* Navigasjon nederst */}
      <footer className="glassmorphism sticky bottom-0 w-full bg-black/70 backdrop-blur-md border-t border-white/10">
        <nav className="flex justify-around items-center h-16">
          <button
            onClick={() => setPage("upload")}
            className={`flex flex-col items-center ${page === "upload" ? "text-cyan-300" : "text-gray-400 hover:text-cyan-300"
              }`}
          >
            <span className="material-icons text-3xl">upload_file</span>
            <span className="text-xs">Opplasting</span>
          </button>
          <button
            onClick={() => setPage("results")}
            className={`flex flex-col items-center ${page === "results" ? "text-cyan-300" : "text-gray-400 hover:text-cyan-300"
              }`}
          >
            <span className="material-icons text-3xl">article</span>
            <span className="text-xs">Resultater</span>
          </button>
        </nav>
      </footer>
    </div>
  );
}
