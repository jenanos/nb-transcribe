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

const MOCK_MODE = (process.env.NEXT_PUBLIC_MOCK_MODE ?? "0").toString() === "1";

const MOCK_MODE_COPY: Record<string, { raw: string; clean?: string }> = {
  summary: {
    raw: "Dette er et eksempel på transkripsjonen fra et kundemøte der vi planlegger utrulling av NB-transcribe.",
    clean:
      "Sammendrag:\n- Vi demonstrerte NB-transcribe i et kundemøte.\n- Kunden ønsker mock-modus for porteføljen sin.\n- Neste steg er å produsere demo og dokumentasjon.",
  },
  email: {
    raw: "Hei, dette er et opptak fra kundemøtet vårt om transkripsjonstjenesten.",
    clean:
      "Hei team,\n\nTakk for et godt møte i dag! Her er en kort oppsummering og neste steg for NB-transcribe-demoen. Jeg setter opp mock-modus i frontend og eksponerer den via Vercel slik at dere kan teste selv. Gi beskjed om dere ønsker tilgang til self-hosted backenden.\n\nMvh\nNicolai",
  },
  document: {
    raw: "Dette er en lenger tekst fra transkripsjonen.",
    clean:
      "I dette dokumentet beskriver vi hvordan NB-transcribe settes opp i containere styrt av Portainer. Tjenesten ligger bak Cloudflare Tunnel og blir kontinuerlig oppdatert gjennom Watchtower og GitHub Actions.",
  },
  talking_points: {
    raw: "Her er noen momenter vi diskuterte under callen.",
    clean:
      "Talepunkter:\n1. Presentasjon av NB-transcribe sin pipeline.\n2. Oppsett med Docker Compose, Portainer og automatiske oppdateringer.\n3. Sikker eksponering via Cloudflare Tunnel.\n4. Mock-modus for porteføljevisning.",
  },
  polish: {
    raw: "Original tekst: vi self-hoster appen og bruker egen maskin for GPU.",
    clean:
      "Renskrevet versjon: Vi driver NB-transcribe på egen maskin med GPU, pakket i containere som styres via Portainer og eksponeres trygt gjennom Cloudflare Tunnel.",
  },
  workflow: {
    raw: "Rå transkripsjon for arbeidsflyt.",
    clean:
      "Arbeidsflyt:\n1. Lydopptak lastes opp til mock-frontenden.\n2. I produksjon sendes jobben til backenden via Cloudflare Tunnel.\n3. Watchtower og GitHub Actions sørger for automatiske oppdateringer av containere.\n\nLLM-prompt forslag:\n- 'Skriv et sammendrag av møtet og fremhev hvordan infrastrukturen er automatisert.'",
  },
};

const MOCK_SAMPLE_FILE_NAME = "demo-meeting.mp3";

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
  const [showMockInfo, setShowMockInfo] = useState(MOCK_MODE);
  const [showMockUploadNotice, setShowMockUploadNotice] = useState(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanTitle = CLEAN_TITLES[lastMode] ?? "Omskrevet versjon";

  const clearPollTimeout = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!MOCK_MODE) {
      return;
    }

    if (typeof window === "undefined" || typeof window.File === "undefined") {
      return;
    }

    setFile((prev) => {
      if (prev) {
        return prev;
      }
      try {
        // Minimal valid MP3 header (ID3 tag) as mock content
        const mockMp3Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x76]);
        return new File([mockMp3Header], MOCK_SAMPLE_FILE_NAME, { type: "audio/mpeg" });
      } catch {
        return prev;
      }
    });
  }, []);

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

    if (MOCK_MODE) {
      const mockContent = MOCK_MODE_COPY[selectedMode] ?? MOCK_MODE_COPY.summary;
      setJobStatus("queued");
      await new Promise((resolve) => setTimeout(resolve, 800));
      setJobStatus("running");
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setResult({
        raw: mockContent.raw,
        clean: rewrite && mockContent.clean ? mockContent.clean : null,
      });
      setLoading(false);
      setPage("results");
      setJobStatus(null);
      return;
    }

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
    if (MOCK_MODE) {
      return;
    }
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

      {showMockInfo && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-2xl rounded-2xl border border-pink-500 bg-black/90 p-6 text-left shadow-[0_0_20px_#ff33a8]">
            <h3 className="font-orbitron text-2xl text-cyan-300 mb-3">Mock mode enabled</h3>
            <p className="mb-3 text-sm text-gray-200">
              This preview of NB-transcribe runs entirely in mock mode so it can be deployed to Vercel without
              connecting to the self-hosted backend. In production the app runs in containers orchestrated via
              Portainer, exposed securely through Cloudflare Tunnel, and kept up to date with Watchtower and GitHub
              Actions.
            </p>
            <p className="mb-4 text-sm text-gray-200">
              The onboarding details here are in English, while the in-app labels remain in Norwegian because NB-transcribe
              focuses on the nb-whisper model.
            </p>
            <p className="mb-4 text-sm text-gray-200">
              Reach out if you would like to try the full GPU-backed experience.
            </p>
            <button
              onClick={() => setShowMockInfo(false)}
              className="rounded-lg bg-pink-500 px-4 py-2 font-bold text-white shadow-[0_0_10px_#ff33a8] hover:bg-pink-600 transition"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {showMockUploadNotice && (
        <div className="fixed inset-0 z-30 flex items-start justify-center pointer-events-none">
          <div className="mt-24 w-full max-w-md rounded-xl border border-cyan-400 bg-black/90 p-5 text-sm text-gray-100 shadow-[0_0_15px_#00e5ff] pointer-events-auto">
            <h4 className="font-orbitron text-lg text-cyan-300 mb-2">File picker disabled in mock mode</h4>
            <p className="mb-3 text-gray-200">
              Uploading custom audio is turned off here. We preloaded an example clip so you can start the transcription and optional
              rewriting steps right away.
            </p>
            <button
              onClick={() => setShowMockUploadNotice(false)}
              className="rounded-lg bg-pink-500 px-3 py-2 font-semibold text-white shadow-[0_0_10px_#ff33a8] hover:bg-pink-600 transition"
            >
              Understood
            </button>
          </div>
        </div>
      )}

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
                onClick={(event) => {
                  if (MOCK_MODE) {
                    event.preventDefault();
                    setShowMockUploadNotice(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (MOCK_MODE && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setShowMockUploadNotice(true);
                  }
                }}
                tabIndex={MOCK_MODE ? 0 : undefined}
                role={MOCK_MODE ? "button" : undefined}
                aria-disabled={MOCK_MODE ? 'true' : 'false'}
                className="mt-2 flex justify-center items-center px-6 py-5 border-2 border-dashed border-pink-400 rounded-md cursor-pointer hover:border-cyan-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
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
                required={!MOCK_MODE}
                disabled={MOCK_MODE}
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
