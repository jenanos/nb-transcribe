export const runtime = "nodejs";

const BASE = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const upstream = await fetch(`${BASE}/process/`, {
    method: "POST",
    body: req.body,
    // @ts-ignore
    duplex: "half",
    headers: Object.fromEntries(
      Array.from(req.headers).filter(([k]) => !["host", "content-length"].includes(k.toLowerCase()))
    ),
  });

    // Fjern hop-by-hop headere som kan skape trøbbel
    const headers = new Headers(upstream.headers);
    ["content-length", "transfer-encoding", "connection"].forEach(h =>
      headers.delete(h)
    );

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err: any) {
    console.error("Proxy error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
