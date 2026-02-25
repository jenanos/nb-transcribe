import {
  BACKEND_BASE_URL,
  MOCK_MODE,
  filterRequestHeaders,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../../../../utils/backend";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;

  if (MOCK_MODE) {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(
      `${BACKEND_BASE_URL}/jobs/chunked/${uploadId}/append`,
      {
        method: "POST",
        body: req.body,
        // @ts-ignore
        duplex: "half",
        headers: withCloudflareAccessHeaders(
          filterRequestHeaders(req.headers)
        ),
      }
    );
    return await forwardResponse(upstream);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
