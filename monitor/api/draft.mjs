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
    const model = (process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest').replace(/^models\//, '');
    const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Write only a short Headcount neighborhood check-in draft, at most 400 characters. Begin with "SIMULATION — Headcount:". This is a synthetic disaster exercise. Ask the recipient to reply OK or HELP. Never claim anyone is injured, that help is dispatched or on the way, give evacuation orders, invent locations or tell people to contact emergency services. If no event is active, describe it as a routine test check-in. This draft will be reviewed by a human before any sending.' }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ active, hazards: active ? hazards : [] }) }] }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.2 },
      }),
    });
    if (!result.ok) {
      const problem = await result.json().catch(() => null);
      const detail = typeof problem?.error?.message === 'string'
        ? problem.error.message.split(key).join('[redacted]').slice(0, 500) : '';
      const hint = result.status === 404
        ? 'Set GEMINI_MODEL to gemini-flash-latest or a generateContent model available to your project, then redeploy.'
        : result.status === 503
          ? 'Gemini is busy or temporarily unavailable. Wait and retry, or set another available GEMINI_MODEL.'
          : result.status === 429
            ? 'Gemini rate limit or quota reached. Check project quota before retrying.'
            : 'Check the server API key, model access and quota.';
      return res.status(502).json({ error: `Gemini request failed (${result.status}, model ${model}). ${hint}${detail ? ` Google: ${detail}` : ''}` });
    }
    const data = await result.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    if (!text || text.length > 600 || !text.startsWith('SIMULATION')) {
      return res.status(502).json({ error: 'Gemini did not return a usable simulation draft. Try again.' });
    }
    return res.status(200).json({ text, source: 'model' });
  } catch (error) {
    const code = error?.cause?.code || error?.code;
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    // Log only transport metadata, never credentials, request headers or message content.
    console.error('Gemini draft transport error', { name: error?.name, code });
    return res.status(timedOut ? 504 : 502).json({ error: timedOut
      ? 'Gemini took longer than 45 seconds. Try again or choose another available GEMINI_MODEL.'
      : `Gemini connection failed${typeof code === 'string' ? ` (${code.replace(/[^A-Z0-9_]/gi, '').slice(0, 60)})` : ''}. Check the Vercel function logs for the transport error.` });
  }
}
