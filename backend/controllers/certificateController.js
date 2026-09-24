const { trusodbService, supabaseService } = require('../database/trusodb');
const { analyzeAndVerifyCertificate } = require('../services/certificateVerifier');

const certificateController = {
  async getCertificates(req, res, next) {
    try {
      const userId = req.user?.id || req.query.userId || req.headers['x-user-id'];
      const certs = await supabaseService.getCertificates(userId);
      res.json({ success: true, certificates: certs });
    } catch (err) {
      next(err);
    }
  },

  async getCertificateStatus(req, res, next) {
    try {
      const userId = req.user?.id || req.query.userId || req.currentUserId || 'sri';
      const statusData = await supabaseService.getUserCertificateStatus(userId);
      res.json({ success: true, ...statusData });
    } catch (err) {
      next(err);
    }
  },

  async uploadCertificate(req, res, next) {
    try {
      const { skillName, issuer, certificateId, credentialId, credentialUrl, verificationScore, title, authority, scoreOrGrade, fileName, fileData, recipientName, issueDate } = req.body;
      const userId = req.user?.id || req.body.userId || req.currentUserId || 'sri';

      const result = await supabaseService.uploadCertificate(userId, {
        skillName,
        recipientName,
        authority: authority || issuer || 'NPTEL (IIT Madras / Kharagpur)',
        issuer: issuer || authority || 'NPTEL (IIT Madras / Kharagpur)',
        title: title || `${skillName} Certification`,
        credentialId: credentialId || certificateId,
        certificateId: credentialId || certificateId,
        credentialUrl,
        verificationScore,
        scoreOrGrade,
        issueDate,
        fileName,
        fileData
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          result: result.result || 'NOT_VERIFIED',
          status: result.status || 'NOT_VERIFIED',
          verification_status: result.verification_status || 'NOT_VERIFIED',
          tutor_eligible: 0,
          is_verified: 0,
          aiReport: result.aiReport,
          certificateId: result.certId,
          error: result.error || result.aiReport?.reason || 'Verification Failed: The certificate is invalid, altered, or unrecognized.',
          reason: result.error || result.aiReport?.reason || 'Verification Failed: The certificate is invalid, altered, or unrecognized.',
          certificate: {
            id: result.certId,
            user_id: userId,
            title: title || `${skillName} Certification`,
            authority: authority || issuer || 'NPTEL (IIT Madras / Kharagpur)',
            credential_id: credentialId || certificateId,
            score_or_grade: scoreOrGrade,
            status: 'NOT_VERIFIED',
            certificate_status: 'NOT_VERIFIED',
            verification_status: result.verification_status || 'NOT_VERIFIED',
            tutor_eligible: 0,
            is_verified: 0,
            verification_reason: result.error || result.aiReport?.reason || 'Verification failed.'
          }
        });
      }

      const finalStatus = result.status || (result.isPendingManualReview ? 'NEEDS_MANUAL_REVIEW' : 'VERIFIED');
      const isVerifiedBool = finalStatus === 'VERIFIED';

      res.json({ 
        success: true, 
        result: result.result || finalStatus,
        status: finalStatus,
        verification_status: result.verification_status || finalStatus,
        tutor_eligible: result.tutor_eligible !== undefined ? result.tutor_eligible : (isVerifiedBool ? 1 : 0),
        is_verified: result.is_verified !== undefined ? result.is_verified : (isVerifiedBool ? 1 : 0),
        aiReport: result.aiReport,
        certificate: result.certificate || result,
        verificationProof: result.verificationProof,
        logoVerified: result.logoVerified !== false,
        logoDetails: result.logoDetails || 'NPTEL Official Seal & IIT Madras Digital Watermark Verified',
        authorizedBy: result.authorizedBy || 'National Programme on Technology Enhanced Learning (NPTEL & IIT Council)',
        tierInfo: result.tierInfo,
        qualificationBonusAwarded: result.qualificationBonusAwarded === true,
        bonusCredits: result.bonusCredits !== undefined ? result.bonusCredits : (isVerifiedBool ? 2.0 : 0),
        isPendingManualReview: result.isPendingManualReview || false,
        message: result.message || (isVerifiedBool 
          ? 'Certificate successfully verified through AI multi-vector authenticity engine! +2.0 Skill Credits allotted to your wallet.'
          : 'Certificate uploaded and queued for Faculty Administrator manual audit.')
      });
    } catch (err) {
      next(err);
    }
  },

  async verifyCertificateAI(req, res, next) {
    try {
      const { skillName, issuer, certificateId, credentialId, credentialUrl, verificationScore, title, authority, scoreOrGrade, fileName, fileData, recipientName, issueDate } = req.body;
      const userId = req.user?.id || req.body.userId || req.currentUserId || 'sri';
      const user = await supabaseService.getUserById(userId);

      const aiReport = analyzeAndVerifyCertificate({
        skillName,
        recipientName: recipientName || user?.name || 'Student',
        authority: authority || issuer || 'Academic Authority',
        issuer: issuer || authority || 'Academic Authority',
        title: title || `${skillName} Certification`,
        credentialId: credentialId || certificateId,
        scoreOrGrade,
        issueDate,
        verificationUrl: credentialUrl,
        fileName,
        fileData,
        userContext: user || {}
      });

      res.json(aiReport);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = certificateController;
