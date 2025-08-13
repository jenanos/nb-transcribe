export const runtime = "nodejs";

export async function GET(_req: Request, { params }: any) {
  const upstream = await fetch(`http://backend:8000/jobs/${params.id}`);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
