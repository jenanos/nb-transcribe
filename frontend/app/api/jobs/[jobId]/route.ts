import {
  BACKEND_BASE_URL,
  MOCK_MODE,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../../utils/backend";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (MOCK_MODE) {
    const isDone = jobId?.toString().endsWith("a") || jobId?.toString().endsWith("0");
    const payload = isDone
      ? {
          job_id: jobId,
          status: "done",
          result: {
            raw: "Dette er en mock-transkripsjon fra NB-transcribe.",
            clean: "Mock: En renskrevet versjon generert for demonstrasjonen.",
          },
        }
      : { job_id: jobId, status: "queued" };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

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
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
