const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--user-data-dir=C:\\Users\\Lenovo\\AppData\\Local\\Temp\\chrome_test_' + Date.now()
  ]);

  let targets = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      targets = await new Promise((res, rej) => {
        const req = http.get('http://127.0.0.1:9222/json', r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res(JSON.parse(d)));
        });
        req.on('error', rej);
      });
      if (targets) break;
    } catch(e) {}
  }

  const page = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id).resolve(msg.result);
      callbacks.delete(msg.id);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[BROWSER LOG]', msg.params.args.map(a => a.value !== undefined ? a.value : JSON.stringify(a)).join(' '));
    }
  });
  await new Promise(r => ws.on('open', r));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 2000));

  // Register a new user with 0 subjects
  const res = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        try {
          const email = 'zero_' + Date.now() + '@vignan.ac.in';
          await window.store.register({
            email,
            password: 'Password123',
            name: 'Zero Subjects User',
            college: 'Vignan University',
            major: 'CSE',
            role: 'STUDENT',
            bio: 'Testing 0 subjects'
          });
          window.app.hideEntrancePortal();
          await window.app.renderAll();
          window.app.switchView('view-quizzes');
          return { registered: true, user: window.store.currentUser.name };
        } catch(e) {
          return { err: e.message };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Register & switch to assessment:', res.result?.value);
  await new Promise(r => setTimeout(r, 1000));

  // Check state of Assessment page
  const assessState = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const count = document.getElementById('assessmentUserSubjectCount')?.textContent;
        const grid = document.getElementById('assessmentSubjectsGrid')?.innerText;
        return { count, gridSnippet: grid?.substring(0, 100) };
      })()
    `,
    returnByValue: true
  });
  console.log('Assessment state:', assessState.result?.value);

  // Now click the button inside the empty state grid
  const clickRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const grid = document.getElementById('assessmentSubjectsGrid');
        const btn = grid.querySelector('button');
        if (!btn) return { error: 'No button in grid' };
        console.log('Clicking button with text:', btn.innerText);
        btn.click();
        const addSkillModal = document.getElementById('addSkillModal');
        const authModal = document.getElementById('authModal');
        const portal = document.getElementById('entrancePortalOverlay');
        return {
          btnText: btn.innerText,
          addSkillModalActive: addSkillModal.classList.contains('active'),
          authModalActive: authModal.classList.contains('active'),
          portalDisplay: portal.style.display,
          portalActive: document.body.classList.contains('portal-active')
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Click result:', clickRes.result?.value);

  ws.close();
  chrome.kill();
}
test().catch(console.error);
