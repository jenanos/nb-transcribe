export const runtime = "nodejs";
const BASE = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function POST(req: Request) {
  const upstream = await fetch(`${BASE}/jobs`, {
    method: "POST",
    body: req.body,
    // @ts-ignore
    duplex: "half",
    headers: Object.fromEntries(
      Array.from(req.headers).filter(([k]) => !["host", "content-length"].includes(k.toLowerCase()))
    ),
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
