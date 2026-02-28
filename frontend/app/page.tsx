"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import CopyableEditableBox from "@/app/components/CopyableEditableBox";
import ProcessingAnimation from "@/app/components/ProcessingAnimation";
import bgImage from "@/public/nb-transcribe-background.png";

const MOCK_MODE = (process.env.NEXT_PUBLIC_MOCK_MODE ?? "0").toString() === "1";
const RAW_DIRECT_UPLOAD_BASE = process.env.NEXT_PUBLIC_DIRECT_BACKEND_URL ?? "";
const DIRECT_UPLOAD_BASE = RAW_DIRECT_UPLOAD_BASE.trim().replace(/\/$/, "");
const HAS_DIRECT_UPLOAD = DIRECT_UPLOAD_BASE.length > 0;

const CHUNKED_UPLOAD_THRESHOLD = 1 * 1024 * 1024; // 1 MB – bruk chunked upload tidlig for å unngå 502 via proxy
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk
const POLL_MAX_RETRIES = 20;

const MOCK_SAMPLE_FILE_NAME = "demo-meeting.mp3";
const MOCK_TRANSCRIPT =
  "Dette er et eksempel på en transkripsjon fra NB-transcribe i mock-modus. Den faktiske backenden kjører lokalt " +
  "på min egen maskin for å beskytte maskinvaren, men UI-et og API-kontraktene er identiske med den selvhostede versjonen.";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ raw: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flowState, setFlowState] = useState<"idle" | "processing" | "results">("idle");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatusBaseUrl, setJobStatusBaseUrl] = useState<string | null>(null);
  const [showMockInfo, setShowMockInfo] = useState(MOCK_MODE);
  const [showMockUploadNotice, setShowMockUploadNotice] = useState(false);
  const [backendDown, setBackendDown] = useState(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (MOCK_MODE) return;
    const healthUrl = HAS_DIRECT_UPLOAD
      ? `${DIRECT_UPLOAD_BASE}/health`
      : "/api/health";
    fetch(healthUrl, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) setBackendDown(true);
      })
      .catch(() => {
        setBackendDown(true);
      });
  }, []);

  async function uploadChunked(file: File, baseUrl: string): Promise<{ job_id: string }> {
    const initUrl = `${baseUrl}/chunked/init?filename=${encodeURIComponent(file.name)}`;
    const initRes = await fetch(initUrl, { method: "POST", credentials: "include" });
    if (!initRes.ok) {
      const t = await initRes.text();
      throw new Error(`${initRes.status} ${initRes.statusText} – ${t}`);
    }
    const { upload_id } = await initRes.json();

    let offset = 0;
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const chunk = file.slice(offset, end);
      const chunkForm = new FormData();
      chunkForm.append("file", chunk, file.name);

      const appendRes = await fetch(
        `${baseUrl}/chunked/${upload_id}/append`,
        { method: "POST", body: chunkForm, credentials: "include" }
      );
      if (!appendRes.ok) {
        const t = await appendRes.text();
        throw new Error(`${appendRes.status} ${appendRes.statusText} – ${t}`);
      }
      offset = end;
    }

    const finalRes = await fetch(
      `${baseUrl}/chunked/${upload_id}/finalize`,
      { method: "POST", credentials: "include" }
    );
    if (!(finalRes.status === 202 || finalRes.status === 200)) {
      const t = await finalRes.text();
      throw new Error(`${finalRes.status} ${finalRes.statusText} – ${t}`);
    }
    return await finalRes.json();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setFlowState("processing");

    if (MOCK_MODE) {
      setTimeout(() => {
        setResult({ raw: MOCK_TRANSCRIPT });
        setLoading(false);
        setFlowState("results");
        setActiveJobId(null);
      }, 3000); // Litt lenger tid for å vise animasjonen
      return;
    }

    const jobEndpointBase = HAS_DIRECT_UPLOAD ? `${DIRECT_UPLOAD_BASE}/jobs` : "/api/jobs";
    const useChunked = file.size > CHUNKED_UPLOAD_THRESHOLD;

    try {
      let job_id: string;

      if (useChunked) {
        const result = await uploadChunked(file, jobEndpointBase);
        job_id = result.job_id;
      } else {
        const formData = new FormData();
        formData.append("file", file);
        const create = await fetch(jobEndpointBase, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!(create.status === 202 || create.status === 200)) {
          const t = await create.text();
          throw new Error(`${create.status} ${create.statusText} – ${t}`);
        }
        const data = await create.json();
        job_id = data.job_id;
      }

      setActiveJobId(job_id);
      setJobStatusBaseUrl(jobEndpointBase);
    } catch (err: any) {
      setError(err.message || "Ukjent feil");
      setLoading(false);
      setFlowState("idle");
      setActiveJobId(null);
      setJobStatusBaseUrl(null);
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
    let consecutiveErrors = 0;

    const poll = async () => {
      clearPollTimeout();
      try {
        const pollBase = jobStatusBaseUrl || "/api/jobs";
        const res = await fetch(`${pollBase}/${activeJobId}`, { cache: "no-store", credentials: "include" });

        const text = await res.text().catch(() => "");
        let data: any = null;

        if (text) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            if (res.ok) {
              throw new Error("Kunne ikke tolke svar fra serveren.");
            }
          }
        }

        if (!res.ok) {
          const isTransient = res.status === 502 || res.status === 503 || res.status === 504;
          if (isTransient && consecutiveErrors < POLL_MAX_RETRIES) {
            consecutiveErrors++;
            if (!cancelled) {
              pollTimeoutRef.current = setTimeout(poll, 2000 * consecutiveErrors);
            }
            return;
          }
          const details = [data?.error, data?.detail, text].filter(Boolean).join("\n");
          const message = `${res.status} ${res.statusText}` + (details ? ` – ${details}` : "");
          throw new Error(message);
        }

        consecutiveErrors = 0;

        if (!data) {
          throw new Error("Kunne ikke tolke svar fra serveren.");
        }
        if (cancelled) return;

        if (data.status === "done") {
          const raw = data?.result?.raw ?? "";
          setResult({ raw });
          setLoading(false);
          setFlowState("results");
          setActiveJobId(null);
          setJobStatusBaseUrl(null);
          return;
        }

        if (data.status === "error") {
          throw new Error(data.error || "Ukjent job-feil");
        }

        // Fortsett å polle
        pollTimeoutRef.current = setTimeout(poll, 2000);
      } catch (err: any) {
        if (cancelled) return;
        const isNetworkError = err instanceof TypeError;
        if (isNetworkError && consecutiveErrors < POLL_MAX_RETRIES) {
          consecutiveErrors++;
          pollTimeoutRef.current = setTimeout(poll, 2000 * consecutiveErrors);
          return;
        }
        setError(err?.message || "Ukjent feil");
        setLoading(false);
        setFlowState("idle");
        setActiveJobId(null);
        setJobStatusBaseUrl(null);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearPollTimeout();
    };
  }, [activeJobId, jobStatusBaseUrl]);

  const handleReset = () => {
    if (MOCK_MODE) {
      try {
        const mockMp3Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x76]);
        setFile(new File([mockMp3Header], MOCK_SAMPLE_FILE_NAME, { type: "audio/mpeg" }));
      } catch {
        setFile(null);
      }
    } else {
      setFile(null);
    }
    setResult(null);
    setFlowState("idle");
    setError(null);
    setLoading(false);
  };

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
            <h3 className="font-orbitron text-2xl text-cyan-300 mb-3">Mock-modus aktivert</h3>
            <p className="mb-3 text-sm text-gray-200">
              Denne forhåndsvisningen kjører kun den synlige frontenden og simulerer svar fra backenden.
              I produksjon er backenden selvhostet med NB-Whisper Large på GPU, men den holdes privat slik
              at maskinvaren ikke eksponeres fra Vercel-demoen.
            </p>
            <p className="mb-4 text-sm text-gray-200">
              UI-et, API-kontraktene og transkriberingsflyten er identiske med den ekte versjonen som jeg kjører
              bak Cloudflare Tunnel. Du kan teste det visuelle her uten å ha tilgang til min backend.
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
            <h4 className="font-orbitron text-lg text-cyan-300 mb-2">Filopplasting deaktivert i mock-modus</h4>
            <p className="mb-3 text-gray-200">
              Opplasting av egne filer er skrudd av her. Vi har forhåndslastet et eksempelklipp slik at du kan se
              transkriberingsflyten uten backend-tilgang.
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

      {backendDown && (
        <div role="alert" className="fixed top-16 left-0 right-0 z-30 flex justify-center pointer-events-none">
          <div className="mt-2 w-full max-w-xl rounded-xl border border-red-400 bg-black/90 px-5 py-3 text-sm text-gray-100 shadow-[0_0_15px_#ff3333] pointer-events-auto flex items-center gap-3">
            <span className="material-icons text-red-400">error_outline</span>
            <span>
              <strong className="text-red-400">Backend utilgjengelig</strong> – Transkribering er ikke mulig akkurat nå. Prøv igjen senere.
            </span>
            <button onClick={() => setBackendDown(false)} className="ml-auto text-gray-400 hover:text-white transition" aria-label="Lukk varsel">
              <span className="material-icons">close</span>
            </button>
          </div>
        </div>
      )}

      <main className="flex-grow flex flex-col items-center p-6 pt-24 space-y-6">
        {/* Flashy tittel */}
        <h1 className="font-road-rage text-6xl md:text-7xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent glow-pulse animate-gradient text-center mt-6">
          NB-transcribe
        </h1>

        {/* Upload Section */}
        <div className={`w-full max-w-md transition-all duration-500 ${flowState === "idle" ? "block" : "hidden"}`}>
          <h2 className="font-orbitron text-2xl text-cyan-300 drop-shadow-[0_0_5px_#00e5ff] mb-4 text-center">
            Opplasting
          </h2>

          <form
            onSubmit={handleSubmit}
            className={`w-full p-6 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 space-y-6 transition-opacity duration-500 ${flowState === "processing" ? "opacity-50 pointer-events-none" : "opacity-100"
              }`}
          >
            {/* Custom file upload */}
            <div>
              <label className="font-orbitron text-lg text-cyan-300" htmlFor="upload-file">
                Last opp lydfil
              </label>
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
                aria-disabled={MOCK_MODE ? "true" : "false"}
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
                disabled={MOCK_MODE || flowState === "processing"}
              />
            </div>



            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-pink-500 text-white font-bold shadow-[0_0_10px_#ff33a8] hover:bg-pink-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || flowState === "processing"}
            >
              {flowState === "processing" ? "Behandler..." : "Start transkribering"}
            </button>
          </form>

          {error && <div className="text-red-400 mt-4 text-center">{error}</div>}
        </div>

        {/* Processing Animation */}
        {flowState === "processing" && (
          <div className="w-full max-w-md animate-fade-in">
            <ProcessingAnimation />
          </div>
        )}

        {/* Results Section */}
        {flowState === "results" && result && (
          <div className="w-full max-w-3xl mx-auto space-y-6 animate-fade-in">
            <h2 className="font-orbitron text-2xl text-cyan-300 drop-shadow-[0_0_5px_#00e5ff] text-center">
              Resultater
            </h2>
            <CopyableEditableBox title="Transkripsjon" content={result.raw} />

            <div className="flex justify-center pt-4">
              <button
                onClick={handleReset}
                className="flex items-center space-x-2 rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-6 py-3 text-cyan-100 hover:bg-cyan-500/20 transition"
              >
                <span className="material-icons">refresh</span>
                <span>Ny transkribering</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
