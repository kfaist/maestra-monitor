/**
 * Per-Entity Frame Buffer
 *
 * POST /api/frame/:slug  — accepts JPEG body (raw binary), stores in memory
 * GET  /api/frame/:slug  — returns latest JPEG frame
 *
 * Single-frame buffer per slug. TD pushes frames via push_shapeshifters.py,
 * dashboard polls via fetchFrame().
 */

export const dynamic = 'force-dynamic';

// In-memory frame store: slug → { data, updatedAt }
const frames = new Map<string, { data: Uint8Array; updatedAt: number }>();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const contentType = request.headers.get('content-type') || '';
    let frameData: Uint8Array;

    if (contentType.includes('application/json')) {
      const json = await request.json();
      if (json.frame) {
        const binary = atob(json.frame);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        frameData = bytes;
      } else {
        return new Response(JSON.stringify({ error: 'Missing frame field' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const arrayBuffer = await request.arrayBuffer();
      frameData = new Uint8Array(arrayBuffer);
    }

    if (frameData.length < 100) {
      return new Response(JSON.stringify({ error: 'Frame too small' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    frames.set(slug, { data: frameData, updatedAt: Date.now() });

    return new Response(null, { status: 204, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const entry = frames.get(slug);
  if (!entry) {
    return new Response(null, { status: 404, headers: CORS_HEADERS });
  }

  const age = Date.now() - entry.updatedAt;

  return new Response(
    entry.data.buffer.slice(
      entry.data.byteOffset,
      entry.data.byteOffset + entry.data.byteLength
    ) as ArrayBuffer,
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Frame-Age-Ms': String(age),
      },
    }
  );
}
