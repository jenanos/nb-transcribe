"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import bgImage from "@/public/nb-transcribe-background.png";

interface TranscriptionRecord {
  id: number;
  job_id: string;
  raw_transcript: string | null;
  audio_duration_seconds: number | null;
  input_size_bytes: number | null;
  original_filename: string | null;
  model_id: string | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string | null;
  completed_at: string | null;
  status: string;
  error_message: string | null;
}

type ModalContent = {
  title: string;
  text: string;
  canCopy: boolean;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TranscriptionsPage() {
  const [records, setRecords] = useState<TranscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/transcriptions", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || "Kunne ikke hente transkripsjoner");
        }
        setRecords(body.items ?? []);
      } catch (err: any) {
        setError(err?.message || "Ukjent feil");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCopy = async (label: string, text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 1500);
    } catch (err) {
      console.error("clipboard error", err);
    }
  };

  const openModal = (title: string, text: string | null) => {
    const safeText = text ?? "Ingen tekst";
    setModalContent({
      title,
      text: safeText,
      canCopy: Boolean(text),
    });
  };

  const closeModal = () => setModalContent(null);

  return (
    <div className="relative min-h-screen text-white">
      <div className="absolute inset-0 -z-10">
        <Image src={bgImage} alt="Synthwave background" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-12 pt-24">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>

            <h1 className="text-3xl font-bold text-cyan-200 drop-shadow-[0_0_10px_#00e5ff] md:text-4xl">
              Lagrede transkripsjoner
            </h1>
            <p className="max-w-2xl text-sm text-gray-200 md:text-base">
              Her finner du alle transkripsjoner som er lagret i databasen.
            </p>
          </div>

        </div>

        {loading && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-gray-200">
            Laster transkripsjoner ...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-gray-200">
            Ingen transkripsjoner er lagret enda. Fullfør en jobb for å se historikk her.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {records.map((record) => (
            <article
              key={record.job_id}
              className="rounded-xl border border-white/10 bg-black/60 p-4 shadow-[0_0_15px_rgba(0,229,255,0.15)] backdrop-blur-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-300">Jobb-ID</p>
                  <p className="font-mono text-sm text-cyan-200">{record.job_id}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${record.status === "done"
                      ? "bg-green-500/20 text-green-200"
                      : record.status === "error"
                        ? "bg-red-500/20 text-red-200"
                        : "bg-yellow-500/20 text-yellow-100"
                    }`}
                >
                  {record.status === "done" ? "Ferdig" : record.status === "error" ? "Feil" : record.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-200 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Opprettet</p>
                  <p>{formatDateTime(record.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Original fil</p>
                  <p>{record.original_filename || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Modell</p>
                  <p>{record.model_id || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Varighet</p>
                  <p>{record.audio_duration_seconds ? `${record.audio_duration_seconds.toFixed(1)} s` : "—"}</p>
                </div>
              </div>

              {record.error_message && (
                <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-red-200">Feil</p>
                  <p className="whitespace-pre-wrap">{record.error_message}</p>
                </div>
              )}

              <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-gray-300">
                  <span>Råtranskripsjon</span>
                  <div className="flex items-center gap-2">
                    {record.raw_transcript && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-gray-100">
                        {record.raw_transcript.length} tegn
                      </span>
                    )}
                    {record.raw_transcript && (
                      <button
                        type="button"
                        onClick={() => handleCopy(`${record.job_id}-raw`, record.raw_transcript)}
                        className="flex items-center justify-center rounded border border-cyan-300/50 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/20"
                        title="Kopier råtranskripsjon"
                      >
                        <span className="material-icons text-sm leading-none">content_copy</span>
                      </button>
                    )}
                    {copiedLabel === `${record.job_id}-raw` && (
                      <span className="text-[10px] text-cyan-200">Kopiert!</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openModal("Råtranskripsjon", record.raw_transcript)}
                  className="w-full text-left"
                >
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-gray-100 transition hover:text-white">
                    {record.raw_transcript || "Ingen tekst"}
                  </p>
                </button>
              </div>
            </article>
          ))}
        </div>

        {modalContent && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-4 py-8">
            <div className="relative w-full max-w-4xl rounded-2xl border border-cyan-400/50 bg-black/90 p-6 shadow-[0_0_30px_#00e5ff]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <h3 className="font-orbitron text-xl text-cyan-200">{modalContent.title}</h3>
                <div className="flex gap-2">
                  {modalContent.canCopy && (
                    <button
                      type="button"
                      onClick={() => handleCopy("modal", modalContent.text)}
                      className="flex items-center justify-center gap-1 rounded border border-cyan-300/60 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20"
                      title="Kopier tekst"
                    >
                      <span className="material-icons text-sm">content_copy</span>
                      Kopier
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex items-center justify-center gap-1 rounded border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-gray-100 transition hover:bg-white/10"
                    title="Lukk"
                  >
                    <span className="material-icons text-sm">close</span>
                    Lukk
                  </button>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-100">{modalContent.text}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
