const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Otimizações para jogo em tempo real
  perMessageDeflate: false,      // não comprimir (pacotes pequenos)
  transports: ['websocket', 'polling'], // permitir os dois (polling como fallback do Railway)
  pingInterval: 25000,
  pingTimeout: 20000
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const JWT_SECRET = 'betx1_secret_2026';
const MP_TOKEN = 'APP_USR-3691621388347314-053106-82e243a23ed4fa091d30923ed61128b2-478925025';
const ADMIN_EMAIL = 'tutoriacaio562@gmail.com';
const ADMIN_SENHA = 'Scmc4815@';
// Admin 2 — acesso reduzido (só suporte e visualização)
const ADMIN2_EMAIL = 'suporte.superduelo@gmail.com';
const ADMIN2_SENHA = 'Suporte2024@';

const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
const payment = new Payment(mp);

app.use(cors());
// express.raw antes do json para o webhook do Stripe poder validar assinatura
app.use('/api/kyc/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Criar tabelas no PostgreSQL
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        saldo REAL DEFAULT 0,
        saldo_treino REAL DEFAULT 1000,
        cpf TEXT DEFAULT '',
        telefone TEXT DEFAULT '',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS telefone TEXT DEFAULT '';
      CREATE TABLE IF NOT EXISTS transacoes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        tipo TEXT,
        valor REAL,
        descricao TEXT,
        status TEXT DEFAULT 'concluido',
        pix_id TEXT,
        chave_pix TEXT DEFAULT '',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Tabelas KYC
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'pending';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_provider VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_provider_session_id VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_approved_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_attempts INTEGER NOT NULL DEFAULT 0;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kyc_verifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        provider_session_id VARCHAR(255),
        status VARCHAR(20) NOT NULL,
        liveness_score NUMERIC(5,4),
        face_match_score NUMERIC(5,4),
        provider_raw JSONB,
        rejection_reason TEXT,
        reviewed_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_verifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_kyc_provider_session ON kyc_verifications(provider_session_id);
    `);
    console.log('✅ Banco de dados inicializado com sucesso');
  } catch (err) {
    console.error('❌ Erro ao conectar no banco:', err.message);
    console.error('❌ Detalhes:', err);
    // Tenta reconectar após 5 segundos
    console.log('🔄 Tentando reconectar em 5 segundos...');
    setTimeout(initDB, 5000);
  }
}
initDB();

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Não autorizado' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ erro: 'Token inválido' }); }
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Não autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ erro: 'Acesso negado' });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ erro: 'Token inválido' }); }
}

app.post('/api/cadastro', async (req, res) => {
  const { nome, email, senha, cpf, codigoConvite } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta' });
  try {
    // Garantir colunas de referral
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_convite TEXT').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS convidado_por INTEGER').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_pago BOOLEAN DEFAULT false').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS partidas_online INTEGER DEFAULT 0').catch(()=>{});

    // Descobrir quem convidou (se houver código)
    let convidadoPor = null;
    if (codigoConvite) {
      const { rows: conv } = await pool.query('SELECT id FROM users WHERE codigo_convite = $1', [codigoConvite.toUpperCase()]);
      if (conv.length) convidadoPor = conv[0].id;
    }

    const hash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      'INSERT INTO users (nome, email, senha, saldo, saldo_treino, cpf, telefone, convidado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [nome, email, hash, 0, 1000, cpf || '', req.body.telefone || '', convidadoPor]
    );
    const novoId = result.rows[0].id;
    // Gerar código de convite único para o novo usuário
    const meuCodigo = 'SD' + novoId + Math.random().toString(36).substring(2,5).toUpperCase();
    await pool.query('UPDATE users SET codigo_convite = $1 WHERE id = $2', [meuCodigo, novoId]);

    const token = jwt.sign({ id: novoId, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, nome, email, saldo: 0, saldo_treino: 1000 });
  } catch { res.status(400).json({ erro: 'Email já cadastrado' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  // Admin principal (acesso total)
  if (email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    const token = jwt.sign({ admin: true, adminNivel: 1, email }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, admin: true, adminNivel: 1 });
  }
  // Admin 2 (acesso reduzido: só suporte/visualização)
  if (email === ADMIN2_EMAIL && senha === ADMIN2_SENHA) {
    const token = jwt.sign({ admin: true, adminNivel: 2, email }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, admin: true, adminNivel: 2 });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) return res.status(400).json({ erro: 'Email não encontrado' });
  if (user.bloqueado) return res.status(403).json({ erro: 'Conta bloqueada. Entre em contato com o suporte.' });
  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return res.status(400).json({ erro: 'Senha incorreta' });
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, nome: user.nome, email: user.email, saldo: parseFloat(user.saldo) || 0, saldo_treino: parseFloat(user.saldo_treino) || 1000 });
});


app.post('/api/perfil/editar', auth, async (req, res) => {
  const { nome, senhaAtual, novaSenha } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
  try {
    if (senhaAtual && novaSenha) {
      const { rows } = await pool.query('SELECT senha FROM users WHERE id = $1', [req.user.id]);
      const ok = await bcrypt.compare(senhaAtual, rows[0].senha);
      if (!ok) return res.status(400).json({ erro: 'Senha atual incorreta' });
      const hash = await bcrypt.hash(novaSenha, 10);
      await pool.query('UPDATE users SET nome = $1, senha = $2 WHERE id = $3', [nome, hash, req.user.id]);
    } else {
      await pool.query('UPDATE users SET nome = $1 WHERE id = $2', [nome, req.user.id]);
    }
    res.json({ sucesso: true, nome });
  } catch { res.status(500).json({ erro: 'Erro ao atualizar perfil' }); }
});


// ===== PAINEL DO USUÁRIO =====
app.get('/api/historico', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM transacoes WHERE user_id = $1 ORDER BY criado_em DESC',
      [req.user.id]
    );
    const depositos = rows.filter(t => t.tipo === 'deposito');
    const saques = rows.filter(t => t.tipo === 'saque');
    const partidas = rows.filter(t => ['ganho','devolucao'].includes(t.tipo));
    const totalGanho = partidas.filter(t=>t.tipo==='ganho').reduce((a,b)=>a+b.valor,0);
    const totalPerdido = rows.filter(t=>t.tipo==='ganho'||t.tipo==='devolucao').length * 0; // calculado no front

    res.json({ depositos, saques, partidas, todas: rows });
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

app.get('/api/perfil', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, nome, email, saldo, saldo_treino, nivel, vitorias_nivel, total_vitorias, total_derrotas FROM users WHERE id = $1', [req.user.id]);
  const u = rows[0];
  if (u) {
    u.saldo = parseFloat(u.saldo) || 0;
    u.saldo_treino = parseFloat(u.saldo_treino) || 1000;
  }
  res.json(u);
});

app.post('/api/pix/depositar', auth, async (req, res) => {
  const { valor, cpf } = req.body;
  if (!valor || valor < 1) return res.status(400).json({ erro: 'Valor mínimo R$1' });
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  const cpfNum = (cpf || user.cpf || '12345678909').replace(/\D/g, '');
  try {
    const pix = await payment.create({
      body: {
        transaction_amount: parseFloat(valor),
        description: `Deposito Betx1`,
        payment_method_id: 'pix',
        payer: {
          email: user.email,
          first_name: user.nome.split(' ')[0] || 'Usuario',
          last_name: user.nome.split(' ')[1] || 'Betx1',
          identification: { type: 'CPF', number: cpfNum }
        }
      },
      requestOptions: { idempotencyKey: `dep_${req.user.id}_${Date.now()}` }
    });
    const pixData = pix.point_of_interaction?.transaction_data;
    res.json({ pix_id: pix.id, qr_code: pixData?.qr_code, qr_code_base64: pixData?.qr_code_base64, valor, status: pix.status });
  } catch (e) {
    console.error('Erro MP:', JSON.stringify(e));
    res.status(500).json({ erro: 'Erro ao gerar Pix' });
  }
});


// ===== WEBHOOK MERCADO PAGO =====
app.post('/api/webhook/mp', async (req, res) => {
  res.status(200).send('OK'); // responder rápido para o MP
  try {
    const { type, data } = req.body;
    if (type !== 'payment') return;

    const pixId = data?.id;
    if (!pixId) return;

    // Buscar status do pagamento no MP
    const pix = await payment.get({ id: pixId });
    if (pix.status !== 'approved') return;

    // Verificar se já foi creditado
    const { rows: existing } = await pool.query(
      'SELECT id FROM transacoes WHERE pix_id = $1', [String(pixId)]
    );
    if (existing.length > 0) return; // já processado

    // Encontrar o usuário pelo email do pagador
    const payerEmail = pix.payer?.email;
    if (!payerEmail) return;

    const { rows: users } = await pool.query(
      'SELECT id FROM users WHERE email = $1', [payerEmail]
    );
    if (!users.length) return;

    const userId = users[0].id;
    const valor = pix.transaction_amount;

    // Creditar saldo
    await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [valor, userId]);
    await pool.query(
      'INSERT INTO transacoes (user_id, tipo, valor, descricao, status, pix_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, 'deposito', valor, 'Depósito via Pix', 'aprovado', String(pixId)]
    );
    console.log(`✅ Webhook: Depósito R$${valor} creditado para user ${userId}`);
  } catch(e) {
    console.error('Erro webhook MP:', e.message);
  }
});

app.get('/api/pix/status/:pixId', auth, async (req, res) => {
  try {
    const pix = await payment.get({ id: req.params.pixId });
    if (pix.status === 'approved') {
      const { rows: existing } = await pool.query('SELECT id FROM transacoes WHERE pix_id = $1', [String(pix.id)]);
      if (existing.length === 0) {
        await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [pix.transaction_amount, req.user.id]);
        await pool.query(
          'INSERT INTO transacoes (user_id, tipo, valor, descricao, status, pix_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [req.user.id, 'deposito', pix.transaction_amount, 'Depósito via Pix', 'aprovado', String(pix.id)]
        );
      }
      const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [req.user.id]);
      return res.json({ status: 'approved', saldo: rows[0].saldo });
    }
    res.json({ status: pix.status });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao verificar Pix' });
  }
});

app.post('/api/sacar', auth, async (req, res) => {
  const { valor, chave_pix, tipo_chave } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
  if (!chave_pix) return res.status(400).json({ erro: 'Informe sua chave Pix' });
  const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if ((parseFloat(user.saldo)||0) < parseFloat(valor)) return res.status(400).json({ erro: 'Saldo insuficiente' });
  // Descrição inclui o tipo da chave para o admin saber
  const tipoTxt = tipo_chave === 'telefone' ? 'Telefone' : 'CPF/CNPJ';
  await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, req.user.id]);
  await pool.query(
    'INSERT INTO transacoes (user_id, tipo, valor, descricao, status, chave_pix) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.user.id, 'saque', valor, `Saque via Pix (${tipoTxt})`, 'pendente', chave_pix]
  );
  const { rows: updated } = await pool.query('SELECT saldo FROM users WHERE id = $1', [req.user.id]);
  res.json({ saldo: updated[0].saldo, mensagem: 'Saque solicitado! Pix em até 24h.' });
});

app.get('/api/transacoes', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM transacoes WHERE user_id = $1 ORDER BY criado_em DESC LIMIT 20',
    [req.user.id]
  );
  res.json(rows);
});

app.get('/api/admin/saques', adminAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*, u.nome, u.email FROM transacoes t
    JOIN users u ON t.user_id = u.id
    WHERE t.tipo = 'saque' AND t.status = 'pendente'
    ORDER BY t.criado_em DESC
  `);
  res.json(rows);
});

app.post('/api/admin/saques/:id/pagar', adminAuth1, async (req, res) => {
  await pool.query("UPDATE transacoes SET status = 'pago' WHERE id = $1", [req.params.id]);
  res.json({ mensagem: 'Saque marcado como pago!' });
});

app.get('/api/admin/usuarios', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nome, email, saldo, saldo_treino, bloqueado, criado_em, telefone FROM users ORDER BY criado_em DESC');
    // Garantir que saldo é número
    const usuarios = rows.map(u => ({ ...u, saldo: parseFloat(u.saldo) || 0, saldo_treino: parseFloat(u.saldo_treino) || 0 }));
    res.json(usuarios);
  } catch(e) {
    console.error('Erro admin usuarios:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// Histórico completo de um usuário (admin)
app.get('/api/admin/usuario/:id/historico', adminAuth, async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    const { rows: uRows } = await pool.query('SELECT id, nome, email, saldo, telefone, criado_em, nivel, total_vitorias, total_derrotas FROM users WHERE id = $1', [userId]);
    if (!uRows.length) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const user = uRows[0];
    user.saldo = parseFloat(user.saldo) || 0;

    const { rows: trans } = await pool.query('SELECT * FROM transacoes WHERE user_id = $1 ORDER BY criado_em DESC LIMIT 100', [userId]);
    const depositos = trans.filter(t => t.tipo === 'deposito');
    const saques = trans.filter(t => t.tipo === 'saque');
    const partidas = trans.filter(t => ['ganho','devolucao','bonus','taxa'].includes(t.tipo));

    res.json({ user, depositos, saques, partidas, todas: trans });
  } catch(e) {
    console.error('Erro histórico admin:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// Enviar notificação (admin) - para todos ou um específico
app.post('/api/admin/notificar', adminAuth, async (req, res) => {
  const { userId, titulo, mensagem } = req.body;
  if (!titulo || !mensagem) return res.status(400).json({ erro: 'Título e mensagem obrigatórios' });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS notificacoes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      titulo TEXT,
      mensagem TEXT,
      lida BOOLEAN DEFAULT false,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    if (userId) {
      // Notificação para 1 usuário
      await pool.query('INSERT INTO notificacoes (user_id, titulo, mensagem) VALUES ($1,$2,$3)', [parseInt(userId), titulo, mensagem]);
    } else {
      // Notificação para todos
      const { rows } = await pool.query('SELECT id FROM users');
      for (const u of rows) {
        await pool.query('INSERT INTO notificacoes (user_id, titulo, mensagem) VALUES ($1,$2,$3)', [u.id, titulo, mensagem]);
      }
    }
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Buscar notificações do usuário
app.get('/api/notificacoes', auth, async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS notificacoes (
      id SERIAL PRIMARY KEY, user_id INTEGER, titulo TEXT, mensagem TEXT,
      lida BOOLEAN DEFAULT false, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    const { rows } = await pool.query('SELECT * FROM notificacoes WHERE user_id = $1 ORDER BY criado_em DESC LIMIT 30', [req.user.id]);
    res.json(rows);
  } catch(e) { res.json([]); }
});

// Marcar notificação como lida
app.post('/api/notificacoes/:id/lida', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notificacoes SET lida = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const { rows: r1 } = await pool.query('SELECT COUNT(*) as total FROM users');
  const { rows: r2 } = await pool.query("SELECT SUM(valor) as total FROM transacoes WHERE tipo='deposito' AND status='aprovado'");
  const { rows: r3 } = await pool.query("SELECT SUM(valor) as total FROM transacoes WHERE tipo='saque' AND status='pago'");
  const { rows: r4 } = await pool.query("SELECT COUNT(*) as total FROM transacoes WHERE tipo='saque' AND status='pendente'");
  res.json({
    totalUsers: parseInt(r1[0].total),
    totalDep: parseFloat(r2[0].total) || 0,
    totalSaq: parseFloat(r3[0].total) || 0,
    saquesPendentes: parseInt(r4[0].total)
  });
});

// ===== AIR HOCKEY WEBSOCKET =====
const filas = {};
const partidas = {};

function criarEstado(valor) {
  return {
    ball: { x: 0.5, y: 0.5, vx: 0.003, vy: 0.005, r: 0.03 },
    m1: { x: 0.5, y: 0.75 },
    m2: { x: 0.5, y: 0.25 },
    mallet_r: 0.075,
    score1: 0,
    score2: 0,
    valor
  };
}

function simularFisica(state) {
  const b = state.ball;
  const gw = 0.35;
  const gx = (1 - gw) / 2;

  b.x += b.vx;
  b.y += b.vy;

  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
  if (b.x + b.r > 1) { b.x = 1 - b.r; b.vx = -Math.abs(b.vx); }

  if (b.y - b.r < 0) {
    if (b.x > gx && b.x < gx + gw) {
      state.score2++;
      resetBall(state, 'p2');
    } else {
      b.y = b.r; b.vy = Math.abs(b.vy);
    }
  }

  if (b.y + b.r > 1) {
    if (b.x > gx && b.x < gx + gw) {
      state.score1++;
      resetBall(state, 'p1');
    } else {
      b.y = 1 - b.r; b.vy = -Math.abs(b.vy);
    }
  }

  colidirMallet(b, state.m1, state.mallet_r);
  colidirMallet(b, state.m2, state.mallet_r);

  const maxV = 0.018;
  const spd = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
  if (spd > maxV) { b.vx = b.vx/spd*maxV; b.vy = b.vy/spd*maxV; }
  if (spd < 0.003) { b.vx *= 1.05; b.vy *= 1.05; }
}

function colidirMallet(b, m, mr) {
  const dx = b.x - m.x;
  const dy = b.y - m.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist < b.r + mr) {
    const nx = dx/dist;
    const ny = dy/dist;
    const spd = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
    b.vx = nx * (spd + 0.002);
    b.vy = ny * (spd + 0.002);
    b.x = m.x + nx * (b.r + mr + 0.001);
    b.y = m.y + ny * (b.r + mr + 0.001);
  }
}

function resetBall(state, scorer) {
  state.ball.x = 0.5;
  state.ball.y = 0.5;
  state.ball.vx = (Math.random() - 0.5) * 0.006;
  state.ball.vy = scorer === 'p1' ? -0.005 : 0.005;
}

// ===== USUÁRIOS ONLINE =====
// Usa contagem de sockets conectados diretamente
app.get('/api/online', (req, res) => {
  res.json({ online: io.engine.clientsCount || 0 });
});

io.on('connection', (socket) => {
  // Notificar todos quando alguém conecta
  io.emit('online_count', io.engine.clientsCount);
  socket.on('disconnect', () => {
    io.emit('online_count', io.engine.clientsCount);
  });
});

io.on('connection', (socket) => {
  let userId = null;
  let userNome = null;
  let currentRoom = null;
  let currentValor = null;

  // ===== AIR HOCKEY: servidor roda física e envia estado para AMBOS =====
  socket.on('join_queue', async ({ valor, token: tkn }) => {
    try {
      const decoded = jwt.verify(tkn, JWT_SECRET);
      userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id=$1',[userId]);
      const user = rows[0];
      if (!user || user.saldo < valor) { socket.emit('error',{msg:'Saldo insuficiente'}); return; }
      userNome = user.nome;
      currentValor = valor;
      if (!filas[valor]) filas[valor] = [];
      if (filas[valor].length > 0) {
        const oponente = filas[valor].shift();
        const roomId = `room_${Date.now()}`;
        currentRoom = roomId;
        oponente.currentRoom = roomId;
        await pool.query('UPDATE users SET saldo=saldo-$1 WHERE id=$2',[valor,userId]);
        await pool.query('UPDATE users SET saldo=saldo-$1 WHERE id=$2',[valor,oponente.userId]);
        // Estado inicial da física
        const state = {
          bx:.5, by:.5, bvx:.006, bvy:.008, br:.03,
          m1x:.5, m1y:.82, m2x:.5, m2y:.18,
          s1:0, s2:0, valor
        };
        partidas[roomId] = {
          p1: oponente, p2: { socket, userId, nome: userNome },
          state, interval: null, valor, score1:0, score2:0
        };
        socket.join(roomId); oponente.socket.join(roomId);
        oponente.socket.emit('game_start',{role:'p1',p1name:oponente.nome,p2name:userNome,valor});
        socket.emit('game_start',{role:'p2',p1name:oponente.nome,p2name:userNome,valor});
        // Loop de física no servidor 20fps
        partidas[roomId].interval = setInterval(() => tickAH(roomId), 1000/60); // 60fps
      } else {
        filas[valor].push({ socket, userId, nome: userNome, currentRoom: null });
      }
    } catch(e) { socket.emit('error',{msg:'Erro'}); }
  });

  // Busca a sala onde este socket está jogando (funciona para P1 E P2)
  function acharSalaAH() {
    for (const [roomId, p] of Object.entries(partidas)) {
      if (p.p1?.socket?.id === socket.id || p.p2?.socket?.id === socket.id) {
        return roomId;
      }
    }
    return null;
  }

  // Receber posição do mallet do jogador
  // PING: ecoa o timestamp de volta para o cliente medir latência
  socket.on('ping_ah', (t) => { socket.emit('pong_ah', t); });

  socket.on('ah_mallet', ({x,y}) => {
    const roomId = acharSalaAH();
    if (!roomId) return;
    const p = partidas[roomId];
    if (p.p1.socket.id===socket.id) { p.state.m1x=x; p.state.m1y=y; }
    else { p.state.m2x=x; p.state.m2y=y; }
  });

  // Desistir
  socket.on('ah_desistir', async () => {
    const roomId = acharSalaAH();
    if (!roomId) return;
    const p = partidas[roomId];
    const winnerRole = p.p1.socket.id===socket.id ? 'p2' : 'p1';
    const outro = p.p1.socket.id===socket.id ? p.p2.socket : p.p1.socket;
    outro.emit('oponente_desistiu');
    await encerrarAirHockey(roomId, winnerRole, 'desistiu');
  });

  socket.on('leave_queue', () => {
    if (currentValor && filas[currentValor])
      filas[currentValor] = filas[currentValor].filter(p=>p.socket.id!==socket.id);
  });

  socket.on('disconnect', async () => {
    // Remover das filas
    Object.keys(filas).forEach(v => {
      filas[v] = filas[v].filter(p=>p.socket.id!==socket.id);
    });
    // Se estava em partida, dar vitória ao outro automaticamente
    const roomId = acharSalaAH();
    if (roomId && partidas[roomId]) {
      const p = partidas[roomId];
      const winnerRole = p.p1.socket.id===socket.id ? 'p2' : 'p1';
      const outro = p.p1.socket.id===socket.id ? p.p2.socket : p.p1.socket;
      try { outro.emit('oponente_desistiu'); } catch(e) {}
      await encerrarAirHockey(roomId, winnerRole, 'desconectou');
    }
  });
});

// Física do Air Hockey no servidor
const MR = 0.074;
function tickAH(roomId) {
  const partida = partidas[roomId];
  if (!partida || partida._encerrado) return;
  const S = partida.state;

  // Guardar posição anterior para colisão contínua
  const oldX = S.bx, oldY = S.by;

  // Velocidade dos mallets (diferença desde o último tick) — dá "tacada" na bola
  const m1vx = S.m1x - (S._pm1x ?? S.m1x), m1vy = S.m1y - (S._pm1y ?? S.m1y);
  const m2vx = S.m2x - (S._pm2x ?? S.m2x), m2vy = S.m2y - (S._pm2y ?? S.m2y);
  S._pm1x = S.m1x; S._pm1y = S.m1y; S._pm2x = S.m2x; S._pm2y = S.m2y;

  S.bx += S.bvx; S.by += S.bvy;

  // Fricção
  S.bvx *= 0.992; S.bvy *= 0.992;
  const sp = Math.sqrt(S.bvx**2+S.bvy**2);
  if (sp < .005) { const f=.006/sp; S.bvx*=f; S.bvy*=f; }
  if (sp > .026) { const f=.026/sp; S.bvx*=f; S.bvy*=f; }

  // Paredes
  if (S.bx-S.br<0) { S.bx=S.br; S.bvx=Math.abs(S.bvx); }
  if (S.bx+S.br>1) { S.bx=1-S.br; S.bvx=-Math.abs(S.bvx); }

  // Cantos arredondados (mesma lógica do cliente)
  const CR = 0.13;
  const cantos = [{cx:CR,cy:CR},{cx:1-CR,cy:CR},{cx:CR,cy:1-CR},{cx:1-CR,cy:1-CR}];
  for(const c of cantos){
    const inX = (c.cx<0.5) ? S.bx < CR : S.bx > 1-CR;
    const inY = (c.cy<0.5) ? S.by < CR : S.by > 1-CR;
    if(inX && inY){
      const dx=S.bx-c.cx, dy=S.by-c.cy, d=Math.sqrt(dx*dx+dy*dy);
      const raio=CR-S.br;
      if(d>raio && d>0){
        const nx=dx/d, ny=dy/d;
        S.bx=c.cx+nx*raio; S.by=c.cy+ny*raio;
        const dot=S.bvx*nx+S.bvy*ny;
        S.bvx-=2*dot*nx; S.bvy-=2*dot*ny;
      }
    }
  }

  // Colisão contínua com mallets (8 passos + impulso do movimento do disco)
  colideContinuo(S, S.m1x, S.m1y, oldX, oldY, m1vx, m1vy);
  colideContinuo(S, S.m2x, S.m2y, oldX, oldY, m2vx, m2vy);

  // Gols
  const gw=.36, gx=(1-gw)/2;
  let scorer = null;
  if (S.by-S.br<0) {
    if (S.bx>gx && S.bx<gx+gw) { S.s1++; scorer='p1'; resetAHBall(S,'up'); }
    else { S.by=S.br; S.bvy=Math.abs(S.bvy); }
  }
  if (S.by+S.br>1) {
    if (S.bx>gx && S.bx<gx+gw) { S.s2++; scorer='p2'; resetAHBall(S,'down'); }
    else { S.by=1-S.br; S.bvy=-Math.abs(S.bvy); }
  }

  // Emitir estado a 60fps — minimiza janela de extrapolação no cliente
  const r = n => Math.round(n*1000)/1000;
  io.to(roomId).volatile.emit('ah_state', {
    bx:r(S.bx), by:r(S.by),
    m1x:r(S.m1x), m1y:r(S.m1y),
    m2x:r(S.m2x), m2y:r(S.m2y),
    bvx:r(S.bvx), bvy:r(S.bvy)
  });

  if (scorer) {
    io.to(roomId).emit('ah_gol', {s1:S.s1, s2:S.s2, scorer});
    if (S.s1>=7||S.s2>=7) {
      const winnerRole = S.s1>=7?'p1':'p2';
      encerrarAirHockey(roomId, winnerRole, 'normal');
    }
  }
}

function colideAH(S, mx, my) {
  const dx=S.bx-mx, dy=S.by-my, d=Math.sqrt(dx*dx+dy*dy);
  const minDist = S.br + MR;
  if (d < minDist && d > 0) {
    const nx=dx/d, ny=dy/d;
    const spd=Math.sqrt(S.bvx**2+S.bvy**2);
    // Empurra a bola para fora do mallet
    S.bx = mx + nx*(minDist+0.003);
    S.by = my + ny*(minDist+0.003);
    // Nova velocidade na direção da normal, com boost
    const newSpd = Math.max(spd + 0.005, 0.011);
    S.bvx = nx*newSpd;
    S.bvy = ny*newSpd;
  }
}

// Detecta colisão ao longo do movimento (evita atravessar em alta velocidade)
function colideContinuo(S, mx, my, oldX, oldY, mvx, mvy) {
  const minDist = S.br + MR;
  // Verifica MAIS pontos ao longo da trajetória (8 = praticamente impossível atravessar)
  const steps = 8;
  for (let i=1; i<=steps; i++) {
    const t = i/steps;
    const cx = oldX + (S.bx-oldX)*t;
    const cy = oldY + (S.by-oldY)*t;
    const dx = cx-mx, dy = cy-my, d = Math.sqrt(dx*dx+dy*dy);
    if (d < minDist && d > 0) {
      const nx=dx/d, ny=dy/d;
      const spd=Math.sqrt(S.bvx**2+S.bvy**2);
      // Reposiciona a bola na superfície do disco
      S.bx = mx + nx*(minDist+0.004);
      S.by = my + ny*(minDist+0.004);
      // Velocidade resultante: direção da normal + impulso do movimento do disco
      const impulsoMallet = Math.sqrt((mvx||0)**2 + (mvy||0)**2);
      const newSpd = Math.max(spd + 0.005 + impulsoMallet*0.6, 0.012);
      S.bvx = nx*newSpd + (mvx||0)*0.4;
      S.bvy = ny*newSpd + (mvy||0)*0.4;
      return true;
    }
  }
  return false;
}

function resetAHBall(S, dir) {
  S.bx=.5; S.by=.5;
  S.bvx=(Math.random()-.5)*.01;
  S.bvy=dir==='up'?.008:-.008;
}

async function encerrarAirHockey(roomId, winnerRole, motivo) {
  const partida = partidas[roomId];
  if (!partida || partida._encerrado) return;
  partida._encerrado = true;
  clearInterval(partida.interval);
  const winnerId = winnerRole==='p1' ? partida.p1.userId : partida.p2.userId;
  const loserId  = winnerRole==='p1' ? partida.p2.userId : partida.p1.userId;
  const winnerSocket = winnerRole==='p1' ? partida.p1.socket : partida.p2.socket;
  const loserSocket  = winnerRole==='p1' ? partida.p2.socket : partida.p1.socket;
  const prize = parseFloat((partida.valor*1.75).toFixed(2));
  let nivelWin = {mudou:0}, nivelLose = {mudou:0};
  try {
    await pool.query('UPDATE users SET saldo=saldo+$1 WHERE id=$2',[prize,winnerId]);
    await pool.query('INSERT INTO transacoes(user_id,tipo,valor,descricao,status) VALUES($1,$2,$3,$4,$5)',
      [winnerId,'ganho',prize,`Vitória Air Hockey R$${partida.valor} (${motivo})`,'concluido']);
    nivelWin = await atualizarNivel(winnerId,'vitoria','airhockey');
    nivelLose = await atualizarNivel(loserId,'derrota','airhockey');
  } catch(e) { console.error('Erro encerrar AH:', e.message); }
  // Enviar resultado individual com mudança de nível
  try {
    winnerSocket.emit('game_end',{winner:winnerRole,prize,valor:partida.valor,nivelMudou:nivelWin.mudou,nivel:nivelWin.nivel});
    loserSocket.emit('game_end',{winner:winnerRole,prize,valor:partida.valor,nivelMudou:nivelLose.mudou,nivel:nivelLose.nivel});
  } catch(e) {
    io.to(roomId).emit('game_end',{winner:winnerRole,prize,valor:partida.valor});
  }
  console.log(`🏒 ${roomId} encerrada: winner=${winnerRole} motivo=${motivo}`);
  delete partidas[roomId];
}


// ===== FLAPPY BIRD MULTIPLAYER =====
const flappySalas = {};
const flappyConns = {};

// Inicia a partida Flappy mesmo que nem todos tenham escolhido pássaro
async function iniciarFlappyForçado(salaKey) {
  const s = flappySalas[salaKey];
  if (!s || s.finalizada || s._iniciandoJogo) return;
  s._iniciandoJogo = true;
  // Auto-atribuir pássaros para quem não escolheu
  let proximo = 0;
  const usados = new Set(Object.values(s.passaros));
  for (const j of s.jogadores) {
    if (s.passaros[j.userId] === undefined) {
      while (usados.has(proximo)) proximo++;
      s.passaros[j.userId] = proximo;
      usados.add(proximo);
      proximo++;
    }
  }
  for (const j of s.jogadores) {
    await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [s.valor, j.userId]);
  }
  io.to(salaKey).emit('flappy_start', {
    jogadores: s.jogadores.map(j => ({ id: j.userId, nome: j.nome })),
    valor: s.valor, countdown: 3,
    passaros: s.passaros
  });
}

function calcularPremios(ranking, valor, tamanho) {
  // valor = aposta de cada jogador
  // 2 jogadores: 1º recebe 175% da aposta dele (casa fica 25% de cada)
  // 3 jogadores: 1º recebe 175%, 2º recebe 100% (devolução)
  // 4 jogadores: 1º recebe 175%, 2º recebe 150%, 3º recebe 50%
  // 5 jogadores: 1º recebe 175%, 2º recebe 150%, 3º recebe 100%
  const premios = {};
  ranking.forEach((j, i) => {
    if (tamanho === 2) {
      if (i === 0) premios[j.userId] = parseFloat((valor * 1.75).toFixed(2));
      else premios[j.userId] = 0;
    } else if (tamanho === 3) {
      if (i === 0) premios[j.userId] = parseFloat((valor * 1.75).toFixed(2));
      else if (i === 1) premios[j.userId] = parseFloat((valor * 1.0).toFixed(2));
      else premios[j.userId] = 0;
    } else if (tamanho === 4) {
      if (i === 0) premios[j.userId] = parseFloat((valor * 1.75).toFixed(2));
      else if (i === 1) premios[j.userId] = parseFloat((valor * 1.5).toFixed(2));
      else if (i === 2) premios[j.userId] = parseFloat((valor * 0.5).toFixed(2));
      else premios[j.userId] = 0;
    } else {
      if (i === 0) premios[j.userId] = parseFloat((valor * 1.75).toFixed(2));
      else if (i === 1) premios[j.userId] = parseFloat((valor * 1.5).toFixed(2));
      else if (i === 2) premios[j.userId] = parseFloat((valor * 1.0).toFixed(2));
      else premios[j.userId] = 0;
    }
  });
  return premios;
}

async function finalizarFlappy(salaKey) {
  const s = flappySalas[salaKey];
  if (!s || s.finalizada) return;
  s.finalizada = true;

  const ranking = [...s.jogadores].sort((a, b) => b.pontos - a.pontos);

  // Detectar empate: se os 2 primeiros (ou todos, em sala 2) têm pontos iguais
  const premios = {};
  const empate2 = s.tamanho === 2 && ranking[0].pontos === ranking[1].pontos;
  if (empate2) {
    // Empate em sala 2: devolve a aposta para ambos
    for (const j of ranking) premios[j.userId] = parseFloat(s.valor.toFixed(2));
  } else {
    Object.assign(premios, calcularPremios(ranking, s.valor, s.tamanho));
  }

  for (const [userId, premio] of Object.entries(premios)) {
    if (premio > 0) {
      await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [premio, userId]);
      const tipo = empate2 ? 'devolucao' : (premio > s.valor ? 'ganho' : 'devolucao');
      await pool.query(
        'INSERT INTO transacoes (user_id, tipo, valor, descricao, status) VALUES ($1,$2,$3,$4,$5)',
        [userId, tipo, premio, `Flappy Bird R$${s.valor} (${s.tamanho}p)${empate2 ? ' - EMPATE' : ''}`, 'concluido']
      );
    }
  }

  // Atualizar nível + ranking: empate = empate, 1º = vitória, resto = derrota
  const nivelPorUser = {};
  for (let i = 0; i < ranking.length; i++) {
    const uid = ranking[i].userId;
    const resultado = empate2 ? 'empate' : (i === 0 ? 'vitoria' : 'derrota');
    const r = await atualizarNivel(uid, resultado, 'flappy');
    nivelPorUser[uid] = r ? r.mudou : 0;
  }

  io.to(salaKey).emit('flappy_fim', {
    ranking: ranking.map(j => ({ id: j.userId, nome: j.nome, pontos: j.pontos })),
    premios,
    empate: empate2,
    nivelMudou: nivelPorUser
  });

  delete flappySalas[salaKey];
  Object.keys(flappyConns).forEach(sid => {
    if (flappyConns[sid] && flappyConns[sid].salaKey === salaKey) delete flappyConns[sid];
  });
}

io.on('connection', (socketF) => {
  socketF.on('flappy_join', async ({ token: tkn, sala, valor }) => {
    try {
      const decoded = jwt.verify(tkn, JWT_SECRET);
      const userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user || user.saldo < valor) { socketF.emit('flappy_erro', { msg: 'Saldo insuficiente' }); return; }

      const salaKey = `flappy_${sala}_${valor}`;
      if (!flappySalas[salaKey]) flappySalas[salaKey] = { jogadores: [], valor, tamanho: sala, iniciada: false, finalizada: false, timer: null };
      const s = flappySalas[salaKey];
      s.jogadores = s.jogadores.filter(j => j.userId !== userId);
      s.jogadores.push({ socketId: socketF.id, userId, nome: user.nome, pontos: 0, morto: false });
      flappyConns[socketF.id] = { userId, nome: user.nome, salaKey, pontos: 0, morto: false };
      socketF.join(salaKey);

      io.to(salaKey).emit('flappy_sala_update', {
        jogadores: s.jogadores.map(j => ({ id: j.userId, nome: j.nome })), total: sala
      });

      if (s.jogadores.length >= sala && !s.iniciada) {
        s.iniciada = true;
        s.passaros = {};
        if (s.timer) clearTimeout(s.timer);
        io.to(salaKey).emit('flappy_escolher_passaro', {
          jogadores: s.jogadores.map(j => ({ id: j.userId, nome: j.nome }))
        });
        // Timeout de 12s: auto-atribui pássaro para quem não escolheu e inicia
        s.timer = setTimeout(() => iniciarFlappyForçado(salaKey), 12000);
      }
    } catch(e) { socketF.emit('flappy_erro', { msg: 'Erro de autenticação' }); }
  });

  // Jogador escolheu pássaro
  socketF.on('flappy_escolher_passaro', ({ passaroIdx }) => {
    const conn = flappyConns[socketF.id];
    if (!conn) return;
    const s = flappySalas[conn.salaKey];
    if (!s || !s.passaros || s.finalizada) return;
    const jaEscolhido = Object.entries(s.passaros).some(([uid, idx]) => idx === passaroIdx && parseInt(uid) !== conn.userId);
    if (jaEscolhido) {
      socketF.emit('flappy_passaro_ocupado', { passaroIdx });
      return;
    }
    s.passaros[conn.userId] = passaroIdx;
    io.to(conn.salaKey).emit('flappy_passaros_atualizados', { passaros: s.passaros });

    // Se todos escolheram, cancela o timeout e inicia imediatamente
    if (Object.keys(s.passaros).length >= s.jogadores.length) {
      if (s.timer) clearTimeout(s.timer);
      iniciarFlappyForçado(conn.salaKey);
    }
  });

  socketF.on('flappy_ponto', ({ pontos }) => {
    const conn = flappyConns[socketF.id];
    if (!conn || conn.morto) return; // ignora pontos se já morreu
    conn.pontos = pontos;
    const s = flappySalas[conn.salaKey];
    if (s) { const j = s.jogadores.find(j => j.userId === conn.userId); if (j && !j.morto) j.pontos = pontos; }
    io.to(conn.salaKey).emit('flappy_update', { id: conn.userId, pontos });
  });

  // Sincronizar posição do pássaro (para adversários verem em tempo real)
  socketF.on('flappy_pos', ({ y, vy }) => {
    const conn = flappyConns[socketF.id];
    if (!conn || conn.morto) return;
    // Repassar para os outros jogadores da sala (volatile = sem lag)
    socketF.to(conn.salaKey).volatile.emit('flappy_pos_update', {
      id: conn.userId, y: Math.round(y), vy: Math.round(vy * 10) / 10
    });
  });

  socketF.on('flappy_morreu', async ({ pontos }) => {
    const conn = flappyConns[socketF.id];
    if (!conn) return;
    conn.morto = true; conn.pontos = pontos;
    const s = flappySalas[conn.salaKey];
    if (!s) return;
    const j = s.jogadores.find(j => j.userId === conn.userId);
    if (j) { j.morto = true; j.pontos = pontos; }
    io.to(conn.salaKey).emit('flappy_player_morreu', { id: conn.userId });
    const vivos = s.jogadores.filter(j => !j.morto);
    // Encerra se todos morreram OU se só sobrou 1 vivo (vencedor já definido)
    if (vivos.length <= 1) {
      await finalizarFlappy(conn.salaKey);
    }
  });

  socketF.on('flappy_leave', () => {
    const conn = flappyConns[socketF.id];
    if (!conn) return;
    const s = flappySalas[conn.salaKey];
    if (s && !s.iniciada) {
      s.jogadores = s.jogadores.filter(j => j.socketId !== socketF.id);
      io.to(conn.salaKey).emit('flappy_sala_update', {
        jogadores: s.jogadores.map(j => ({ id: j.userId, nome: j.nome })), total: s.tamanho
      });
    }
    socketF.leave(conn.salaKey);
    delete flappyConns[socketF.id];
  });
});


// ===== XADREZ MULTIPLAYER =====
const xadrezFilas = {}; // valor -> [jogadores]
const xadrezPartidas = {}; // roomId -> { p1, p2, valor }

io.on('connection', (socketX) => {
  socketX.on('chess_join', async ({ valor, token: tkn }) => {
    try {
      const decoded = jwt.verify(tkn, JWT_SECRET);
      const userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user || user.saldo < valor) { socketX.emit('chess_error', { msg: 'Saldo insuficiente' }); return; }

      if (!xadrezFilas[valor]) xadrezFilas[valor] = [];
      xadrezFilas[valor] = xadrezFilas[valor].filter(j => j.userId !== userId);

      if (xadrezFilas[valor].length > 0) {
        const oponente = xadrezFilas[valor].shift();
        const roomId = `chess_${Date.now()}`;

        await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, userId]);
        await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, oponente.userId]);

        xadrezPartidas[roomId] = { p1: oponente, p2: { socket: socketX, userId, nome: user.nome }, valor };

        socketX.join(roomId);
        oponente.socket.join(roomId);

        // Cor aleatória
        const cores = Math.random() > 0.5 ? ['white','black'] : ['black','white'];
        oponente.socket.emit('chess_start', { color: cores[0], oppName: user.nome, valor });
        socketX.emit('chess_start', { color: cores[1], oppName: oponente.nome, valor });

        xadrezPartidas[roomId].room = roomId;
      } else {
        xadrezFilas[valor].push({ socket: socketX, userId, nome: user.nome });
      }
    } catch(e) { socketX.emit('chess_error', { msg: 'Erro de autenticação' }); }
  });

  socketX.on('chess_move', (data) => {
    const partida = Object.values(xadrezPartidas).find(p => p.p1.socket.id===socketX.id || p.p2.socket.id===socketX.id);
    if (!partida) return;
    const outro = partida.p1.socket.id===socketX.id ? partida.p2.socket : partida.p1.socket;
    outro.emit('chess_move', data);
  });

  socketX.on('chess_end', async ({ winner, reason }) => {
    const entry = Object.entries(xadrezPartidas).find(([,p]) => p.p1.socket.id===socketX.id || p.p2.socket.id===socketX.id);
    if (!entry) return;
    const [roomId, partida] = entry;
    const winnerId = winner==='white' ? partida.p1.userId : partida.p2.userId;
    const prize = parseFloat((partida.valor * 1.75).toFixed(2));
    await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [prize, winnerId]);
    await pool.query('INSERT INTO transacoes (user_id, tipo, valor, descricao, status) VALUES ($1,$2,$3,$4,$5)',
      [winnerId, 'ganho', prize, `Vitória Xadrez R$${partida.valor}`, 'concluido']);
    io.to(roomId).emit('chess_end', { winner, reason });
    delete xadrezPartidas[roomId];
  });

  socketX.on('chess_leave', () => {
    Object.keys(xadrezFilas).forEach(v => {
      xadrezFilas[v] = xadrezFilas[v].filter(j => j.socket.id !== socketX.id);
    });
  });
});


// ===== SINUCA MULTIPLAYER =====
const sinucaFilas = {};
const sinucaPartidas = {};

io.on('connection', (socketS) => {
  socketS.on('sinuca_join', async ({ valor, token: tkn }) => {
    try {
      const decoded = jwt.verify(tkn, JWT_SECRET);
      const userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user || user.saldo < valor) { socketS.emit('sinuca_error', { msg: 'Saldo insuficiente' }); return; }
      if (!sinucaFilas[valor]) sinucaFilas[valor] = [];
      sinucaFilas[valor] = sinucaFilas[valor].filter(j => j.userId !== userId);
      if (sinucaFilas[valor].length > 0) {
        const oponente = sinucaFilas[valor].shift();
        const roomId = `sinuca_${Date.now()}`;
        await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, userId]);
        await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, oponente.userId]);
        sinucaPartidas[roomId] = { p1: oponente, p2: { socket: socketS, userId, nome: user.nome }, valor };
        socketS.join(roomId);
        oponente.socket.join(roomId);
        oponente.socket.emit('sinuca_start', { first: true, oppName: user.nome, valor });
        socketS.emit('sinuca_start', { first: false, oppName: oponente.nome, valor });
      } else {
        sinucaFilas[valor].push({ socket: socketS, userId, nome: user.nome });
      }
    } catch(e) { socketS.emit('sinuca_error', { msg: 'Erro' }); }
  });

  socketS.on('sinuca_shot', (data) => {
    const partida = Object.values(sinucaPartidas).find(p => p.p1.socket.id===socketS.id || p.p2.socket.id===socketS.id);
    if (!partida) return;
    const outro = partida.p1.socket.id===socketS.id ? partida.p2.socket : partida.p1.socket;
    outro.emit('sinuca_shot', data);
  });

  socketS.on('sinuca_end', async ({ winner }) => {
    const entry = Object.entries(sinucaPartidas).find(([,p]) => p.p1.socket.id===socketS.id || p.p2.socket.id===socketS.id);
    if (!entry) return;
    const [roomId, partida] = entry;
    const winnerId = winner==='p1' ? partida.p1.userId : partida.p2.userId;
    const prize = parseFloat((partida.valor*1.75).toFixed(2));
    await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [prize, winnerId]);
    await pool.query('INSERT INTO transacoes (user_id,tipo,valor,descricao,status) VALUES ($1,$2,$3,$4,$5)',
      [winnerId,'ganho',prize,`Vitória Sinuca R$${partida.valor}`,'concluido']);
    io.to(roomId).emit('sinuca_end', { winner, reason: 'Fim de jogo' });
    delete sinucaPartidas[roomId];
  });

  socketS.on('sinuca_leave', () => {
    Object.keys(sinucaFilas).forEach(v => {
      sinucaFilas[v] = sinucaFilas[v].filter(j => j.socket.id !== socketS.id);
    });
  });
});



// ===== SISTEMA DE NÍVEIS =====
// Adicionar colunas se não existirem
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS nivel INTEGER DEFAULT 1').catch(()=>{});
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS vitorias_nivel INTEGER DEFAULT 0').catch(()=>{});
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS total_vitorias INTEGER DEFAULT 0').catch(()=>{});
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS total_derrotas INTEGER DEFAULT 0').catch(()=>{});

async function atualizarNivel(userId, resultado, jogo) {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS nivel INTEGER DEFAULT 1').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS vitorias_nivel INTEGER DEFAULT 0').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS total_vitorias INTEGER DEFAULT 0').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS total_derrotas INTEGER DEFAULT 0').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS partidas_online INTEGER DEFAULT 0').catch(()=>{});

    const { rows } = await pool.query('SELECT nivel, vitorias_nivel, total_vitorias, total_derrotas FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) return { mudou: 0 };

    let nivel = user.nivel || 1;
    const nivelAntes = nivel;
    let vitorias = user.vitorias_nivel || 0;
    let totalVit = user.total_vitorias || 0;
    let totalDer = user.total_derrotas || 0;

    if (resultado === 'vitoria') {
      vitorias++; totalVit++;
      if (vitorias >= 10 && nivel < 100) { nivel++; vitorias = 0; }
    } else if (resultado === 'derrota') {
      totalDer++;
      if (vitorias > 0) { vitorias--; }
      else if (nivel > 1) { nivel--; vitorias = 9; }
    }

    await pool.query(
      'UPDATE users SET nivel=$1, vitorias_nivel=$2, total_vitorias=$3, total_derrotas=$4 WHERE id=$5',
      [nivel, vitorias, totalVit, totalDer, userId]
    );

    // Atualizar ranking (vitória +2, empate +1, derrota -1) e contar partidas online
    await atualizarRanking(userId, resultado, jogo);
    await contarPartidaReferral(userId);

    return { mudou: nivel - nivelAntes, nivel, nivelAntes };
  } catch(e) { console.error('Erro nivel:', e.message); return { mudou: 0 }; }
}

// ===== RANKING (semanal e mensal) =====
// Helper: chaves de período consistentes
// Semana: domingo a sábado. Chave = data do domingo (YYYY-MM-DD)
// Mês: dia 1 ao último dia. Chave = YYYY-MM
function chaveSemana(d = new Date()) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diaSemana = dt.getDay(); // 0=domingo
  dt.setDate(dt.getDate() - diaSemana); // volta para o domingo
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const dia = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`; // ex: 2026-06-07 (domingo)
}
function chaveMes(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`; // ex: 2026-06
}

async function atualizarRanking(userId, resultado, jogo) {
  if (!jogo) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS ranking (
      id SERIAL PRIMARY KEY, user_id INTEGER, jogo TEXT, pontos INTEGER DEFAULT 0,
      semana TEXT, mes TEXT, atualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, jogo, semana, mes)
    )`).catch(()=>{});
    const pts = resultado === 'vitoria' ? 2 : resultado === 'empate' ? 1 : -1;
    const semana = chaveSemana();
    const mes = chaveMes();
    await pool.query(`
      INSERT INTO ranking (user_id, jogo, pontos, semana, mes) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id, jogo, semana, mes) DO UPDATE SET pontos = ranking.pontos + $3, atualizado = CURRENT_TIMESTAMP
    `, [userId, jogo, pts, semana, mes]);
  } catch(e) { console.error('Erro ranking:', e.message); }
}

// ===== REFERRAL: contar partidas online do convidado =====
async function contarPartidaReferral(userId) {
  try {
    await pool.query('UPDATE users SET partidas_online = COALESCE(partidas_online,0) + 1 WHERE id = $1', [userId]);
    // Verificar se atingiu 50 partidas e tem quem convidou
    const { rows } = await pool.query('SELECT partidas_online, convidado_por, bonus_pago FROM users WHERE id = $1', [userId]);
    const u = rows[0];
    if (u && u.convidado_por && !u.bonus_pago && u.partidas_online >= 50) {
      // Pagar R$5 ao convidador
      await pool.query('UPDATE users SET saldo = saldo + 5 WHERE id = $1', [u.convidado_por]);
      await pool.query('UPDATE users SET bonus_pago = true WHERE id = $1', [userId]);
      await pool.query('INSERT INTO transacoes (user_id,tipo,valor,descricao,status) VALUES ($1,$2,$3,$4,$5)',
        [u.convidado_por, 'bonus', 5, 'Bônus de indicação (amigo jogou 50 partidas)', 'concluido']);
      // Notificar o convidador
      await pool.query(`CREATE TABLE IF NOT EXISTS notificacoes (id SERIAL PRIMARY KEY, user_id INTEGER, titulo TEXT, mensagem TEXT, lida BOOLEAN DEFAULT false, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`).catch(()=>{});
      await pool.query('INSERT INTO notificacoes (user_id, titulo, mensagem) VALUES ($1,$2,$3)',
        [u.convidado_por, '🎁 Bônus de indicação!', 'Seu amigo completou 50 partidas. Você ganhou R$5,00!']);
      console.log(`🎁 Bônus de indicação pago: convidador ${u.convidado_por}`);
    }
  } catch(e) { /* colunas podem não existir ainda */ }
}

// ===== SISTEMA DE SALAS PRIVADAS =====
const salasPrivadas = {}; // codigo -> { jogo, valor, senha, dono, socketDono, nomesDono, aguardando }

function gerarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socketP) => {
  socketP.on('criar_sala', async ({ token: tkn, jogo, valor, senha }) => {
    try {
      console.log('📥 criar_sala recebido:', { jogo, valor });
      const decoded = jwt.verify(tkn, JWT_SECRET);
      const userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user) { socketP.emit('sala_erro', { msg: 'Usuário não encontrado' }); return; }
      const saldoNum = parseFloat(user.saldo) || 0;
      const valorNum = parseFloat(valor) || 0;
      if (saldoNum < valorNum) { socketP.emit('sala_erro', { msg: 'Saldo insuficiente' }); return; }

      // Remover sala anterior do mesmo jogador
      Object.keys(salasPrivadas).forEach(k => {
        if (salasPrivadas[k].userId === userId) delete salasPrivadas[k];
      });

      let codigo;
      do { codigo = gerarCodigo(); } while (salasPrivadas[codigo]);

      salasPrivadas[codigo] = { jogo, valor: valorNum, senha: senha || '', userId, socket: socketP, nome: user.nome, aguardando: true };
      socketP.join('sala_' + codigo);
      socketP.emit('sala_criada', { codigo, jogo, valor: valorNum });
      console.log('✅ Sala criada:', codigo, 'jogo:', jogo);
    } catch(e) {
      console.error('❌ Erro criar_sala:', e.message);
      socketP.emit('sala_erro', { msg: 'Erro ao criar sala: ' + e.message });
    }
  });

  socketP.on('entrar_sala', async ({ token: tkn, codigo, senha }) => {
    try {
      const decoded = jwt.verify(tkn, JWT_SECRET);
      const userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];

      const sala = salasPrivadas[codigo.toUpperCase()];
      if (!sala) { socketP.emit('sala_erro', { msg: 'Sala não encontrada!' }); return; }
      if (!sala.aguardando) { socketP.emit('sala_erro', { msg: 'Sala já está em jogo!' }); return; }
      if (sala.userId === userId) { socketP.emit('sala_erro', { msg: 'Você criou esta sala!' }); return; }
      if (sala.senha && sala.senha !== senha) { socketP.emit('sala_erro', { msg: 'Senha incorreta!' }); return; }
      if (!user || (parseFloat(user.saldo)||0) < (parseFloat(sala.valor)||0)) { socketP.emit('sala_erro', { msg: 'Saldo insuficiente' }); return; }

      sala.aguardando = false;
      socketP.join('sala_' + codigo);

      // Debitar os dois
      await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [sala.valor, sala.userId]);
      await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [sala.valor, userId]);

      // Iniciar o jogo correto
      const roomId = 'sala_' + codigo;
      const jogo = sala.jogo;

      if (jogo === 'airhockey') {
        const state = {
          bx:.5, by:.5, bvx:.006, bvy:.008, br:.03,
          m1x:.5, m1y:.82, m2x:.5, m2y:.18,
          s1:0, s2:0, valor:sala.valor
        };
        partidas[roomId] = {
          p1:{socket:sala.socket,userId:sala.userId,nome:sala.nome},
          p2:{socket:socketP,userId,nome:user.nome},
          state, interval:null, valor:sala.valor, score1:0, score2:0
        };
        sala.socket.emit('game_start',{role:'p1',p1name:sala.nome,p2name:user.nome,valor:sala.valor});
        socketP.emit('game_start',{role:'p2',p1name:sala.nome,p2name:user.nome,valor:sala.valor});
        // Usa o mesmo motor de física da fila normal (tickAH)
        partidas[roomId].interval = setInterval(() => tickAH(roomId), 1000/60);
      } else if (jogo === 'xadrez') {
        const cores = Math.random()>0.5?['white','black']:['black','white'];
        sala.socket.emit('chess_start',{color:cores[0],oppName:user.nome,valor:sala.valor});
        socketP.emit('chess_start',{color:cores[1],oppName:sala.nome,valor:sala.valor});
        xadrezPartidas[roomId] = {p1:{socket:sala.socket,userId:sala.userId,nome:sala.nome},p2:{socket:socketP,userId,nome:user.nome},valor:sala.valor,room:roomId};
      } else if (jogo === 'flappy') {
        const salaKey = roomId;
        flappySalas[salaKey] = { jogadores:[{socketId:sala.socket.id,userId:sala.userId,nome:sala.nome,pontos:0,morto:false},{socketId:socketP.id,userId,nome:user.nome,pontos:0,morto:false}], valor:sala.valor, tamanho:2, iniciada:true, finalizada:false };
        flappyConns[sala.socket.id] = {userId:sala.userId,nome:sala.nome,salaKey,pontos:0,morto:false};
        flappyConns[socketP.id] = {userId,nome:user.nome,salaKey,pontos:0,morto:false};
        sala.socket.emit('flappy_start',{jogadores:[{id:sala.userId,nome:sala.nome},{id:userId,nome:user.nome}],valor:sala.valor,countdown:3});
        socketP.emit('flappy_start',{jogadores:[{id:sala.userId,nome:sala.nome},{id:userId,nome:user.nome}],valor:sala.valor,countdown:3});
      } else if (jogo === 'sinuca') {
        sinucaPartidas[roomId]={p1:{socket:sala.socket,userId:sala.userId,nome:sala.nome},p2:{socket:socketP,userId,nome:user.nome},valor:sala.valor};
        sala.socket.emit('sinuca_start',{first:true,oppName:user.nome,valor:sala.valor});
        socketP.emit('sinuca_start',{first:false,oppName:sala.nome,valor:sala.valor});
      }

      delete salasPrivadas[codigo];
    } catch(e) { socketP.emit('sala_erro', { msg: 'Erro ao entrar na sala' }); }
  });

  socketP.on('cancelar_sala', ({ codigo }) => {
    if (salasPrivadas[codigo] && salasPrivadas[codigo].socket.id === socketP.id) {
      delete salasPrivadas[codigo];
    }
  });
});


// ===== ADMIN - CONTROLE DE USUÁRIOS =====
app.post('/api/admin/usuario/:id/saldo', adminAuth1, async (req, res) => {
  const valor = parseFloat(req.body.valor);
  const operacao = req.body.operacao;
  const userId = parseInt(req.params.id);
  if (!valor || valor <= 0 || isNaN(valor)) return res.status(400).json({ erro: 'Valor inválido' });
  if (!userId || isNaN(userId)) return res.status(400).json({ erro: 'ID inválido' });
  try {
    // Verificar se usuário existe
    const { rows: check } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!check.length) return res.status(404).json({ erro: 'Usuário não encontrado' });

    if (operacao === 'add') {
      await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [valor, userId]);
      await pool.query('INSERT INTO transacoes (user_id,tipo,valor,descricao,status) VALUES ($1,$2,$3,$4,$5)',
        [userId, 'bonus', valor, 'Crédito manual pelo admin', 'concluido']);
    } else {
      await pool.query('UPDATE users SET saldo = GREATEST(0, saldo - $1) WHERE id = $2', [valor, userId]);
    }
    const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [userId]);
    res.json({ sucesso: true, saldo: parseFloat(rows[0].saldo) });
  } catch(e) {
    console.error('Erro admin saldo:', e.message);
    res.status(500).json({ erro: 'Erro ao atualizar saldo: ' + e.message });
  }
});

app.post('/api/admin/usuario/:id/bloquear', adminAuth1, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT bloqueado FROM users WHERE id = $1', [req.params.id]);
    const novoStatus = !rows[0]?.bloqueado;
    await pool.query('UPDATE users SET bloqueado = $1 WHERE id = $2', [novoStatus, req.params.id]);
    res.json({ sucesso: true, bloqueado: novoStatus });
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

app.post('/api/admin/usuario/:id/senha', adminAuth, async (req, res) => {
  const { novaSenha } = req.body;
  if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ erro: 'Senha muito curta' });
  try {
    const hash = await bcrypt.hash(novaSenha, 10);
    await pool.query('UPDATE users SET senha = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

// ===== ADMIN - CONTROLE DE JOGOS =====
// Rota PÚBLICA: status dos jogos (para a tela inicial saber quais estão ativos)
app.get('/api/jogos-status', async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS jogos_config (
      id TEXT PRIMARY KEY, nome TEXT, ativo BOOLEAN DEFAULT true
    )`).catch(()=>{});
    const { rows } = await pool.query('SELECT id, ativo FROM jogos_config');
    const status = {};
    rows.forEach(r => { status[r.id] = r.ativo; });
    res.json(status);
  } catch(e) { res.json({}); }
});

app.get('/api/admin/jogos', adminAuth, async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS jogos_config (
      id TEXT PRIMARY KEY, nome TEXT, ativo BOOLEAN DEFAULT true
    )`);
    const jogos = ['airhockey','flappy','xadrez','sinuca','domino'];
    const nomes = {'airhockey':'🏒 Air Hockey','flappy':'🐦 Flappy Duelo','xadrez':'♟️ Xadrez','sinuca':'🎱 Sinuca','domino':'🁣 Dominó'};
    for (const j of jogos) {
      await pool.query('INSERT INTO jogos_config (id,nome,ativo) VALUES ($1,$2,true) ON CONFLICT (id) DO NOTHING', [j, nomes[j]]);
    }
    const { rows } = await pool.query('SELECT * FROM jogos_config');
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

app.post('/api/admin/jogos/:id/toggle', adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE jogos_config SET ativo = NOT ativo WHERE id = $1', [req.params.id]);
    const { rows } = await pool.query('SELECT ativo FROM jogos_config WHERE id = $1', [req.params.id]);
    res.json({ sucesso: true, ativo: rows[0].ativo });
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

app.get('/api/admin/estatisticas', adminAuth, async (req, res) => {
  try {
    const { rows: r1 } = await pool.query('SELECT COUNT(*) as total FROM users');
    const { rows: r2 } = await pool.query("SELECT SUM(valor) as total FROM transacoes WHERE tipo='deposito' AND status='aprovado'");
    const { rows: r3 } = await pool.query("SELECT SUM(valor) as total FROM transacoes WHERE tipo='saque' AND status='pago'");
    const { rows: r4 } = await pool.query("SELECT COUNT(*) as total FROM transacoes WHERE tipo='saque' AND status='pendente'");
    const { rows: r5 } = await pool.query("SELECT SUM(valor)*0.25 as total FROM transacoes WHERE tipo='ganho'");
    const { rows: r6 } = await pool.query("SELECT descricao, COUNT(*) as total FROM transacoes WHERE tipo='ganho' GROUP BY descricao ORDER BY total DESC");
    res.json({
      totalUsers: parseInt(r1[0].total),
      totalDep: parseFloat(r2[0].total)||0,
      totalSaq: parseFloat(r3[0].total)||0,
      saquesPendentes: parseInt(r4[0].total),
      receitaCasa: parseFloat(r5[0].total)||0,
      jogosMaisJogados: r6
    });
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

// Add bloqueado column if not exists
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT false').catch(()=>{});

// Block login for blocked users

// ===== DOMINÓ MULTIPLAYER =====
const dominoFilas = {};
const dominoPartidas = {};

function criarPecasDomino() {
  const p = [];
  for (let i=0;i<=6;i++) for(let j=i;j<=6;j++) p.push({a:i,b:j});
  return p.sort(()=>Math.random()-0.5);
}

io.on('connection', (socketD) => {
  socketD.on('domino_join', async ({ valor, token: tkn }) => {
    try {
      const decoded = jwt.verify(tkn, JWT_SECRET);
      const userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user || user.saldo < valor) { socketD.emit('domino_error', {msg:'Saldo insuficiente'}); return; }
      if (!dominoFilas[valor]) dominoFilas[valor] = [];
      dominoFilas[valor] = dominoFilas[valor].filter(j => j.userId !== userId);
      if (dominoFilas[valor].length > 0) {
        const oponente = dominoFilas[valor].shift();
        const roomId = `domino_${Date.now()}`;
        await pool.query('UPDATE users SET saldo=saldo-$1 WHERE id=$2',[valor,userId]);
        await pool.query('UPDATE users SET saldo=saldo-$1 WHERE id=$2',[valor,oponente.userId]);
        const pecas = criarPecasDomino();
        const mao1 = pecas.slice(0,7);
        const mao2 = pecas.slice(7,14);
        const estoque = 14;
        const first = mao1.some(p=>p.a===6&&p.b===6);
        dominoPartidas[roomId] = {p1:oponente,p2:{socket:socketD,userId,nome:user.nome},valor};
        socketD.join(roomId); oponente.socket.join(roomId);
        oponente.socket.emit('domino_start',{first,oppName:user.nome,valor,mao:mao1,estoque});
        socketD.emit('domino_start',{first:!first,oppName:oponente.nome,valor,mao:mao2,estoque});
      } else {
        dominoFilas[valor].push({socket:socketD,userId,nome:user.nome});
      }
    } catch(e) { socketD.emit('domino_error',{msg:'Erro'}); }
  });

  socketD.on('domino_move', data => {
    const partida = Object.values(dominoPartidas).find(p=>p.p1.socket.id===socketD.id||p.p2.socket.id===socketD.id);
    if (!partida) return;
    const outro = partida.p1.socket.id===socketD.id ? partida.p2.socket : partida.p1.socket;
    outro.emit('domino_move', data);
  });

  socketD.on('domino_end', async ({ winner }) => {
    const entry = Object.entries(dominoPartidas).find(([,p])=>p.p1.socket.id===socketD.id||p.p2.socket.id===socketD.id);
    if (!entry) return;
    const [roomId, partida] = entry;
    const winnerId = winner==='p1' ? partida.p1.userId : partida.p2.userId;
    const prize = parseFloat((partida.valor*1.75).toFixed(2));
    await pool.query('UPDATE users SET saldo=saldo+$1 WHERE id=$2',[prize,winnerId]);
    await pool.query('INSERT INTO transacoes(user_id,tipo,valor,descricao,status) VALUES($1,$2,$3,$4,$5)',
      [winnerId,'ganho',prize,`Vitória Dominó R$${partida.valor}`,'concluido']);
    io.to(roomId).emit('domino_end',{winner,reason:'Fim de jogo'});
    delete dominoPartidas[roomId];
  });

  socketD.on('domino_leave', () => {
    Object.keys(dominoFilas).forEach(v => {
      dominoFilas[v] = dominoFilas[v].filter(j=>j.socket.id!==socketD.id);
    });
  });
});


// ===== SISTEMA DE TORNEIOS =====
pool.query(`CREATE TABLE IF NOT EXISTS torneios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  jogo TEXT NOT NULL,
  premio REAL NOT NULL,
  taxa_inscricao REAL NOT NULL,
  max_participantes INTEGER NOT NULL,
  data_hora TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'aberto',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).catch(e=>console.error('Erro criar tabela torneios:', e.message));

pool.query(`CREATE TABLE IF NOT EXISTS torneio_inscricoes (
  id SERIAL PRIMARY KEY,
  torneio_id INTEGER REFERENCES torneios(id),
  user_id INTEGER REFERENCES users(id),
  nome TEXT,
  inscrito_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(torneio_id, user_id)
)`).catch(e=>console.error('Erro criar tabela inscricoes:', e.message));

// Listar torneios (público)
app.get('/api/torneios', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM torneio_inscricoes WHERE torneio_id = t.id) as inscritos,
        EXISTS(SELECT 1 FROM torneio_inscricoes WHERE torneio_id = t.id AND user_id = $1) as inscrito
      FROM torneios t
      WHERE t.status != 'finalizado'
      ORDER BY t.data_hora ASC
    `, [req.user.id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: 'Erro ao listar torneios' }); }
});

// Inscrever-se em torneio
app.post('/api/torneios/:id/inscrever', auth, async (req, res) => {
  try {
    const { rows: tRows } = await pool.query('SELECT * FROM torneios WHERE id = $1', [req.params.id]);
    const torneio = tRows[0];
    if (!torneio) return res.status(404).json({ erro: 'Torneio não encontrado' });
    if (torneio.status !== 'aberto') return res.status(400).json({ erro: 'Inscrições encerradas' });

    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM torneio_inscricoes WHERE torneio_id = $1', [req.params.id]);
    if (parseInt(countRows[0].count) >= torneio.max_participantes) return res.status(400).json({ erro: 'Torneio lotado' });

    const { rows: uRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = uRows[0];
    if (user.saldo < torneio.taxa_inscricao) return res.status(400).json({ erro: 'Saldo insuficiente para a taxa' });

    // Verificar se já inscrito
    const { rows: jaRows } = await pool.query('SELECT 1 FROM torneio_inscricoes WHERE torneio_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (jaRows.length) return res.status(400).json({ erro: 'Você já está inscrito' });

    // Debitar taxa e inscrever
    await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [torneio.taxa_inscricao, req.user.id]);
    await pool.query('INSERT INTO torneio_inscricoes (torneio_id, user_id, nome) VALUES ($1, $2, $3)', [req.params.id, req.user.id, user.nome]);
    await pool.query('INSERT INTO transacoes (user_id,tipo,valor,descricao,status) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'taxa', torneio.taxa_inscricao, `Inscrição: ${torneio.nome}`, 'concluido']);

    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: 'Erro ao inscrever' }); }
});

// ADMIN: criar torneio
app.post('/api/admin/torneios', adminAuth1, async (req, res) => {
  const { nome, jogo, premio, taxa_inscricao, max_participantes, data_hora } = req.body;
  if (!nome || !jogo || !data_hora) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO torneios (nome, jogo, premio, taxa_inscricao, max_participantes, data_hora) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [nome, jogo, premio||0, taxa_inscricao||0, max_participantes||8, data_hora]
    );
    res.json({ sucesso: true, id: rows[0].id });
  } catch(e) { res.status(500).json({ erro: 'Erro ao criar torneio' }); }
});

// ADMIN: listar todos torneios com inscritos
app.get('/api/admin/torneios', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM torneio_inscricoes WHERE torneio_id = t.id) as inscritos
      FROM torneios t ORDER BY t.data_hora DESC
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

// ADMIN: deletar/cancelar torneio
app.post('/api/admin/torneios/:id/cancelar', adminAuth1, async (req, res) => {
  try {
    // Reembolsar inscritos
    const { rows: insc } = await pool.query('SELECT ti.user_id, t.taxa_inscricao FROM torneio_inscricoes ti JOIN torneios t ON t.id=ti.torneio_id WHERE ti.torneio_id = $1', [req.params.id]);
    for (const i of insc) {
      await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [i.taxa_inscricao, i.user_id]);
    }
    await pool.query("UPDATE torneios SET status = 'finalizado' WHERE id = $1", [req.params.id]);
    res.json({ sucesso: true, reembolsados: insc.length });
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});

// ADMIN: ver inscritos de um torneio
app.get('/api/admin/torneios/:id/inscritos', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT nome, inscrito_em FROM torneio_inscricoes WHERE torneio_id = $1 ORDER BY inscrito_em', [req.params.id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: 'Erro' }); }
});


// ===== MIDDLEWARE: só admin principal (nível 1) =====
function adminAuth1(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Não autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.admin || decoded.adminNivel !== 1) return res.status(403).json({ erro: 'Apenas o admin principal pode fazer isso' });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ erro: 'Token inválido' }); }
}

// ===== EXCLUIR CONTA (usuário exclui a própria) =====
app.delete('/api/perfil/excluir', auth, async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query('DELETE FROM transacoes WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM notificacoes WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM torneio_inscricoes WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM tickets WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ sucesso: true });
  } catch(e) {
    console.error('Erro excluir conta:', e.message);
    res.status(500).json({ erro: 'Erro ao excluir conta' });
  }
});

// ===== EXCLUIR CONTA (admin principal exclui qualquer um) =====
app.delete('/api/admin/usuario/:id', adminAuth1, async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    await pool.query('DELETE FROM transacoes WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM notificacoes WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM torneio_inscricoes WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM tickets WHERE user_id = $1', [userId]).catch(()=>{});
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ sucesso: true });
  } catch(e) {
    console.error('Erro admin excluir:', e.message);
    res.status(500).json({ erro: 'Erro ao excluir usuário' });
  }
});

// ===== TICKETS DE SUPORTE (Dúvidas e Reclamações) =====
pool.query(`CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  nome TEXT,
  email TEXT,
  assunto TEXT,
  mensagem TEXT,
  status TEXT DEFAULT 'aberto',
  resposta TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).catch(e=>console.error('Erro criar tabela tickets:', e.message));

// Usuário envia ticket
app.post('/api/tickets', auth, async (req, res) => {
  const { assunto, mensagem } = req.body;
  if (!assunto || !mensagem) return res.status(400).json({ erro: 'Preencha assunto e mensagem' });
  try {
    const { rows: uRows } = await pool.query('SELECT nome, email FROM users WHERE id = $1', [req.user.id]);
    const u = uRows[0];
    await pool.query('INSERT INTO tickets (user_id, nome, email, assunto, mensagem) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, u.nome, u.email, assunto, mensagem]);
    res.json({ sucesso: true });
  } catch(e) {
    console.error('Erro criar ticket:', e.message);
    res.status(500).json({ erro: 'Erro ao enviar mensagem' });
  }
});

// Usuário vê seus próprios tickets
app.get('/api/tickets', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY criado_em DESC', [req.user.id]);
    res.json(rows);
  } catch(e) { res.json([]); }
});

// Admin (1 ou 2) vê todos os tickets
app.get('/api/admin/tickets', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tickets ORDER BY CASE WHEN status=\'aberto\' THEN 0 ELSE 1 END, criado_em DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Admin responde/fecha ticket
app.post('/api/admin/tickets/:id/responder', adminAuth, async (req, res) => {
  const { resposta } = req.body;
  const ticketId = parseInt(req.params.id);
  try {
    // Buscar o ticket para saber o user_id
    const { rows: tRows } = await pool.query('SELECT user_id, assunto FROM tickets WHERE id = $1', [ticketId]);
    if (!tRows.length) return res.status(404).json({ erro: 'Ticket não encontrado' });
    await pool.query("UPDATE tickets SET status = 'respondido', resposta = $1 WHERE id = $2", [resposta, ticketId]);
    // Notificar o usuário da resposta
    if (resposta && tRows[0].user_id) {
      await pool.query(`CREATE TABLE IF NOT EXISTS notificacoes (
        id SERIAL PRIMARY KEY, user_id INTEGER, titulo TEXT, mensagem TEXT,
        lida BOOLEAN DEFAULT false, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`).catch(()=>{});
      await pool.query('INSERT INTO notificacoes (user_id, titulo, mensagem) VALUES ($1,$2,$3)',
        [tRows[0].user_id, '💬 Resposta do suporte', `Sobre "${tRows[0].assunto}": ${resposta}`]);
    }
    res.json({ sucesso: true });
  } catch(e) {
    console.error('Erro responder ticket:', e.message);
    res.status(500).json({ erro: 'Erro ao responder' });
  }
});

// Contador de tickets abertos (para badge)
app.get('/api/admin/tickets/count', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'aberto'");
    res.json({ abertos: parseInt(rows[0].count) });
  } catch(e) { res.json({ abertos: 0 }); }
});


// ===== BANNERS/NOVIDADES (editáveis pelo admin) =====
pool.query(`CREATE TABLE IF NOT EXISTS banners (
  id SERIAL PRIMARY KEY,
  titulo TEXT,
  subtitulo TEXT,
  cor1 TEXT DEFAULT '#2a1a4a',
  cor2 TEXT DEFAULT '#4a2a6a',
  emoji TEXT DEFAULT '🎉',
  imagem TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).then(async () => {
  // Inserir banners padrão se não houver nenhum
  const { rows } = await pool.query('SELECT COUNT(*) FROM banners');
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`INSERT INTO banners (titulo, subtitulo, cor1, cor2, emoji, ordem) VALUES
      ('Bem-vindo ao Super Duelo!', 'Jogue, compita e divirta-se', '#1a4a2a', '#2a6a3a', '🎮', 1),
      ('Air Hockey & Flappy Duelo', 'Nossos jogos principais com premiação real', '#2a1a4a', '#4a2a6a', '🏆', 2),
      ('Convide amigos', 'Jogue 1v1 em salas privadas', '#4a2a1a', '#6a3a2a', '👥', 3)`);
  }
  await pool.query('ALTER TABLE banners ADD COLUMN IF NOT EXISTS imagem TEXT').catch(()=>{});
}).catch(e=>console.error('Erro banners:', e.message));

// Listar banners ativos (público)
app.get('/api/banners', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM banners WHERE ativo = true ORDER BY ordem ASC, id ASC');
    res.json(rows);
  } catch(e) { res.json([]); }
});

// Admin: listar todos os banners
app.get('/api/admin/banners', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM banners ORDER BY ordem ASC, id ASC');
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Admin: criar banner
app.post('/api/admin/banners', adminAuth1, async (req, res) => {
  const { titulo, subtitulo, cor1, cor2, emoji, ordem, imagem } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
  try {
    await pool.query('ALTER TABLE banners ADD COLUMN IF NOT EXISTS imagem TEXT').catch(()=>{});
    const { rows } = await pool.query(
      'INSERT INTO banners (titulo, subtitulo, cor1, cor2, emoji, ordem, imagem) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [titulo, subtitulo||'', cor1||'#2a1a4a', cor2||'#4a2a6a', emoji||'🎉', ordem||0, imagem||null]
    );
    res.json({ sucesso: true, id: rows[0].id });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Admin: editar banner
app.post('/api/admin/banners/:id', adminAuth1, async (req, res) => {
  const { titulo, subtitulo, cor1, cor2, emoji, ordem, ativo, imagem } = req.body;
  try {
    await pool.query('ALTER TABLE banners ADD COLUMN IF NOT EXISTS imagem TEXT').catch(()=>{});
    await pool.query(
      'UPDATE banners SET titulo=$1, subtitulo=$2, cor1=$3, cor2=$4, emoji=$5, ordem=$6, ativo=$7, imagem=$8 WHERE id=$9',
      [titulo, subtitulo, cor1, cor2, emoji, ordem, ativo!==false, imagem||null, parseInt(req.params.id)]
    );
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Admin: deletar banner
app.delete('/api/admin/banners/:id', adminAuth1, async (req, res) => {
  try {
    await pool.query('DELETE FROM banners WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ===== RANKING (público, por jogo e período) =====
app.get('/api/ranking/:jogo/:periodo', auth, async (req, res) => {
  const { jogo, periodo } = req.params; // periodo: 'semana' ou 'mes'
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS ranking (
      id SERIAL PRIMARY KEY, user_id INTEGER, jogo TEXT, pontos INTEGER DEFAULT 0,
      semana TEXT, mes TEXT, atualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, jogo, semana, mes)
    )`).catch(()=>{});
    let filtro, valor;
    if (periodo === 'semana') {
      filtro = 'semana';
      valor = chaveSemana();
    } else {
      filtro = 'mes';
      valor = chaveMes();
    }
    const { rows } = await pool.query(`
      SELECT r.pontos, u.nome, u.nivel, r.user_id
      FROM ranking r JOIN users u ON u.id = r.user_id
      WHERE r.jogo = $1 AND r.${filtro} = $2
      ORDER BY r.pontos DESC LIMIT 50
    `, [jogo, valor]);
    res.json({ ranking: rows, meuId: req.user.id });
  } catch(e) { res.json({ ranking: [], meuId: req.user.id }); }
});

// ===== REFERRAL: meus dados de indicação =====
// Aplicar código de convite (para quem não colocou no cadastro)
app.post('/api/convite/aplicar', auth, async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ erro: 'Informe o código' });
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS convidado_por INTEGER').catch(()=>{});
    // Verificar se o usuário já foi convidado por alguém
    const { rows: meu } = await pool.query('SELECT convidado_por, codigo_convite, partidas_online FROM users WHERE id = $1', [req.user.id]);
    if (meu[0]?.convidado_por) return res.status(400).json({ erro: 'Você já usou um código de convite' });
    if ((meu[0]?.partidas_online || 0) > 0) return res.status(400).json({ erro: 'Você só pode usar um código antes de jogar a primeira partida' });
    // Achar o dono do código
    const { rows: dono } = await pool.query('SELECT id FROM users WHERE codigo_convite = $1', [codigo.toUpperCase()]);
    if (!dono.length) return res.status(404).json({ erro: 'Código inválido' });
    if (dono[0].id === req.user.id) return res.status(400).json({ erro: 'Você não pode usar seu próprio código' });
    // Aplicar
    await pool.query('UPDATE users SET convidado_por = $1 WHERE id = $2', [dono[0].id, req.user.id]);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ADMIN: ver todas as indicações
app.get('/api/admin/indicacoes', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id as convidador_id, c.nome as convidador_nome, c.codigo_convite,
        a.nome as indicado_nome, a.partidas_online, a.bonus_pago
      FROM users a
      JOIN users c ON c.id = a.convidado_por
      ORDER BY c.nome, a.partidas_online DESC
    `);
    // Agrupar por convidador
    const grupos = {};
    for (const r of rows) {
      if (!grupos[r.convidador_id]) {
        grupos[r.convidador_id] = { nome: r.convidador_nome, codigo: r.codigo_convite, indicados: [], totalGanho: 0 };
      }
      const partidas = Math.min(r.partidas_online || 0, 50);
      grupos[r.convidador_id].indicados.push({ nome: r.indicado_nome, partidas, completo: r.bonus_pago });
      if (r.bonus_pago) grupos[r.convidador_id].totalGanho += 5;
    }
    res.json(Object.values(grupos));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/convite', auth, async (req, res) => {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS codigo_convite TEXT').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS convidado_por INTEGER').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_pago BOOLEAN DEFAULT false').catch(()=>{});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS partidas_online INTEGER DEFAULT 0').catch(()=>{});

    const { rows } = await pool.query('SELECT codigo_convite FROM users WHERE id = $1', [req.user.id]);
    let codigo = rows[0]?.codigo_convite;
    // Gerar se não tiver
    if (!codigo) {
      codigo = 'SD' + req.user.id + Math.random().toString(36).substring(2,5).toUpperCase();
      await pool.query('UPDATE users SET codigo_convite = $1 WHERE id = $2', [codigo, req.user.id]);
    }
    // Contar indicados e quantos completaram
    let totalIndicados = 0, pagos = 0;
    try {
      const { rows: indicados } = await pool.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE bonus_pago = true) as pagos FROM users WHERE convidado_por = $1',
        [req.user.id]
      );
      totalIndicados = parseInt(indicados[0].total) || 0;
      pagos = parseInt(indicados[0].pagos) || 0;
    } catch(e) {}
    res.json({ codigo, totalIndicados, bonusGanhos: pagos, ganhoTotal: pagos * 5 });
  } catch(e) {
    console.error('Erro /api/convite:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// Lista de indicados com progresso
app.get('/api/convite/indicados', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT nome, partidas_online, bonus_pago FROM users WHERE convidado_por = $1 ORDER BY partidas_online DESC',
      [req.user.id]
    );
    res.json(rows.map(r => ({ nome: r.nome, partidas: Math.min(r.partidas_online||0, 50), completo: r.bonus_pago })));
  } catch(e) { res.json([]); }
});


// ===== RECOMPENSAS DE RANKING (admin define) =====
pool.query(`CREATE TABLE IF NOT EXISTS ranking_premios (
  id SERIAL PRIMARY KEY,
  jogo TEXT NOT NULL,
  periodo TEXT NOT NULL,
  posicao INTEGER NOT NULL,
  valor REAL NOT NULL,
  UNIQUE(jogo, periodo, posicao)
)`).catch(e=>console.error('Erro tabela ranking_premios:', e.message));

// Listar prêmios configurados (público - mostra no ranking)
app.get('/api/ranking-premios/:jogo/:periodo', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT posicao, valor FROM ranking_premios WHERE jogo=$1 AND periodo=$2 ORDER BY posicao',
      [req.params.jogo, req.params.periodo]
    );
    res.json(rows);
  } catch(e) { res.json([]); }
});

// ADMIN: ver prêmios configurados
app.get('/api/admin/ranking-premios/:jogo/:periodo', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT posicao, valor FROM ranking_premios WHERE jogo=$1 AND periodo=$2 ORDER BY posicao',
      [req.params.jogo, req.params.periodo]
    );
    res.json(rows);
  } catch(e) { res.json([]); }
});

// ADMIN: salvar prêmios (substitui todos do jogo/período)
app.post('/api/admin/ranking-premios', adminAuth1, async (req, res) => {
  const { jogo, periodo, premios } = req.body; // premios: [{posicao, valor}, ...]
  if (!jogo || !periodo || !Array.isArray(premios)) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    await pool.query('DELETE FROM ranking_premios WHERE jogo=$1 AND periodo=$2', [jogo, periodo]);
    for (const p of premios) {
      if (p.valor > 0) {
        await pool.query(
          'INSERT INTO ranking_premios (jogo, periodo, posicao, valor) VALUES ($1,$2,$3,$4) ON CONFLICT (jogo,periodo,posicao) DO UPDATE SET valor=$4',
          [jogo, periodo, p.posicao, p.valor]
        );
      }
    }
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ADMIN: pagar prêmios do ranking atual (distribui aos top colocados)
app.post('/api/admin/ranking-premios/pagar', adminAuth1, async (req, res) => {
  const { jogo, periodo } = req.body;
  try {
    // Buscar prêmios configurados
    const { rows: premios } = await pool.query(
      'SELECT posicao, valor FROM ranking_premios WHERE jogo=$1 AND periodo=$2 ORDER BY posicao',
      [jogo, periodo]
    );
    if (!premios.length) return res.status(400).json({ erro: 'Nenhum prêmio configurado' });

    // Buscar ranking atual
    let filtro, valor;
    if (periodo === 'semana') {
      filtro = 'semana';
      valor = chaveSemana();
    } else {
      filtro = 'mes';
      valor = chaveMes();
    }
    const { rows: rank } = await pool.query(
      `SELECT user_id FROM ranking WHERE jogo=$1 AND ${filtro}=$2 ORDER BY pontos DESC LIMIT 50`,
      [jogo, valor]
    );

    let pagos = 0;
    for (const premio of premios) {
      const idx = premio.posicao - 1;
      if (rank[idx]) {
        const uid = rank[idx].user_id;
        await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [premio.valor, uid]);
        await pool.query('INSERT INTO transacoes (user_id,tipo,valor,descricao,status) VALUES ($1,$2,$3,$4,$5)',
          [uid, 'bonus', premio.valor, `Prêmio ranking ${jogo} (${premio.posicao}º lugar)`, 'concluido']);
        await pool.query(`CREATE TABLE IF NOT EXISTS notificacoes (id SERIAL PRIMARY KEY, user_id INTEGER, titulo TEXT, mensagem TEXT, lida BOOLEAN DEFAULT false, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`).catch(()=>{});
        await pool.query('INSERT INTO notificacoes (user_id, titulo, mensagem) VALUES ($1,$2,$3)',
          [uid, '🏆 Prêmio do Ranking!', `Você ficou em ${premio.posicao}º no ranking de ${jogo} e ganhou R$${premio.valor.toFixed(2)}!`]);
        pagos++;
      }
    }
    res.json({ sucesso: true, pagos });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== KYC =====
const kycRoutes = require('./routes/kyc');
app.use('/api/kyc', kycRoutes({
  db: pool,
  requireAuth: auth,
  requireAdmin: adminAuth
}));

server.listen(3000, () => console.log('✅ Super Duelo rodando em http://localhost:3000'));