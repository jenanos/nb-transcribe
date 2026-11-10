import {
  BACKEND_BASE_URL,
  type StreamingRequestInit,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../utils/backend";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const init: StreamingRequestInit = {
      method: "POST",
      body: req.body,
      duplex: "half",
      headers: withCloudflareAccessHeaders(filterRequestHeaders(req.headers)),
    };
    const upstream = await fetch(`${BACKEND_BASE_URL}/process/`, init);

    return await forwardResponse(upstream);
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
