import { getCloudflareAccessHeaders } from "./cloudflare";

export const BACKEND_BASE_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

export const MOCK_MODE =
  (process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.TRANSCRIBE_MOCK_MODE ?? "0").toString() === "1";

const headersToObject = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
};

export const withCloudflareAccessHeaders = (headers?: HeadersInit): Record<string, string> => ({
  ...headersToObject(headers),
  ...(getCloudflareAccessHeaders() ?? {}),
});

export const sanitizeHeaders = (headers: Headers) => {
  const clean = new Headers(headers);
  ["content-length", "transfer-encoding", "connection"].forEach((name) => clean.delete(name));
  return clean;
};

export const forwardResponse = async (upstream: Response) => {
  const headers = sanitizeHeaders(upstream.headers);
  const payload = await upstream.text();

  if (!upstream.ok) {
    const errorBody = payload || `${upstream.status} ${upstream.statusText}`;
    return new Response(JSON.stringify({ error: errorBody }), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(payload, { status: upstream.status, headers });
};

export const filterRequestHeaders = (headers: Headers) =>
  Object.fromEntries(
    Array.from(headers).filter(([key]) => !["host", "content-length"].includes(key.toLowerCase()))
  );
