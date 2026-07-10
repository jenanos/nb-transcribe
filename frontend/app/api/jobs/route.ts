import {
  BACKEND_BASE_URL,
  type StreamingRequestInit,
  MOCK_MODE,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../utils/backend";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    const init: StreamingRequestInit = {
      method: "POST",
      body: req.body,
      duplex: "half",
      headers: withCloudflareAccessHeaders(filterRequestHeaders(req.headers)),
    };
    const upstream = await fetch(`${BACKEND_BASE_URL}/jobs`, init);
    return await forwardResponse(upstream);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
