// services/kycProvider.js
// Camada agnóstica: a aplicação fala com KycProvider.
// Trocar provedor = trocar a env KYC_PROVIDER e implementar/ajustar o adapter.

/**
 * Contrato que todo adapter implementa:
 *
 *   createSession({ user, returnUrl }) -> { sessionId, redirectUrl, clientSecret? }
 *     Inicia uma verificação no provedor. Retorna a URL/secret pra abrir no front.
 *
 *   getSession(sessionId) -> {
 *     status: 'submitted'|'approved'|'rejected'|'manual_review',
 *     livenessScore?, faceMatchScore?,
 *     extractedName?, extractedCpf?, extractedBirthDate?,
 *     rejectionReason?, raw
 *   }
 *
 *   verifyWebhook(req) -> { sessionId, status, ... } | null
 *     Valida assinatura e devolve o evento normalizado.
 */

// ---------------- Adapter MOCK (dev / testes) ----------------
// Aprova automaticamente após 3s. Use em DEV. NUNCA em produção.
class MockProvider {
  constructor() { this.sessions = new Map(); }

  async createSession({ user, returnUrl }) {
    const sessionId = 'mock_' + Date.now() + '_' + user.id;
    this.sessions.set(sessionId, {
      status: 'submitted',
      createdAt: Date.now(),
      userId: user.id
    });
    return {
      sessionId,
      redirectUrl: `${returnUrl}?mock_session=${sessionId}`,
      clientSecret: null
    };
  }

  async getSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { status: 'rejected', rejectionReason: 'session_not_found', raw: {} };
    // após 3s "aprova" automaticamente
    if (Date.now() - s.createdAt > 3000) s.status = 'approved';
    return {
      status: s.status,
      livenessScore: 0.99,
      faceMatchScore: 0.97,
      raw: { mock: true, sessionId }
    };
  }

  async verifyWebhook() { return null; } // mock não usa webhook
}

// ---------------- Adapter STRIPE IDENTITY ----------------
// Docs: https://stripe.com/docs/identity
// Instala: npm i stripe
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
class StripeIdentityProvider {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY ausente');
    }
    this.stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }

  async createSession({ user, returnUrl }) {
    const vs = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      options: {
        document: {
          require_live_capture: true,        // força captura ao vivo
          require_matching_selfie: true,     // selfie + face match
          allowed_types: ['driving_license', 'id_card', 'passport']
        }
      },
      metadata: { user_id: String(user.id), platform: 'superduelo' },
      return_url: returnUrl
    });
    return {
      sessionId: vs.id,
      redirectUrl: vs.url,
      clientSecret: vs.client_secret
    };
  }

  async getSession(sessionId) {
    const vs = await this.stripe.identity.verificationSessions.retrieve(
      sessionId,
      { expand: ['last_verification_report'] }
    );
    return {
      status: this._mapStatus(vs.status),
      livenessScore: null,                   // Stripe não expõe score numérico
      faceMatchScore: null,
      extractedName: vs.last_verification_report?.document?.first_name
        ? `${vs.last_verification_report.document.first_name} ${vs.last_verification_report.document.last_name || ''}`.trim()
        : null,
      extractedBirthDate: vs.last_verification_report?.document?.dob
        ? `${vs.last_verification_report.document.dob.year}-${String(vs.last_verification_report.document.dob.month).padStart(2,'0')}-${String(vs.last_verification_report.document.dob.day).padStart(2,'0')}`
        : null,
      rejectionReason: vs.last_error?.reason || null,
      raw: vs
    };
  }

  _mapStatus(s) {
    if (s === 'verified') return 'approved';
    if (s === 'requires_input') return 'rejected';
    if (s === 'canceled') return 'rejected';
    if (s === 'processing') return 'submitted';
    return 'submitted';
  }

  async verifyWebhook(req) {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,                          // precisa de express.raw no router de webhook
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch { return null; }

    const vs = event.data.object;
    if (!event.type.startsWith('identity.verification_session.')) return null;
    return {
      sessionId: vs.id,
      status: this._mapStatus(vs.status),
      userId: vs.metadata?.user_id ? Number(vs.metadata.user_id) : null,
      raw: event
    };
  }
}

// ---------------- Adapter IDWALL ----------------
// Stub funcional — preencha as URLs reais quando assinar contrato.
// Docs: https://docs.idwall.co
class IdwallProvider {
  constructor() {
    this.apiKey = process.env.IDWALL_API_KEY;
    this.baseUrl = process.env.IDWALL_BASE_URL || 'https://api-v2.idwall.co';
    if (!this.apiKey) throw new Error('IDWALL_API_KEY ausente');
  }
  async createSession({ user, returnUrl }) {
    // POST /sdk/tokens (consulte docs Idwall — endpoint exato muda por produto contratado)
    throw new Error('Idwall: implementar conforme contrato/produto contratado');
  }
  async getSession(sessionId) {
    throw new Error('Idwall: implementar getSession');
  }
  async verifyWebhook() { return null; }
}

// ---------------- Adapter UNICO ----------------
class UnicoProvider {
  constructor() {
    this.apiKey = process.env.UNICO_API_KEY;
    if (!this.apiKey) throw new Error('UNICO_API_KEY ausente');
  }
  async createSession() { throw new Error('Unico: implementar'); }
  async getSession()    { throw new Error('Unico: implementar'); }
  async verifyWebhook() { return null; }
}

// ---------------- Factory ----------------
function getKycProvider() {
  const p = (process.env.KYC_PROVIDER || 'mock').toLowerCase();
  switch (p) {
    case 'stripe': return new StripeIdentityProvider();
    case 'idwall': return new IdwallProvider();
    case 'unico':  return new UnicoProvider();
    case 'mock':   return new MockProvider();
    default: throw new Error(`KYC_PROVIDER inválido: ${p}`);
  }
}

module.exports = { getKycProvider };
