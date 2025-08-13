export const runtime = "nodejs";
export async function POST(req: Request) {
  const upstream = await fetch("http://backend:8000/jobs", {
    method: "POST",
    body: req.body,
    // @ts-ignore
    duplex: "half",
    headers: Object.fromEntries(
      Array.from(req.headers).filter(([k]) =>
        !["host", "content-length"].includes(k.toLowerCase())
      )
    ),
  });
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
