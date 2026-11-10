import {
  BACKEND_BASE_URL,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../../../../utils/backend";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;

  try {
    const upstream = await fetch(
      `${BACKEND_BASE_URL}/jobs/chunked/${uploadId}/finalize`,
      {
        method: "POST",
        headers: withCloudflareAccessHeaders({}),
      }
    );
    return await forwardResponse(upstream);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
