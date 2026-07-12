// Record a Chrome performance trace from a Cast receiver (or any Chrome) over the
// DevTools Protocol — no GUI, no npm deps (Node 21+ has built-in fetch + WebSocket).
//
//   node tools/cast_trace.mjs 192.168.1.248:9222 8
//     arg1 = <ip:port> of the receiver's remote-debugging endpoint
//     arg2 = seconds to record (default 8) — keep the app animating during this window
//
// Writes trace.json in the cwd. Load it in desktop Chrome DevTools:
//   F12 → Performance tab → "Load profile…" (up-arrow icon) → trace.json
// (works even if the live inspect window is blank — that's a version mismatch, not the data).
import { writeFileSync } from 'node:fs';

const [addr = '192.168.1.248:9222', secs = '8'] = process.argv.slice(2);
const DUR = Number(secs) * 1000;
const base = `http://${addr}`;

// Chrome remote-debugging rejects a *hostname* Host header (DNS-rebind guard) but allows an IP.
// Some builds still prefer localhost — try direct, then fall back.
async function targets() {
  for (const headers of [ {}, { Host: 'localhost' } ]) {
    try {
      const r = await fetch(`${base}/json/list`, { headers });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) return j; }
    } catch {}
  }
  throw new Error(`no inspectable targets at ${base}/json/list — is the receiver running?`);
}

const list = await targets();
const page = list.find(t => t.type === 'page' && /receiver|hangman|\.html/i.test(t.url || '')) ||
             list.find(t => t.type === 'page') || list[0];
console.error(`target: ${page.title || '(untitled)'}  ${page.url || ''}`);
const wsUrl = page.webSocketDebuggerUrl;
if (!wsUrl) throw new Error('target has no webSocketDebuggerUrl');

const ws = new WebSocket(wsUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise(res => pending.set(i, res)); };

const events = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  else if (m.method === 'Tracing.dataCollected') events.push(...m.value ?? m.params?.value ?? []);
  else if (m.method === 'Tracing.tracingComplete') finish();
});

function finish() {
  writeFileSync('trace.json', JSON.stringify({ traceEvents: events }));
  console.error(`\nwrote trace.json — ${events.length} events. Load it in DevTools → Performance → Load profile.`);
  ws.close(); process.exit(0);
}

ws.addEventListener('open', async () => {
  // rendering-focused categories: JS call tree, style/layout/paint/composite, frames, gpu
  const cats = [
    'devtools.timeline', 'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline.stack',
    'blink', 'blink.user_timing', 'cc', 'gpu', 'v8', 'v8.execute',
    'disabled-by-default-v8.cpu_profiler', 'latencyInfo', 'loading', 'rail',
  ];
  await send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: cats },
  });
  console.error(`recording ${secs}s … keep the character animating on the TV now`);
  setTimeout(() => send('Tracing.end'), DUR);
});
ws.addEventListener('error', e => { console.error('ws error:', e.message || e); process.exit(1); });
