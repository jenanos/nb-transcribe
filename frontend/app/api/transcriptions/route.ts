import {
  BACKEND_BASE_URL,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../utils/backend";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
    const upstream = await fetch(`${BACKEND_BASE_URL}/transcriptions${query}`, {
      method: "GET",
      headers: withCloudflareAccessHeaders(filterRequestHeaders(req.headers as Headers)),
    });

    return await forwardResponse(upstream);
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Proxy failure" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
