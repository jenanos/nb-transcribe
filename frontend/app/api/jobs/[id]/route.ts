export const runtime = "nodejs";
const BASE = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

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
