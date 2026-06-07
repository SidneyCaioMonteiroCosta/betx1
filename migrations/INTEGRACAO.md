# KYC do Super Duelo — guia de integração

Tudo isso é **agnóstico de provedor**. Pra começar você roda com `KYC_PROVIDER=mock` (aprova sozinho em 3s, ótimo pra testar o fluxo), depois troca pra `stripe` / `idwall` / `unico` sem mexer no resto.

## 1) Estrutura sugerida no repo

```
backend/
  services/kycProvider.js      <- kyc/backend/kycProvider.js
  middleware/requireKyc.js     <- kyc/backend/requireKyc.js
  routes/kyc.js                <- kyc/backend/kycRoutes.js
  utils/cpf.js                 <- kyc/backend/cpf.js
public/
  kyc.html                     <- kyc/frontend/kyc.html
  kyc-callback.html            <- kyc/frontend/kyc-callback.html
  admin/kyc.html               <- kyc/admin/admin-kyc.html
migrations/
  001_add_kyc.sql              <- kyc/migrations/001_add_kyc.sql
```

## 2) Rodar a migration

```bash
psql $DATABASE_URL -f migrations/001_add_kyc.sql
```

No Railway: `railway run psql $DATABASE_URL -f migrations/001_add_kyc.sql`

## 3) Variáveis de ambiente

```
# Modo:
KYC_PROVIDER=mock              # dev
# KYC_PROVIDER=stripe          # prod (recomendado começar aqui)

PUBLIC_URL=https://superduelo.up.railway.app

# Se for Stripe Identity:
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 4) Plugar no `app.js`

```js
const kycRoutes = require('./routes/kyc');
const { requireKycApproved } = require('./middleware/requireKyc');

// IMPORTANTE: rota de webhook ANTES do express.json(), com raw body pra Stripe validar assinatura
app.post('/api/kyc/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => { req.rawBody = req.body; next(); },
  // depois o router cuida do resto
);

app.use(express.json());

// rotas livres (sem KYC): auth, kyc, dados do próprio user
app.use('/api/auth', authRoutes);
app.use('/api/kyc',  kycRoutes({ db, requireAuth, requireAdmin }));
app.get('/api/me',   requireAuth, meHandler);

// rotas que EXIGEM KYC aprovado
app.use('/api/games',     requireAuth, requireKycApproved, gamesRoutes);
app.use('/api/deposits',  requireAuth, requireKycApproved, depositRoutes);
app.use('/api/withdraw',  requireAuth, requireKycApproved, withdrawRoutes);
app.use('/api/matches',   requireAuth, requireKycApproved, matchRoutes);
```

E no Socket.io, no `io.use(authMiddleware)`, adiciona:

```js
io.use((socket, next) => {
  if (socket.user?.kyc_status !== 'approved') {
    return next(new Error('kyc_required'));
  }
  next();
});
```

## 5) Redirecionar no front

Onde o usuário loga ou abre o jogo, checa o status:

```js
const me = await fetch('/api/me', { credentials:'include' }).then(r=>r.json());
if (me.kyc_status !== 'approved') {
  window.location.href = '/kyc.html';
}
```

## 6) Configurar webhook do Stripe (quando trocar mock → stripe)

No dashboard Stripe → Developers → Webhooks → Add endpoint:
- URL: `https://superduelo.up.railway.app/api/kyc/webhook`
- Events: `identity.verification_session.verified`, `.requires_input`, `.canceled`, `.processing`
- Copia o `whsec_...` pra `STRIPE_WEBHOOK_SECRET`

## 7) Testar com mock

1. `KYC_PROVIDER=mock` no `.env`
2. Cadastra um usuário novo
3. Vai pra `/kyc.html`, preenche CPF válido + nome + data 18+
4. Clica continuar → callback abre → aguarda 3s → aprovado
5. Status no banco vira `approved` e jogo libera

## 8) Antes de subir pra produção

- [ ] Trocar `KYC_PROVIDER=mock` → `stripe`
- [ ] Configurar webhook do Stripe
- [ ] Testar fluxo end-to-end com documento real
- [ ] Página de Política de Privacidade explicando coleta de CPF/foto (LGPD)
- [ ] Termo de uso mencionando que +18 e KYC são obrigatórios
- [ ] Rate limit no `/api/kyc/start` (ex: 5 tentativas/dia por user)
- [ ] Logar tentativas pra fraude (mesmo CPF tentando várias contas, etc.)

## 9) Próximos passos sugeridos

- **Cruzamento de CPF + nome na Receita Federal** (API SerPro/HubDev). Stripe Identity não faz isso, é um furo importante.
- **Bloqueio de IP/device duplicado** (alguém criar 5 contas pra cashback inicial).
- **Lista de exclusão voluntária** (jogador pede pra ser bloqueado — exigido em algumas regulações de gambling).
