import {
  BACKEND_BASE_URL,
  MOCK_MODE,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../../utils/backend";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { jobId?: string } }) {
  if (MOCK_MODE) {
    return new Response(
      JSON.stringify({ status: "queued" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  const jobId = params.jobId;
  if (!jobId) {
    return new Response(
      JSON.stringify({ error: "Job ID is required" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const upstream = await fetch(`${BACKEND_BASE_URL}/jobs/${jobId}`, {
      method: "GET",
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
