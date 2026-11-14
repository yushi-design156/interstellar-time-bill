#!/usr/bin/env node
/* 星际穿越时间账单 · 本地服务
 * 干三件事：
 *  1) 静态托管作品（并把本机 IP 打出来，手机连同一个 Wi-Fi 就能看）
 *  2) /api/ops    真实探测 Ollama / Dify / Xinference，给作战台用
 *  3) /api/narrate 调本地模型写旁白，每次调用都记账，作战台能看到
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent.jsonl');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ── 调用账本 ── */
const ring = [];
async function logEvent(what, detail = '', meta = '') {
  const entry = { t: new Date().toISOString(), what, detail, meta };
  ring.unshift(entry);
  if (ring.length > 200) ring.pop();
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {}
  return entry;
}

async function readLogTail(n = 60) {
  try {
    const txt = await fs.readFile(LOG_FILE, 'utf8');
    return txt.trim().split('\n').filter(Boolean).slice(-n).reverse()
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return ring.slice(0, n); }
}

/* ── 探测 ── */
async function probe(url, ms = 1500) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    const txt = await r.text();
    return { up: r.ok || r.status === 307, status: r.status, body: txt };
  } catch (e) {
    return { up: false, status: 0, error: String(e.message || e) };
  } finally { clearTimeout(timer); }
}

let dockerCache = { at: 0, count: null };
function dockerCount() {
  if (Date.now() - dockerCache.at < 20000) return Promise.resolve(dockerCache.count);
  return new Promise((res) => {
    exec('docker ps --format "{{.Names}}" 2>/dev/null', { timeout: 4000 }, (err, out) => {
      const n = err ? null : out.trim().split('\n').filter(Boolean).length;
      dockerCache = { at: Date.now(), count: n };
      res(n);
    });
  });
}

async function buildOps() {
  const [ollama, dify, xin] = await Promise.all([
    probe('http://127.0.0.1:11434/api/tags'),
    probe('http://127.0.0.1:80/', 1200),
    probe('http://127.0.0.1:9997/v1/models', 1200),
  ]);

  const out = {};

  out.ollama = { up: ollama.up };
  if (ollama.up) {
    try { out.ollama.models = JSON.parse(ollama.body).models.map((m) => m.name); } catch { out.ollama.models = []; }
    const ps = await probe('http://127.0.0.1:11434/api/ps');
    if (ps.up) { try { out.ollama.loaded = JSON.parse(ps.body).models.map((m) => m.name); } catch {} }
  } else {
    out.ollama.note = '没应答。跑 `ollama serve`。';
  }

  out.dify = { up: dify.up, containers: null };
  if (dify.up) {
    out.dify.containers = await dockerCount();
    out.dify.note = dify.status === 307 ? '307 → 首次要去 /install 建管理员账号' : '';
  } else {
    out.dify.note = '没应答。`cd ~/dify/docker && docker compose up -d`。';
  }

  out.xinference = { up: xin.up };
  if (xin.up) {
    try { out.xinference.models = (JSON.parse(xin.body).data || []).map((m) => m.id); } catch {}
  } else {
    out.xinference.note = '没启动。装完用 `~/.xinference-venv/bin/xinference-local --port 9997`。';
  }

  out.hermes = { up: true, note: '总调度：写代码、验物理、搭服务' };
  out.log = await readLogTail(50);
  return out;
}

/* ── 旁白 ── */
const NARRATE_MODELS = ['qwen3:8b', 'qwen3.6:35b-a3b'];

async function narrate(payload) {
  const { factor = 1, radius = 1, spin = 0, stay = 1, earth = '—' } = payload || {};
  const prompt = [
    '你是一个冷静的旁白，为一本科普作品写一句话。',
    `事实：行星上的 1 小时 = 地球的 ${factor.toFixed(2)} 小时；行星停留 ${stay} 小时，地球过去 ${earth}。`,
    `轨道半径 r = ${radius} M，黑洞自转 a/M = ${spin}。`,
    '要求：一句中文，不超过 40 字，不煽情，不用感叹号，不说"让我们"，像物理学家顺口说的话。只输出这句话。',
  ].join('\n');

  for (const model of NARRATE_MODELS) {
    const t0 = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 90000);
    try {
      const r = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          model, prompt, stream: false,
          options: { temperature: 0.85, num_predict: 160, top_p: 0.9 },
        }),
      });
      const d = await r.json();
      let text = (d.response || '').replace(/<think[\s\S]*?<\/think>/g, '').trim();
      text = text.split('\n').filter(Boolean).pop() || text;
      if (!r.ok || !text) throw new Error(d.error || 'empty');
      const ms = Date.now() - t0;
      await logEvent('生成旁白', `「${text.slice(0, 40)}」`, `${model} · ${ms}ms`);
      return { ok: true, text, model, ms };
    } catch (e) {
      await logEvent('生成旁白失败', String(e.message || e).slice(0, 60), model);
    } finally { clearTimeout(timer); }
  }
  return { ok: false, error: '所有本地模型都没应答' };
}

/* ── HTTP ── */
function send(res, code, body, type = 'application/json; charset=utf-8') {
  const isBin = body && (Buffer.isBuffer(body) || body instanceof Uint8Array);
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  res.end(isBin || typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === '/api/ops') return send(res, 200, await buildOps());

    if (p === '/api/narrate' && req.method === 'POST') {
      const body = await readBody(req);
      return send(res, 200, await narrate(body));
    }

    if (p === '/api/progress') {
      const file = path.join(ROOT, 'data', 'progress.json');
      if (req.method === 'GET') {
        return send(res, 200, JSON.parse(await fs.readFile(file, 'utf8')));
      }
      const body = await readBody(req);
      await fs.writeFile(file, JSON.stringify(body, null, 2));
      await logEvent('进度已保存', `${(body.weeks || []).flatMap((w) => w.sessions).filter((s) => s.done).length} 项完成`, 'phone-sync');
      return send(res, 200, { ok: true });
    }

    if (p === '/api/health') return send(res, 200, { ok: true, uptime: process.uptime() });

    /* 静态 */
    let file = p === '/' ? '/index.html' : decodeURIComponent(p);
    file = path.join(ROOT, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
    if (!existsSync(file)) return send(res, 404, 'not found', 'text/plain');
    const data = await fs.readFile(file);
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n  星际穿越时间账单`);
  console.log(`  本机   http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  手机   http://${ip}:${PORT}   ← 同一个 Wi-Fi 直接开`);
  console.log('');
  await logEvent('服务启动', `端口 ${PORT}`, 'node server.mjs');
});
