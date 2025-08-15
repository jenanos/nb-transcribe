"use client";
import { useState } from "react";
import Image from "next/image";
import bgImage from "@/public/nb-transcribe-background.png";

function CopyableEditableBox({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(content);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  return (
    <div className="relative p-4 rounded-xl bg-black/60 backdrop-blur-md border border-white/10">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-orbitron text-xl text-pink-400">{title}</h3>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="text-cyan-300 hover:text-white transition-colors"
            title="Kopier"
          >
            📋
          </button>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-cyan-300 hover:text-white transition-colors"
              title="Rediger"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full p-2 bg-black/50 text-white border border-pink-400 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <button
            onClick={handleSave}
            className="mt-2 px-4 py-2 bg-pink-500 rounded hover:bg-pink-600"
          >
            Lagre
          </button>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap">{text}</pre>
      )}

      {copied && (
        <div className="absolute top-2 right-12 bg-cyan-500 text-black px-2 py-1 rounded text-sm">
          Kopiert!
        </div>
      )}
    </div>
  );
}

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
    <div className="min-h-screen flex flex-col text-white font-sans relative">
      {/* Bakgrunn på begge sider */}
      <div className="absolute inset-0 -z-10">
        <Image src={bgImage} alt="Synthwave background" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      </div>

      {/* Opplastingsside */}
      {page === "upload" && (
        <main className="flex-grow flex flex-col items-center p-6 space-y-6">
          {/* Flashy tittel */}
          <h1 className="font-road-rage text-6xl md:text-7xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent glow-pulse animate-gradient text-center mt-6">
            NB-transcribe
          </h1>
          {/* Undertittel */}
          <h2 className="font-orbitron text-2xl text-cyan-300 drop-shadow-[0_0_5px_#00e5ff] mb-4">
            Opplasting
          </h2>

          {/* Skjema */}
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md p-6 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 space-y-6"
          >
            {/* Custom file upload */}
            <div>
              <label className="font-orbitron text-lg text-cyan-300">Last opp lydfil</label>
              <label
                htmlFor="upload-file"
                className="mt-2 flex justify-center items-center px-6 py-5 border-2 border-dashed border-pink-400 rounded-md cursor-pointer hover:border-cyan-400 transition-colors"
              >
                <span className="text-center text-pink-400">
                  {file ? file.name : "Klikk for å velge fil eller dra og slipp"}
                </span>
              </label>
              <input
                id="upload-file"
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                required
              />
            </div>

            {/* Mode */}
            <div>
              <label className="font-orbitron text-lg text-cyan-300">Type omskriving</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="mt-2 block w-full pl-3 pr-10 py-3 rounded-md bg-black/50 text-white border border-pink-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <option value="summary">Sammendrag</option>
                <option value="email">E-post</option>
                <option value="document">Dokument</option>
              </select>
            </div>

            {/* Rewrite */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rewrite}
                onChange={(e) => setRewrite(e.target.checked)}
                className="accent-pink-500"
              />
              <span>Renskriv med Gemma-3</span>
            </label>

            {/* Submit */}
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
        <main className="flex-grow p-6 space-y-6">
          {/* Undertittel */}
          <h2 className="font-orbitron text-2xl text-cyan-300 drop-shadow-[0_0_5px_#00e5ff] text-center">
            Resultater
          </h2>
          {result && (
            <div className="w-full max-w-3xl mx-auto space-y-6">
              <CopyableEditableBox title="Transkripsjon" content={result.raw} />
              {result.clean && (
                <CopyableEditableBox title="Omskrevet versjon" content={result.clean} />
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
