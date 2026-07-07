// server.js — Global counter + claim engine + cloud user data + admin stats + health check + referral server + updates system + multi‑item training + stadium eligibility
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'miners.json');
const PORT = process.env.PORT || 3000;

// ---- CHANGE THIS TO YOUR OWN SECRET KEY ----
const ADMIN_KEY = process.env.ADMIN_KEY || 'mysecret123';

// --------------- Persistent data ---------------
let data = {
  minersCounted: {},
  totalMiners: 0,
  totalDistributed: 0,
  claims: {},
  users: {},
  referrals: [],
  referralRewards: {},
  referralFriends: {},
  updates: [],
  stadiumsBuilt: 0,
  stadiumOwners: {}
};

// --------- Training cost constants ---------
const TIER_SIZE = 20;
const ITEM_DEFS = {
  footballPlayer:  { baseCost: 0.3, attrs: ['speed','shoot','power','intelligence','brilliance','accuracy'] },
  car:             { baseCost: 0.5, attrs: ['speed','acceleration','handling','durability'] },
  wrestler:        { baseCost: 0.6, attrs: ['strength','agility','stamina','signature_move'] },
  basketballPlayer:{ baseCost: 0.5, attrs: ['shooting','dribbling','defence','vertical'] },
  gun:             { baseCost: 0.7, attrs: ['accuracy','fire_rate','damage','reload_speed'] },
  viking:          { baseCost: 0.6, attrs: ['berserk','shield_wall','axe_skill','endurance'] },
  lion:            { baseCost: 0.5, attrs: ['hunting','stealth','ferocity','stamina'] },
  wolf:            { baseCost: 0.4, attrs: ['pack_tactics','speed','tracking','loyalty'] },
  ship:            { baseCost: 1.0, attrs: ['hull','navigation','cargo','crew'] },
  house:           { baseCost: 0.8, attrs: ['rooms','security','comfort','energy_efficiency'] },
  shop:            { baseCost: 0.9, attrs: ['inventory','customer_flow','marketing','location'] },
  aeroplane:       { baseCost: 1.2, attrs: ['thrust','aerodynamics','fuel_efficiency','range'] },
  fighter:         { baseCost: 1.0, attrs: ['combat','agility','stealth','weapons_systems'] },
  stadium:         { baseCost: 1.5, attrs: ['capacity','atmosphere','facilities','pitch_quality'] }
};

function getUpgradeCost(level, baseCost) {
  return baseCost * Math.pow(2, Math.floor(level / TIER_SIZE));
}

function getTotalSpentAllItems(items) {
  let total = 0;
  if (!items) return 0;
  for (const itemKey in items) {
    if (itemKey === 'stadium') continue;
    const def = ITEM_DEFS[itemKey];
    if (!def) continue;
    const attrs = items[itemKey] || {};
    for (const attr of def.attrs) {
      const lv = attrs[attr] || 0;
      for (let l = 0; l < lv; l++) {
        total += getUpgradeCost(l, def.baseCost);
      }
    }
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
    data.stadiumsBuilt = data.stadiumsBuilt || 0;
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

  // Admin: post an update
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
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
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

  // Admin: delete an update
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
        res.writeHead(400);
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
    res.writeHead(200);
    res.end(JSON.stringify({ totalMiners: data.totalMiners }));
  }

  // Claim reward
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
      const cap = 300000000;
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

  // Get total distributed
  else if (req.method === 'GET' && req.url === '/total-distributed') {
    res.writeHead(200);
    res.end(JSON.stringify({ totalDistributed: data.totalDistributed }));
  }

  // Save user data
  else if (req.method === 'POST' && req.url === '/save-user') {
    try {
      const { accountId, userData } = await parseBody(req);
      if (!accountId || !userData) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing accountId or userData' }));
      }
      data.users[accountId] = { ...userData, serverTimestamp: Date.now() };
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // Load user data
  else if (req.method === 'GET' && req.url.startsWith('/load-user')) {
    const url = new URL(req.url, `http://localhost`);
    const accountId = url.searchParams.get('accountId');
    if (!accountId) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing accountId' }));
    }
    const userData = data.users[accountId] || null;
    res.writeHead(200);
    res.end(JSON.stringify({ userData, lastServerClaim: data.claims[accountId] || null }));
  }

  // Task claim
  else if (req.method === 'POST' && req.url === '/task-claim') {
    try {
      const { accountId, taskType, amount } = await parseBody(req);
      if (!accountId || !taskType || !amount) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing fields' }));
      }
      data.totalDistributed += amount;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // Boost claim
  else if (req.method === 'POST' && req.url === '/boost-claim') {
    try {
      const { accountId, amount } = await parseBody(req);
      if (!accountId || !amount) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing fields' }));
      }
      data.totalDistributed += amount;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // Referral add
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
      const exists = data.referrals.some(r => r.referrer === referrerCode && r.referred === referredCode);
      if (exists) return res.end(JSON.stringify({ error: 'Already connected' }));
      const reward = getReferralReward();
      data.totalDistributed += reward * 2;
      data.referrals.push({ referrer: referrerCode, referred: referredCode, timestamp: Date.now() });
      if (!data.referralRewards[referrerCode]) data.referralRewards[referrerCode] = 0;
      data.referralRewards[referrerCode] += reward;
      if (!data.referralFriends[referrerCode]) data.referralFriends[referrerCode] = [];
      data.referralFriends[referrerCode].push({ referred: referredCode, timestamp: Date.now() });
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, reward }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // Get referral info
  else if (req.method === 'GET' && req.url.startsWith('/referral-info')) {
    const url = new URL(req.url, `http://localhost`);
    const code = url.searchParams.get('code');
    if (!code || code.length !== 12) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid code' }));
    }
    const friends = data.referralFriends[code] || [];
    const totalEarned = data.referralRewards[code] || 0;
    res.writeHead(200);
    res.end(JSON.stringify({ referralCode: code, friends, totalEarned }));
  }

  // Stadium eligibility check
  else if (req.method === 'GET' && req.url.startsWith('/check-stadium-eligibility')) {
    const url = new URL(req.url, `http://localhost`);
    const accountId = url.searchParams.get('accountId');
    if (!accountId) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing accountId' }));
    }
    const user = data.users[accountId] || {};
    const items = user.items || {};
    const totalSpent = getTotalSpentAllItems(items);
    const alreadyOwner = data.stadiumOwners[accountId] === true;
    const capReached = data.stadiumsBuilt >= 1000;
    res.writeHead(200);
    res.end(JSON.stringify({
      totalSpent,
      eligible: totalSpent >= 4000 && !capReached,
      alreadyOwner,
      capReached,
      stadiumsBuilt: data.stadiumsBuilt
    }));
  }

  // Unlock stadium
  else if (req.method === 'POST' && req.url === '/unlock-stadium') {
    try {
      const { accountId } = await parseBody(req);
      if (!accountId) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing accountId' }));
      }
      if (data.stadiumOwners[accountId]) {
        return res.end(JSON.stringify({ success: true, message: 'Already owner' }));
      }
      if (data.stadiumsBuilt >= 1000) {
        return res.end(JSON.stringify({ error: 'Stadium cap reached' }));
      }
      const user = data.users[accountId] || {};
      const items = user.items || {};
      const totalSpent = getTotalSpentAllItems(items);
      if (totalSpent < 4000) {
        return res.end(JSON.stringify({ error: 'Insufficient total spent (need 4000)', totalSpent }));
      }
      data.stadiumOwners[accountId] = true;
      data.stadiumsBuilt++;
      if (!user.items) user.items = {};
      if (!user.items.stadium) user.items.stadium = {};
      data.users[accountId] = user;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, stadiumsBuilt: data.stadiumsBuilt }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // Admin adjust distribution
  else if (req.method === 'POST' && req.url === '/admin-adjust-distribution') {
    const url = new URL(req.url, `http://localhost`);
    const key = url.searchParams.get('key');
    if (key !== ADMIN_KEY) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Forbidden' })); }
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
    const url = new URL(req.url, `http://localhost`);
    const key = url.searchParams.get('key');
    if (key !== ADMIN_KEY) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Forbidden' })); }
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
    const url = new URL(req.url, `http://localhost`);
    const key = url.searchParams.get('key');
    if (key !== ADMIN_KEY) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Forbidden' })); }
    try {
      let total = 0;
      for (const accId in data.users) {
        const u = data.users[accId];
        total += (u.balance || 0);
        if (u.items) total += getTotalSpentAllItems(u.items);
      }
      data.totalDistributed = total;
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, totalDistributed: data.totalDistributed }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: 'Internal error' })); }
  }

  // Admin stats
  else if (req.method === 'GET' && req.url.startsWith('/admin-stats')) {
    const url = new URL(req.url, `http://localhost`);
    const key = url.searchParams.get('key');
    if (key !== ADMIN_KEY) { res.writeHead(403); return res.end(JSON.stringify({ error: 'Forbidden' })); }
    res.writeHead(200);
    res.end(JSON.stringify({
      totalMiners: data.totalMiners,
      totalDistributed: data.totalDistributed,
      minersCounted: data.minersCounted,
      claims: data.claims,
      users: data.users,
      referrals: data.referrals,
      referralRewards: data.referralRewards,
      referralFriends: data.referralFriends,
      stadiumsBuilt: data.stadiumsBuilt,
      stadiumOwners: data.stadiumOwners
    }));
  }

  // Fallback
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));