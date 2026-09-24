const http = require('http');
const fs = require('fs');
const path = require('path');

async function request(options, data, isFormData = false, boundary = '') {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text), buffer });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: text, buffer });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function login(email, password, name = 'Test User') {
  let res = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password });

  if (!res.body?.token) {
    await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name,
      email,
      password,
      college: 'Vignan University',
      major: 'B.Tech CSE',
      role: 'STUDENT'
    });

    res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email, password });
  }

  if (!res.body?.token) throw new Error(`Login failed for ${email}: ` + JSON.stringify(res.body));
  return { token: res.body.token, user: res.body.user };
}

async function runVoiceMessagingTests() {
  console.log('🎙️ ============================================================');
  console.log('🎙️ STARTING VOICE MESSAGING AUDIO PIPELINE E2E VERIFICATION');
  console.log('🎙️ ============================================================');

  // 1. Authenticate Mahi & Akki
  const mahi = await login('mahi@vignan.ac.in', 'Password123', 'Mahi');
  const akki = await login('akki@vignan.ac.in', 'Password123', 'Akki');
  console.log(`✅ Step 1: Logged in Mahi (${mahi.user.id}) & Akki (${akki.user.id})`);

  // 2. Prepare real audio buffer (test_audio_sample.webm or generate mock audio header)
  let audioBuffer;
  const samplePath = path.join(__dirname, 'test_audio_sample.webm');
  if (fs.existsSync(samplePath)) {
    audioBuffer = fs.readFileSync(samplePath);
  } else {
    // Generate valid dummy buffer
    audioBuffer = Buffer.from('RIFF....WAVEfmt ....data....', 'utf8');
  }

  // 3. Upload audio via multipart/form-data to POST /api/chats/upload-voice
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice_recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const multipartBody = Buffer.concat([
    Buffer.from(header, 'utf8'),
    audioBuffer,
    Buffer.from(footer, 'utf8')
  ]);

  const uploadRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/chats/upload-voice',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': multipartBody.length,
      'Authorization': `Bearer ${mahi.token}`
    }
  }, multipartBody);

  if (uploadRes.status !== 200 || !uploadRes.body?.audioUrl) {
    throw new Error('❌ Upload voice failed: ' + JSON.stringify(uploadRes.body));
  }
  const uploadedAudioUrl = uploadRes.body.audioUrl;
  console.log(`✅ Step 2: Binary audio uploaded successfully. Returned URL: ${uploadedAudioUrl}`);

  // 4. Verify file actually exists on disk
  const localFilePath = path.join(__dirname, uploadedAudioUrl.replace(/^\//, ''));
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`❌ Uploaded audio file not found on disk at: ${localFilePath}`);
  }
  const stats = fs.statSync(localFilePath);
  console.log(`✅ Step 3: Verified audio file exists on disk (${stats.size} bytes) at ${localFilePath}`);

  // 5. Send voice message from Mahi to Akki
  const sendRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/chats/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mahi.token}`
    }
  }, {
    receiverId: akki.user.id,
    text: 'Voice note (0:05)',
    messageType: 'voice',
    audioUrl: uploadedAudioUrl,
    audioDuration: 5
  });

  if (sendRes.status !== 200 && sendRes.status !== 201) {
    throw new Error('❌ Send voice message failed: ' + JSON.stringify(sendRes.body));
  }
  const sentMessage = sendRes.body.data || sendRes.body.message || sendRes.body;
  console.log(`✅ Step 4: Voice message sent from Mahi to Akki. Message ID: ${sentMessage.id}`);

  // 6. Verify Akki receives the voice message with persistent audio_url
  const getRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/chats/messages?peerId=${mahi.user.id}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${akki.token}`
    }
  });

  if (getRes.status !== 200 || !Array.isArray(getRes.body.messages)) {
    throw new Error('❌ Fetch messages failed: ' + JSON.stringify(getRes.body));
  }
  const voiceMsg = getRes.body.messages.find(m => m.audio_url === uploadedAudioUrl || m.id === sentMessage.id);
  if (!voiceMsg) {
    throw new Error('❌ Akki could not find the voice message in conversation messages!');
  }
  if (!voiceMsg.audio_url || !voiceMsg.audio_url.startsWith('/uploads/voice/')) {
    throw new Error(`❌ Voice message missing valid audio_url! Found: ${voiceMsg.audio_url}`);
  }
  console.log(`✅ Step 5: Akki retrieved voice message with valid audio_url: ${voiceMsg.audio_url}`);

  // 7. Verify HTTP Byte-Range Streaming (crucial for Chromium WebM playback & seeking)
  const streamRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: uploadedAudioUrl,
    method: 'GET',
    headers: {
      'Range': 'bytes=0-50'
    }
  });

  if (streamRes.status !== 206) {
    throw new Error(`❌ HTTP Byte-Range request failed! Expected status 206 Partial Content, got: ${streamRes.status}`);
  }
  if (!streamRes.headers['accept-ranges'] || streamRes.headers['accept-ranges'] !== 'bytes') {
    throw new Error(`❌ Missing or invalid Accept-Ranges header: ${streamRes.headers['accept-ranges']}`);
  }
  if (!streamRes.headers['content-range']) {
    throw new Error(`❌ Missing Content-Range header in 206 response`);
  }
  console.log(`✅ Step 6: HTTP Byte-Range Audio Streaming verified (Status 206, Accept-Ranges: bytes, Content-Range: ${streamRes.headers['content-range']})`);

  // 8. Verify Text Messaging continues to work seamlessly
  const textRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/chats/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${akki.token}`
    }
  }, {
    receiverId: mahi.user.id,
    text: 'I received and heard your voice message clearly!',
    messageType: 'text'
  });

  if (textRes.status !== 200 && textRes.status !== 201) {
    throw new Error('❌ Send text message failed: ' + JSON.stringify(textRes.body));
  }
  console.log('✅ Step 7: Text messaging verified working in parallel with voice messaging');

  console.log('🎉 ============================================================');
  console.log('🎉 ALL VOICE MESSAGING AUDIO PIPELINE TESTS PASSED 100%!');
  console.log('🎉 ============================================================');
}

runVoiceMessagingTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
