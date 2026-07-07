// server.js — Full backend (admin endpoints open – no auth)
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'miners.json');
const PORT = process.env.PORT || 3000;

// --------------- Persistent data ---------------
let data = {
  minersCounted: {},      // { accountId: true }
  totalMiners: 0,
  totalDistributed: 0,
  claims: {},             // { accountId: timestamp }
  users: {},              // { accountId: { balance, attributes, username, ... } }
  referrals: [],
  referralRewards: {},
  referralFriends: {},
  updates: [],
  stadiumsSold: 0,
  stadiumOwners: {}
};

const BASE_COST = 0.3;
const TIER_SIZE = 20;

function getUpgradeCost(level) {
  return BASE_COST * Math.pow(2, Math.floor(level / TIER_SIZE));
}

function getTotalSpent(attrs) {
  let total = 0;
  if (!attrs || typeof attrs !== 'object') return 0;
  for (let attr in attrs) {
    const lv = attrs[attr] || 0;
    for (let l = 0; l < lv; l++) total += getUpgradeCost(l);
  }
  return total;
}

try {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.minersCounted = data.minersCounted || {};
    data.totalMiners = data.totalMiners || 0;
    data.totalDistributed = data.totalDistributed || 0;
    data.claims = data.claims || {};
    data.users = data.users || {};
    data.referrals = data.referrals || [];
    data.referralRewards = data.referralRewards || {};
    data.referralFriends = data.referralFriends || {};
    data.updates = data.updates || [];
    data.stadiumsSold = data.stadiumsSold || 0;
    data.stadiumOwners = data.stadiumOwners || {};
  }
} catch (e) {}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

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

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  // Public updates feed
  if (req.method === 'GET' && req.url === '/updates') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data.updates));
  }

  // Admin: post an update (NO AUTH)
  if (req.method === 'POST' && req.url.startsWith('/admin-update')) {
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
      data.updates.unshift(newUpdate);
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, update: newUpdate }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // Admin: delete an update (NO AUTH)
  if (req.method === 'DELETE' && req.url.startsWith('/admin-update')) {
    const url = new URL(req.url, `http://localhost`);
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing id' }));
    }
    const index = data.updates.findIndex(u => u.id === id);
    if (index === -1) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'Update not found' }));
    }
    data.updates.splice(index, 1);
    saveData();
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
  }

  // Register new miner
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

  // Get total miners
  else if (req.method === 'GET' && req.url === '/total-miners') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ totalMiners: data.totalMiners }));
  }

  // Claim reward
  else if (req.method === 'POST' && req.url === '/claim') {
    try {
      const { accountId } = await parseBody(req);
      if (!accountId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing accountId' })); }
      const now = Date.now();
      const lastClaim = data.claims[accountId] || 0;
      const oneDay = 86400000;
      if (now - lastClaim < oneDay) {
        const remaining = oneDay - (now - lastClaim);
        return res.end(JSON.stringify({ error: 'Already claimed today', remainingMs: remaining }));
      }
      const rate = getCurrentRate();
      const cap = 300000000;
      if (data.totalDistributed + rate > cap) {
        return res.end(JSON.stringify({ error: 'Airdrop cap reached' }));
      }
      data.claims[accountId] = now;
      data.totalDistributed += rate;
      if (data.users[accountId]) {
        data.users[accountId].balance = (data.users[accountId].balance || 0) + rate;
      }
      saveData();
      res.end(JSON.stringify({ success: true, reward: rate, totalMiners: data.totalMiners, totalDistributed: data.totalDistributed }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Get total distributed
  else if (req.method === 'GET' && req.url === '/total-distributed') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ totalDistributed: data.totalDistributed }));
  }

  // Save user data (cloud sync)
  else if (req.method === 'POST' && req.url === '/save-user') {
    try {
      const { accountId, userData } = await parseBody(req);
      if (!accountId || !userData) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing accountId or userData' })); }
      data.users[accountId] = { ...userData, serverTimestamp: Date.now() };
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Load user data
  else if (req.method === 'GET' && req.url.startsWith('/load-user')) {
    const url = new URL(req.url, `http://localhost`);
    const accountId = url.searchParams.get('accountId');
    if (!accountId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing accountId' })); }
    const userData = data.users[accountId] || null;
    const lastServerClaim = data.claims[accountId] || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ userData, lastServerClaim }));
  }

  // Task claim
  else if (req.method === 'POST' && req.url === '/task-claim') {
    try {
      const { accountId, taskType, amount } = await parseBody(req);
      if (!accountId || !taskType || !amount) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing fields' })); }
      data.totalDistributed += amount;
      if (data.users[accountId]) data.users[accountId].balance = (data.users[accountId].balance || 0) + amount;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Boost claim
  else if (req.method === 'POST' && req.url === '/boost-claim') {
    try {
      const { accountId, amount } = await parseBody(req);
      if (!accountId || !amount) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing fields' })); }
      data.totalDistributed += amount;
      if (data.users[accountId]) data.users[accountId].balance = (data.users[accountId].balance || 0) + amount;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Referral add
  else if (req.method === 'POST' && req.url === '/referral-add') {
    try {
      const { referrerCode, referredCode } = await parseBody(req);
      if (!referrerCode || !referredCode || referrerCode.length !== 12 || referredCode.length !== 12) {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid codes' }));
      }
      if (referrerCode === referredCode) return res.end(JSON.stringify({ error: 'Self-referral not allowed' }));
      if (data.referrals.some(r => r.referrer === referrerCode && r.referred === referredCode))
        return res.end(JSON.stringify({ error: 'Already connected' }));
      const reward = getReferralReward();
      data.totalDistributed += reward * 2;
      data.referrals.push({ referrer: referrerCode, referred: referredCode, timestamp: Date.now() });
      data.referralRewards[referrerCode] = (data.referralRewards[referrerCode] || 0) + reward;
      data.referralFriends[referrerCode] = data.referralFriends[referrerCode] || [];
      data.referralFriends[referrerCode].push({ referred: referredCode, timestamp: Date.now() });
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, reward, message: 'Referral added.' }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Referral info
  else if (req.method === 'GET' && req.url.startsWith('/referral-info')) {
    const url = new URL(req.url, `http://localhost`);
    const code = url.searchParams.get('code');
    if (!code || code.length !== 12) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid referral code' })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ referralCode: code, friends: data.referralFriends[code] || [], totalEarned: data.referralRewards[code] || 0 }));
  }

  // Stadium info
  else if (req.method === 'GET' && req.url === '/stadium-info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sold: data.stadiumsSold, total: 1000 }));
  }

  // Buy stadium
  else if (req.method === 'POST' && req.url === '/buy-stadium') {
    try {
      const { accountId } = await parseBody(req);
      if (!accountId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing accountId' })); }
      if (data.stadiumOwners[accountId]) return res.end(JSON.stringify({ error: 'You already own a stadium' }));
      if (data.stadiumsSold >= 1000) return res.end(JSON.stringify({ error: 'All stadiums sold out' }));
      const user = data.users[accountId];
      if (!user || typeof user.balance !== 'number') return res.end(JSON.stringify({ error: 'User data not found. Please sync your wallet first.' }));
      const price = 2000;
      if (user.balance < price) return res.end(JSON.stringify({ error: 'Insufficient balance. You need 2000 $FOOT.' }));
      user.balance -= price;
      data.stadiumsSold++;
      data.stadiumOwners[accountId] = true;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, newBalance: user.balance, sold: data.stadiumsSold }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Admin stats (no auth)
  else if (req.method === 'GET' && req.url.startsWith('/admin-stats')) {
    const stats = {
      totalMiners: data.totalMiners,
      totalDistributed: data.totalDistributed,
      stadiumsSold: data.stadiumsSold,
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

  // Admin adjust distribution
  else if (req.method === 'POST' && req.url === '/admin-adjust-distribution') {
    try {
      const { amount } = await parseBody(req);
      if (typeof amount !== 'number') { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid amount' })); }
      data.totalDistributed += amount;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Admin set distribution
  else if (req.method === 'POST' && req.url === '/admin-set-distribution') {
    try {
      const { value } = await parseBody(req);
      if (typeof value !== 'number' || value < 0) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid value' })); }
      data.totalDistributed = value;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' })); }
  }

  // Admin recover distribution
  else if (req.method === 'POST' && req.url === '/admin-recover-distribution') {
    try {
      let total = 0;
      for (const accountId in data.users) {
        const u = data.users[accountId];
        total += (u.balance || 0);
        if (u.attributes) total += getTotalSpent(u.attributes);
      }
      data.totalDistributed = total;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: 'Internal error' })); }
  }

  // Fallback
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));