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
const io = new Server(server);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const JWT_SECRET = 'betx1_secret_2026';
const MP_TOKEN = 'APP_USR-3691621388347314-053106-82e243a23ed4fa091d30923ed61128b2-478925025';
const ADMIN_EMAIL = 'tutoriacaio562@gmail.com';
const ADMIN_SENHA = 'Scmc4815@';

const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
const payment = new Payment(mp);

app.use(cors());
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
  const { nome, email, senha, cpf } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      'INSERT INTO users (nome, email, senha, saldo, saldo_treino, cpf, telefone) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [nome, email, hash, 0, 1000, cpf || '', req.body.telefone || '']
    );
    const token = jwt.sign({ id: result.rows[0].id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, nome, email, saldo: 0, saldo_treino: 1000 });
  } catch { res.status(400).json({ erro: 'Email já cadastrado' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  if (email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    const token = jwt.sign({ admin: true, email }, JWT_SECRET, { expiresIn: '1d' });
    return res.json({ token, admin: true });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) return res.status(400).json({ erro: 'Email não encontrado' });
  if (user.bloqueado) return res.status(403).json({ erro: 'Conta bloqueada. Entre em contato com o suporte.' });
  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return res.status(400).json({ erro: 'Senha incorreta' });
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, nome: user.nome, email: user.email, saldo: user.saldo, saldo_treino: user.saldo_treino || 1000 });
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
  res.json(rows[0]);
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
  const { valor, chave_pix } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
  if (!chave_pix) return res.status(400).json({ erro: 'Informe sua chave Pix' });
  const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (user.saldo < valor) return res.status(400).json({ erro: 'Saldo insuficiente' });
  await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, req.user.id]);
  await pool.query(
    'INSERT INTO transacoes (user_id, tipo, valor, descricao, status, chave_pix) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.user.id, 'saque', valor, 'Saque via Pix', 'pendente', chave_pix]
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

app.post('/api/admin/saques/:id/pagar', adminAuth, async (req, res) => {
  await pool.query("UPDATE transacoes SET status = 'pago' WHERE id = $1", [req.params.id]);
  res.json({ mensagem: 'Saque marcado como pago!' });
});

app.get('/api/admin/usuarios', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, nome, email, saldo, saldo_treino, criado_em FROM users ORDER BY criado_em DESC');
  res.json(rows);
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
const usuariosOnline = new Set();

io.on('connection', (socket) => {
  socket.on('usuario_online', (userId) => {
    if (userId) {
      usuariosOnline.add(userId);
      io.emit('online_count', usuariosOnline.size);
    }
  });

  socket.on('disconnect', () => {
    // Remove user from online set when disconnected
    // We'll use token-based tracking
    if (socket._userId) {
      usuariosOnline.delete(socket._userId);
      io.emit('online_count', usuariosOnline.size);
    }
  });
});

app.get('/api/online', (req, res) => {
  res.json({ online: usuariosOnline.size });
});

io.on('connection', (socket) => {
  let userId = null;
  let userNome = null;
  let currentRoom = null;
  let currentValor = null;

  socket.on('join_queue', async ({ valor, token: tkn }) => {
    try {
      const decoded = jwt.verify(tkn, JWT_SECRET);
      userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user || user.saldo < valor) {
        socket.emit('error', { msg: 'Saldo insuficiente' });
        return;
      }
      userNome = user.nome;
      currentValor = valor;

      if (!filas[valor]) filas[valor] = [];

      if (filas[valor].length > 0) {
        const oponente = filas[valor].shift();
        const roomId = `room_${Date.now()}`;
        currentRoom = roomId;

        await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, userId]);
        await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, oponente.userId]);

        const state = criarEstado(valor);
        partidas[roomId] = {
          p1: oponente, p2: { socket, userId, nome: userNome },
          state, interval: null
        };

        socket.join(roomId);
        oponente.socket.join(roomId);

        oponente.socket.emit('game_start', { role: 'p1', p1name: oponente.nome, p2name: userNome, valor });
        socket.emit('game_start', { role: 'p2', p1name: oponente.nome, p2name: userNome, valor });

        partidas[roomId].interval = setInterval(async () => {
          const partida = partidas[roomId];
          if (!partida) return;
          simularFisica(partida.state);
          io.to(roomId).emit('game_update', partida.state);

          if (partida.state.score1 >= 7 || partida.state.score2 >= 7) {
            clearInterval(partida.interval);
            const winner = partida.state.score1 >= 7 ? 'p1' : 'p2';
            const winnerId = winner === 'p1' ? partida.p1.userId : partida.p2.userId;
            const prize = parseFloat((valor * 1.75).toFixed(2));
            await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [prize, winnerId]);
            await pool.query(
              'INSERT INTO transacoes (user_id, tipo, valor, descricao, status) VALUES ($1, $2, $3, $4, $5)',
              [winnerId, 'ganho', prize, `Vitória Air Hockey R$${valor}`, 'concluido']
            );
            const loserId = winner === 'p1' ? partida.p2.userId : partida.p1.userId;
            await atualizarNivel(winnerId, 'vitoria');
            await atualizarNivel(loserId, 'derrota');
            io.to(roomId).emit('game_end', { winner, prize, valor });
            delete partidas[roomId];
          }
        }, 1000/60);

      } else {
        filas[valor].push({ socket, userId, nome: userNome });
      }
    } catch(e) {
      socket.emit('error', { msg: 'Erro de autenticação' });
    }
  });

  socket.on('mallet_move', ({ x, y }) => {
    if (!currentRoom || !partidas[currentRoom]) return;
    const partida = partidas[currentRoom];
    if (partida.p1.socket.id === socket.id) {
      partida.state.m1.x = Math.max(0.06, Math.min(0.94, x));
      partida.state.m1.y = Math.max(0.5, Math.min(0.94, y));
    } else {
      partida.state.m2.x = Math.max(0.06, Math.min(0.94, x));
      partida.state.m2.y = Math.max(0.06, Math.min(0.5, y));
    }
  });

  socket.on('leave_queue', () => {
    if (currentValor && filas[currentValor]) {
      filas[currentValor] = filas[currentValor].filter(p => p.socket.id !== socket.id);
    }
  });

  socket.on('disconnect', async () => {
    if (currentValor && filas[currentValor]) {
      filas[currentValor] = filas[currentValor].filter(p => p.socket.id !== socket.id);
    }
    if (currentRoom && partidas[currentRoom]) {
      clearInterval(partidas[currentRoom].interval);
      const partida = partidas[currentRoom];
      const outroSocket = partida.p1.socket.id === socket.id ? partida.p2.socket : partida.p1.socket;
      const outroId = partida.p1.socket.id === socket.id ? partida.p2.userId : partida.p1.userId;
      const valor = partida.state.valor;
      await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [valor, outroId]);
      outroSocket.emit('game_end', { winner: partida.p1.socket.id === socket.id ? 'p2' : 'p1', prize: valor * 1.75, valor });
      delete partidas[currentRoom];
    }
  });
});


// ===== FLAPPY BIRD MULTIPLAYER =====
const flappySalas = {};
const flappyConns = {};

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
  const premios = calcularPremios(ranking, s.valor, s.tamanho);

  for (const [userId, premio] of Object.entries(premios)) {
    if (premio > 0) {
      await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [premio, userId]);
      const tipo = premio > s.valor ? 'ganho' : 'devolucao';
      await pool.query(
        'INSERT INTO transacoes (user_id, tipo, valor, descricao, status) VALUES ($1,$2,$3,$4,$5)',
        [userId, tipo, premio, `Flappy Bird R$${s.valor} (${s.tamanho}p)`, 'concluido']
      );
    }
  }

  io.to(salaKey).emit('flappy_fim', {
    ranking: ranking.map(j => ({ id: j.userId, nome: j.nome, pontos: j.pontos })),
    premios
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
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(async () => {
          for (const j of s.jogadores) {
            await pool.query('UPDATE users SET saldo = saldo - $1 WHERE id = $2', [valor, j.userId]);
          }
          io.to(salaKey).emit('flappy_start', {
            jogadores: s.jogadores.map(j => ({ id: j.userId, nome: j.nome })), valor, countdown: 3
          });
        }, 500);
      }
    } catch(e) { socketF.emit('flappy_erro', { msg: 'Erro de autenticação' }); }
  });

  socketF.on('flappy_ponto', ({ pontos }) => {
    const conn = flappyConns[socketF.id];
    if (!conn || conn.morto) return; // ignora pontos se já morreu
    conn.pontos = pontos;
    const s = flappySalas[conn.salaKey];
    if (s) { const j = s.jogadores.find(j => j.userId === conn.userId); if (j && !j.morto) j.pontos = pontos; }
    io.to(conn.salaKey).emit('flappy_update', { id: conn.userId, pontos });
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
    if (s.jogadores.every(j => j.morto)) await finalizarFlappy(conn.salaKey);
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

async function atualizarNivel(userId, resultado) {
  // resultado: 'vitoria', 'derrota', 'empate'
  if (resultado === 'empate') return;
  try {
    const { rows } = await pool.query('SELECT nivel, vitorias_nivel, total_vitorias, total_derrotas FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) return;

    let nivel = user.nivel || 1;
    let vitorias = user.vitorias_nivel || 0;
    let totalVit = user.total_vitorias || 0;
    let totalDer = user.total_derrotas || 0;

    if (resultado === 'vitoria') {
      vitorias++;
      totalVit++;
      // Sobe de nível a cada 10 vitórias
      if (vitorias >= 10 && nivel < 100) {
        nivel++;
        vitorias = 0; // zera contador para próximo nível
      }
    } else if (resultado === 'derrota') {
      totalDer++;
      // Derrota anula uma vitória
      if (vitorias > 0) {
        vitorias--;
      } else if (nivel > 1) {
        // Se não tem vitórias acumuladas e perde, volta ao final do nível anterior
        nivel--;
        vitorias = 9; // volta com 9/10 no nível anterior
      }
    }

    await pool.query(
      'UPDATE users SET nivel=$1, vitorias_nivel=$2, total_vitorias=$3, total_derrotas=$4 WHERE id=$5',
      [nivel, vitorias, totalVit, totalDer, userId]
    );
  } catch(e) { console.error('Erro nivel:', e.message); }
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
      const decoded = jwt.verify(tkn, JWT_SECRET);
      const userId = decoded.id;
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = rows[0];
      if (!user || user.saldo < valor) { socketP.emit('sala_erro', { msg: 'Saldo insuficiente' }); return; }

      // Remover sala anterior do mesmo jogador
      Object.keys(salasPrivadas).forEach(k => {
        if (salasPrivadas[k].userId === userId) delete salasPrivadas[k];
      });

      let codigo;
      do { codigo = gerarCodigo(); } while (salasPrivadas[codigo]);

      salasPrivadas[codigo] = { jogo, valor, senha: senha || '', userId, socket: socketP, nome: user.nome, aguardando: true };
      socketP.join('sala_' + codigo);
      socketP.emit('sala_criada', { codigo, jogo, valor });
    } catch(e) { socketP.emit('sala_erro', { msg: 'Erro ao criar sala' }); }
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
      if (!user || user.saldo < sala.valor) { socketP.emit('sala_erro', { msg: 'Saldo insuficiente' }); return; }

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
          ball: { x:0.5,y:0.5,vx:0.003,vy:0.005,r:0.03 },
          m1:{x:0.5,y:0.75}, m2:{x:0.5,y:0.25},
          mallet_r:0.075, score1:0, score2:0, valor:sala.valor
        };
        partidas[roomId] = { p1:{socket:sala.socket,userId:sala.userId,nome:sala.nome}, p2:{socket:socketP,userId,nome:user.nome}, state, interval:null };
        sala.socket.emit('game_start',{role:'p1',p1name:sala.nome,p2name:user.nome,valor:sala.valor});
        socketP.emit('game_start',{role:'p2',p1name:sala.nome,p2name:user.nome,valor:sala.valor});
        partidas[roomId].interval = setInterval(async () => {
          const partida = partidas[roomId];
          if(!partida) return;
          simularFisica(partida.state);
          io.to(roomId).emit('game_update',partida.state);
          if(partida.state.score1>=7||partida.state.score2>=7){
            clearInterval(partida.interval);
            const winner=partida.state.score1>=7?'p1':'p2';
            const winnerId=winner==='p1'?partida.p1.userId:partida.p2.userId;
            const prize=parseFloat((sala.valor*1.75).toFixed(2));
            await pool.query('UPDATE users SET saldo=saldo+$1 WHERE id=$2',[prize,winnerId]);
            await pool.query('INSERT INTO transacoes(user_id,tipo,valor,descricao,status) VALUES($1,$2,$3,$4,$5)',[winnerId,'ganho',prize,`Vitória Air Hockey Sala R$${sala.valor}`,'concluido']);
            io.to(roomId).emit('game_end',{winner,prize,valor:sala.valor});
            delete partidas[roomId];
          }
        },1000/60);
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
app.post('/api/admin/usuario/:id/saldo', adminAuth, async (req, res) => {
  const { valor, operacao } = req.body; // operacao: 'add' ou 'remove'
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
  try {
    if (operacao === 'add') {
      await pool.query('UPDATE users SET saldo = saldo + $1 WHERE id = $2', [valor, req.params.id]);
      await pool.query('INSERT INTO transacoes (user_id,tipo,valor,descricao,status) VALUES ($1,$2,$3,$4,$5)',
        [req.params.id, 'bonus', valor, 'Crédito manual pelo admin', 'concluido']);
    } else {
      await pool.query('UPDATE users SET saldo = GREATEST(0, saldo - $1) WHERE id = $2', [valor, req.params.id]);
    }
    const { rows } = await pool.query('SELECT saldo FROM users WHERE id = $1', [req.params.id]);
    res.json({ sucesso: true, saldo: rows[0].saldo });
  } catch(e) { res.status(500).json({ erro: 'Erro ao atualizar saldo' }); }
});

app.post('/api/admin/usuario/:id/bloquear', adminAuth, async (req, res) => {
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
app.get('/api/admin/jogos', adminAuth, async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS jogos_config (
      id TEXT PRIMARY KEY, nome TEXT, ativo BOOLEAN DEFAULT true
    )`);
    const jogos = ['airhockey','flappy','xadrez','sinuca'];
    const nomes = {'airhockey':'Air Hockey','flappy':'Flappy Duelo','xadrez':'Xadrez','sinuca':'Sinuca'};
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

server.listen(3000, () => console.log('✅ Super Duelo rodando em http://localhost:3000'));