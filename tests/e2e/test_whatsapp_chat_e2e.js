// test_whatsapp_chat_e2e.js
// Automated verification suite for WhatsApp-style Text + Voice Only Direct Chat

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('========================================================');
  console.log('🧪 RUNNING WHATSAPP TEXT + VOICE ONLY CHAT E2E SUITE');
  console.log('========================================================\n');

  // 1. Authenticate Sri and Rishitha
  console.log('1️⃣ Authenticating test users...');
  async function loginOrRegister(email, password, name, role = 'STUDENT') {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).then(r => r.json());

    if (loginRes.success && loginRes.token) {
      return { token: loginRes.token, user: loginRes.user };
    }

    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role })
    }).then(r => r.json());

    if (!regRes.success || !regRes.token) {
      throw new Error(`Auth failed for ${email}: ${JSON.stringify(regRes)}`);
    }
    return { token: regRes.token, user: regRes.user };
  }

  const sriAuth = await loginOrRegister('sri@vignan.ac.in', 'Password123', 'Sri Dhanush');
  const rishithaAuth = await loginOrRegister('rishitha@vignan.ac.in', 'Password123', 'Rishitha');

  const sriToken = sriAuth.token;
  const rishithaToken = rishithaAuth.token;
  const sriId = sriAuth.user.id;
  const rishithaId = rishithaAuth.user.id;
  console.log(`✅ Sri (${sriId}) & Rishitha (${rishithaId}) authenticated successfully.\n`);

  // 2. Test Sending Text Message
  console.log('2️⃣ Sending text message from Sri to Rishitha...');
  const sendTextRes = await fetch(`${BASE_URL}/api/chats/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sriToken}`
    },
    body: JSON.stringify({
      receiverId: rishithaId,
      messageType: 'text',
      text: 'Hey Rishitha! Are you available for a Figma UI/UX coaching swap today?'
    })
  }).then(r => r.json());

  if (!sendTextRes.success || sendTextRes.message?.message_type !== 'text') {
    throw new Error('Failed to send text message: ' + JSON.stringify(sendTextRes));
  }
  console.log(`✅ Text message sent & stored in DB! ID: ${sendTextRes.message.id}, Type: ${sendTextRes.message.message_type}\n`);

  // 3. Test Sending Voice Message
  console.log('3️⃣ Sending voice message with Base64 audio payload from Sri to Rishitha...');
  const mockAudioBase64 = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZpkq17GDD0JARatdjv/////////+';
  const sendVoiceRes = await fetch(`${BASE_URL}/api/chats/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sriToken}`
    },
    body: JSON.stringify({
      receiverId: rishithaId,
      messageType: 'voice',
      text: '🎤 Voice message',
      audioData: mockAudioBase64,
      audioDuration: 7
    })
  }).then(r => r.json());

  if (!sendVoiceRes.success || sendVoiceRes.message?.message_type !== 'voice' || !sendVoiceRes.message?.audio_data) {
    throw new Error('Failed to send voice message: ' + JSON.stringify(sendVoiceRes));
  }
  console.log(`✅ Voice message sent & stored in DB! ID: ${sendVoiceRes.message.id}, Duration: ${sendVoiceRes.message.audio_duration}s\n`);

  // 4. Test File Upload Prohibition in Chat (Must be strictly rejected with HTTP 400)
  console.log('4️⃣ Testing File / Image Upload Rejection in Direct Chat...');
  const illegalFilePayloads = [
    { receiverId: rishithaId, messageType: 'file', fileName: 'document.pdf', fileData: 'base64...' },
    { receiverId: rishithaId, messageType: 'image', fileData: 'data:image/png;base64,...' },
    { receiverId: rishithaId, messageType: 'text', text: 'Here is file', attachments: [{ name: 'test.pdf' }] },
    { receiverId: rishithaId, messageType: 'text', text: 'image', attachmentData: 'base64...' }
  ];

  for (const payload of illegalFilePayloads) {
    const res = await fetch(`${BASE_URL}/api/chats/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sriToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.status !== 400 || data.success === true) {
      throw new Error(`File rejection failed! Allowed payload: ${JSON.stringify(payload)} (Status: ${res.status})`);
    }
    console.log(`   🛡️ Successfully blocked illegal upload (${payload.messageType || 'attachment'}): "${data.error}"`);
  }
  console.log('✅ All file/document uploads are strictly prohibited and blocked in Direct Chat.\n');

  // 5. Test Conversations List with Unread Counters & Voice Snippet
  console.log('5️⃣ Testing conversation summary for Rishitha...');
  const convsRes = await fetch(`${BASE_URL}/api/chats/conversations`, {
    headers: { 'Authorization': `Bearer ${rishithaToken}` }
  }).then(r => r.json());

  if (!convsRes.success || !Array.isArray(convsRes.conversations)) {
    throw new Error('Failed to fetch conversations: ' + JSON.stringify(convsRes));
  }

  const sriConv = convsRes.conversations.find(c => c.peer_id === sriId);
  if (!sriConv) {
    throw new Error(`Sri conversation (${sriId}) not found in Rishitha conversations list: ${JSON.stringify(convsRes.conversations)}`);
  }

  console.log(`✅ Found conversation with Sri!`);
  console.log(`   - Last message preview: "${sriConv.last_message_preview}"`);
  console.log(`   - Last message type: "${sriConv.last_message_type}"`);
  console.log(`   - Unread count: ${sriConv.unread_count}`);

  if (sriConv.unread_count < 2) {
    throw new Error(`Expected at least 2 unread messages, got ${sriConv.unread_count}`);
  }

  // 6. Test Fetching Messages & Automatic Mark As Read
  console.log('\n6️⃣ Fetching messages between Rishitha and Sri (Marking as read)...');
  const msgsRes = await fetch(`${BASE_URL}/api/chats/messages?peerId=${sriId}`, {
    headers: { 'Authorization': `Bearer ${rishithaToken}` }
  }).then(r => r.json());

  if (!msgsRes.success || !Array.isArray(msgsRes.messages)) {
    throw new Error('Failed to fetch messages');
  }

  console.log(`✅ Retrieved ${msgsRes.messages.length} messages between Sri and Rishitha.`);

  // Check conversations again to verify unread count is now 0
  const postReadConvs = await fetch(`${BASE_URL}/api/chats/conversations`, {
    headers: { 'Authorization': `Bearer ${rishithaToken}` }
  }).then(r => r.json());

  const postSriConv = postReadConvs.conversations.find(c => c.peer_id === sriId);
  console.log(`   - Unread count after reading: ${postSriConv?.unread_count || 0}`);
  if (postSriConv && postSriConv.unread_count !== 0) {
    throw new Error('Unread count did not reset to 0 after viewing messages');
  }

  console.log('\n========================================================');
  console.log('🎉 ALL WHATSAPP DIRECT CHAT E2E TESTS PASSED 100%!');
  console.log('========================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
