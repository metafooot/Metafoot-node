// server.js — Global counter + claim engine + cloud user data + admin stats endpoint
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'miners.json');
const PORT = process.env.PORT || 3000;

// ---- CHANGE THIS TO YOUR OWN SECRET KEY ----
const ADMIN_KEY = 'mysecret123';

// --------------- Persistent data ---------------
let data = {
  minersCounted: {},   // { accountId: true }
  totalMiners: 0,
  totalDistributed: 0,
  claims: {},          // { accountId: timestamp }
  users: {}            // { accountId: userData }
};

try {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch (e) {}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

// Helper: read JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
  });
}

function getCurrentRate() {
  const m = data.totalMiners;
  if (m < 15000) return 4;
  if (m < 100000) return 2;
  if (m < 500000) return 1;
  if (m < 1000000) return 0.5;
  return 0.25;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // --- Register new miner ---
  if (req.method === 'POST' && req.url === '/register-miner') {
    try {
      const { accountId } = await parseBody(req);
      if (!accountId || accountId.length !== 12) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid accountId' }));
      }
      if (data.minersCounted[accountId]) {
        return res.end(JSON.stringify({ alreadyCounted: true, totalMiners: data.totalMiners }));
      }
      data.minersCounted[accountId] = true;
      data.totalMiners++;
      saveData();
      return res.end(JSON.stringify({ alreadyCounted: false, totalMiners: data.totalMiners }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // --- Get total miners ---
  else if (req.method === 'GET' && req.url === '/total-miners') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ totalMiners: data.totalMiners }));
  }

  // --- Claim reward ---
  else if (req.method === 'POST' && req.url === '/claim') {
    try {
      const { accountId } = await parseBody(req);
      if (!accountId) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing accountId' }));
      }
      const now = Date.now();
      const lastClaim = data.claims[accountId] || 0;
      const oneDay = 86400000;
      if (now - lastClaim < oneDay) {
        const remaining = oneDay - (now - lastClaim);
        return res.end(JSON.stringify({ error: 'Already claimed today', remainingMs: remaining }));
      }
      const rate = getCurrentRate();
      const cap = 50000000;
      if (data.totalDistributed + rate > cap) {
        return res.end(JSON.stringify({ error: 'Airdrop cap reached' }));
      }
      data.claims[accountId] = now;
      data.totalDistributed += rate;
      saveData();
      res.end(JSON.stringify({ success: true, reward: rate, totalMiners: data.totalMiners, totalDistributed: data.totalDistributed }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // --- Get total distributed ---
  else if (req.method === 'GET' && req.url === '/total-distributed') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ totalDistributed: data.totalDistributed }));
  }

  // --- Save user data (cloud sync) ---
  else if (req.method === 'POST' && req.url === '/save-user') {
    try {
      const { accountId, userData } = await parseBody(req);
      if (!accountId || !userData) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing accountId or userData' }));
      }
      if (!data.users) data.users = {};
      data.users[accountId] = {
        ...userData,
        serverTimestamp: Date.now()
      };
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // --- Load user data ---
  else if (req.method === 'GET' && req.url.startsWith('/load-user')) {
    const url = new URL(req.url, `http://localhost`);
    const accountId = url.searchParams.get('accountId');
    if (!accountId) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing accountId' }));
    }
    const userData = (data.users && data.users[accountId]) || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ userData }));
  }

  // --- Admin stats (protected) ---
  else if (req.method === 'GET' && req.url.startsWith('/admin-stats')) {
    const url = new URL(req.url, `http://localhost`);
    const key = url.searchParams.get('key');

    if (key !== ADMIN_KEY) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }

    const stats = {
      totalMiners: data.totalMiners,
      totalDistributed: data.totalDistributed,
      minersCounted: data.minersCounted,
      claims: data.claims,
      users: data.users
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
  }

  // --- Fallback ---
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));