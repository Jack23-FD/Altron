import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {existsSync} from 'node:fs';
import {mkdtemp, writeFile, unlink, rmdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const PROJECT = 'jack-speaksmart-ai-2026';
const MODEL = process.env.JACK_MODEL || 'qwen3:1.7b';
const PORT = Number(process.env.JACK_BRIDGE_PORT || 8765);
const OLLAMA = 'http://127.0.0.1:11434';
const SPEECH_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'speech');
const SPEECH_PYTHON = path.join(SPEECH_ROOT, '.venv', 'Scripts', 'python.exe');
const AUDIO_TYPES = new Map([['audio/webm', '.webm'], ['audio/mp4', '.m4a'],
  ['audio/ogg', '.ogg'], ['audio/wav', '.wav']]);
const MAX_AUDIO_BYTES = 1_500_000;
const execFileAsync = promisify(execFile);
const ORIGINS = new Set([
  'https://jack-speaksmart-ai-2026.web.app',
  'https://jack-speaksmart-ai-2026.firebaseapp.com',
  ...(process.env.JACK_EXTRA_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean),
]);
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certs = null, certExpiry = 0;

function send(res, code, data, origin) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
    ...(code === 429 ? {'Retry-After': '60'} : {}),
    ...(ORIGINS.has(origin) ? {'Access-Control-Allow-Origin': origin} : {}),
  });
  res.end(body);
}

function parsePart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function signingCerts() {
  if (certs && Date.now() < certExpiry) return certs;
  const response = await fetch(CERT_URL, {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error('Google signing keys unavailable');
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('Invalid signing keys');
  const match = response.headers.get('cache-control')?.match(/max-age=(\d+)/);
  const seconds = Math.min(Number(match?.[1] || 300), 3600);
  certs = data;
  certExpiry = Date.now() + Math.max(seconds, 60) * 1000;
  return certs;
}

export async function verifyFirebaseToken(token, getCerts = signingCerts) {
  if (typeof token !== 'string' || token.length > 8192) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const header = parsePart(parts[0]);
  const claims = parsePart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid || typeof header.kid !== 'string') throw new Error('Invalid token header');
  const keys = await getCerts();
  const cert = keys[header.kid];
  if (!cert || !crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), cert,
      Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid token signature');
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== PROJECT || claims.iss !== `https://securetoken.google.com/${PROJECT}` ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      !Number.isInteger(claims.exp) || claims.exp <= now ||
      !Number.isInteger(claims.iat) || claims.iat > now ||
      !Number.isInteger(claims.auth_time) || claims.auth_time > now ||
      claims.firebase?.sign_in_provider !== 'google.com' || claims.email_verified !== true) {
    throw new Error('Invalid token claims');
  }
  return claims.sub;
}

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16000) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readAudio(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_AUDIO_BYTES) throw new Error('Audio too large');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_AUDIO_BYTES) throw new Error('Audio too large');
    chunks.push(chunk);
  }
  if (bytes < 1000) throw new Error('Audio too short');
  return Buffer.concat(chunks);
}

export async function transcribeLocalAudio(audio, mime, language = 'en') {
  if (!existsSync(SPEECH_PYTHON)) throw new Error('Voice setup is missing');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'jack-audio-'));
  const file = path.join(folder, `speech${AUDIO_TYPES.get(mime)}`);
  try {
    await writeFile(file, audio);
    const {stdout} = await execFileAsync(SPEECH_PYTHON,
      [path.join(SPEECH_ROOT, 'transcribe.py'), file, language],
      {timeout: 90000, maxBuffer: 32000, windowsHide: true});
    const result = JSON.parse(stdout);
    return typeof result.text === 'string' ? result.text.trim().slice(0, 1200) : '';
  } finally {
    await unlink(file).catch(() => {});
    await rmdir(folder).catch(() => {});
  }
}

function validMessages(messages) {
  return Array.isArray(messages) && messages.length >= 2 && messages.length <= 10 &&
    messages[0]?.role === 'system' && messages.at(-1)?.role === 'user' &&
    messages.every((m, i) => m && (i === 0 ? m.role === 'system' : ['user', 'assistant'].includes(m.role)) &&
      typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 2000);
}

export function sanitizeTutorFeedback(content, original) {
  let result;
  try { result = JSON.parse(content); } catch { return content; }
  if (!result || typeof result !== 'object') return content;
  const tokens = text => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
  const correction = typeof result.correction === 'string' && typeof result.reply === 'string';
  const grammar = typeof result.corrected === 'string' && typeof result.explanation === 'string';
  if (!correction && !grammar) return content;
  const key = correction ? 'correction' : 'corrected';
  const before = tokens(original), after = tokens(result[key]);
  const shared = [...new Set(before)].filter(word => after.includes(word)).length;
  const pronouns = new Set(['i', 'you', 'he', 'she', 'we', 'they', 'it']);
  const subjectChanged = before.some(word => pronouns.has(word) && !after.includes(word));
  const tooDifferent = !before.length || !after.length ||
    subjectChanged || (before.length === 1 && after.length !== 1) ||
    shared / new Set(before).size < (before.length === 2 ? 0.5 : 0.6) ||
    after.length > Math.max(before.length + 2, Math.ceil(before.length * 1.5));
  if (correction && (tooDifferent || before.join(' ') === after.join(' '))) {
    result.correction = ''; result.explanation = '';
  } else if (grammar && tooDifferent) {
    result.corrected = original;
    result.explanation = 'Jack could not safely correct this sentence. Try a shorter sentence.';
  } else if (grammar && before.join(' ') === after.join(' ')) {
    result.explanation = 'Your sentence is already clear.';
  } else if (typeof result.explanation === 'string') {
    const changes = before.map((word, i) => [word, after[i]]).filter(([old, now]) => old !== now);
    if (before.length === after.length && changes.length === 1) {
      const [old, now] = changes[0];
      const past = {go:'went',eat:'ate',see:'saw',buy:'bought',do:'did',have:'had',is:'was',are:'were'};
      if (past[old] === now) result.explanation = `Use “${now}”, the past tense of “${old}”, for a finished action.`;
      else if (now === old + 's' || now === old + 'es') result.explanation = `Use “${now}” with this subject in the present tense.`;
    }
    if (/already (correct|natural)|no (grammar )?mistake/i.test(result.explanation)) {
      result.explanation = 'This version changes the wording to make the sentence clearer.';
    }
  }
  return JSON.stringify(result);
}

export function makeServer({verifyToken = verifyFirebaseToken, ollamaFetch = fetch,
  transcribeAudio = transcribeLocalAudio} = {}) {
  const perUser = new Map(), globalCalls = [];
  let activeChat = 0, activeVoice = 0;
  function limitReason(uid, kind) {
    const now = Date.now();
    const recent = (perUser.get(uid) || []).filter(t => now - t < 60000);
    while (globalCalls.length && now - globalCalls[0] >= 3600000) globalCalls.shift();
    if (recent.length >= 20) return 'You have made many practice requests. Wait a minute and try again.';
    if (globalCalls.length >= 300) return 'Jack has reached the shared hourly limit. Try again later.';
    if ((kind === 'voice' && activeVoice >= 1) || (kind === 'chat' && activeChat >= 2)) {
      return 'Jack is finishing another request. Try again in a moment.';
    }
    recent.push(now);
    perUser.set(uid, recent);
    globalCalls.push(now);
    return '';
  }
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    if (req.url === '/health' && req.method === 'GET') return send(res, 200, {ok: true}, origin);
    if (!ORIGINS.has(origin)) return send(res, 403, {error: 'Origin not allowed'}, origin);
    if (req.method === 'OPTIONS' && ['/api/chat', '/api/status', '/api/transcribe'].includes(req.url)) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Speech-Language',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin',
      });
      return res.end();
    }
    if (!((req.url === '/api/status' && req.method === 'GET') ||
          (['/api/chat', '/api/transcribe'].includes(req.url) && req.method === 'POST'))) {
      return send(res, 404, {error: 'Not found'}, origin);
    }
    const bearer = req.headers.authorization || '';
    if (!bearer.startsWith('Bearer ')) return send(res, 401, {error: 'Google sign-in required'}, origin);
    let uid;
    try { uid = await verifyToken(bearer.slice(7)); }
    catch { return send(res, 401, {error: 'Google sign-in expired. Please sign in again.'}, origin); }
    try {
      if (req.url === '/api/status') {
        const response = await ollamaFetch(`${OLLAMA}/api/tags`, {signal: AbortSignal.timeout(4000)});
        if (!response.ok) throw new Error('Ollama unavailable');
        const data = await response.json();
        return send(res, 200, {ready: (data.models || []).some(m => m.name === MODEL),
          voiceReady: existsSync(SPEECH_PYTHON) && existsSync(path.join(SPEECH_ROOT, '.voice-ready-base')),
          model: MODEL}, origin);
      }
      const reason = limitReason(uid, req.url === '/api/transcribe' ? 'voice' : 'chat');
      if (reason) return send(res, 429, {error: reason}, origin);
      if (req.url === '/api/transcribe') {
        const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const language = req.headers['x-speech-language'] || 'en';
        if (!AUDIO_TYPES.has(mime)) return send(res, 415, {error: 'This browser audio format is not supported.'}, origin);
        if (!['en', 'ta'].includes(language)) return send(res, 400, {error: 'Choose English or Tamil speech.'}, origin);
        let audio;
        try { audio = await readAudio(req); }
        catch (error) { return send(res, error.message === 'Audio too large' ? 413 : 400, {error: error.message}, origin); }
        activeVoice++;
        try {
          const transcript = await transcribeAudio(audio, mime, language);
          if (!transcript) return send(res, 422, {error: 'No clear speech was heard. Try again in a quiet place.'}, origin);
          return send(res, 200, {text: transcript, language}, origin);
        } finally { activeVoice--; }
      }
      const input = await readJson(req);
      if (!validMessages(input.messages)) return send(res, 400, {error: 'Invalid chat request'}, origin);
      activeChat++;
      try {
        const response = await ollamaFetch(`${OLLAMA}/api/chat`, {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({model: MODEL, messages: input.messages, format: 'json', stream: false,
            think: false, options: {temperature: 0.3, num_predict: 350}}),
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
        const data = await response.json();
        if (typeof data.message?.content !== 'string' || data.message.content.length > 10000) {
          throw new Error('Invalid Ollama response');
        }
        return send(res, 200, {message: {content: sanitizeTutorFeedback(
          data.message.content, input.messages.at(-1).content)}}, origin);
      } finally { activeChat--; }
    } catch (error) {
      if (req.url === '/api/transcribe') {
        const detail = String(error?.stderr || error?.message || error).slice(0, 700);
        console.error('Voice transcription failed:', detail);
        const timedOut = /timed out|ETIMEDOUT/i.test(detail);
        const unreadable = /Invalid data found|Error opening input|Invalid argument|could not open/i.test(detail);
        const message = timedOut
          ? 'Voice transcription timed out. Record one short sentence and try again.'
          : unreadable
            ? 'This recording could not be read. Try a short recording in Chrome or Edge.'
            : 'The laptop voice model failed. Run setup_voice.bat on the laptop, then try again.';
        return send(res, 503, {error: message}, origin);
      }
      return send(res, 503, {error: error.message === 'Request too large' ? error.message : 'Laptop AI is unavailable. Try again later.'}, origin);
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  makeServer().listen(PORT, '127.0.0.1', () => console.log(`Jack bridge ready on 127.0.0.1:${PORT}`));
}
