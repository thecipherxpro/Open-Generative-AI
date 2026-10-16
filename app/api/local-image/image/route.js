import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function comfyBase() {
  return (process.env.COMFYUI_URL || '').replace(/\/$/, '');
}

export async function GET(request) {
  const base = comfyBase();
  if (!base) return NextResponse.json({ error: 'Local AI is not configured.' }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename') || '';
  const subfolder = searchParams.get('subfolder') || '';
  const type = searchParams.get('type') || 'output';

  if (!filename || filename.includes('..') || subfolder.includes('..')) {
    return NextResponse.json({ error: 'Invalid image path.' }, { status: 400 });
  }

  const query = new URLSearchParams({ filename, subfolder, type });
  try {
    const response = await fetch(`${base}/view?${query.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });

    const contentType = response.headers.get('content-type') || 'image/png';
    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'private, max-age=3600',
        'content-disposition': `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`
      }
    });
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve generated image.' }, { status: 502 });
  }
}
