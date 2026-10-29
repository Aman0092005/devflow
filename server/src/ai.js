export class AiError extends Error {
  constructor(status) { 
    super(`Gemini API responded ${status}`); 
    this.aiStatus = status; 
  }
}

export const aiConfigured = () => !!process.env.GEMINI_API_KEY;

// Updated to use current stable free tier models.
// Added 0 to MOVE_ON to catch timeouts and network drops so fallbacks trigger.
const DEFAULT_MODELS = 'gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.6-flash';
const MOVE_ON = [0, 404, 429, 503];

// Helper to prevent hitting the next model instantly during a rate limit flood
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(model, { system, messages, json }) {
  const ctrl = new AbortController();
  // Lowered timeout to 10 seconds so your app fails over quickly rather than hanging the server
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 4096, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
  } catch {
    throw new AiError(0); // network failure or timeout
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AiError(res.status);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new AiError(422); // blocked or empty answer
  return text;
}

export async function askAI(options) {
  const models = (process.env.GEMINI_MODEL || DEFAULT_MODELS).split(',').map((m) => m.trim()).filter(Boolean);
  let last;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      return await callModel(model, options);
    } catch (e) {
      if (!(e instanceof AiError) || !MOVE_ON.includes(e.aiStatus)) throw e;
      console.warn(`Gemini model "${model}" unavailable (${e.aiStatus}).`);
      last = e;

      // Introduce a 1-second delay before checking the next fallback 
      // if the error was a rate limit (429) or overload (503)
      if ((e.aiStatus === 429 || e.aiStatus === 503) && i < models.length - 1) {
        await sleep(1000);
      }
    }
  }
  throw last;
}

export function sendAiError(res, e, next) {
  if (!(e instanceof AiError)) return next(e);
  const map = {
    0: [504, 'Gemini took too long to respond. The request timed out.'],
    400: [502, 'Gemini rejected the request. Check GEMINI_API_KEY and GEMINI_MODEL in server/.env.'],
    403: [502, 'Google denied access. Check that the key is valid and your Google account is verified.'],
    404: [502, 'Gemini couldn’t find the configured model. Update GEMINI_MODEL to a current string like gemini-3.8-flash.'],
    422: [502, 'Gemini didn’t return an answer (it may have been blocked). Try rephrasing.'],
    429: [429, 'The free-tier limit was reached. Wait a minute and try again.'],
    503: [502, 'Gemini is overloaded right now. Try again in a moment.'],
  };
  const [status, error] = map[e.aiStatus] || [502, 'The AI service didn’t respond properly. Try again in a moment.'];
  res.status(status).json({ error });
}
