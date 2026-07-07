<!DOCTYPE <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>METAFOOT Admin</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --card: #151520;
      --text: #ffcccc;
      --accent: #ff5555;
      --gold: #ffd700;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px; }
    h1 { color: var(--accent); margin-bottom: 0.5rem; }
    .status { color: #ff8888; margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: var(--card); border: 1px solid #333; border-radius: 12px; padding: 1rem; }
    .card h2 { color: var(--accent); font-size: 1.1rem; margin-bottom: 0.5rem; }
    .stat { font-size: 2rem; color: var(--gold); }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td { border: 1px solid #333; padding: 6px; text-align: left; font-size: 0.9rem; }
    th { background: #1a1a2a; color: var(--gold); }
    textarea { width: 100%; background: #1a1a2a; color: white; border: 1px solid var(--accent); padding: 0.5rem; border-radius: 8px; resize: vertical; }
    .section { margin-top: 2rem; }
    .btn { padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 5px; margin-bottom: 5px; }
    .danger { background: #990000; }
    .success { background: #228B22; }
    pre { background: #111; padding: 1rem; border-radius: 8px; overflow-x: auto; max-height: 300px; }
    .scrollable { max-height: 500px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>⚽ METAFOOT Admin</h1>
  <p class="status" id="connectionStatus">Connecting…</p>

  <div id="dashboard" style="display: none;">
    <div class="grid" id="overviewGrid"></div>

    <!-- Player Attributes Section -->
    <div class="section">
      <h2>🏋️ Player Attributes</h2>
      <div class="scrollable">
        <table id="attributesTable">
          <thead>
            <tr>
              <th>Account ID</th>
              <th>Username</th>
              <th>Balance</th>
              <th>Speed</th>
              <th>Shoot</th>
              <th>Power</th>
              <th>Intelligence</th>
              <th>Brilliance</th>
              <th>Accuracy</th>
              <th>Total Spent</th>
            </tr>
          </thead>
          <tbody id="attributesBody"></tbody>
        </table>
      </div>
      <p id="noPlayersMsg" style="color:#888; margin-top:1rem;">No players with attributes found.</p>
    </div>

    <div class="section">
      <h2>📋 All Data (JSON)</h2>
      <button class="btn" onclick="copyFullData()">Copy Full JSON</button>
      <pre id="rawJson"></pre>
    </div>

    <div class="section">
      <h2>📝 Manage Updates</h2>
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <input type="text" id="updateTitle" placeholder="Title" style="flex:1; padding:8px; background:#1a1a2a; border:1px solid #ff5555; color:white; border-radius:6px;">
        <textarea id="updateContent" placeholder="Content" rows="2" style="flex:2;"></textarea>
        <button class="btn success" onclick="postUpdate()">Post Update</button>
      </div>
      <div id="updatesList"></div>
    </div>

    <div class="section">
      <h2>🔧 Tools</h2>
      <button class="btn" onclick="adjustDistribution()">Adjust Distribution</button>
      <button class="btn" onclick="setDistribution()">Set Distribution</button>
      <button class="btn danger" onclick="recoverDistribution()">Recover from Users</button>
    </div>
  </div>

  <script>
    // No API_BASE needed – we always call the same server we’re on.
    const ATTR_NAMES = ['speed','shoot','power','intelligence','brilliance','accuracy'];
    const BASE_COST = 0.3;
    const TIER_SIZE = 20;

    function getUpgradeCost(level) {
      return BASE_COST * Math.pow(2, Math.floor(level / TIER_SIZE));
    }

    function calcTotalSpent(attrs) {
      let total = 0;
      for (let attr in attrs) {
        const lv = attrs[attr] || 0;
        for (let l = 0; l < lv; l++) total += getUpgradeCost(l);
      }
      return total;
    }

    async function fetchData() {
      try {
        // Use relative URL – works everywhere
        const res = await fetch('/admin-stats');
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        document.getElementById('connectionStatus').innerText = '✅ Connected';
        document.getElementById('dashboard').style.display = 'block';
        renderDashboard(data);
        renderAttributes(data);
        document.getElementById('rawJson').textContent = JSON.stringify(data, null, 2);
        fetchUpdates();
      } catch(e) {
        document.getElementById('connectionStatus').innerText = '❌ Connection failed — check server';
      }
    }

    function renderDashboard(data) {
      const grid = document.getElementById('overviewGrid');
      grid.innerHTML = `
        <div class="card"><h2>Total Miners</h2><div class="stat">${data.totalMiners}</div></div>
        <div class="card"><h2>Total Distributed</h2><div class="stat">${data.totalDistributed.toLocaleString()}</div></div>
        <div class="card"><h2>Stadiums Sold</h2><div class="stat">${data.stadiumsSold || 0} / 1000</div></div>
        <div class="card"><h2>Referral Codes</h2><div class="stat">${Object.keys(data.referralRewards).length}</div></div>
        <div class="card"><h2>Active Claimers</h2><div class="stat">${Object.keys(data.claims).length}</div></div>
        <div class="card"><h2>Synced Users</h2><div class="stat">${Object.keys(data.users).length}</div></div>
      `;
    }

    function renderAttributes(data) {
      const tbody = document.getElementById('attributesBody');
      const noMsg = document.getElementById('noPlayersMsg');
      tbody.innerHTML = '';
      const users = data.users || {};
      let hasAny = false;

      for (const [accountId, user] of Object.entries(users)) {
        const attrs = user.attributes;
        if (!attrs || Object.keys(attrs).length === 0) continue;
        hasAny = true;
        const username = user.username || '—';
        const balance = user.balance !== undefined ? user.balance.toFixed(2) : '0.00';
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${accountId}</td>
          <td>${username}</td>
          <td>${balance}</td>
          ${ATTR_NAMES.map(a => `<td>${attrs[a] || 0}</td>`).join('')}
          <td>${calcTotalSpent(attrs).toFixed(2)}</td>
        `;
        tbody.appendChild(row);
      }

      noMsg.style.display = hasAny ? 'none' : 'block';
    }

    async function fetchUpdates() {
      const res = await fetch('/updates');
      const updates = await res.json();
      const list = document.getElementById('updatesList');
      list.innerHTML = updates.map(u => `
        <div style="background:#151520; padding:0.8rem; border-radius:8px; margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#ffaaaa;">${u.title}</strong> <small>(${u.date})</small><br>
            ${u.content}
          </div>
          <button class="btn danger" onclick="deleteUpdate('${u.id}')">Delete</button>
        </div>
      `).join('');
    }

    async function postUpdate() {
      const title = document.getElementById('updateTitle').value.trim();
      const content = document.getElementById('updateContent').value.trim();
      if (!title || !content) return alert('Fill both fields');
      const res = await fetch('/admin-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      if (res.ok) {
        document.getElementById('updateTitle').value = '';
        document.getElementById('updateContent').value = '';
        fetchUpdates();
      } else alert('Failed');
    }

    async function deleteUpdate(id) {
      if (!confirm('Delete this update?')) return;
      const res = await fetch(`/admin-update?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchUpdates(); else alert('Failed');
    }

    async function adjustDistribution() {
      const amount = prompt('Amount to add (can be negative):', '0');
      if (amount === null) return;
      const res = await fetch('/admin-adjust-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount) })
      });
      if (res.ok) fetchData();
      else alert('Failed');
    }

    async function setDistribution() {
      const value = prompt('New total distributed:', '0');
      if (value === null) return;
      const res = await fetch('/admin-set-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: Number(value) })
      });
      if (res.ok) fetchData();
      else alert('Failed');
    }

    async function recoverDistribution() {
      if (!confirm('Recalculate totalDistributed from synced users?')) return;
      const res = await fetch('/admin-recover-distribution', { method: 'POST' });
      if (res.ok) fetchData();
      else alert('Failed');
    }

    function copyFullData() {
      const text = document.getElementById('rawJson').textContent;
      navigator.clipboard.writeText(text);
      alert('Copied!');
    }

    fetchData();
  </script>
</body>
</html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>METAFOOT Admin</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --card: #151520;
      --text: #ffcccc;
      --accent: #ff5555;
      --gold: #ffd700;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px; }
    h1 { color: var(--accent); margin-bottom: 0.5rem; }
    .status { color: #ff8888; margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: var(--card); border: 1px solid #333; border-radius: 12px; padding: 1rem; }
    .card h2 { color: var(--accent); font-size: 1.1rem; margin-bottom: 0.5rem; }
    .stat { font-size: 2rem; color: var(--gold); }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td { border: 1px solid #333; padding: 6px; text-align: left; font-size: 0.9rem; }
    th { background: #1a1a2a; color: var(--gold); }
    textarea { width: 100%; background: #1a1a2a; color: white; border: 1px solid var(--accent); padding: 0.5rem; border-radius: 8px; resize: vertical; }
    .section { margin-top: 2rem; }
    .btn { padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 5px; margin-bottom: 5px; }
    .danger { background: #990000; }
    .success { background: #228B22; }
    pre { background: #111; padding: 1rem; border-radius: 8px; overflow-x: auto; max-height: 300px; }
    .scrollable { max-height: 500px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>⚽ METAFOOT Admin</h1>
  <p class="status" id="connectionStatus">Connecting…</p>

  <div id="dashboard" style="display: none;">
    <div class="grid" id="overviewGrid"></div>

    <!-- Player Attributes Section -->
    <div class="section">
      <h2>🏋️ Player Attributes</h2>
      <div class="scrollable">
        <table id="attributesTable">
          <thead>
            <tr>
              <th>Account ID</th>
              <th>Username</th>
              <th>Balance</th>
              <th>Speed</th>
              <th>Shoot</th>
              <th>Power</th>
              <th>Intelligence</th>
              <th>Brilliance</th>
              <th>Accuracy</th>
              <th>Total Spent</th>
            </tr>
          </thead>
          <tbody id="attributesBody"></tbody>
        </table>
      </div>
      <p id="noPlayersMsg" style="color:#888; margin-top:1rem;">No players with attributes found.</p>
    </div>

    <div class="section">
      <h2>📋 All Data (JSON)</h2>
      <button class="btn" onclick="copyFullData()">Copy Full JSON</button>
      <pre id="rawJson"></pre>
    </div>

    <div class="section">
      <h2>📝 Manage Updates</h2>
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <input type="text" id="updateTitle" placeholder="Title" style="flex:1; padding:8px; background:#1a1a2a; border:1px solid #ff5555; color:white; border-radius:6px;">
        <textarea id="updateContent" placeholder="Content" rows="2" style="flex:2;"></textarea>
        <button class="btn success" onclick="postUpdate()">Post Update</button>
      </div>
      <div id="updatesList"></div>
    </div>

    <div class="section">
      <h2>🔧 Tools</h2>
      <button class="btn" onclick="adjustDistribution()">Adjust Distribution</button>
      <button class="btn" onclick="setDistribution()">Set Distribution</button>
      <button class="btn danger" onclick="recoverDistribution()">Recover from Users</button>
    </div>
  </div>

  <script>
    // No API_BASE needed – we always call the same server we’re on.
    const ATTR_NAMES = ['speed','shoot','power','intelligence','brilliance','accuracy'];
    const BASE_COST = 0.3;
    const TIER_SIZE = 20;

    function getUpgradeCost(level) {
      return BASE_COST * Math.pow(2, Math.floor(level / TIER_SIZE));
    }

    function calcTotalSpent(attrs) {
      let total = 0;
      for (let attr in attrs) {
        const lv = attrs[attr] || 0;
        for (let l = 0; l < lv; l++) total += getUpgradeCost(l);
      }
      return total;
    }

    async function fetchData() {
      try {
        // Use relative URL – works everywhere
        const res = await fetch('/admin-stats');
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        document.getElementById('connectionStatus').innerText = '✅ Connected';
        document.getElementById('dashboard').style.display = 'block';
        renderDashboard(data);
        renderAttributes(data);
        document.getElementById('rawJson').textContent = JSON.stringify(data, null, 2);
        fetchUpdates();
      } catch(e) {
        document.getElementById('connectionStatus').innerText = '❌ Connection failed — check server';
      }
    }

    function renderDashboard(data) {
      const grid = document.getElementById('overviewGrid');
      grid.innerHTML = `
        <div class="card"><h2>Total Miners</h2><div class="stat">${data.totalMiners}</div></div>
        <div class="card"><h2>Total Distributed</h2><div class="stat">${data.totalDistributed.toLocaleString()}</div></div>
        <div class="card"><h2>Stadiums Sold</h2><div class="stat">${data.stadiumsSold || 0} / 1000</div></div>
        <div class="card"><h2>Referral Codes</h2><div class="stat">${Object.keys(data.referralRewards).length}</div></div>
        <div class="card"><h2>Active Claimers</h2><div class="stat">${Object.keys(data.claims).length}</div></div>
        <div class="card"><h2>Synced Users</h2><div class="stat">${Object.keys(data.users).length}</div></div>
      `;
    }

    function renderAttributes(data) {
      const tbody = document.getElementById('attributesBody');
      const noMsg = document.getElementById('noPlayersMsg');
      tbody.innerHTML = '';
      const users = data.users || {};
      let hasAny = false;

      for (const [accountId, user] of Object.entries(users)) {
        const attrs = user.attributes;
        if (!attrs || Object.keys(attrs).length === 0) continue;
        hasAny = true;
        const username = user.username || '—';
        const balance = user.balance !== undefined ? user.balance.toFixed(2) : '0.00';
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${accountId}</td>
          <td>${username}</td>
          <td>${balance}</td>
          ${ATTR_NAMES.map(a => `<td>${attrs[a] || 0}</td>`).join('')}
          <td>${calcTotalSpent(attrs).toFixed(2)}</td>
        `;
        tbody.appendChild(row);
      }

      noMsg.style.display = hasAny ? 'none' : 'block';
    }

    async function fetchUpdates() {
      const res = await fetch('/updates');
      const updates = await res.json();
      const list = document.getElementById('updatesList');
      list.innerHTML = updates.map(u => `
        <div style="background:#151520; padding:0.8rem; border-radius:8px; margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#ffaaaa;">${u.title}</strong> <small>(${u.date})</small><br>
            ${u.content}
          </div>
          <button class="btn danger" onclick="deleteUpdate('${u.id}')">Delete</button>
        </div>
      `).join('');
    }

    async function postUpdate() {
      const title = document.getElementById('updateTitle').value.trim();
      const content = document.getElementById('updateContent').value.trim();
      if (!title || !content) return alert('Fill both fields');
      const res = await fetch('/admin-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      if (res.ok) {
        document.getElementById('updateTitle').value = '';
        document.getElementById('updateContent').value = '';
        fetchUpdates();
      } else alert('Failed');
    }

    async function deleteUpdate(id) {
      if (!confirm('Delete this update?')) return;
      const res = await fetch(`/admin-update?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchUpdates(); else alert('Failed');
    }

    async function adjustDistribution() {
      const amount = prompt('Amount to add (can be negative):', '0');
      if (amount === null) return;
      const res = await fetch('/admin-adjust-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount) })
      });
      if (res.ok) fetchData();
      else alert('Failed');
    }

    async function setDistribution() {
      const value = prompt('New total distributed:', '0');
      if (value === null) return;
      const res = await fetch('/admin-set-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: Number(value) })
      });
      if (res.ok) fetchData();
      else alert('Failed');
    }

    async function recoverDistribution() {
      if (!confirm('Recalculate totalDistributed from synced users?')) return;
      const res = await fetch('/admin-recover-distribution', { method: 'POST' });
      if (res.ok) fetchData();
      else alert('Failed');
    }

    function copyFullData() {
      const text = document.getElementById('rawJson').textContent;
      navigator.clipboard.writeText(text);
      alert('Copied!');
    }

    fetchData();
  </script>
</body>
</html>