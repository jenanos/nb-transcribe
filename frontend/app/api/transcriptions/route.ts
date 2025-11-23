import {
  BACKEND_BASE_URL,
  MOCK_MODE,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../utils/backend";

export const runtime = "nodejs";

const mockItems = [
  {
    id: 1,
    job_id: "mock-job-123",
    raw_transcript: "Dette er en demotranskripsjon fra mock-modus.",
    audio_duration_seconds: 42,
    input_size_bytes: 102400,
    original_filename: "demo.wav",
    model_id: "stub-model",
    metadata_json: {},
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "done",
    error_message: null,
  },
];

export async function GET(req: Request) {
  if (MOCK_MODE) {
    return new Response(JSON.stringify({ items: mockItems }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
    const upstream = await fetch(`${BACKEND_BASE_URL}/transcriptions${query}`, {
      method: "GET",
      headers: withCloudflareAccessHeaders(filterRequestHeaders(req.headers as Headers)),
    });

    return await forwardResponse(upstream);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Proxy failure" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
