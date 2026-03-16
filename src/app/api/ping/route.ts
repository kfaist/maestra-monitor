export async function GET() {
  return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  return new Response(JSON.stringify({ ok: true, echo: body.slice(0, 100), time: Date.now() }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
