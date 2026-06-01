const API = '';
let token = localStorage.getItem('betx1_token');
let usuario = JSON.parse(localStorage.getItem('betx1_user') || 'null');
let modalType = 'dep';
let pixAmt = 0;
let pixId = null;
let pixCheckInterval = null;

window.addEventListener('DOMContentLoaded', () => {
  createParticles();
  if (token && usuario) {
    if (usuario.admin) enterAdmin();
    else enterApp();
  }
});

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

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'wallet') loadTransacoes();
  if (id === 'admin') loadAdmin();
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

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  err.textContent = '';
  if (!email || !senha) { err.textContent = 'Preencha todos os campos!'; return; }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.erro; return; }
    token = data.token;
    localStorage.setItem('betx1_token', token);
    if (data.admin) {
      usuario = { admin: true, email };
      localStorage.setItem('betx1_user', JSON.stringify(usuario));
      enterAdmin();
    } else {
      saveUser(data);
      enterApp();
    }
  } catch { err.textContent = 'Erro de conexão'; }
}

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
    const res = await fetch('/api/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.erro; return; }
    saveUser(data);
    enterApp();
  } catch { err.textContent = 'Erro de conexão'; }
}

function saveUser(data) {
  token = data.token;
  usuario = { nome: data.nome, email: data.email, saldo: data.saldo, saldo_treino: data.saldo_treino || 1000 };
  localStorage.setItem('betx1_token', token);
  localStorage.setItem('betx1_user', JSON.stringify(usuario));
}

function enterApp() {
  updateBalanceUI();
  document.getElementById('profileName').textContent = usuario.nome;
  document.getElementById('profileEmail').textContent = usuario.email;
  showScreen('lobby');
}

function enterAdmin() {
  showScreen('admin');
  loadAdmin();
}

function updateBalanceUI() {
  const saldo = (usuario.saldo || 0).toFixed(2).replace('.', ',');
  const treino = Math.floor(usuario.saldo_treino || 1000).toLocaleString('pt-BR');
  document.getElementById('balanceTop').textContent = saldo;
  document.getElementById('walletBal').textContent = saldo;
  document.getElementById('saqSaldo').textContent = saldo;
  document.getElementById('saldoTreino').textContent = treino;
  document.getElementById('saldoTreinoTop').textContent = treino;
}

function logout() {
  if (!confirm('Sair da conta?')) return;
  token = null; usuario = null;
  localStorage.removeItem('betx1_token');
  localStorage.removeItem('betx1_user');
  showScreen('splash');
}

function showModal(type) {
  modalType = type;
  pixAmt = 0; pixId = null;
  clearInterval(pixCheckInterval);
  document.getElementById('modalTitle').textContent = type === 'dep' ? '💰 DEPOSITAR VIA PIX' : '🏦 SACAR VIA PIX';
  document.getElementById('modalDep').style.display = type === 'dep' ? 'block' : 'none';
  document.getElementById('modalSaq').style.display = type === 'saq' ? 'block' : 'none';
  document.getElementById('depOk').style.display = 'none';
  document.getElementById('saqOk').style.display = 'none';
  document.getElementById('depAmt').value = '';
  if (document.getElementById('saqAmt')) document.getElementById('saqAmt').value = '';
  if (document.getElementById('pixKey')) document.getElementById('pixKey').value = '';
  const qrArea = document.getElementById('qrArea');
  if (qrArea) qrArea.style.display = 'none';
  document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) {
    clearInterval(pixCheckInterval);
    document.getElementById('modalOverlay').style.display = 'none';
  }
}

function setAmt(v, el) {
  pixAmt = v;
  document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById(modalType === 'dep' ? 'depAmt' : 'saqAmt').value = v;
}

function copyPix() {
  const code = document.getElementById('pixCopyCode')?.textContent;
  if (code) navigator.clipboard?.writeText(code);
  alert('Código Pix copiado!');
}

async function confirmarDep() {
  const valor = parseFloat(document.getElementById('depAmt').value) || pixAmt;
  if (!valor || valor < 1) { alert('Valor mínimo R$1!'); return; }
  const btn = document.querySelector('#modalDep .btn-primary');
  btn.textContent = '⏳ GERANDO PIX...';
  btn.disabled = true;
  try {
    const res = await fetch('/api/pix/depositar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ valor })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.erro); btn.textContent = '✅ GERAR PIX'; btn.disabled = false; return; }
    pixId = data.pix_id;
    const qrArea = document.getElementById('qrArea');
    qrArea.style.display = 'block';
    if (data.qr_code_base64) {
      document.getElementById('qrImg').src = 'data:image/png;base64,' + data.qr_code_base64;
      document.getElementById('qrImg').style.display = 'block';
    }
    document.getElementById('pixCopyCode').textContent = data.qr_code || '';
    btn.textContent = '✅ GERAR PIX';
    btn.disabled = false;
    pixCheckInterval = setInterval(async () => {
      try {
        const r = await fetch('/api/pix/status/' + pixId, { headers: { 'Authorization': 'Bearer ' + token } });
        const d = await r.json();
        if (d.status === 'approved') {
          clearInterval(pixCheckInterval);
          usuario.saldo = d.saldo;
          localStorage.setItem('betx1_user', JSON.stringify(usuario));
          updateBalanceUI();
          document.getElementById('depOk').style.display = 'block';
          document.getElementById('qrArea').style.display = 'none';
          setTimeout(() => document.getElementById('modalOverlay').style.display = 'none', 3000);
        }
      } catch {}
    }, 5000);
  } catch {
    alert('Erro de conexão');
    btn.textContent = '✅ GERAR PIX';
    btn.disabled = false;
  }
}

async function confirmarSaq() {
  const valor = parseFloat(document.getElementById('saqAmt').value) || pixAmt;
  const chave_pix = document.getElementById('pixKey').value.trim();
  if (!valor || valor <= 0) { alert('Escolha um valor!'); return; }
  if (!chave_pix) { alert('Informe sua chave Pix!'); return; }
  try {
    const res = await fetch('/api/sacar', {
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
  } catch { alert('Erro de conexão'); }
}

async function loadTransacoes() {
  try {
    const res = await fetch('/api/transacoes', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const list = document.getElementById('transList');
    if (!data.length) { list.innerHTML = '<div class="empty">Nenhuma transação ainda.</div>'; return; }
    const icons = { deposito: '💳', saque: '🏦', bonus: '🎁' };
    const tipos = { deposito: 'dep', saque: 'saq', bonus: 'bonus' };
    list.innerHTML = data.map(t => {
      const pos = t.tipo !== 'saque';
      const date = new Date(t.criado_em).toLocaleString('pt-BR');
      return `<div class="trans-item">
        <div class="trans-icon ${tipos[t.tipo] || 'dep'}">${icons[t.tipo] || '💰'}</div>
        <div class="trans-desc"><div class="trans-name">${t.descricao}</div><div class="trans-date">${date}</div></div>
        <div class="trans-val ${pos ? 'pos' : 'neg'}">${pos ? '+' : '-'}R$ ${t.valor.toFixed(2).replace('.', ',')}</div>
      </div>`;
    }).join('');
  } catch {}
}

function jogarTreino(jogo) {
  alert(`🤖 ${jogo.charAt(0).toUpperCase() + jogo.slice(1)} vs Bot\n\nEm breve disponível!`);
}

function recarregarFichas() {
  usuario.saldo_treino = 1000;
  localStorage.setItem('betx1_user', JSON.stringify(usuario));
  updateBalanceUI();
  alert('✅ Fichas recarregadas!');
}

async function loadAdmin() {
  try {
    const headers = { 'Authorization': 'Bearer ' + token };
    const [stats, saques, users] = await Promise.all([
      fetch('/api/admin/stats', { headers }).then(r => r.json()),
      fetch('/api/admin/saques', { headers }).then(r => r.json()),
      fetch('/api/admin/usuarios', { headers }).then(r => r.json()),
    ]);
    document.getElementById('statUsers').textContent = stats.totalUsers || 0;
    document.getElementById('statDep').textContent = 'R$' + (stats.totalDep || 0).toFixed(0);
    document.getElementById('statPend').textContent = stats.saquesPendentes || 0;
    const saqEl = document.getElementById('adminSaques');
    if (!saques.length) {
      saqEl.innerHTML = '<div class="empty">Nenhum saque pendente. ✅</div>';
    } else {
      saqEl.innerHTML = saques.map(s => `
        <div class="trans-item" style="flex-wrap:wrap;gap:8px;">
          <div class="trans-icon saq">🏦</div>
          <div class="trans-desc">
            <div class="trans-name">${s.nome} — R$ ${s.valor.toFixed(2)}</div>
            <div class="trans-date">Chave Pix: ${s.chave_pix || 'não informada'}</div>
            <div class="trans-date">${new Date(s.criado_em).toLocaleString('pt-BR')}</div>
          </div>
          <button onclick="pagarSaque(${s.id})" style="padding:6px 14px;background:var(--green);color:#000;border:none;border-radius:6px;font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">✅ PAGO</button>
        </div>
      `).join('');
    }
    document.getElementById('adminUsers').innerHTML = users.map(u => `
      <div class="trans-item">
        <div class="trans-icon dep">👤</div>
        <div class="trans-desc">
          <div class="trans-name">${u.nome}</div>
          <div class="trans-date">${u.email}</div>
        </div>
        <div class="trans-val pos">R$ ${(u.saldo || 0).toFixed(2)}</div>
      </div>
    `).join('');
  } catch(e) { console.log('Erro admin:', e); }
}

async function pagarSaque(id) {
  if (!confirm('Marcar saque como pago?')) return;
  try {
    await fetch(`/api/admin/saques/${id}/pagar`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    loadAdmin();
  } catch {}
}

function openGame(game) {
  alert(`🎮 ${game.charAt(0).toUpperCase() + game.slice(1)}\n\nEm breve disponível com apostas reais!`);
}