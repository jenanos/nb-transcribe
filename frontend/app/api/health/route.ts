import {
  BACKEND_BASE_URL,
  MOCK_MODE,
  forwardResponse,
  withCloudflareAccessHeaders,
} from "../utils/backend";

export const runtime = "nodejs";

export async function GET() {
  if (MOCK_MODE) {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const upstream = await fetch(`${BACKEND_BASE_URL}/health`, {
      headers: withCloudflareAccessHeaders(),
      cache: "no-store",
    });
    return await forwardResponse(upstream);
  } catch {
    return new Response(
      JSON.stringify({ error: "Backend unavailable" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
