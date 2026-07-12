// Serve a LOCAL rig.js to a LIVE Cast receiver over DevTools, without deploying — Option A:
// enable Fetch interception, reload the page, and fulfill the rig.js request from a working-tree file.
// Lets you A/B a rig change on the actual Chromecast before merging. The swap is ephemeral: the next
// relaunch reverts to the deployed file. No npm deps (Node 21+ has fetch + WebSocket).
//
//   node tools/cast_serve.mjs <ip:port> [file] [traceSecs]
//     ip:port    DevTools endpoint that serves /json/list (e.g. localhost:9222 after
//                `adb forward tcp:9222 localabstract:chrome_devtools_remote`, or 192.168.1.248:9222
//                if the TV exposes it directly). NOTE: 5555 is the ADB port, not DevTools.
//     file       rig.js to serve (default: rig/rig.js next to this tool)
//     traceSecs  if >0, record a perf trace for N s after the swap and write trace.json
//
// Flow: attach -> Fetch.enable(pattern=*/rig/rig.js*) -> Page.reload(ignoreCache) -> fulfill the
// re-request with `file` (a marker is appended so we can confirm the patched build loaded).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const [addr = 'localhost:9222', fileArg, secsArg = '0'] = process.argv.slice(2);
const FILE = resolve(fileArg || `${here}/../rig.js`);
const TRACE = Number(secsArg) * 1000;
const base = `http://${addr}`;
const MARKER = 'cast_serve-' + Date.now();

// Chrome remote-debugging rejects a hostname Host header (DNS-rebind guard) but allows an IP / localhost.
async function targets() {
  for (const headers of [{}, { Host: 'localhost' }]) {
    try {
      const r = await fetch(`${base}/json/list`, { headers });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) return j; }
    } catch {}
  }
  throw new Error(`no inspectable targets at ${base}/json/list — is DevTools reachable at ${addr}?`);
}

const list = await targets();
const page = list.find(t => t.type === 'page' && /receiver|hangman|\.html/i.test(t.url || '')) ||
             list.find(t => t.type === 'page') || list[0];
console.error(`target: ${page.title || '(untitled)'}  ${page.url || ''}`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise(res => pending.set(i, res)); };

// the file to serve, plus a marker global so we can prove the patched build is the one that ran
const body = readFileSync(FILE, 'utf8') + `\n;window.__rigBuild=${JSON.stringify(MARKER)};`;
const b64 = Buffer.from(body).toString('base64');
let served = 0;

ws.addEventListener('message', async ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params;
    if (/\/rig\/rig\.js(\?|$)/.test(request.url)) {
      served++;
      console.error(`  ↳ intercepted ${request.url} — serving ${FILE} (${body.length} bytes)`);
      await send('Fetch.fulfillRequest', {
        requestId, responseCode: 200,
        responseHeaders: [
          { name: 'content-type', value: 'application/javascript; charset=utf-8' },
          { name: 'cache-control', value: 'no-store' },
        ],
        body: b64,
      });
    } else {
      await send('Fetch.continueRequest', { requestId });   // let everything else through untouched
    }
  }
});

ws.addEventListener('open', async () => {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/rig/rig.js*' }] });
  console.error(`serving ${FILE}\nreloading receiver …`);
  await send('Page.reload', { ignoreCache: true });

  // give the page time to re-fetch + boot the rig, then confirm the patched build loaded
  await new Promise(r => setTimeout(r, 3500));
  const { result } = await send('Runtime.evaluate', { expression: 'window.__rigBuild || null', returnByValue: true });
  if (result.value === MARKER) console.error(`✓ patched rig.js is live (build ${MARKER}, ${served} fetch hit${served === 1 ? '' : 's'})`);
  else console.error(`⚠ could not confirm patched build (window.__rigBuild=${JSON.stringify(result.value)}, served=${served}). ` +
                     `The page may not have re-requested rig.js — check the receiver reloaded.`);

  if (TRACE > 0) {
    const cats = ['devtools.timeline', 'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline.stack',
      'blink', 'cc', 'gpu', 'v8', 'v8.execute', 'disabled-by-default-v8.cpu_profiler', 'latencyInfo'];
    const events = [];
    const onData = ev => { const m = JSON.parse(ev.data);
      if (m.method === 'Tracing.dataCollected') events.push(...(m.value ?? m.params?.value ?? []));
      else if (m.method === 'Tracing.tracingComplete') {
        writeFileSync('trace.json', JSON.stringify({ traceEvents: events }));
        console.error(`\nwrote trace.json — ${events.length} events`); ws.close(); process.exit(0); } };
    ws.addEventListener('message', onData);
    await send('Tracing.start', { transferMode: 'ReportEvents',
      traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: cats } });
    console.error(`recording ${secsArg}s … keep the character animating on the TV now`);
    setTimeout(() => send('Tracing.end'), TRACE);
  } else {
    console.error(`\nswap done. Leaving interception active (Ctrl-C to detach; the loaded rig stays until relaunch).`);
  }
});
ws.addEventListener('error', e => { console.error('ws error:', e.message || e); process.exit(1); });
process.on('SIGINT', async () => { try { await send('Fetch.disable'); } catch {} ws.close(); process.exit(0); });
