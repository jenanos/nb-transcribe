export const runtime = "nodejs";
const BASE = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const MOCK_MODE = (process.env.NEXT_PUBLIC_MOCK_MODE ?? "0").toString() === "1";

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

const filterRequestHeaders = (headers: Headers) =>
  Object.fromEntries(
    Array.from(headers).filter(([key]) => !["host", "content-length"].includes(key.toLowerCase()))
  );

export async function POST(req: Request) {
  if (MOCK_MODE) {
    // Simulate job creation
    const mockId = "mock-job-" + Math.random().toString(36).slice(2, 8);
    return new Response(JSON.stringify({ job_id: mockId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const upstream = await fetch(`${BASE}/jobs`, {
      method: "POST",
      body: req.body,
      // @ts-ignore
      duplex: "half",
      headers: filterRequestHeaders(req.headers),
    });
    return await forwardResponse(upstream);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
