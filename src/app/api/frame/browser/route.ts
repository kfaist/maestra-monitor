/**
 * Browser Camera Frame Buffer
 *
 * POST /api/frame/browser  — accepts JPEG body, stores in memory
 * GET  /api/frame/browser   — returns latest JPEG frame (TD polls this)
 *
 * Single-frame buffer: only the most recent frame is kept.
 * TD's Web Client DAT can poll this at 10-15fps to get the browser camera feed.
 */

// Force dynamic — this route uses in-memory state
export const dynamic = 'force-dynamic';

let latestFrame: Uint8Array | null = null;
let lastUpdated = 0;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let frameData: Uint8Array;

    if (contentType.includes('application/json')) {
      // Base64-encoded JSON payload: { frame: "base64...", format: "jpeg" }
      const json = await request.json();
      if (json.frame) {
        // Decode base64 to Uint8Array
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
      // Raw binary (image/jpeg, application/octet-stream, etc.)
      const arrayBuffer = await request.arrayBuffer();
      frameData = new Uint8Array(arrayBuffer);
    }

    if (frameData.length < 100) {
      return new Response(JSON.stringify({ error: 'Frame too small' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    latestFrame = frameData;
    lastUpdated = Date.now();

    return new Response(JSON.stringify({ ok: true, size: frameData.length, timestamp: lastUpdated }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

export async function GET() {
  if (!latestFrame) {
    return new Response(JSON.stringify({ error: 'No frame available', hint: 'Open /camera to start streaming' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const age = Date.now() - lastUpdated;

  return new Response(latestFrame.buffer.slice(latestFrame.byteOffset, latestFrame.byteOffset + latestFrame.byteLength) as ArrayBuffer, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Frame-Age-Ms': String(age),
      'X-Frame-Timestamp': String(lastUpdated),
    },
  });
}
