const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const db = new Database('betx1.db');
const JWT_SECRET = 'betx1_secret_2026';
const MP_TOKEN = 'TEST-3691621388347314-053106-dff7c822291e72190efc547499baca17-478925025';

const mp = new MercadoPagoConfig({ accessToken: MP_TOKEN });
const payment = new Payment(mp);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    saldo REAL DEFAULT 0,
    cpf TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tipo TEXT,
    valor REAL,
    descricao TEXT,
    status TEXT DEFAULT 'concluido',
    pix_id TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Não autorizado' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ erro: 'Token inválido' }); }
}

app.post('/api/cadastro', async (req, res) => {
  const { nome, email, senha, cpf } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const result = db.prepare('INSERT INTO users (nome, email, senha, saldo, cpf) VALUES (?, ?, ?, ?, ?)').run(nome, email, hash, 10, cpf || '');
    db.prepare('INSERT INTO transacoes (user_id, tipo, valor, descricao) VALUES (?, ?, ?, ?)').run(result.lastInsertRowid, 'bonus', 10, 'Bônus de boas-vindas');
    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, nome, email, saldo: 10 });
  } catch { res.status(400).json({ erro: 'Email já cadastrado' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(400).json({ erro: 'Email não encontrado' });
  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return res.status(400).json({ erro: 'Senha incorreta' });
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, nome: user.nome, email: user.email, saldo: user.saldo });
});

app.get('/api/perfil', auth, (req, res) => {
  const user = db.prepare('SELECT id, nome, email, saldo FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// GERAR PIX
app.post('/api/pix/depositar', auth, async (req, res) => {
  const { valor, cpf } = req.body;
  if (!valor || valor < 1) return res.status(400).json({ erro: 'Valor mínimo R$1' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const cpfNum = (cpf || user.cpf || '12345678909').replace(/\D/g, '');
  try {
    const pix = await payment.create({
      body: {
        transaction_amount: parseFloat(valor),
        description: `Deposito Betx1 - ${user.nome}`,
        payment_method_id: 'pix',
        payer: {
          email: user.email,
          first_name: user.nome.split(' ')[0],
          last_name: user.nome.split(' ')[1] || 'Usuario',
          identification: {
            type: 'CPF',
            number: cpfNum
          }
        }
      },
      requestOptions: { idempotencyKey: `dep_${req.user.id}_${Date.now()}` }
    });
    const pixData = pix.point_of_interaction?.transaction_data;
    res.json({
      pix_id: pix.id,
      qr_code: pixData?.qr_code,
      qr_code_base64: pixData?.qr_code_base64,
      valor,
      status: pix.status
    });
  } catch (e) {
    console.error('Erro MP:', JSON.stringify(e));
    res.status(500).json({ erro: 'Erro ao gerar Pix: ' + (e.message || 'tente novamente') });
  }
});

// VERIFICAR STATUS PIX
app.get('/api/pix/status/:pixId', auth, async (req, res) => {
  try {
    const pix = await payment.get({ id: req.params.pixId });
    if (pix.status === 'approved') {
      const existing = db.prepare('SELECT id FROM transacoes WHERE pix_id = ?').get(String(pix.id));
      if (!existing) {
        db.prepare('UPDATE users SET saldo = saldo + ? WHERE id = ?').run(pix.transaction_amount, req.user.id);
        db.prepare('INSERT INTO transacoes (user_id, tipo, valor, descricao, status, pix_id) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, 'deposito', pix.transaction_amount, 'Depósito via Pix', 'aprovado', String(pix.id));
      }
      const user = db.prepare('SELECT saldo FROM users WHERE id = ?').get(req.user.id);
      return res.json({ status: 'approved', saldo: user.saldo });
    }
    res.json({ status: pix.status });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao verificar Pix' });
  }
});

// SACAR
app.post('/api/sacar', auth, (req, res) => {
  const { valor, chave_pix } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
  if (!chave_pix) return res.status(400).json({ erro: 'Informe sua chave Pix' });
  const user = db.prepare('SELECT saldo FROM users WHERE id = ?').get(req.user.id);
  if (user.saldo < valor) return res.status(400).json({ erro: 'Saldo insuficiente' });
  db.prepare('UPDATE users SET saldo = saldo - ? WHERE id = ?').run(valor, req.user.id);
  db.prepare('INSERT INTO transacoes (user_id, tipo, valor, descricao, status) VALUES (?, ?, ?, ?, ?)').run(req.user.id, 'saque', valor, `Saque Pix: ${chave_pix}`, 'pendente');
  const updated = db.prepare('SELECT saldo FROM users WHERE id = ?').get(req.user.id);
  res.json({ saldo: updated.saldo, mensagem: 'Saque solicitado! Pix em até 24h.' });
});

app.get('/api/transacoes', auth, (req, res) => {
  const trans = db.prepare('SELECT * FROM transacoes WHERE user_id = ? ORDER BY criado_em DESC LIMIT 20').all(req.user.id);
  res.json(trans);
});

app.listen(3000, () => console.log('✅ Betx1 rodando em http://localhost:3000'));