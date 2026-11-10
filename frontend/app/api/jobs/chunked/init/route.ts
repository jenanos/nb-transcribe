import {
  BACKEND_BASE_URL,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../../../utils/backend";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
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
