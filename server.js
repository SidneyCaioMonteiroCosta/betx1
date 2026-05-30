const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const db = new Database('betx1.db');
const JWT_SECRET = 'betx1_secret_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CRIAR TABELAS
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    saldo REAL DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tipo TEXT,
    valor REAL,
    descricao TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// MIDDLEWARE AUTH
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Não autorizado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

// CADASTRO
app.post('/api/cadastro', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const stmt = db.prepare('INSERT INTO users (nome, email, senha, saldo) VALUES (?, ?, ?, ?)');
    const result = stmt.run(nome, email, hash, 10); // R$10 de bônus
    db.prepare('INSERT INTO transacoes (user_id, tipo, valor, descricao) VALUES (?, ?, ?, ?)').run(result.lastInsertRowid, 'bonus', 10, 'Bônus de boas-vindas');
    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, nome, email, saldo: 10 });
  } catch (e) {
    res.status(400).json({ erro: 'Email já cadastrado' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(400).json({ erro: 'Email não encontrado' });
  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return res.status(400).json({ erro: 'Senha incorreta' });
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, nome: user.nome, email: user.email, saldo: user.saldo });
});

// PERFIL
app.get('/api/perfil', auth, (req, res) => {
  const user = db.prepare('SELECT id, nome, email, saldo, criado_em FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// DEPOSITAR
app.post('/api/depositar', auth, (req, res) => {
  const { valor } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
  db.prepare('UPDATE users SET saldo = saldo + ? WHERE id = ?').run(valor, req.user.id);
  db.prepare('INSERT INTO transacoes (user_id, tipo, valor, descricao) VALUES (?, ?, ?, ?)').run(req.user.id, 'deposito', valor, 'Depósito via Pix');
  const user = db.prepare('SELECT saldo FROM users WHERE id = ?').get(req.user.id);
  res.json({ saldo: user.saldo, mensagem: 'Depósito realizado!' });
});

// SACAR
app.post('/api/sacar', auth, (req, res) => {
  const { valor, chave_pix } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
  if (!chave_pix) return res.status(400).json({ erro: 'Informe sua chave Pix' });
  const user = db.prepare('SELECT saldo FROM users WHERE id = ?').get(req.user.id);
  if (user.saldo < valor) return res.status(400).json({ erro: 'Saldo insuficiente' });
  db.prepare('UPDATE users SET saldo = saldo - ? WHERE id = ?').run(valor, req.user.id);
  db.prepare('INSERT INTO transacoes (user_id, tipo, valor, descricao) VALUES (?, ?, ?, ?)').run(req.user.id, 'saque', valor, `Saque Pix: ${chave_pix}`);
  const updated = db.prepare('SELECT saldo FROM users WHERE id = ?').get(req.user.id);
  res.json({ saldo: updated.saldo, mensagem: 'Saque solicitado! Pix em até 24h.' });
});

// HISTÓRICO
app.get('/api/transacoes', auth, (req, res) => {
  const trans = db.prepare('SELECT * FROM transacoes WHERE user_id = ? ORDER BY criado_em DESC LIMIT 20').all(req.user.id);
  res.json(trans);
});

app.listen(3000, () => console.log('✅ Betx1 rodando em http://localhost:3000'));