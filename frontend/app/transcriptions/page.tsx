"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import bgImage from "@/public/nb-transcribe-background.png";

interface TranscriptionRecord {
  id: number;
  job_id: string;
  raw_transcript: string | null;
  clean_transcript: string | null;
  rewrite_mode: string | null;
  rewrite_enabled: boolean;
  prompt: string | null;
  audio_duration_seconds: number | null;
  input_size_bytes: number | null;
  original_filename: string | null;
  model_id: string | null;
  created_at: string | null;
  completed_at: string | null;
  status: string;
  error_message: string | null;
}

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

  return (
    <div className="relative min-h-screen text-white">
      <div className="absolute inset-0 -z-10">
        <Image src={bgImage} alt="Synthwave background" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-12 pt-10 md:pt-16">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-orbitron text-sm uppercase tracking-widest text-pink-300">Historikk</p>
            <h1 className="text-3xl font-bold text-cyan-200 drop-shadow-[0_0_10px_#00e5ff] md:text-4xl">
              Lagrede transkripsjoner
            </h1>
            <p className="max-w-2xl text-sm text-gray-200 md:text-base">
              Her finner du alle transkripsjoner og bearbeidelser som er lagret i databasen.
              Klikk deg tilbake til forsiden for å laste opp nye filer eller start en ny jobb.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 shadow-[0_0_10px_#00e5ff] hover:bg-cyan-500/20"
          >
            <span className="material-icons text-base">arrow_back</span>
            Til transkribering
          </Link>
        </div>

        {loading && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-gray-200">
            Laster transkripsjoner ...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
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
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    record.status === "done"
                      ? "bg-green-500/20 text-green-200"
                      : record.status === "error"
                        ? "bg-red-500/20 text-red-200"
                        : "bg-yellow-500/20 text-yellow-100"
                  }`}
                >
                  {record.status === "done"
                    ? "Ferdig"
                    : record.status === "error"
                      ? "Feil"
                      : record.status}
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
                  <p className="text-xs uppercase tracking-wide text-gray-400">Modus</p>
                  <p>
                    {record.rewrite_mode || "—"} {record.rewrite_enabled ? "(med renskriving)" : "(kun rå)"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Modell</p>
                  <p>{record.model_id || "—"}</p>
                </div>
              </div>

              {record.prompt && (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-gray-100">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-300">Tilpasset prompt</p>
                  <p className="whitespace-pre-wrap">{record.prompt}</p>
                </div>
              )}

              {record.error_message && (
                <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-red-200">Feil</p>
                  <p className="whitespace-pre-wrap">{record.error_message}</p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-gray-300">
                    <span>Råtranskripsjon</span>
                    {record.raw_transcript && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-gray-100">
                        {record.raw_transcript.length} tegn
                      </span>
                    )}
                  </div>
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-gray-100">
                    {record.raw_transcript || "Ingen tekst"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-gray-300">
                    <span>Renskrevet</span>
                    {record.clean_transcript && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-gray-100">
                        {record.clean_transcript.length} tegn
                      </span>
                    )}
                  </div>
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-gray-100">
                    {record.clean_transcript || "Ingen tekst"}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
