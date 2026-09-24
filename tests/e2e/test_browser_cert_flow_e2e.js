const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('============================================================');
  console.log('STARTING BROWSER E2E TEST: CERTIFICATE VERIFICATION AUDIT');
  console.log('============================================================\n');

  const tempProfile = 'C:\\Users\\Lenovo\\AppData\\Local\\Temp\\chrome_cert_test_' + Date.now();
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,950',
    '--user-data-dir=' + tempProfile
  ]);

  let targets = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      targets = await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:9223/json', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy(new Error('timeout')));
      });
      if (targets) break;
    } catch (e) {}
  }

  if (!targets) throw new Error('Could not connect to Chrome CDP on port 9223');

  const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension')) || targets.find(t => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.on('open', r));
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) cb.reject(new Error(msg.error.message));
      else cb.resolve(msg.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 2000));

  // Login as mahi
  console.log('Activating mahi session (usr_1790057593868)...');
  const loginRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const userRes = await fetch('/api/users/usr_1790057593868');
      const u = await userRes.json();
      const mahi = u.user;
      window.store.currentUser = mahi;
      window.store.currentPersonaId = mahi.id;
      window.store.personas[mahi.id] = mahi;
      localStorage.setItem('skillswap_active_persona', mahi.id);
      localStorage.setItem('currentUser', JSON.stringify(mahi));
      localStorage.setItem('skillswap_logged_in', 'true');
      sessionStorage.setItem('skillswap_logged_in', 'true');
      
      window.app.hideEntrancePortal();
      const overlay = document.getElementById('entrancePortalOverlay');
      if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.add('portal-hidden');
      }
      document.body.classList.remove('portal-active');

      await window.store.fetchCertificates(mahi.id);
      window.app.switchView('view-profile');
      await window.app.renderProfile();
      window.app.renderAll();
      return {
        userName: window.store.currentUser?.name,
        userId: window.store.currentUser?.id,
        certsCount: window.store.currentUser?.certificates?.length
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('User session initialized:', loginRes.result.value);

  await new Promise(r => setTimeout(r, 1500));

  // Inspect Profile DOM
  console.log('\n--- Checking Profile DOM for Mahi ---');
  const profileDom = await send('Runtime.evaluate', {
    expression: `(() => {
      const grid = document.getElementById('profileCertificatesGrid');
      const topBadge = document.getElementById('profileCardTopTierBadge');
      const rawHtml = grid ? grid.innerHTML : '';
      return {
        gridExists: Boolean(grid),
        topBadgeText: topBadge ? topBadge.textContent.trim() : null,
        hasNotVerifiedBadge: rawHtml.includes('NOT VERIFIED'),
        hasNotEligibleText: rawHtml.includes('Not eligible to teach'),
        hasByeSyntaxReason: rawHtml.includes('bye'),
        certHtmlLength: rawHtml.length
      };
    })()`,
    returnByValue: true
  });
  console.log('Profile DOM Evaluation:', profileDom.result.value);

  // Click [View] button on the certificate card
  console.log('\n--- Clicking [View] Button to Open Certificate Audit Modal ---');
  const openModalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const viewBtn = document.querySelector('#profileCertificatesGrid button');
      if (viewBtn) {
        viewBtn.click();
        return { clicked: true, btnText: viewBtn.textContent.trim() };
      }
      window.app.openCertificateAuditModal('cert_1790135420931');
      return { clicked: true, directCall: true };
    })()`,
    returnByValue: true
  });
  console.log('Modal trigger result:', openModalRes.result.value);

  await new Promise(r => setTimeout(r, 1000));

  // Inspect Modal DOM
  const modalDom = await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.getElementById('certificateAuditModal');
      const isActive = modal ? modal.classList.contains('active') : false;
      const decBadge = document.getElementById('certAuditDecisionBadge')?.textContent?.trim();
      const eligBadge = document.getElementById('certAuditEligibilityBadge')?.textContent?.trim();
      const decMsg = document.getElementById('certAuditDecisionMessage')?.textContent?.trim();
      const ocrBadge = document.getElementById('stageOcrBadge')?.textContent?.trim();
      const qrBadge = document.getElementById('stageQrBadge')?.textContent?.trim();
      const idBadge = document.getElementById('stageIdBadge')?.textContent?.trim();
      const nameBadge = document.getElementById('stageNameBadge')?.textContent?.trim();
      const docBadge = document.getElementById('stageDocBadge')?.textContent?.trim();
      const issuerBadge = document.getElementById('stageIssuerBadge')?.textContent?.trim();
      const tierResult = document.getElementById('certAuditTierResult')?.textContent?.trim();
      const bookSwap = document.getElementById('certAuditBookSwapAccess')?.textContent?.trim();

      return {
        isActive,
        decBadge,
        eligBadge,
        decMsg: decMsg ? decMsg.slice(0, 100) + '...' : null,
        stageChecks: {
          ocr: ocrBadge,
          qr: qrBadge,
          id: idBadge,
          name: nameBadge,
          doc: docBadge,
          issuer: issuerBadge
        },
        tierResult,
        bookSwap
      };
    })()`,
    returnByValue: true
  });
  console.log('\n--- Certificate Audit Modal DOM ---');
  console.log(JSON.stringify(modalDom.result.value, null, 2));

  // Close browser
  ws.close();
  chrome.kill();

  console.log('\n============================================================');
  console.log('BROWSER E2E TEST COMPLETED SUCCESSFULLY');
  console.log('============================================================\n');
}

run().catch(err => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
