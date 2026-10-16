'use client';

import { useEffect, useState } from 'react';

export default function LocalImagePage() {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(28);
  const [cfg, setCfg] = useState(7);
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [resultSeed, setResultSeed] = useState(null);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/local-image/health', { cache: 'no-store' })
      .then(async (r) => ({ status: r.status, data: await r.json() }))
      .then(({ data }) => setHealth(data))
      .catch(() => setHealth({ ok: false }));
  }, []);

  async function generate(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setImageUrl('');
    try {
      const response = await fetch('/api/local-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negativePrompt,
          width,
          height,
          steps,
          cfg,
          seed: seed === '' ? undefined : Number(seed)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail || data?.error || 'Generation failed.');
      setImageUrl(data.imageUrl);
      setResultSeed(data.seed);
    } catch (err) {
      setError(err.message || 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }

  const online = health?.ok === true;

  return (
    <main style={{ minHeight: '100vh', background: '#080b10', color: '#eef2f7', padding: '40px 20px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#6ee7b7', fontWeight: 700, letterSpacing: '.08em', fontSize: 12 }}>TATPC AI • SELF-HOSTED</p>
            <h1 style={{ margin: '7px 0 4px', fontSize: 34 }}>Local Image Studio</h1>
            <p style={{ margin: 0, color: '#98a2b3' }}>Generate with your own ComfyUI GPU backend. No per-image API charge.</p>
          </div>
          <div style={{ padding: '8px 12px', borderRadius: 999, background: online ? '#0d2b22' : '#2b1515', color: online ? '#6ee7b7' : '#fca5a5', border: `1px solid ${online ? '#1d5a47' : '#663232'}` }}>
            {health === null ? 'Checking local AI…' : online ? `Online • ${health.checkpoint || 'ComfyUI'}` : 'Local AI offline'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: 24 }} className="local-ai-grid">
          <form onSubmit={generate} style={{ background: '#0f141c', border: '1px solid #202938', borderRadius: 18, padding: 20 }}>
            <label style={labelStyle}>Prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required maxLength={3000} rows={8} placeholder="Describe the image you want…" style={inputStyle} />

            <label style={labelStyle}>Negative prompt</label>
            <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={3} placeholder="blurry, low quality…" style={inputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Width" value={width} onChange={setWidth} min={512} max={1536} step={64} />
              <Field label="Height" value={height} onChange={setHeight} min={512} max={1536} step={64} />
              <Field label="Steps" value={steps} onChange={setSteps} min={5} max={60} step={1} />
              <Field label="CFG" value={cfg} onChange={setCfg} min={1} max={20} step={0.5} />
            </div>

            <label style={labelStyle}>Seed <span style={{ color: '#667085', fontWeight: 400 }}>(blank = random)</span></label>
            <input type="number" min="0" value={seed} onChange={(e) => setSeed(e.target.value)} style={inputStyle} />

            <button type="submit" disabled={loading || !online} style={{ width: '100%', marginTop: 16, border: 0, borderRadius: 12, padding: '13px 16px', fontWeight: 800, cursor: loading || !online ? 'not-allowed' : 'pointer', background: loading || !online ? '#28313f' : '#10b981', color: '#07120f' }}>
              {loading ? 'Generating…' : 'Generate locally'}
            </button>

            {error && <div style={{ marginTop: 14, borderRadius: 10, padding: 12, color: '#fecaca', background: '#321717', border: '1px solid #682a2a', whiteSpace: 'pre-wrap' }}>{error}</div>}
          </form>

          <section style={{ minHeight: 590, background: '#0f141c', border: '1px solid #202938', borderRadius: 18, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {imageUrl ? (
              <div style={{ width: '100%' }}>
                <img src={imageUrl} alt="Generated result" style={{ display: 'block', maxWidth: '100%', maxHeight: '74vh', margin: '0 auto', borderRadius: 14, objectFit: 'contain' }} />
                <div style={{ marginTop: 12, color: '#98a2b3', fontSize: 13, textAlign: 'center' }}>Seed: {resultSeed}</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#667085' }}>
                <div style={{ fontSize: 52, marginBottom: 8 }}>✦</div>
                <div>Your generated image will appear here.</div>
              </div>
            )}
          </section>
        </div>
      </div>
      <style jsx global>{`
        @media (max-width: 820px) {
          .local-ai-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

function Field({ label, value, onChange, min, max, step }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle} />
    </div>
  );
}

const labelStyle = { display: 'block', margin: '14px 0 7px', fontSize: 13, fontWeight: 700, color: '#cbd5e1' };
const inputStyle = { width: '100%', boxSizing: 'border-box', borderRadius: 11, padding: '11px 12px', border: '1px solid #2b3545', background: '#090d13', color: '#eef2f7', outline: 'none', resize: 'vertical' };
