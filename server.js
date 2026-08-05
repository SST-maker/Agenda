#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 2 * 1024 * 1024;
const clients = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function validFamilyId(value) {
  return typeof value === 'string' && /^[A-Z0-9-]{4,32}$/.test(value.toUpperCase());
}

function familyFile(familyId) {
  const safe = familyId.toUpperCase();
  const digest = crypto.createHash('sha256').update(safe).digest('hex').slice(0, 24);
  return path.join(DATA_DIR, `${digest}.json`);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Payload trop volumineux'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function broadcast(familyId, payload) {
  const listeners = clients.get(familyId) || new Set();
  const data = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of listeners) response.write(data);
}

async function handleAPI(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJSON(res, 200, { ok: true, service: 'agenda-family-sync', now: new Date().toISOString() });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const familyId = (url.searchParams.get('familyId') || '').toUpperCase();
    if (!validFamilyId(familyId)) { sendJSON(res, 400, { error: 'Code famille invalide.' }); return true; }
    try {
      const payload = JSON.parse(await fsp.readFile(familyFile(familyId), 'utf8'));
      sendJSON(res, 200, payload);
    } catch (error) {
      if (error.code === 'ENOENT') sendJSON(res, 404, { error: 'Famille non initialisée.' });
      else sendJSON(res, 500, { error: 'Lecture impossible.' });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/state') {
    try {
      const body = await readBody(req);
      const familyId = String(body.familyId || '').toUpperCase();
      const state = body.state;
      if (!validFamilyId(familyId)) { sendJSON(res, 400, { error: 'Code famille invalide.' }); return true; }
      if (!state || !Array.isArray(state.members) || !Array.isArray(state.events)) { sendJSON(res, 400, { error: 'Structure de données invalide.' }); return true; }
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const target = familyFile(familyId);
      const temp = `${target}.${process.pid}.tmp`;
      const payload = { familyId, state, updatedAt: new Date().toISOString() };
      await fsp.writeFile(temp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      await fsp.rename(temp, target);
      sendJSON(res, 200, { ok: true, updatedAt: payload.updatedAt });
      broadcast(familyId, { clientId: body.clientId || null, updatedAt: payload.updatedAt });
    } catch (error) {
      sendJSON(res, error.status || 400, { error: error.message || 'Requête invalide.' });
    }
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const familyId = (url.searchParams.get('familyId') || '').toUpperCase();
    if (!validFamilyId(familyId)) { sendJSON(res, 400, { error: 'Code famille invalide.' }); return true; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ familyId })}\n\n`);
    if (!clients.has(familyId)) clients.set(familyId, new Set());
    clients.get(familyId).add(res);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.get(familyId)?.delete(res);
      if (clients.get(familyId)?.size === 0) clients.delete(familyId);
    });
    return true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname.startsWith('/data/') || pathname === '/server.js') {
    sendJSON(res, 404, { error: 'Introuvable.' });
    return;
  }

  const candidate = path.resolve(ROOT, `.${pathname}`);
  if (!candidate.startsWith(ROOT + path.sep)) {
    sendJSON(res, 403, { error: 'Accès refusé.' });
    return;
  }

  try {
    const stat = await fsp.stat(candidate);
    const file = stat.isDirectory() ? path.join(candidate, 'index.html') : candidate;
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': path.basename(file) === 'service-worker.js' ? 'no-cache' : 'public, max-age=3600'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      const stream = fs.createReadStream(file);
      stream.on('error', () => { if (!res.headersSent) sendJSON(res, 500, { error: 'Lecture impossible.' }); else res.destroy(); });
      stream.pipe(res);
    }
  } catch {
    // Navigation SPA : l'interface reste accessible sur une route inconnue.
    if ((req.headers.accept || '').includes('text/html')) {
      const index = path.join(ROOT, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-cache' });
      fs.createReadStream(index).pipe(res);
    } else {
      sendJSON(res, 404, { error: 'Introuvable.' });
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (await handleAPI(req, res, url)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { sendJSON(res, 405, { error: 'Méthode non autorisée.' }); return; }
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Erreur interne.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AGENDA est disponible sur http://localhost:${PORT}`);
  console.log(`Réseau local : lance avec HOST=0.0.0.0 puis ouvre l'adresse IP de cet ordinateur.`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
