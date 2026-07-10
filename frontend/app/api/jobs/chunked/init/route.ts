import {
  BACKEND_BASE_URL,
  MOCK_MODE,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../../../utils/backend";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (MOCK_MODE) {
    const mockId = "mock-upload-" + Math.random().toString(36).slice(2, 8);
    return new Response(JSON.stringify({ upload_id: mockId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const filename = url.searchParams.get("filename");
    const backendUrl = new URL(`${BACKEND_BASE_URL}/jobs/chunked/init`);
    if (filename) backendUrl.searchParams.set("filename", filename);

    const upstream = await fetch(backendUrl.toString(), {
      method: "POST",
      headers: withCloudflareAccessHeaders({}),
    });
    return await forwardResponse(upstream);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Proxy failure" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
