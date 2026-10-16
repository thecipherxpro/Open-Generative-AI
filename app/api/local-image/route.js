import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = Number(process.env.LOCAL_AI_RATE_LIMIT || 10);
const buckets = globalThis.__cipherxLocalAiBuckets || new Map();
globalThis.__cipherxLocalAiBuckets = buckets;

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim();
}

function checkRateLimit(ip) {
  const now = Date.now();
  const current = buckets.get(ip);
  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    buckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function comfyBase() {
  return (process.env.COMFYUI_URL || '').replace(/\/$/, '');
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildWorkflow({ prompt, negativePrompt, width, height, steps, cfg, seed }) {
  const checkpoint = process.env.COMFYUI_CHECKPOINT || 'sd_xl_base_1.0.safetensors';
  const prefix = process.env.COMFYUI_OUTPUT_PREFIX || 'tatpc-ai';

  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0]
      }
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint }
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 }
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['4', 1] }
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negativePrompt || '', clip: ['4', 1] }
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] }
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: prefix, images: ['8', 0] }
    }
  };
}

async function waitForResult(base, promptId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/history/${encodeURIComponent(promptId)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000)
    });
    if (response.ok) {
      const history = await response.json();
      const job = history?.[promptId];
      if (job?.outputs) {
        for (const output of Object.values(job.outputs)) {
          const image = output?.images?.[0];
          if (image?.filename) return image;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error('Generation timed out while waiting for ComfyUI.');
}

export async function POST(request) {
  const base = comfyBase();
  if (!base) {
    return NextResponse.json({ error: 'Local AI is not configured. Set COMFYUI_URL on the server.' }, { status: 503 });
  }

  if (!checkRateLimit(clientIp(request))) {
    return NextResponse.json({ error: 'Too many image requests. Please wait a few minutes and try again.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  const prompt = String(body?.prompt || '').trim();
  if (!prompt || prompt.length > 3000) {
    return NextResponse.json({ error: 'Prompt is required and must be 3000 characters or fewer.' }, { status: 400 });
  }

  const negativePrompt = String(body?.negativePrompt || '').slice(0, 2000);
  const width = Math.round(clampInt(body?.width, 1024, 512, 1536) / 64) * 64;
  const height = Math.round(clampInt(body?.height, 1024, 512, 1536) / 64) * 64;
  const steps = clampInt(body?.steps, 28, 5, 60);
  const cfg = clampFloat(body?.cfg, 7, 1, 20);
  const seed = Number.isFinite(Number(body?.seed)) && Number(body.seed) >= 0
    ? Math.floor(Number(body.seed))
    : crypto.randomInt(0, 2_147_483_647);

  const workflow = buildWorkflow({ prompt, negativePrompt, width, height, steps, cfg, seed });
  const clientId = crypto.randomUUID();

  try {
    const submit = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: AbortSignal.timeout(20_000)
    });

    if (!submit.ok) {
      const detail = (await submit.text()).slice(0, 1000);
      return NextResponse.json({ error: 'ComfyUI rejected the workflow.', detail }, { status: 502 });
    }

    const submitted = await submit.json();
    const promptId = submitted?.prompt_id;
    if (!promptId) {
      return NextResponse.json({ error: 'ComfyUI did not return a prompt_id.' }, { status: 502 });
    }

    const image = await waitForResult(base, promptId, clampInt(process.env.LOCAL_AI_TIMEOUT_MS, 240000, 30000, 300000));
    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder || '',
      type: image.type || 'output'
    });

    return NextResponse.json({
      ok: true,
      promptId,
      seed,
      imageUrl: `/api/local-image/image?${query.toString()}`
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Local image generation failed.' }, { status: 502 });
  }
}
