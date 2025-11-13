import {
  BACKEND_BASE_URL,
  MOCK_MODE,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../utils/backend";

export const runtime = "nodejs";

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
    const upstream = await fetch(`${BACKEND_BASE_URL}/jobs`, {
      method: "POST",
      body: req.body,
      // @ts-ignore
      duplex: "half",
      headers: withCloudflareAccessHeaders(filterRequestHeaders(req.headers)),
    });
    return await forwardResponse(upstream);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
