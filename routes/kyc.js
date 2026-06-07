// routes/kyc.js
const express = require('express');
const { getKycProvider } = require('../services/kycProvider');
const { isValidCPF, cleanCPF, isAdult, getAge } = require('../utils/cpf');
const govbr = require('../services/govbr');

// Armazena state temporário para validar callback (em memória, suficiente para 1 servidor)
const pendingStates = new Map(); // state -> userId

module.exports = function kycRoutes({ db, requireAuth, requireAdmin }) {
  const router = express.Router();
  const provider = getKycProvider();

  // ---------- GET /api/kyc/govbr/start ----------
  // Redireciona o usuário para o Gov.br.
  // Aceita token via query ?_t= porque o browser faz redirect (não pode setar header).
  router.get('/govbr/start', (req, res, next) => {
    if (req.query._t) req.headers.authorization = 'Bearer ' + req.query._t;
    requireAuth(req, res, next);
  }, (req, res) => {
    if (!process.env.GOVBR_CLIENT_ID) {
      return res.redirect((process.env.PUBLIC_URL || '') + '/kyc-callback.html?status=rejected&reason=govbr_nao_configurado');
    }
    const state = `${req.user.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    pendingStates.set(state, req.user.id);
    // Limpar states antigos (>10 min)
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [s] of pendingStates) {
      const ts = parseInt(s.split('_')[1]);
      if (ts < cutoff) pendingStates.delete(s);
    }
    res.redirect(govbr.buildAuthUrl(state));
  });

  // ---------- GET /api/kyc/govbr/callback ----------
  // Gov.br redireciona aqui com ?code=...&state=...
  router.get('/govbr/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const publicUrl = process.env.PUBLIC_URL || '';

    if (error || !code || !state) {
      return res.redirect(`${publicUrl}/kyc-callback.html?status=rejected&reason=acesso_negado`);
    }

    const userId = pendingStates.get(state);
    if (!userId) {
      return res.redirect(`${publicUrl}/kyc-callback.html?status=rejected&reason=state_invalido`);
    }
    pendingStates.delete(state);

    try {
      const tokenData = await govbr.exchangeCode(code);
      if (!tokenData.access_token) {
        return res.redirect(`${publicUrl}/kyc-callback.html?status=rejected&reason=token_invalido`);
      }

      const info = await govbr.getUserInfo(tokenData.access_token);

      // Gov.br retorna CPF no campo "sub" ou "cpf"
      const cpfRaw = info.cpf || info.sub || '';
      const cpf = cpfRaw.replace(/\D/g, '');
      const fullName = info.name || info.nome || '';
      // dataNascimento vem como "DD/MM/YYYY" ou "YYYY-MM-DD"
      let birthDate = info.dataNascimento || info.birthdate || null;
      if (birthDate && birthDate.includes('/')) {
        const [d, m, y] = birthDate.split('/');
        birthDate = `${y}-${m}-${d}`;
      }

      if (!cpf || cpf.length !== 11) {
        return res.redirect(`${publicUrl}/kyc-callback.html?status=rejected&reason=cpf_nao_retornado`);
      }
      if (!isAdult(birthDate)) {
        return res.redirect(`${publicUrl}/kyc-callback.html?status=rejected&reason=menor_de_idade`);
      }

      // CPF já vinculado a outra conta?
      const dupe = await db.query(
        'SELECT id FROM users WHERE cpf = $1 AND id <> $2', [cpf, userId]
      );
      if (dupe.rows.length) {
        return res.redirect(`${publicUrl}/kyc-callback.html?status=rejected&reason=cpf_ja_usado`);
      }

      // Salvar e aprovar
      await db.query(
        `UPDATE users SET cpf=$1, full_name=$2, birth_date=$3,
          kyc_status='approved', kyc_provider='govbr', kyc_approved_at=NOW(),
          kyc_attempts=kyc_attempts+1
         WHERE id=$4`,
        [cpf, fullName, birthDate, userId]
      );
      await db.query(
        `INSERT INTO kyc_verifications (user_id, provider, provider_session_id, status, provider_raw)
         VALUES ($1, 'govbr', $2, 'approved', $3)`,
        [userId, state, JSON.stringify({ sub: info.sub, name: info.name })]
      );

      res.redirect(`${publicUrl}/kyc-callback.html?status=approved`);
    } catch (err) {
      console.error('[kyc/govbr/callback]', err.message);
      res.redirect(`${publicUrl}/kyc-callback.html?status=rejected&reason=erro_interno`);
    }
  });

  // ---------- POST /api/kyc/start ----------
  // Usuário envia CPF, nome completo e data de nascimento.
  // Validamos local (CPF + 18+) e criamos sessão no provedor.
  router.post('/start', requireAuth, async (req, res) => {
    try {
      const { cpf, full_name, birth_date } = req.body;

      if (!cpf || !full_name || !birth_date) {
        return res.status(400).json({ error: 'missing_fields' });
      }
      if (!isValidCPF(cpf)) {
        return res.status(400).json({ error: 'invalid_cpf' });
      }
      if (!isAdult(birth_date)) {
        return res.status(403).json({
          error: 'underage',
          message: 'Você precisa ter 18 anos ou mais para usar o Super Duelo.',
          age: getAge(birth_date)
        });
      }

      const cpfClean = cleanCPF(cpf);

      // CPF já vinculado a outra conta?
      const dupe = await db.query(
        'SELECT id FROM users WHERE cpf = $1 AND id <> $2',
        [cpfClean, req.user.id]
      );
      if (dupe.rows.length) {
        return res.status(409).json({ error: 'cpf_already_used' });
      }

      // Guarda dados básicos + tenta criar sessão no provedor
      await db.query(
        `UPDATE users SET cpf=$1, full_name=$2, birth_date=$3,
                          kyc_attempts = kyc_attempts + 1
         WHERE id=$4`,
        [cpfClean, full_name.trim(), birth_date, req.user.id]
      );

      const returnUrl = `${process.env.PUBLIC_URL}/kyc-callback.html`;
      const session = await provider.createSession({
        user: { id: req.user.id, email: req.user.email },
        returnUrl
      });

      await db.query(
        `UPDATE users SET kyc_status='submitted',
                          kyc_provider=$1,
                          kyc_provider_session_id=$2
         WHERE id=$3`,
        [process.env.KYC_PROVIDER || 'mock', session.sessionId, req.user.id]
      );

      await db.query(
        `INSERT INTO kyc_verifications (user_id, provider, provider_session_id, status)
         VALUES ($1, $2, $3, 'submitted')`,
        [req.user.id, process.env.KYC_PROVIDER || 'mock', session.sessionId]
      );

      res.json({
        ok: true,
        sessionId: session.sessionId,
        redirectUrl: session.redirectUrl,
        clientSecret: session.clientSecret
      });
    } catch (err) {
      console.error('[kyc/start]', err);
      res.status(500).json({ error: 'kyc_start_failed', detail: err.message });
    }
  });

  // ---------- GET /api/kyc/status ----------
  // Front faz polling enquanto provedor não bate webhook.
  router.get('/status', requireAuth, async (req, res) => {
    try {
      const u = (await db.query(
        `SELECT kyc_status, kyc_provider_session_id, kyc_rejection_reason
           FROM users WHERE id=$1`,
        [req.user.id]
      )).rows[0];

      // Se ainda 'submitted', consulta provedor pra atualizar
      if (u.kyc_status === 'submitted' && u.kyc_provider_session_id) {
        const remote = await provider.getSession(u.kyc_provider_session_id);
        if (remote.status !== 'submitted') {
          await applyVerdict(db, req.user.id, u.kyc_provider_session_id, remote);
          u.kyc_status = remote.status;
          u.kyc_rejection_reason = remote.rejectionReason || null;
        }
      }

      res.json({
        status: u.kyc_status,
        rejection_reason: u.kyc_rejection_reason
      });
    } catch (err) {
      console.error('[kyc/status]', err);
      res.status(500).json({ error: 'kyc_status_failed' });
    }
  });

  // ---------- POST /api/kyc/webhook ----------
  // IMPORTANTE: monte essa rota com express.raw no app.js ANTES do express.json(),
  // pra Stripe conseguir validar a assinatura.
  router.post('/webhook', async (req, res) => {
    try {
      const event = await provider.verifyWebhook(req);
      if (!event) return res.status(400).send('invalid');

      const v = (await db.query(
        `SELECT user_id FROM kyc_verifications
          WHERE provider_session_id=$1 ORDER BY id DESC LIMIT 1`,
        [event.sessionId]
      )).rows[0];
      if (!v) return res.status(404).send('session_not_found');

      const remote = await provider.getSession(event.sessionId);
      await applyVerdict(db, v.user_id, event.sessionId, remote);

      res.json({ received: true });
    } catch (err) {
      console.error('[kyc/webhook]', err);
      res.status(500).send('webhook_error');
    }
  });

  // ---------- ADMIN ----------
  // GET /api/kyc/admin/pending — lista quem precisa de revisão manual
  router.get('/admin/pending', requireAuth, requireAdmin, async (_req, res) => {
    const rows = (await db.query(
      `SELECT u.id, u.email, u.full_name, u.cpf, u.birth_date,
              u.kyc_status, u.kyc_attempts, v.created_at,
              v.liveness_score, v.face_match_score, v.id AS verification_id
         FROM users u
         JOIN kyc_verifications v ON v.user_id = u.id
        WHERE u.kyc_status IN ('manual_review','submitted')
        ORDER BY v.created_at DESC`
    )).rows;
    res.json(rows);
  });

  // POST /api/kyc/admin/:userId/decide  { decision: 'approve'|'reject', reason? }
  router.post('/admin/:userId/decide', requireAuth, requireAdmin, async (req, res) => {
    const { decision, reason } = req.body;
    const userId = Number(req.params.userId);
    if (!['approve','reject'].includes(decision)) {
      return res.status(400).json({ error: 'invalid_decision' });
    }
    const newStatus = decision === 'approve' ? 'approved' : 'rejected';

    await db.query(
      `UPDATE users
          SET kyc_status=$1,
              kyc_approved_at=CASE WHEN $1='approved' THEN NOW() ELSE NULL END,
              kyc_rejection_reason=$2
        WHERE id=$3`,
      [newStatus, decision === 'reject' ? (reason || 'rejeitado_pelo_admin') : null, userId]
    );
    await db.query(
      `UPDATE kyc_verifications
          SET status=$1, rejection_reason=$2, reviewed_by=$3, updated_at=NOW()
        WHERE user_id=$4 AND id=(SELECT MAX(id) FROM kyc_verifications WHERE user_id=$4)`,
      [newStatus, reason || null, req.user.id, userId]
    );
    res.json({ ok: true, status: newStatus });
  });

  return router;
};

// Aplica veredito normalizado do provedor no banco
async function applyVerdict(db, userId, sessionId, remote) {
  const updates = {
    status: remote.status,
    rejection: remote.rejectionReason || null
  };

  await db.query(
    `UPDATE kyc_verifications
        SET status=$1, liveness_score=$2, face_match_score=$3,
            provider_raw=$4, rejection_reason=$5, updated_at=NOW()
      WHERE provider_session_id=$6`,
    [updates.status, remote.livenessScore || null, remote.faceMatchScore || null,
     remote.raw || {}, updates.rejection, sessionId]
  );

  await db.query(
    `UPDATE users
        SET kyc_status=$1,
            kyc_approved_at = CASE WHEN $1='approved' THEN NOW() ELSE kyc_approved_at END,
            kyc_rejection_reason=$2
      WHERE id=$3`,
    [updates.status, updates.rejection, userId]
  );
}
