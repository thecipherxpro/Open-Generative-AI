import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const base = (process.env.COMFYUI_URL || '').replace(/\/$/, '');
  if (!base) return NextResponse.json({ ok: false, configured: false }, { status: 503 });

  try {
    const response = await fetch(`${base}/system_stats`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, configured: true, reachable: false }, { status: 502 });
    }
    const stats = await response.json();
    return NextResponse.json({
      ok: true,
      configured: true,
      reachable: true,
      checkpoint: process.env.COMFYUI_CHECKPOINT || 'sd_xl_base_1.0.safetensors',
      device: stats?.devices?.[0]?.name || stats?.system?.os || 'ComfyUI'
    });
  } catch {
    return NextResponse.json({ ok: false, configured: true, reachable: false }, { status: 502 });
  }
}
