const { trusodbService } = require('../../backend/database/trusodb');
const { analyzeAndVerifyCertificate } = require('../../backend/services/certificateVerifier');

async function runTests() {
  console.log('================================================================');
  console.log('   SKILLSWAP CERTIFICATE VERIFICATION LIFECYCLE AUDIT SUITE    ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
    }
  }

  // TEST 1: Inspect Mahi's existing certificate in SQLite DB
  console.log('Test 1: Verify Mahi (usr_1790057593868) Database Record State');
  const certs = await trusodbService.getCertificates('usr_1790057593868');
  assert(certs.length > 0, 'Mahi has at least 1 certificate in database');
  const mahiCert = certs[0];
  assert(mahiCert.certificate_status === 'NOT_VERIFIED', `Mahi cert status is NOT_VERIFIED (got: ${mahiCert.certificate_status})`);
  assert(mahiCert.tutor_eligible === 0, `Mahi tutor_eligible is 0 (got: ${mahiCert.tutor_eligible})`);
  assert(mahiCert.is_verified === 0, `Mahi is_verified is 0 (got: ${mahiCert.is_verified})`);
  assert(mahiCert.verification_reason && mahiCert.verification_reason.includes('bye'), 'Mahi verification_reason details syntax rejection for ID "bye"');

  // TEST 2: Verify Status Determination Logic (Simulating app.js logic)
  console.log('\nTest 2: Verify Frontend Status Determination Logic');
  function determineStatus(c) {
    const rawStatus = (c.certificate_status || c.verification_status || c.status || '').toUpperCase();
    let status = 'PENDING_VERIFICATION';
    if (rawStatus === 'VERIFIED' || c.is_verified === 1) {
      status = 'VERIFIED';
    } else if (rawStatus === 'NOT_VERIFIED' || c.verification_result === 'FAKE' || c.is_verified === -1) {
      status = 'NOT_VERIFIED';
    } else if (rawStatus === 'NEEDS_MANUAL_REVIEW' || rawStatus === 'NEEDS_REVIEW' || rawStatus === 'PENDING_FACULTY') {
      status = 'NEEDS_MANUAL_REVIEW';
    } else if (c.is_verified === 0 && (c.verification_reason || c.rejection_reason)) {
      status = 'NOT_VERIFIED';
    }
    return status;
  }

  const mahiCalculatedStatus = determineStatus(mahiCert);
  assert(mahiCalculatedStatus === 'NOT_VERIFIED', `Mahi certificate evaluates to NOT_VERIFIED in frontend (got: ${mahiCalculatedStatus})`);

  // TEST 3: Verification Engine - 3 Distinct Outcomes
  console.log('\nTest 3: Verification Engine 3 Outcomes (VERIFIED, NOT_VERIFIED, NEEDS_MANUAL_REVIEW)');
  
  // 3a. Authentic NPTEL cert
  const authenticReport = analyzeAndVerifyCertificate({
    recipientName: 'Sri Dhanush',
    skillName: 'Programming in Python',
    title: 'Programming, Data Structures and Algorithms Using Python',
    authority: 'NPTEL (IIT Madras)',
    issuer: 'NPTEL (IIT Madras)',
    credentialId: 'NPTEL23CS42S12345678',
    scoreOrGrade: 'Elite+Gold (94%)',
    fileName: 'NPTEL_Python_Certificate.pdf',
    verificationUrl: 'https://nptel.ac.in/noc/Ecertificate/?q=NPTEL23CS42S12345678',
    userContext: { name: 'Sri Dhanush', id: 'sri' }
  });
  assert(authenticReport.certificate_status === 'VERIFIED', `Authentic NPTEL certificate results in VERIFIED (got: ${authenticReport.certificate_status})`);
  assert(authenticReport.tutor_eligible === true, `Authentic NPTEL certificate grants tutor_eligible = true`);

  // 3b. Fraudulent / Invalid NPTEL cert (like Mahi's 'bye')
  const invalidReport = analyzeAndVerifyCertificate({
    recipientName: 'mahi',
    skillName: 'hlo',
    title: 'hlo',
    authority: 'NPTEL',
    credentialId: 'bye',
    scoreOrGrade: '54',
    fileName: 'test.pdf',
    userContext: { name: 'mahi', id: 'usr_1790057593868' }
  });
  assert(invalidReport.certificate_status === 'NOT_VERIFIED', `Invalid ID "bye" results in NOT_VERIFIED (got: ${invalidReport.certificate_status})`);
  assert(invalidReport.tutor_eligible === false, `Invalid ID "bye" denies tutor_eligible (got: ${invalidReport.tutor_eligible})`);

  // 3c. Unaccredited platform -> NEEDS_MANUAL_REVIEW
  const unknownIssuerReport = analyzeAndVerifyCertificate({
    recipientName: 'Sri Dhanush',
    skillName: 'Graphic Design',
    title: 'Graphic Design Masterclass',
    authority: 'Random Boot Camp Institute',
    issuer: 'Random Boot Camp Institute',
    credentialId: 'RND-98765432',
    scoreOrGrade: '88%',
    fileName: 'bootcamp_cert.pdf',
    userContext: { name: 'Sri Dhanush', id: 'sri' }
  });
  assert(unknownIssuerReport.certificate_status === 'NEEDS_MANUAL_REVIEW', `Unaccredited issuer results in NEEDS_MANUAL_REVIEW (got: ${unknownIssuerReport.certificate_status})`);
  assert(unknownIssuerReport.tutor_eligible === false, `NEEDS_MANUAL_REVIEW sets tutor_eligible = false (Not eligible yet)`);

  // TEST 4: Backend API Status Endpoint
  console.log('\nTest 4: Backend API Status Endpoint (/api/certificates/status?userId=usr_1790057593868)');
  const res = await fetch('http://localhost:3000/api/certificates/status?userId=usr_1790057593868');
  const apiStatus = await res.json();
  assert(apiStatus.success === true, 'Status endpoint returned success: true');
  assert(apiStatus.status === 'NOT_VERIFIED', `Status endpoint reports status = NOT_VERIFIED (got: ${apiStatus.status})`);
  assert(apiStatus.tutor_eligible === 0, `Status endpoint reports tutor_eligible = 0 (got: ${apiStatus.tutor_eligible})`);

  console.log('\n================================================================');
  console.log(`   EVALUATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('All backend and business logic tests PASSED successfully!');
    process.exit(0);
  } else {
    console.error('Some tests failed!');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during evaluation:', err);
  process.exit(1);
});
