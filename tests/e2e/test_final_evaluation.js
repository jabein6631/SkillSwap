const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('============================================================');
  console.log('RUNNING FULL END-TO-END VERIFICATION SUITE');
  console.log('============================================================\n');

  const tempProfile = 'C:\\Users\\Lenovo\\AppData\\Local\\Temp\\chrome_final_test_' + Date.now();
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    '--user-data-dir=' + tempProfile
  ]);

  let targets = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      targets = await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:9222/json', (res) => {
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

  if (!targets) throw new Error('Could not connect to Chrome CDP on port 9222');

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

  const logs = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) cb.reject(msg.error);
      else cb.resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value !== undefined ? a.value : JSON.stringify(a)).join(' ');
      logs.push(text);
      console.log(`[BROWSER CONSOLE]`, text);
    }
  });

  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- Step 0: Logging in normally as sri@vignan.ac.in ---');
  const loginRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        try {
          const res = await window.store.login('sri@vignan.ac.in', 'Password123');
          window.app.hideEntrancePortal();
          await window.app.renderAll();
          window.app.switchView('view-quizzes');
          return {
            success: true,
            user: window.store.currentUser?.name,
            tokenExists: Boolean(window.store.token),
            localStorageToken: Boolean(localStorage.getItem('token')),
            localStorageAuthToken: Boolean(localStorage.getItem('skillswap_auth_token'))
          };
        } catch (e) {
          return { error: e.message };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Login Result:', loginRes.result?.value);
  await new Promise(r => setTimeout(r, 800));

  // ============================================================
  // TEST 1: Assessment -> + Add Subject to Profile -> Add Subject / Skill
  // ============================================================
  console.log('\n--- TEST 1: Click "+ Add Subject to Profile" on Assessment page ---');
  logs.length = 0; // clear log buffer

  const test1Click = await send('Runtime.evaluate', {
    expression: `
      (() => {
        // Try empty-state button first if present, otherwise header button
        const emptyBtn = document.getElementById('assessmentEmptyAddSubjectBtn') || document.querySelector('#assessmentSubjectsGrid button');
        const headerBtn = document.getElementById('assessmentAddSkillModalBtn');
        const targetBtn = emptyBtn || headerBtn;
        if (!targetBtn) return { error: 'No Add Subject button found' };
        targetBtn.click();
        const modal = document.getElementById('addSkillModal');
        const authModal = document.getElementById('authModal');
        const portal = document.getElementById('entrancePortalOverlay');
        const bodyPortalActive = document.body.classList.contains('portal-active');

        return {
          btnId: targetBtn.id || targetBtn.className,
          btnText: targetBtn.innerText.trim(),
          modalActive: modal ? modal.classList.contains('active') : false,
          authModalActive: authModal ? authModal.classList.contains('active') : false,
          portalVisible: portal ? portal.style.display !== 'none' : false,
          bodyPortalActive: bodyPortalActive,
          currentPath: window.location.pathname
        };
      })()
    `,
    returnByValue: true
  });

  await new Promise(r => setTimeout(r, 600));
  console.log('Test 1 State:', test1Click.result?.value);

  const test1Pass = test1Click.result?.value?.modalActive === true &&
    test1Click.result?.value?.authModalActive === false &&
    test1Click.result?.value?.portalVisible === false &&
    test1Click.result?.value?.bodyPortalActive === false;

  console.log('TEST 1 RESULT:', test1Pass ? 'PASS' : 'FAIL');

  // ============================================================
  // TEST 2: Add Subject / Skill -> Add Java -> Success -> Assessment -> Java appears
  // ============================================================
  console.log('\n--- TEST 2: Add Java -> Success -> Go to Assessment -> Java appears ---');
  const test2Add = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        // Quick fill Java Full Stack Development
        window.app.quickFillPopularSubject(
          'Java Full Stack Development',
          'Programming',
          'Intermediate',
          'Java, OOP, Collections, Multithreading, Spring Boot, REST APIs, JDBC'
        );

        // Submit the form via app method
        await window.app.submitAddSkillForm();

        const successView = document.getElementById('addSkillModalSuccessView');
        const successVisible = successView && successView.style.display !== 'none';
        const successName = document.getElementById('addSkillSuccessSubjectName')?.textContent;

        // Click Go to Assessment
        window.app.handleSuccessGoToAssessment();
        await new Promise(r => setTimeout(r, 600));

        const selected = window.app.selectedAssessmentSubject;
        const allSubjects = (window.app.assessmentSubjects || []).map(s => s.skill_name);
        const modalStillOpen = document.getElementById('addSkillModal').classList.contains('active');

        return {
          successVisible,
          successName,
          selected,
          allSubjects,
          modalStillOpen
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Test 2 Result Details:', test2Add.result?.value);

  const test2Pass = test2Add.result?.value?.successVisible === true &&
    test2Add.result?.value?.allSubjects?.includes('Java Full Stack Development') &&
    test2Add.result?.value?.selected === 'Java Full Stack Development' &&
    test2Add.result?.value?.modalStillOpen === false;

  console.log('TEST 2 RESULT:', test2Pass ? 'PASS' : 'FAIL');

  // ============================================================
  // TEST 3: Assessment -> + Add Another Subject -> Add Subject / Skill
  // ============================================================
  console.log('\n--- TEST 3: Click "+ Add Another Subject" ---');
  const test3Click = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = document.getElementById('assessmentAddAnotherSubjectBtn');
        if (!btn) return { error: 'No assessmentAddAnotherSubjectBtn found' };
        btn.click();

        const modal = document.getElementById('addSkillModal');
        const authModal = document.getElementById('authModal');
        const portal = document.getElementById('entrancePortalOverlay');

        return {
          btnText: btn.innerText.trim(),
          modalActive: modal ? modal.classList.contains('active') : false,
          authModalActive: authModal ? authModal.classList.contains('active') : false,
          portalVisible: portal ? portal.style.display !== 'none' : false,
          currentPath: window.location.pathname
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Test 3 State:', test3Click.result?.value);

  const test3Pass = test3Click.result?.value?.modalActive === true &&
    test3Click.result?.value?.authModalActive === false &&
    test3Click.result?.value?.portalVisible === false;

  console.log('TEST 3 RESULT:', test3Pass ? 'PASS' : 'FAIL');

  // Close modal before refresh test
  await send('Runtime.evaluate', { expression: `window.app.closeModal('addSkillModal')` });
  await new Promise(r => setTimeout(r, 400));

  // ============================================================
  // TEST 4: Refresh browser -> Authenticated -> Add Subject
  // ============================================================
  console.log('\n--- TEST 4: Browser Refresh -> Authentication Persistence -> Add Subject ---');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2500));

  const test4State = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const isSessionActive = window.store.isSessionActive();
        const currentUser = window.store.currentUser?.name || window.store.getCurrentPersona()?.name;
        const portal = document.getElementById('entrancePortalOverlay');
        const portalActive = document.body.classList.contains('portal-active');
        const token = localStorage.getItem('token') || localStorage.getItem('skillswap_auth_token');

        // Switch to quizzes view and click add subject
        window.app.switchView('view-quizzes');
        const addBtn = document.getElementById('assessmentAddSkillModalBtn') || document.getElementById('assessmentAddAnotherSubjectBtn');
        addBtn.click();

        const modal = document.getElementById('addSkillModal');

        return {
          isSessionActive,
          currentUser,
          hasToken: Boolean(token),
          portalActive,
          portalVisible: portal ? portal.style.display !== 'none' : false,
          addSkillModalActiveAfterReload: modal ? modal.classList.contains('active') : false
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Test 4 State:', test4State.result?.value);

  const test4Pass = test4State.result?.value?.isSessionActive === true &&
    test4State.result?.value?.portalActive === false &&
    test4State.result?.value?.portalVisible === false &&
    test4State.result?.value?.addSkillModalActiveAfterReload === true;

  console.log('TEST 4 RESULT:', test4Pass ? 'PASS' : 'FAIL');

  // ============================================================
  // TEST 5: User with 0 subjects (Empty State Button)
  // ============================================================
  console.log('\n--- TEST 5: Testing with brand new student with 0 subjects ---');
  const test5Zero = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const email = 'zero_eval_' + Date.now() + '@vignan.ac.in';
        await window.store.register({
          email,
          password: 'Password123',
          name: 'Zero Subjects Student',
          college: 'Vignan University',
          major: 'CSE',
          role: 'STUDENT',
          bio: 'Zero subjects test'
        });
        window.app.hideEntrancePortal();
        await window.app.renderAll();
        window.app.switchView('view-quizzes');
        await new Promise(r => setTimeout(r, 600));

        // Click the empty state button
        const emptyBtn = document.getElementById('assessmentEmptyAddSubjectBtn');
        if (!emptyBtn) return { error: 'Empty button not found' };
        emptyBtn.click();

        const modal = document.getElementById('addSkillModal');
        const portal = document.getElementById('entrancePortalOverlay');

        return {
          emptyBtnFound: true,
          modalActive: modal.classList.contains('active'),
          portalActive: document.body.classList.contains('portal-active'),
          portalDisplay: portal.style.display
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Test 5 State (0 Subjects User):', test5Zero.result?.value);
  const test5Pass = test5Zero.result?.value?.modalActive === true &&
    test5Zero.result?.value?.portalActive === false;
  console.log('TEST 5 RESULT:', test5Pass ? 'PASS' : 'FAIL');

  console.log('\n============================================================');
  console.log('FINAL SUMMARY:');
  console.log(`1. Add Subject button → ${test1Pass ? 'PASS' : 'FAIL'}`);
  console.log(`2. Add Another Subject → ${test3Pass ? 'PASS' : 'FAIL'}`);
  console.log(`3. Add subject (Java) → ${test2Pass ? 'PASS' : 'FAIL'}`);
  console.log(`4. Return to assessment → ${test2Pass ? 'PASS' : 'FAIL'}`);
  console.log(`5. Refresh/auth persistence → ${test4Pass ? 'PASS' : 'FAIL'}`);
  console.log('============================================================');

  ws.close();
  chrome.kill();
}

run().catch(console.error);
