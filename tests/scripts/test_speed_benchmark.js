const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--user-data-dir=C:\\Users\\Lenovo\\AppData\\Local\\Temp\\chrome_speed_test'
  ]);
  let targets = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      targets = await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:9223/json', res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => req.destroy(new Error('timeout')));
      });
      if (targets && targets.length > 0) break;
    } catch (e) {}
  }
  if (!targets) throw new Error('Could not connect to Chrome CDP on port 9223');
  const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension')) || targets.find(t => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const send = (m, p = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    const cb = data => {
      const parsed = JSON.parse(data);
      if (parsed.id === msgId) { ws.off('message', cb); resolve(parsed.result); }
    };
    ws.on('message', cb);
    ws.send(JSON.stringify({ id: msgId, method: m, params: p }));
  });
  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 2000));

  const res = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        try {
          for (let i = 0; i < 50; i++) {
            if (window.store && window.app && window.store.login) break;
            await new Promise(r => setTimeout(r, 100));
          }
          await window.store.login('sri@vignan.ac.in', 'Password123');
          window.app.openAddSkillModal('offered');
          window.app.quickFillPopularSubject(
            'Java Full Stack Development',
            'Programming',
            'Intermediate',
            'Java testing speed'
          );
          const t0 = performance.now();
          const form = document.getElementById('addSkillForm');
          
          let successSeen = false;
          let observer = new MutationObserver(() => {
            const sv = document.getElementById('addSkillModalSuccessView');
            if (sv && sv.style.display !== 'none') {
              successSeen = true;
            }
          });
          observer.observe(document.getElementById('addSkillModalSuccessView'), { attributes: true, attributeFilter: ['style'] });
          
          document.getElementById('saveSkillBtn').click();
          
          for (let i = 0; i < 50; i++) {
            await new Promise(r => setTimeout(r, 100));
            const sv = document.getElementById('addSkillModalSuccessView');
            if (sv && sv.style.display !== 'none') {
              successSeen = true;
              break;
            }
          }
          const elapsed = performance.now() - t0;
          return { successSeen, elapsed, lastSubject: window.app.lastAddedSubjectName };
        } catch (e) {
          return { error: e.message };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Result:', res?.result?.value || res);
  ws.close();
  chrome.kill();
}

test().catch(console.error);
