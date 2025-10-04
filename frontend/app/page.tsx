"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import CopyableEditableBox from "@/app/components/CopyableEditableBox";
import bgImage from "@/public/nb-transcribe-background.png";

const MODE_OPTIONS = [
  { value: "summary", label: "Sammendrag" },
  { value: "email", label: "E-post" },
  { value: "document", label: "Avsnitt til dokument" },
  { value: "talking_points", label: "Talepunkter" },
  { value: "polish", label: "Renskriving" },
  { value: "workflow", label: "Arbeidsflyt" },
];

const CLEAN_TITLES: Record<string, string> = {
  summary: "Omskrevet versjon",
  email: "E-postutkast",
  document: "Dokumentavsnitt",
  talking_points: "Talepunkter",
  polish: "Renskrevet versjon",
  workflow: "Arbeidsflyt og LLM-promptforslag",
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<string>(MODE_OPTIONS[0].value);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ raw: string; clean: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState(true);
  const [page, setPage] = useState<"upload" | "results">("upload");
  const [lastMode, setLastMode] = useState<string>(MODE_OPTIONS[0].value);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"queued" | "running" | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanTitle = CLEAN_TITLES[lastMode] ?? "Omskrevet versjon";

  const clearPollTimeout = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    clearPollTimeout();
    setActiveJobId(null);
    setLoading(true);
    setError(null);
    setResult(null);

    const selectedMode = mode;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", selectedMode);
    formData.append("rewrite", String(rewrite));
    setLastMode(selectedMode);

    try {
      const create = await fetch("/api/jobs", { method: "POST", body: formData });
      if (!(create.status === 202 || create.status === 200)) {
        const t = await create.text();
        throw new Error(`${create.status} ${create.statusText} – ${t}`);
      }
      const { job_id } = await create.json();
      setActiveJobId(job_id);
      setJobStatus("queued");
    } catch (err: any) {
      setError(err.message || "Ukjent feil");
      setLoading(false);
      setActiveJobId(null);
      setJobStatus(null);
    }
  }

  useEffect(() => {
    if (!activeJobId) {
      clearPollTimeout();
      return;
    }

    let cancelled = false;

    const poll = async () => {
      clearPollTimeout();
      try {
        const res = await fetch(`/api/jobs/${activeJobId}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.status === "done") {
          const raw = data?.result?.raw ?? "";
          const cleanValue = data?.result?.clean;
          setResult({
            raw,
            clean: typeof cleanValue === "string" ? cleanValue : null,
          });
          setLoading(false);
          setPage("results");
          setActiveJobId(null);
          setJobStatus(null);
          return;
        }

        if (data.status === "error") {
          throw new Error(data.error || "Ukjent job-feil");
        }

        if (data.status === "queued" || data.status === "running") {
          setJobStatus(data.status);
        }

        pollTimeoutRef.current = setTimeout(poll, 2000);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Ukjent feil");
        setLoading(false);
        setJobStatus(null);
        setActiveJobId(null);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearPollTimeout();
    };
  }, [activeJobId]);

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
              <label htmlFor="upload-file" className="font-orbitron text-lg text-cyan-300">Last opp lydfil</label>
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
                {MODE_OPTIONS.map(({ value: optionValue, label }) => (
                  <option key={optionValue} value={optionValue}>
                    {label}
                  </option>
                ))}
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
            {loading && (
              <div className="text-center text-sm text-cyan-300">
                {jobStatus === "running"
                  ? "Jobben kjører – transkriberer og renskriver."
                  : "Jobb lagt i kø – starter om et øyeblikk."}
              </div>
            )}
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
                <CopyableEditableBox title={cleanTitle} content={result.clean} />
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
