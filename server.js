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
  ssl: { rejectUnauthorized: false }
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
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
      'INSERT INTO users (nome, email, senha, saldo, saldo_treino, cpf) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [nome, email, hash, 0, 1000, cpf || '']
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
  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return res.status(400).json({ erro: 'Senha incorreta' });
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, nome: user.nome, email: user.email, saldo: user.saldo, saldo_treino: user.saldo_treino || 1000 });
});

app.get('/api/perfil', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, nome, email, saldo, saldo_treino FROM users WHERE id = $1', [req.user.id]);
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
    mallet_r: 0.06,
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

server.listen(3000, () => console.log('✅ Betx1 rodando em http://localhost:3000'));