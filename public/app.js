const API = '';
let token = localStorage.getItem('superduelo_token');
let usuario = JSON.parse(localStorage.getItem('superduelo_user') || 'null');
let modalType = 'dep';
let pixAmt = 0;
let pixId = null;
let pixCheckInterval = null;

// Avatares disponíveis
const AVATARES = ['😎','🤠','🥷','👑','🦁','🐯','🦊','🐺','🎭','🤖','👾','🎮','🏆','💎','🔥','⚡','🌟','🎯','🎲','♟️'];

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
  if (id === 'wallet') { atualizarSaldoServidor(); loadTransacoes(); }
  if (id === 'admin') loadAdmin();
  if (id === 'profile') carregarPerfil();
}

async function atualizarSaldoServidor() {
  try {
    const res = await fetch('/api/perfil', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (data.saldo !== undefined) {
      usuario.saldo = data.saldo;
      usuario.nome = data.nome;
      localStorage.setItem('superduelo_user', JSON.stringify(usuario));
      updateBalanceUI();
    }
  } catch {}
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.erro; return; }
    token = data.token;
    localStorage.setItem('superduelo_token', token);
    if (data.admin) {
      usuario = { admin: true, email };
      localStorage.setItem('superduelo_user', JSON.stringify(usuario));
      enterAdmin();
    } else { saveUser(data); enterApp(); }
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
  const telefone = document.getElementById('regTelefone').value.trim();
  if (!telefone) { err.textContent = 'Informe seu número de celular!'; return; }
  if (!validarTelBR(telefone)) { err.textContent = 'Número inválido! Use um celular brasileiro válido (ex: (11) 99999-9999)'; return; }
  if (!document.getElementById('checkIdade').checked) { err.textContent = 'Você deve ter 18 anos ou mais e aceitar os Termos de Uso!'; return; }
  try {
    const res = await fetch('/api/cadastro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha, telefone })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.erro; return; }
    saveUser(data); enterApp();
  } catch { err.textContent = 'Erro de conexão'; }
}

function saveUser(data) {
  token = data.token;
  usuario = {
    nome: data.nome, email: data.email, saldo: data.saldo,
    saldo_treino: data.saldo_treino || 1000,
    avatar: data.avatar || '😎',
    notif_deposito: true, notif_saque: true
  };
  localStorage.setItem('superduelo_token', token);
  localStorage.setItem('superduelo_user', JSON.stringify(usuario));
}

function enterApp() {
  updateBalanceUI();
  atualizarAvatar();
  showScreen('lobby');
  // Atualiza saldo do servidor ao entrar
  atualizarSaldoServidor();
  // Atualiza a cada 30 segundos
  setInterval(atualizarSaldoServidor, 30000);
}

async function atualizarSaldoServidor() {
  try {
    const res = await fetch('/api/perfil', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (data.saldo !== undefined) {
      usuario.saldo = data.saldo;
      usuario.nome = data.nome;
      localStorage.setItem('superduelo_user', JSON.stringify(usuario));
      updateBalanceUI();
    }
  } catch {}
}

function enterAdmin() { showScreen('admin'); loadAdmin(); }

function atualizarAvatar() {
  const av = usuario?.avatar || '😎';
  document.querySelectorAll('.avatar, .profile-avatar').forEach(el => el.textContent = av);
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
  localStorage.removeItem('superduelo_token');
  localStorage.removeItem('superduelo_user');
  showScreen('splash');
}

// ===== PERFIL =====
async function carregarPerfil() {
  try {
    const r = await fetch('/api/perfil', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    usuario.nome = d.nome;
    usuario.email = d.email;
    usuario.saldo = d.saldo;
    localStorage.setItem('superduelo_user', JSON.stringify(usuario));
  } catch {}
  document.getElementById('profileName').textContent = usuario.nome || '-';
  document.getElementById('profileEmail').textContent = usuario.email || '-';
  document.querySelector('.profile-avatar').textContent = usuario.avatar || '😎';
}

function abrirEditarPerfil() {
  document.getElementById('editNome').value = usuario.nome || '';
  document.getElementById('editEmail').value = usuario.email || '';
  document.getElementById('editSenhaAtual').value = '';
  document.getElementById('editNovaSenha').value = '';
  document.getElementById('editMsg').textContent = '';
  renderAvatares();
  document.getElementById('modalEditPerfil').style.display = 'flex';
}

function fecharEditarPerfil() {
  document.getElementById('modalEditPerfil').style.display = 'none';
}

function renderAvatares() {
  const grid = document.getElementById('avatarGrid');
  grid.innerHTML = AVATARES.map(av => `
    <div onclick="selecionarAvatar('${av}',this)"
      style="font-size:28px;cursor:pointer;padding:8px;border-radius:10px;text-align:center;border:2px solid ${av===usuario.avatar?'var(--gold)':'transparent'};background:${av===usuario.avatar?'rgba(240,192,64,.1)':'transparent'}">
      ${av}
    </div>
  `).join('');
}

function selecionarAvatar(av, el) {
  usuario.avatar = av;
  document.querySelectorAll('#avatarGrid div').forEach(d => {
    d.style.border = '2px solid transparent';
    d.style.background = 'transparent';
  });
  el.style.border = '2px solid var(--gold)';
  el.style.background = 'rgba(240,192,64,.1)';
  atualizarAvatar();
  localStorage.setItem('superduelo_user', JSON.stringify(usuario));
}

async function salvarPerfil() {
  const nome = document.getElementById('editNome').value.trim();
  const senhaAtual = document.getElementById('editSenhaAtual').value;
  const novaSenha = document.getElementById('editNovaSenha').value;
  const msg = document.getElementById('editMsg');

  if (!nome) { msg.textContent = 'Nome obrigatório!'; msg.style.color = '#ef4444'; return; }

  try {
    const body = { nome };
    if (senhaAtual && novaSenha) {
      if (novaSenha.length < 6) { msg.textContent = 'Nova senha muito curta!'; msg.style.color = '#ef4444'; return; }
      body.senhaAtual = senhaAtual;
      body.novaSenha = novaSenha;
    }

    const res = await fetch('/api/perfil/editar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.erro; msg.style.color = '#ef4444'; return; }

    usuario.nome = nome;
    localStorage.setItem('superduelo_user', JSON.stringify(usuario));
    document.getElementById('profileName').textContent = nome;
    msg.textContent = '✅ Perfil atualizado!';
    msg.style.color = '#00c853';
    setTimeout(fecharEditarPerfil, 1500);
  } catch { msg.textContent = 'Erro de conexão'; msg.style.color = '#ef4444'; }
}

function abrirNotificacoes() {
  document.getElementById('notifDeposito').checked = usuario.notif_deposito !== false;
  document.getElementById('notifSaque').checked = usuario.notif_saque !== false;
  document.getElementById('modalNotif').style.display = 'flex';
}

function fecharNotificacoes() {
  document.getElementById('modalNotif').style.display = 'none';
}

function salvarNotificacoes() {
  usuario.notif_deposito = document.getElementById('notifDeposito').checked;
  usuario.notif_saque = document.getElementById('notifSaque').checked;
  localStorage.setItem('superduelo_user', JSON.stringify(usuario));
  fecharNotificacoes();
  mostrarToast('✅ Notificações salvas!');
}

function mostrarToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e2d50;color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;z-index:9999;border:1px solid var(--border);';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 2500);
}

// Notificar depósito/saque
function notificarTransacao(tipo, valor) {
  if (tipo === 'deposito' && usuario.notif_deposito !== false) {
    mostrarToast(`💳 Depósito de R$ ${valor.toFixed(2)} confirmado!`);
  }
  if (tipo === 'saque' && usuario.notif_saque !== false) {
    mostrarToast(`🏦 Saque de R$ ${valor.toFixed(2)} solicitado!`);
  }
}

// ===== MODAL =====
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
  mostrarToast('📋 Código Pix copiado!');
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
          localStorage.setItem('superduelo_user', JSON.stringify(usuario));
          updateBalanceUI();
          document.getElementById('depOk').style.display = 'block';
          document.getElementById('qrArea').style.display = 'none';
          notificarTransacao('deposito', valor);
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
    localStorage.setItem('superduelo_user', JSON.stringify(usuario));
    updateBalanceUI();
    document.getElementById('saqOk').style.display = 'block';
    notificarTransacao('saque', valor);
    setTimeout(() => document.getElementById('modalOverlay').style.display = 'none', 2000);
  } catch { alert('Erro de conexão'); }
}

async function loadTransacoes() {
  try {
    const res = await fetch('/api/transacoes', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const list = document.getElementById('transList');
    if (!data.length) { list.innerHTML = '<div class="empty">Nenhuma transação ainda.</div>'; return; }
    const icons = { deposito: '💳', saque: '🏦', ganho: '🏆', devolucao: '🔄' };
    const tipos = { deposito: 'dep', saque: 'saq', ganho: 'dep', devolucao: 'dep' };
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
  if (jogo === 'airhockey') { window.location.href = '/airhockey.html'; return; }
  alert(`🤖 ${jogo.charAt(0).toUpperCase() + jogo.slice(1)} vs Bot\n\nEm breve disponível!`);
}

function recarregarFichas() {
  usuario.saldo_treino = 1000;
  localStorage.setItem('superduelo_user', JSON.stringify(usuario));
  updateBalanceUI();
  mostrarToast('✅ Fichas recarregadas!');
}

let todosUsuarios = [];
let userEditandoId = null;

function adminTab(tab) {
  ['saques','usuarios','jogos','stats'].forEach(t => {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).style.display = t === tab ? 'block' : 'none';
    const el = document.getElementById('at' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) { el.style.color = t === tab ? 'var(--gold)' : 'var(--muted)'; el.style.borderBottomColor = t === tab ? 'var(--gold)' : 'transparent'; }
  });
  if (tab === 'usuarios') carregarUsuariosAdmin();
  if (tab === 'jogos') carregarJogosAdmin();
  if (tab === 'stats') carregarStatsAdmin();
}

async function loadAdmin() {
  try {
    const headers = { 'Authorization': 'Bearer ' + token };
    const saques = await fetch('/api/admin/saques', { headers }).then(r => r.json());
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
          <button onclick="pagarSaque(${s.id})" style="padding:6px 14px;background:var(--green);color:#000;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">✅ PAGO</button>
        </div>
      `).join('');
    }
  } catch(e) { console.log('Erro admin:', e); }
}

async function carregarUsuariosAdmin() {
  try {
    const headers = { 'Authorization': 'Bearer ' + token };
    todosUsuarios = await fetch('/api/admin/usuarios', { headers }).then(r => r.json());
    renderUsuarios(todosUsuarios);
  } catch(e) {}
}

function renderUsuarios(users) {
  document.getElementById('adminUsers').innerHTML = users.map(u => `
    <div class="trans-item" style="cursor:pointer;" onclick="abrirEditUser(${u.id})">
      <div class="trans-icon dep" style="background:${u.bloqueado?'rgba(239,68,68,.2)':'rgba(0,200,83,.1)'};">${u.bloqueado?'🔒':'👤'}</div>
      <div class="trans-desc">
        <div class="trans-name">${u.nome} ${u.bloqueado?'<span style="color:#ef4444;font-size:11px;">(bloqueado)</span>':''}</div>
        <div class="trans-date">${u.email}</div>
      </div>
      <div class="trans-val pos">R$ ${(u.saldo||0).toFixed(2)}</div>
    </div>
  `).join('');
}

function filtrarUsuarios() {
  const q = document.getElementById('searchUser').value.toLowerCase();
  renderUsuarios(todosUsuarios.filter(u => u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
}

function abrirEditUser(id) {
  const u = todosUsuarios.find(u => u.id === id);
  if (!u) return;
  userEditandoId = id;
  document.getElementById('editUserInfo').textContent = `${u.nome} · ${u.email}`;
  document.getElementById('adminSaldoAtual').textContent = `Saldo atual: R$ ${(u.saldo||0).toFixed(2)}`;
  document.getElementById('adminSaldoVal').value = '';
  document.getElementById('adminNovaSenha').value = '';
  document.getElementById('adminEditMsg').textContent = '';
  const btn = document.getElementById('btnBloquear');
  if (u.bloqueado) {
    btn.textContent = '✅ Desbloquear usuário';
    btn.style.background = 'rgba(0,200,83,.1)';
    btn.style.border = '1px solid rgba(0,200,83,.3)';
    btn.style.color = 'var(--green)';
  } else {
    btn.textContent = '🔒 Bloquear usuário';
    btn.style.background = 'rgba(239,68,68,.1)';
    btn.style.border = '1px solid rgba(239,68,68,.3)';
    btn.style.color = '#ef4444';
  }
  document.getElementById('modalEditUser').style.display = 'flex';
}

function fecharEditUser() {
  document.getElementById('modalEditUser').style.display = 'none';
  userEditandoId = null;
}

async function adminAjustarSaldo(op) {
  const valor = parseFloat(document.getElementById('adminSaldoVal').value);
  if (!valor || valor <= 0) { document.getElementById('adminEditMsg').textContent = 'Informe um valor válido!'; return; }
  try {
    const res = await fetch('/api/admin/usuario/' + userEditandoId + '/saldo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ valor, operacao: op })
    });
    const data = await res.json();
    if (!res.ok) { document.getElementById('adminEditMsg').textContent = data.erro; return; }
    document.getElementById('adminSaldoAtual').textContent = `Saldo atual: R$ ${data.saldo.toFixed(2)}`;
    document.getElementById('adminEditMsg').style.color = 'var(--green)';
    document.getElementById('adminEditMsg').textContent = op === 'add' ? `✅ R$ ${valor.toFixed(2)} adicionado!` : `✅ R$ ${valor.toFixed(2)} removido!`;
    const u = todosUsuarios.find(u => u.id === userEditandoId);
    if (u) u.saldo = data.saldo;
    carregarUsuariosAdmin();
  } catch(e) { document.getElementById('adminEditMsg').textContent = 'Erro de conexão'; }
}

async function adminBloquear() {
  try {
    const res = await fetch('/api/admin/usuario/' + userEditandoId + '/bloquear', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    document.getElementById('adminEditMsg').style.color = 'var(--gold)';
    document.getElementById('adminEditMsg').textContent = data.bloqueado ? '🔒 Usuário bloqueado!' : '✅ Usuário desbloqueado!';
    await carregarUsuariosAdmin();
    const u = todosUsuarios.find(u => u.id === userEditandoId);
    if (u) {
      const btn = document.getElementById('btnBloquear');
      btn.textContent = u.bloqueado ? '✅ Desbloquear usuário' : '🔒 Bloquear usuário';
    }
  } catch(e) {}
}

async function adminResetarSenha() {
  const novaSenha = document.getElementById('adminNovaSenha').value.trim();
  if (!novaSenha || novaSenha.length < 6) { document.getElementById('adminEditMsg').textContent = 'Senha deve ter mínimo 6 caracteres!'; return; }
  try {
    const res = await fetch('/api/admin/usuario/' + userEditandoId + '/senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ novaSenha })
    });
    const data = await res.json();
    document.getElementById('adminEditMsg').style.color = 'var(--green)';
    document.getElementById('adminEditMsg').textContent = '✅ Senha resetada com sucesso!';
    document.getElementById('adminNovaSenha').value = '';
  } catch(e) {}
}

async function carregarJogosAdmin() {
  try {
    const jogos = await fetch('/api/admin/jogos', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json());
    document.getElementById('adminJogos').innerHTML = jogos.map(j => `
      <div class="trans-item">
        <div class="trans-icon dep" style="font-size:20px;">${j.id==='airhockey'?'🏒':j.id==='flappy'?'🐦':j.id==='xadrez'?'♟️':'🎱'}</div>
        <div class="trans-desc"><div class="trans-name">${j.nome}</div><div class="trans-date">${j.ativo?'✅ Ativo':'❌ Desativado'}</div></div>
        <button onclick="toggleJogo('${j.id}', this)" style="padding:6px 14px;background:${j.ativo?'rgba(239,68,68,.1)':'rgba(0,200,83,.1)'};border:1px solid ${j.ativo?'rgba(239,68,68,.3)':'rgba(0,200,83,.3)'};color:${j.ativo?'#ef4444':'var(--green)'};border-radius:8px;font-size:13px;cursor:pointer;font-weight:700;">${j.ativo?'Desativar':'Ativar'}</button>
      </div>
    `).join('');
  } catch(e) {}
}

async function toggleJogo(id, btn) {
  try {
    const res = await fetch('/api/admin/jogos/' + id + '/toggle', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    carregarJogosAdmin();
    mostrarToast(data.ativo ? '✅ Jogo ativado!' : '❌ Jogo desativado!');
  } catch(e) {}
}

async function carregarStatsAdmin() {
  try {
    const stats = await fetch('/api/admin/estatisticas', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json());
    document.getElementById('statUsers').textContent = stats.totalUsers || 0;
    document.getElementById('statDep').textContent = 'R$' + (stats.totalDep || 0).toFixed(0);
    document.getElementById('statPend').textContent = stats.saquesPendentes || 0;
    document.getElementById('statReceita').textContent = 'R$' + (stats.receitaCasa || 0).toFixed(0);
    document.getElementById('statSaq').textContent = 'R$' + (stats.totalSaq || 0).toFixed(0);
    if (stats.jogosMaisJogados?.length) {
      document.getElementById('statsJogos').innerHTML = stats.jogosMaisJogados.map(j => `
        <div class="trans-item">
          <div class="trans-desc"><div class="trans-name">${j.descricao}</div></div>
          <div class="trans-val pos">${j.total}x</div>
        </div>
      `).join('');
    }
  } catch(e) {}
}

async function pagarSaque(id) {
  if (!confirm('Marcar saque como pago?')) return;
  try {
    await fetch(`/api/admin/saques/${id}/pagar`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    loadAdmin();
  } catch {}
}

function mascaraTel(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 7) v = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
  else if (v.length > 2) v = '(' + v.slice(0,2) + ') ' + v.slice(2);
  else if (v.length > 0) v = '(' + v;
  input.value = v;
}

function validarTelBR(tel) {
  const nums = tel.replace(/\D/g, '');
  // Celular brasileiro: 11 dígitos, DDD + 9 + 8 dígitos
  if (nums.length !== 11) return false;
  if (nums[2] !== '9') return false; // celular começa com 9
  const ddd = parseInt(nums.slice(0,2));
  if (ddd < 11 || ddd > 99) return false;
  return true;
}

function abrirTermos() {
  document.getElementById('modalTermos').style.display = 'flex';
}

function fecharTermos() {
  document.getElementById('modalTermos').style.display = 'none';
}

function openGame(game) {
  alert(`🎮 ${game.charAt(0).toUpperCase() + game.slice(1)}\n\nEm breve disponível com apostas reais!`);
}