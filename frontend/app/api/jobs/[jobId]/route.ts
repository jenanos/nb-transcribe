import {
  BACKEND_BASE_URL,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../../utils/backend";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: "Job ID is required" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const upstream = await fetch(`${BACKEND_BASE_URL}/jobs/${jobId}`, {
      method: "GET",
      cache: "no-store",
      headers: withCloudflareAccessHeaders(filterRequestHeaders(req.headers)),
    });
    return await forwardResponse(upstream);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
