module.exports = (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    platform: 'SkillSwap Peer-to-Peer Hub',
    authSystem: 'JWT + TrusoDB Auth Bridge + RBAC Active',
    roles: ['STUDENT', 'ADMIN']
  });
};
