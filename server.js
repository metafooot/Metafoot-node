// server.js — Global counter + claim engine + cloud user data + admin stats + health check + referral server + updates system + Twitter verifications
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
  twitterSubmissions: []   // { accountId, twitterHandle, tweetId, status, timestamp }
};

// --------- Training cost constants ---------
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
    for (let l = 0; l < lv; l++) {
      total += getUpgradeCost(l);
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
    data.twitterSubmissions = data.twitterSubmissions || [];
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

  // ... (all endpoints from the previous complete server.js, including /submit-twitter-task, /admin-twitter-submissions, /admin-reward-twitter, etc.)
  // The full file was given above; make sure to include all the endpoints.
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));