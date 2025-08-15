export const runtime = "nodejs";
const BASE = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export async function GET(_req: Request, { params }: any) {
  const upstream = await fetch(`${BASE}/jobs/${params.id}`);
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
