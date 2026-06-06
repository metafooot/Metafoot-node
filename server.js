// server.js — Global counter + claim engine + cloud user data + admin stats + health check + referral server (fully fixed)
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'miners.json');
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
  accountRefCodes: {},    // { accountId: referralCode }
  refCodeToAccount: {}    // { referralCode: accountId }
};

try {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data.referrals) data.referrals = [];
    if (!data.accountRefCodes) data.accountRefCodes = {};
    if (!data.refCodeToAccount) data.refCodeToAccount = {};
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  // --- Register new miner (now stores referral code mapping) ---
  if (req.method === 'POST' && req.url === '/register-miner') {
    try {
      const { accountId, referralCode } = await parseBody(req);
      if (!accountId || accountId.length !== 12) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid accountId' }));
      }
      // Store referral code mapping if provided and not already present
      if (referralCode && referralCode.length === 12) {
        if (!data.accountRefCodes[accountId]) {
          data.accountRefCodes[accountId] = referralCode;
        }
        if (!data.refCodeToAccount[referralCode]) {
          data.refCodeToAccount[referralCode] = accountId;
        }
      }
      if (data.minersCounted[accountId]) {
        saveData();
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

  // --- Save user data (cloud sync) – now also builds mapping from stored referral code ---
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
      // Update referral code mapping if userData contains it
      if (userData.referralCode) {
        data.accountRefCodes[accountId] = userData.referralCode;
        data.refCodeToAccount[userData.referralCode] = accountId;
      }
      saveData();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  }

  // --- Load user data (now auto‑creates mapping on login) ---
  else if (req.method === 'GET' && req.url.startsWith('/load-user')) {
    const url = new URL(req.url, `http://localhost`);
    const accountId = url.searchParams.get('accountId');
    if (!accountId) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing accountId' }));
    }
    const userData = (data.users && data.users[accountId]) || null;
    const lastServerClaim = data.claims[accountId] || null;

    // Auto‑create mapping if missing (fixes old accounts)
    if (userData && userData.referralCode) {
      if (!data.accountRefCodes[accountId]) {
        data.accountRefCodes[accountId] = userData.referralCode;
      }
      if (!data.refCodeToAccount[userData.referralCode]) {
        data.refCodeToAccount[userData.referralCode] = accountId;
      }
      saveData(); // persist the new mapping immediately
    }

    // Get inviter's referral code (prefer userData, fallback to mapping)
    let inviterReferralCode = userData?.referralCode || data.accountRefCodes[accountId] || null;
    let referredList = [];
    if (inviterReferralCode) {
      referredList = data.referrals
        .filter(r => r.referrer === inviterReferralCode)
        .map(r => ({ referred: r.referred, timestamp: r.timestamp }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      userData,
      lastServerClaim,
      referralInfo: {
        count: referredList.length,
        referred: referredList
      }
    }));
  }

  // --- Server-side referral: add referral pair and credit inviter (fully fixed) ---
  else if (req.method === 'POST' && req.url === '/referral-add') {
    try {
      const { referrerCode, referredCode } = await parseBody(req);
      if (!referrerCode || !referredCode || referrerCode.length !== 12 || referredCode.length !== 12) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Invalid codes' }));
      }

      // Prevent self-referral
      if (referrerCode === referredCode) {
        return res.end(JSON.stringify({ error: 'Self-referral not allowed' }));
      }

      // Check duplicate
      const alreadyExists = data.referrals.some(
        r => r.referrer === referrerCode && r.referred === referredCode
      );
      if (alreadyExists) {
        return res.end(JSON.stringify({ error: 'Already connected' }));
      }

      // Save referral record
      data.referrals.push({
        referrer: referrerCode,
        referred: referredCode,
        timestamp: Date.now()
      });

      // Credit inviter's balance – find their accountId via mapping
      let inviterAccountId = data.refCodeToAccount[referrerCode];
      if (!inviterAccountId) {
        // reverse lookup: find accountId whose referralCode matches referrerCode
        for (const [accId, refCode] of Object.entries(data.accountRefCodes)) {
          if (refCode === referrerCode) {
            inviterAccountId = accId;
            data.refCodeToAccount[referrerCode] = accId; // store forward mapping for next time
            break;
          }
        }
      }

      if (inviterAccountId) {
        const reward = getReferralReward();
        if (!data.users[inviterAccountId]) {
          data.users[inviterAccountId] = { balance: 0 };
        }
        data.users[inviterAccountId].balance = (data.users[inviterAccountId].balance || 0) + reward;
      }
      // If still not found, the inviter has never logged in; their reward will be credited
      // the next time they log in and the mapping is created (via /load-user).

      saveData();

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        reward: getReferralReward(),
        message: 'Referral added.'
      }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
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
      accountRefCodes: data.accountRefCodes
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