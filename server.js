// server.js — Global counter + claim engine + cloud user data + admin stats + health check + referral server + updates system
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'miners.json');
const UPDATES_FILE = path.join(__dirname, 'updates.json');
const PORT = process.env.PORT || 3000;

// ---- CHANGE THIS TO YOUR OWN SECRET KEY ----
const ADMIN_KEY = 'mysecret123';

// --------------- Persistent data ---------------
let data = {
  minersCounted: {},      // { accountId: true }
  totalMiners: 0,
  totalDistributed: 0,
  claims: {},             // { accountId: timestamp }
  users: {},              // { accountId: userData }
  referrals: [],          // { referrer: string (referralCode), referred: string (referralCode), timestamp: number }
  referralRewards: {},    // { referralCode: totalEarned }
  referralFriends: {}     // { referralCode: [ { referred, timestamp } ] }
};

// Load or create updates array
let updates = [];
try {
  if (fs.existsSync(UPDATES_FILE)) {
    updates = JSON.parse(fs.readFileSync(UPDATES_FILE, 'utf8'));
  }
} catch (e) {}

try {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data.referrals) data.referrals = [];
    if (!data.referralRewards) data.referralRewards = {};
    if (!data.referralFriends) data.referralFriends = {};
  }
} catch (e) {}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

function saveUpdates() {
  fs.writeFileSync(UPDATES_FILE, JSON.stringify(updates));
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

function getReferralReward() {
  const miners = data.totalMiners;
  const base = 2;
  if (miners < 15000) return base;
  if (miners < 100000) return base / 2;
  if (miners < 500000) return base / 4;
  if (miners < 1000000) return base / 8;
  return base / 16;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // --- Health check ---
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  // --- Public updates feed ---
  if (req.method === 'GET' && req.url === '/updates') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(updates));
  }

  // --- Admin: post an update ---
  if (req.method === 'POST' && req.url.startsWith('/admin-update')) {
    const url = new URL(req.url, `http://localhost`);
    const key = url.searchParams.get('key');
    if (key !== ADMIN_KEY) {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }
    try {
      const { title, content } = await parseBody(req);
      if (!title || !content) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing title or content' }));
      }
      const newUpdate = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        title,
        content,
        date: new Date().toISOString().split('T')[0]
      };
      updates.unshift(newUpdate);  // newest first
      saveUpdates();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, update: newUpdate }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // --- Admin: delete an update ---
  if (req.method === 'DELETE' && req.url.startsWith('/admin-update')) {
    const url = new URL(req.url, `http://localhost`);
    const key = url.searchParams.get('key');
    if (key !== ADMIN_KEY) {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing id' }));
    }
    const index = updates.findIndex(u => u.id === id);
    if (index === -1) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'Update not found' }));
    }
    updates.splice(index, 1);
    saveUpdates();
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
  }

  // --- Register new miner ---
  else if (req.method === 'POST' && req.url === '/register-miner') {
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
    const lastServerClaim = data.claims[accountId] || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ userData, lastServerClaim }));
  }

  // --- Server-side referral ---
  else if (req.method === 'POST' && req.url === '/referral-add') {
    try {
      const { referrerCode, referredCode } = await parseBody(req);
      if (!referrerCode || !referredCode || referrerCode.length !== 12 || referredCode.length !== 12) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Invalid codes' }));
      }
      if (referrerCode === referredCode) {
        return res.end(JSON.stringify({ error: 'Self-referral not allowed' }));
      }
      const alreadyExists = data.referrals.some(
        r => r.referrer === referrerCode && r.referred === referredCode
      );
      if (alreadyExists) {
        return res.end(JSON.stringify({ error: 'Already connected' }));
      }
      data.referrals.push({
        referrer: referrerCode,
        referred: referredCode,
        timestamp: Date.now()
      });
      const reward = getReferralReward();
      if (!data.referralRewards[referrerCode]) {
        data.referralRewards[referrerCode] = 0;
      }
      data.referralRewards[referrerCode] += reward;
      if (!data.referralFriends[referrerCode]) {
        data.referralFriends[referrerCode] = [];
      }
      data.referralFriends[referrerCode].push({
        referred: referredCode,
        timestamp: Date.now()
      });
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        reward: reward,
        message: 'Referral added.'
      }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // --- Get referral info ---
  else if (req.method === 'GET' && req.url.startsWith('/referral-info')) {
    const url = new URL(req.url, `http://localhost`);
    const code = url.searchParams.get('code');
    if (!code || code.length !== 12) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid referral code' }));
    }
    const friends = data.referralFriends[code] || [];
    const totalEarned = data.referralRewards[code] || 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      referralCode: code,
      friends: friends,
      totalEarned: totalEarned
    }));
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
      users: data.users,
      referrals: data.referrals,
      referralRewards: data.referralRewards,
      referralFriends: data.referralFriends
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