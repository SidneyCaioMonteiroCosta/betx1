// middleware/requireKyc.js
// Use depois do middleware de autenticação (req.user já preenchido).
//
// Exemplo no app.js:
//   const { requireKycApproved } = require('./middleware/requireKyc');
//   app.use('/api/games',    requireAuth, requireKycApproved);
//   app.use('/api/deposits', requireAuth, requireKycApproved);
//   app.use('/api/withdraw', requireAuth, requireKycApproved);
//
// Rotas que ficam LIBERADAS sem KYC: /api/kyc/*, /api/auth/*, /api/me

function requireKycApproved(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (req.user.kyc_status === 'approved') return next();

  return res.status(403).json({
    error: 'kyc_required',
    kyc_status: req.user.kyc_status,
    message: 'Você precisa concluir a verificação de identidade para usar essa funcionalidade.',
    redirect: '/kyc.html'
  });
}

module.exports = { requireKycApproved };
