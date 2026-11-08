// Vercel Node function. Drafts only: no Photon credentials or messaging calls.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST to draft a message.' });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'Add GEMINI_API_KEY to Vercel environment variables and redeploy. Keep it server-side; do not use a VITE_ prefix.' });
  let input;
  try {
    input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid draft request.' });
  }
  // Only accept bounded event flags, never arbitrary prompts or household details.
  const active = input?.active === true;
  const hazards = [...new Set((Array.isArray(input?.hazards) ? input.hazards.slice(0, 10) : [])
    .filter((kind) => ['quake', 'fire'].includes(kind)))];
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Write only a short Headcount neighborhood check-in draft, at most 400 characters. Begin with "SIMULATION — Headcount:". This is a synthetic disaster exercise. Ask the recipient to reply OK or HELP. Never claim anyone is injured, that help is dispatched or on the way, give evacuation orders, invent locations or tell people to contact emergency services. If no event is active, describe it as a routine test check-in. This draft will be reviewed by a human before any sending.' }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ active, hazards: active ? hazards : [] }) }] }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.2 },
      }),
    });
    if (!result.ok) return res.status(502).json({ error: `Gemini request failed (${result.status}). Check the server API key, model access and quota.` });
    const data = await result.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    if (!text || text.length > 600 || !text.startsWith('SIMULATION')) {
      return res.status(502).json({ error: 'Gemini did not return a usable simulation draft. Try again.' });
    }
    return res.status(200).json({ text, source: 'model' });
  } catch {
    return res.status(502).json({ error: 'Gemini could not be reached or timed out. Try again.' });
  }
}
