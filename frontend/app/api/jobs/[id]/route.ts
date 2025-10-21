export const runtime = "nodejs";
const BASE = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const MOCK_MODE = (process.env.MOCK_MODE ?? process.env.NEXT_PUBLIC_MOCK_MODE ?? "0").toString() === "1";

const sanitizeHeaders = (headers: Headers) => {
  const clean = new Headers(headers);
  ["content-length", "transfer-encoding", "connection"].forEach((name) => clean.delete(name));
  return clean;
};

const forwardResponse = async (upstream: Response) => {
  const headers = sanitizeHeaders(upstream.headers);
  const payload = await upstream.text();

  if (!upstream.ok) {
    const errorBody = payload || `${upstream.status} ${upstream.statusText}`;
    return new Response(
      JSON.stringify({ error: errorBody }),
      { status: upstream.status, headers: { "content-type": "application/json" } }
    );
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(payload, { status: upstream.status, headers });
};

export async function GET(_req: Request, { params }: any) {
  if (MOCK_MODE) {
    // Alternate between queued and completed for demo
    const isDone = params.id?.toString().endsWith("a") || params.id?.toString().endsWith("0");
    const payload = isDone
      ? {
          job_id: params.id,
          status: "done",
          result: {
            raw: "Dette er en mock-transkripsjon fra NB-transcribe.",
            clean: "Mock: En renskrevet versjon generert for demonstrasjonen.",
          },
        }
      : { job_id: params.id, status: "queued" };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const upstream = await fetch(`${BASE}/jobs/${params.id}`);
    return await forwardResponse(upstream);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
