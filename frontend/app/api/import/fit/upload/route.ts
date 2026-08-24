// Route Handler takes priority over the next.config.ts rewrite for this path,
// allowing large multipart uploads without Next.js proxy body-size limits.

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";

  const upstream = await fetch(
    "http://localhost:8000/api/import/fit/upload",
    {
      method: "POST",
      headers: { "content-type": contentType },
      body: request.body,
      // duplex: 'half' is required by Node.js 18+ to stream a request body
      ...({ duplex: "half" } as object),
    }
  );

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
