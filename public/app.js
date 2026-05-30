const API = '';
let token = localStorage.getItem('betx1_token');
let usuario = JSON.parse(localStorage.getItem('betx1_user') || 'null');
let modalType = 'dep';
let pixAmt = 0;

// INIT
window.addEventListener('DOMContentLoaded', () => {
  createParticles();
  if (token && usuario) enterApp();
});

// PARTICLES
function createParticles() {
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (4 + Math.random() * 6) + 's';
    p.style.animationDelay = Math.random() * 6 + 's';
    p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
    c.appendChild(p);
  }
}

// SCREENS
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'wallet') loadTransacoes();
}

function showAuth(tab) {
  showScreen('auth');
  switchTab(tab);
}

function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
}

// LOGIN
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  err.textContent = '';
  if (!email || !senha) { err.textContent = 'Preencha todos os campos!'; return; }
  try {
    const res = await fetch(API + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.erro || 'Erro ao entrar'; return; }
    saveUser(data);
    enterApp();
  } catch (e) {
    err.textContent = 'Erro de conexão com o servidor';
  }
}

// CADASTRO
async function doRegister() {
  const nome = document.getElementById('regNome').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const senha = document.getElementById('regSenha').value;
  const senha2 = document.getElementById('regSenha2').value;
  const err = document.getElementById('regErr');
  err.textContent = '';
  if (!nome || !email || !senha) { err.textContent = 'Preencha todos os campos!'; return; }
  if (senha !== senha2) { err.textContent = 'Senhas não coincidem!'; return; }
  if (senha.length < 6) { err.textContent = 'Senha muito curta!'; return; }
  try {
    const res = await fetch(API + '/api/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.erro || 'Erro ao cadastrar'; return; }
    saveUser(data);
    enterApp();
  } catch (e) {
    err.textContent = 'Erro de conexão com o servidor';
  }
}

function saveUser(data) {
  token = data.token;
  usuario = { nome: data.nome, email: data.email, saldo: data.saldo };
  localStorage.setItem('betx1_token', token);
  localStorage.setItem('betx1_user', JSON.stringify(usuario));
}

function enterApp() {
  updateBalanceUI();
  document.getElementById('profileName').textContent = usuario.nome;
  document.getElementById('profileEmail').textContent = usuario.email;
  showScreen('lobby');
}

function updateBalanceUI() {
  const fmt = usuario.saldo.toFixed(2).replace('.', ',');
  document.getElementById('balanceTop').textContent = fmt;
  document.getElementById('walletBal').textContent = fmt;
  document.getElementById('saqSaldo').textContent = fmt;
}

// LOGOUT
function logout() {
  if (!confirm('Sair da conta?')) return;
  token = null; usuario = null;
  localStorage.removeItem('betx1_token');
  localStorage.removeItem('betx1_user');
  showScreen('splash');
}

// MODAL
function showModal(type) {
  modalType = type;
  pixAmt = 0;
  document.getElementById('modalTitle').textContent = type === 'dep' ? '💰 DEPOSITAR' : '🏦 SACAR';
  document.getElementById('modalDep').style.display = type === 'dep' ? 'block' : 'none';
  document.getElementById('modalSaq').style.display = type === 'saq' ? 'block' : 'none';
  document.getElementById('depOk').style.display = 'none';
  document.getElementById('saqOk').style.display = 'none';
  document.getElementById('depAmt').value = '';
  if (document.getElementById('saqAmt')) document.getElementById('saqAmt').value = '';
  if (document.getElementById('pixKey')) document.getElementById('pixKey').value = '';
  document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay'))
    document.getElementById('modalOverlay').style.display = 'none';
}

function setAmt(v, el) {
  pixAmt = v;
  document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  const inputId = modalType === 'dep' ? 'depAmt' : 'saqAmt';
  document.getElementById(inputId).value = v;
}

function copyPix() {
  navigator.clipboard?.writeText('betx1@pagamentos.com.br');
  alert('Chave Pix copiada!');
}

// DEPOSITAR
async function confirmarDep() {
  const valor = parseFloat(document.getElementById('depAmt').value) || pixAmt;
  if (!valor || valor <= 0) { alert('Escolha um valor!'); return; }
  try {
    const res = await fetch(API + '/api/depositar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ valor })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.erro); return; }
    usuario.saldo = data.saldo;
    localStorage.setItem('betx1_user', JSON.stringify(usuario));
    updateBalanceUI();
    document.getElementById('depOk').style.display = 'block';
    setTimeout(() => document.getElementById('modalOverlay').style.display = 'none', 2000);
  } catch (e) {
    alert('Erro de conexão');
  }
}

// SACAR
async function confirmarSaq() {
  const valor = parseFloat(document.getElementById('saqAmt').value) || pixAmt;
  const chave_pix = document.getElementById('pixKey').value.trim();
  if (!valor || valor <= 0) { alert('Escolha um valor!'); return; }
  if (!chave_pix) { alert('Informe sua chave Pix!'); return; }
  try {
    const res = await fetch(API + '/api/sacar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ valor, chave_pix })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.erro); return; }
    usuario.saldo = data.saldo;
    localStorage.setItem('betx1_user', JSON.stringify(usuario));
    updateBalanceUI();
    document.getElementById('saqOk').style.display = 'block';
    setTimeout(() => document.getElementById('modalOverlay').style.display = 'none', 2000);
  } catch (e) {
    alert('Erro de conexão');
  }
}

// TRANSAÇÕES
async function loadTransacoes() {
  try {
    const res = await fetch(API + '/api/transacoes', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const list = document.getElementById('transList');
    if (!data.length) { list.innerHTML = '<div class="empty">Nenhuma transação ainda.</div>'; return; }
    const icons = { deposito: '💳', saque: '🏦', bonus: '🎁' };
    const tipos = { deposito: 'dep', saque: 'saq', bonus: 'bonus' };
    list.innerHTML = data.map(t => {
      const pos = t.tipo !== 'saque';
      const date = new Date(t.criado_em).toLocaleString('pt-BR');
      return `
        <div class="trans-item">
          <div class="trans-icon ${tipos[t.tipo] || 'dep'}">${icons[t.tipo] || '💰'}</div>
          <div class="trans-desc">
            <div class="trans-name">${t.descricao}</div>
            <div class="trans-date">${date}</div>
          </div>
          <div class="trans-val ${pos ? 'pos' : 'neg'}">${pos ? '+' : '-'}R$ ${t.valor.toFixed(2).replace('.', ',')}</div>
        </div>`;
    }).join('');
  } catch (e) {
    console.log('Erro ao carregar transações');
  }
}

// JOGOS
function openGame(game) {
  alert(`🎮 ${game.charAt(0).toUpperCase() + game.slice(1)}\n\nEm breve disponível com apostas reais!`);
}