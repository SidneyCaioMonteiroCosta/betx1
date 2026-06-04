function getNivelTitulo(nivel) {
  if (nivel <= 5) return 'Novato';
  if (nivel <= 10) return 'Iniciante';
  if (nivel <= 20) return 'Aprendiz';
  if (nivel <= 30) return 'Amador';
  if (nivel <= 40) return 'Regular';
  if (nivel <= 50) return 'Competidor';
  if (nivel <= 60) return 'Veterano';
  if (nivel <= 70) return 'Expert';
  if (nivel <= 80) return 'Mestre';
  if (nivel <= 90) return 'Grão-Mestre';
  if (nivel <= 99) return 'Lendário';
  return '👑 CAMPEÃO';
}

function getNivelCor(nivel) {
  if (nivel <= 20) return 'linear-gradient(135deg,#6b7db3,#4a5568)';
  if (nivel <= 40) return 'linear-gradient(135deg,#22c55e,#16a34a)';
  if (nivel <= 60) return 'linear-gradient(135deg,#3b82f6,#2563eb)';
  if (nivel <= 80) return 'linear-gradient(135deg,#a855f7,#7c3aed)';
  if (nivel <= 99) return 'linear-gradient(135deg,#f0c040,#d4a020)';
  return 'linear-gradient(135deg,#ef4444,#dc2626)';
}

function atualizarNivelUI(nivel, vitoriasNivel, totalVit, totalDer) {
  const badge = document.getElementById('nivelBadge');
  const titulo = document.getElementById('nivelTitulo');
  const bar = document.getElementById('nivelBar');
  const progress = document.getElementById('nivelProgress');
  const partidas = document.getElementById('profilePartidas');
  const vitorias = document.getElementById('profileVitorias');
  const winrate = document.getElementById('profileWinRate');

  if (!badge) return;
  nivel = nivel || 1;
  vitoriasNivel = vitoriasNivel || 0;
  totalVit = totalVit || 0;
  totalDer = totalDer || 0;

  badge.textContent = nivel >= 100 ? '👑 100' : `Nível ${nivel}`;
  badge.style.background = getNivelCor(nivel);
  titulo.textContent = getNivelTitulo(nivel);
  bar.style.width = (vitoriasNivel / 10 * 100) + '%';
  bar.style.background = getNivelCor(nivel);
  progress.textContent = nivel >= 100 ? 'MAX' : `${vitoriasNivel}/10 vitórias`;

  const totalPartidas = totalVit + totalDer;
  const wr = totalPartidas > 0 ? Math.round(totalVit / totalPartidas * 100) : 0;
  if (partidas) partidas.textContent = totalPartidas;
  if (vitorias) vitorias.textContent = totalVit;
  if (winrate) winrate.textContent = wr + '%';
}

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
  if (id === 'stats') carregarHistorico();
  if (id === 'torneios') carregarTorneios();
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
  atualizarSaldoServidor();
  setInterval(atualizarSaldoServidor, 30000);
  // Conectar socket para rastrear online
  iniciarSocketOnline();
}

function iniciarSocketOnline() {
  try {
    // Buscar contagem a cada 10 segundos
    const atualizarOnline = () => {
      fetch('/api/online').then(r=>r.json()).then(d=>{
        const el = document.getElementById('onlineCount');
        if (el) el.textContent = d.online || 0;
      }).catch(()=>{});
    };
    atualizarOnline();
    setInterval(atualizarOnline, 10000);

    // Também ouvir via socket
    const s = io();
    s.on('online_count', count => {
      const el = document.getElementById('onlineCount');
      if (el) el.textContent = count;
    });
  } catch(e) {}
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
    usuario.nivel = d.nivel;
    usuario.vitorias_nivel = d.vitorias_nivel;
    usuario.total_vitorias = d.total_vitorias;
    usuario.total_derrotas = d.total_derrotas;
    localStorage.setItem('superduelo_user', JSON.stringify(usuario));
    atualizarNivelUI(d.nivel, d.vitorias_nivel, d.total_vitorias, d.total_derrotas);
  } catch {}
  document.getElementById('profileName').textContent = usuario.nome || '-';
  document.getElementById('profileEmail').textContent = usuario.email || '-';
  document.querySelectorAll('.profile-avatar').forEach(el => el.textContent = usuario.avatar || '😎');
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
  const tabMap = {
    'saques': { div: 'tabSaques', btn: 'atSaques' },
    'usuarios': { div: 'tabUsers', btn: 'atUsers' },
    'jogos': { div: 'tabJogos', btn: 'atJogos' },
    'stats': { div: 'tabStats', btn: 'atStats' },
    'torneios': { div: 'tabTorneios', btn: 'atTorneios' }
  };
  Object.entries(tabMap).forEach(([t, ids]) => {
    const divEl = document.getElementById(ids.div);
    const btnEl = document.getElementById(ids.btn);
    if (divEl) divEl.style.display = t === tab ? 'block' : 'none';
    if (btnEl) {
      btnEl.style.color = t === tab ? 'var(--gold)' : 'var(--muted)';
      btnEl.style.borderBottomColor = t === tab ? 'var(--gold)' : 'transparent';
    }
  });
  if (tab === 'usuarios') carregarUsuariosAdmin();
  if (tab === 'jogos') carregarJogosAdmin();
  if (tab === 'stats') carregarStatsAdmin();
  if (tab === 'torneios') carregarTorneiosAdmin();
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
  document.getElementById('adminUsers').innerHTML = users.map(u => {
    const saldo = parseFloat(u.saldo) || 0;
    return `
    <div class="trans-item" style="cursor:pointer;" onclick="abrirEditUser(${u.id})">
      <div class="trans-icon dep" style="background:${u.bloqueado?'rgba(239,68,68,.2)':'rgba(0,200,83,.1)'};">${u.bloqueado?'🔒':'👤'}</div>
      <div class="trans-desc">
        <div class="trans-name">${u.nome} ${u.bloqueado?'<span style="color:#ef4444;font-size:11px;">(bloqueado)</span>':''}</div>
        <div class="trans-date">${u.email}</div>
      </div>
      <div class="trans-val pos">R$ ${saldo.toFixed(2)}</div>
    </div>
  `;}).join('');
}

function filtrarUsuarios() {
  const q = document.getElementById('searchUser').value.toLowerCase();
  renderUsuarios(todosUsuarios.filter(u => u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
}

function abrirEditUser(id) {
  const u = todosUsuarios.find(u => u.id === id);
  if (!u) return;
  userEditandoId = id;
  const saldo = parseFloat(u.saldo) || 0;
  document.getElementById('editUserInfo').textContent = `${u.nome} · ${u.email}`;
  document.getElementById('adminSaldoAtual').textContent = `Saldo atual: R$ ${saldo.toFixed(2)}`;
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
  const msgEl = document.getElementById('adminEditMsg');
  msgEl.style.color = '#ef4444';
  if (!valor || valor <= 0) { msgEl.textContent = 'Informe um valor válido!'; return; }
  if (!userEditandoId) { msgEl.textContent = 'Erro: usuário não selecionado!'; return; }
  try {
    const res = await fetch('/api/admin/usuario/' + userEditandoId + '/saldo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ valor, operacao: op })
    });
    const data = await res.json();
    console.log('Admin ajustar saldo:', { res: res.status, data });
    if (!res.ok) { msgEl.textContent = data.erro || 'Erro no servidor'; return; }
    const novoSaldo = parseFloat(data.saldo) || 0;
    document.getElementById('adminSaldoAtual').textContent = `Saldo atual: R$ ${novoSaldo.toFixed(2)}`;
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = op === 'add' ? `✅ R$ ${valor.toFixed(2)} adicionado!` : `✅ R$ ${valor.toFixed(2)} removido!`;
    document.getElementById('adminSaldoVal').value = '';
    const u = todosUsuarios.find(u => u.id === userEditandoId);
    if (u) u.saldo = novoSaldo;
    carregarUsuariosAdmin();
  } catch(e) {
    console.error('Erro ajustar saldo:', e);
    msgEl.textContent = 'Erro de conexão: ' + e.message;
  }
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


// ===== PAINEL DO USUÁRIO =====
let historicoData = null;
let statsTabAtual = 'depositos';

async function carregarHistorico() {
  try {
    const res = await fetch('/api/historico', { headers: { 'Authorization': 'Bearer ' + token } });
    historicoData = await res.json();

    // Atualizar saldo
    await atualizarSaldoServidor();
    document.getElementById('statsSaldo').textContent = 'R$ ' + (usuario.saldo||0).toFixed(2).replace('.', ',');

    // Calcular ganhos e perdas de partidas
    let ganhos = 0, perdas = 0, partidas = 0;
    if (historicoData.todas) {
      const jogadas = historicoData.todas.filter(t => ['ganho','devolucao'].includes(t.tipo));
      partidas = jogadas.length;
      ganhos = historicoData.todas.filter(t=>t.tipo==='ganho').reduce((a,b)=>a+b.valor, 0);
      // Perdas = apostas não ganhas (estimativa baseada nos ganhos)
      perdas = historicoData.todas.filter(t=>t.tipo==='ganho').length * 0; // calculado diferente
    }

    document.getElementById('statsGanhos').textContent = 'R$ ' + ganhos.toFixed(2).replace('.', ',');
    document.getElementById('statsPartidas').textContent = partidas;

    statsTab(statsTabAtual);
  } catch(e) { console.log('Erro stats:', e); }
}

function statsTab(tab) {
  statsTabAtual = tab;
  const tabs = { depositos: 'stDep', saques: 'stSaq', partidas: 'stPart' };
  Object.entries(tabs).forEach(([t, id]) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.color = t === tab ? 'var(--gold)' : 'var(--muted)';
      el.style.borderBottomColor = t === tab ? 'var(--gold)' : 'transparent';
    }
  });

  if (!historicoData) return;
  const content = document.getElementById('statsTabContent');

  if (tab === 'depositos') {
    const deps = historicoData.depositos || [];
    if (!deps.length) { content.innerHTML = '<div class="empty">Nenhum depósito ainda.</div>'; return; }
    const total = deps.reduce((a,b) => a+b.valor, 0);
    content.innerHTML = `
      <div style="background:rgba(0,200,83,.08);border:1px solid rgba(0,200,83,.2);border-radius:10px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;">
        <div style="font-size:12px;color:var(--muted);">Total depositado</div>
        <div style="font-weight:700;color:#00c853;">R$ ${total.toFixed(2).replace('.',',')}</div>
      </div>
      ${deps.map(d => `
        <div class="trans-item">
          <div class="trans-icon dep">💳</div>
          <div class="trans-desc">
            <div class="trans-name">${d.descricao}</div>
            <div class="trans-date">${new Date(d.criado_em).toLocaleString('pt-BR')}</div>
          </div>
          <div class="trans-val pos">+R$ ${d.valor.toFixed(2).replace('.',',')}</div>
        </div>
      `).join('')}
    `;
  } else if (tab === 'saques') {
    const saqs = historicoData.saques || [];
    if (!saqs.length) { content.innerHTML = '<div class="empty">Nenhum saque ainda.</div>'; return; }
    const total = saqs.reduce((a,b) => a+b.valor, 0);
    content.innerHTML = `
      <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;">
        <div style="font-size:12px;color:var(--muted);">Total sacado</div>
        <div style="font-weight:700;color:#ef4444;">R$ ${total.toFixed(2).replace('.',',')}</div>
      </div>
      ${saqs.map(s => `
        <div class="trans-item">
          <div class="trans-icon saq">🏦</div>
          <div class="trans-desc">
            <div class="trans-name">${s.descricao}</div>
            <div class="trans-date">${new Date(s.criado_em).toLocaleString('pt-BR')} · ${s.status==='pago'?'✅ Pago':'⏳ Pendente'}</div>
          </div>
          <div class="trans-val neg">-R$ ${s.valor.toFixed(2).replace('.',',')}</div>
        </div>
      `).join('')}
    `;
  } else if (tab === 'partidas') {
    const parts = historicoData.partidas || [];
    if (!parts.length) { content.innerHTML = '<div class="empty">Nenhuma partida ainda.</div>'; return; }
    const vitorias = parts.filter(p=>p.tipo==='ganho').length;
    const total = parts.length;
    const winrate = total > 0 ? Math.round(vitorias/total*100) : 0;
    const ganhos = parts.filter(p=>p.tipo==='ganho').reduce((a,b)=>a+b.valor,0);

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--gold);">${total}</div>
          <div style="font-size:11px;color:var(--muted);">Partidas</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#00c853;">${vitorias}</div>
          <div style="font-size:11px;color:var(--muted);">Vitórias</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--gold);">${winrate}%</div>
          <div style="font-size:11px;color:var(--muted);">Win Rate</div>
        </div>
      </div>
      <div style="background:rgba(0,200,83,.08);border:1px solid rgba(0,200,83,.2);border-radius:10px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;">
        <div style="font-size:12px;color:var(--muted);">Total ganho em partidas</div>
        <div style="font-weight:700;color:#00c853;">R$ ${ganhos.toFixed(2).replace('.',',')}</div>
      </div>
      ${parts.map(p => `
        <div class="trans-item">
          <div class="trans-icon dep" style="background:${p.tipo==='ganho'?'rgba(0,200,83,.1)':'rgba(240,192,64,.1)'};">${p.tipo==='ganho'?'🏆':'🔄'}</div>
          <div class="trans-desc">
            <div class="trans-name">${p.descricao}</div>
            <div class="trans-date">${new Date(p.criado_em).toLocaleString('pt-BR')}</div>
          </div>
          <div class="trans-val pos">+R$ ${p.valor.toFixed(2).replace('.',',')}</div>
        </div>
      `).join('')}
    `;
  }
}


// ===== TORNEIOS (USUÁRIO) =====
async function carregarTorneios() {
  try {
    const res = await fetch('/api/torneios', { headers: { Authorization: 'Bearer ' + token } });
    const torneios = await res.json();
    const el = document.getElementById('listaTorneios');
    if (!torneios.length) {
      el.innerHTML = '<div class="empty">Nenhum torneio disponível no momento. Volte em breve! 🏆</div>';
      return;
    }
    const jogoEmoji = {airhockey:'🏒',flappy:'🐦',xadrez:'♟️',sinuca:'🎱',domino:'🁣'};
    const jogoNome = {airhockey:'Air Hockey',flappy:'Flappy Duelo',xadrez:'Xadrez',sinuca:'Sinuca',domino:'Dominó'};
    el.innerHTML = torneios.map(t => {
      const data = new Date(t.data_hora);
      const lotado = t.inscritos >= t.max_participantes;
      const dataStr = data.toLocaleDateString('pt-BR') + ' às ' + data.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      return `
        <div style="background:linear-gradient(135deg,#1a1030,#2a1a4a);border:1px solid #4a3a6a;border-radius:14px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:28px;">${jogoEmoji[t.jogo]||'🎮'}</div>
            <div style="flex:1;">
              <div style="font-weight:800;font-size:16px;color:#fff;">${t.nome}</div>
              <div style="font-size:12px;color:#b0a0d0;">${jogoNome[t.jogo]||t.jogo}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="background:rgba(0,0,0,.3);border-radius:8px;padding:8px 10px;">
              <div style="font-size:10px;color:#b0a0d0;">PRÊMIO</div>
              <div style="font-size:16px;font-weight:700;color:var(--gold);">R$ ${t.premio.toFixed(2).replace('.',',')}</div>
            </div>
            <div style="background:rgba(0,0,0,.3);border-radius:8px;padding:8px 10px;">
              <div style="font-size:10px;color:#b0a0d0;">TAXA</div>
              <div style="font-size:16px;font-weight:700;color:#fff;">R$ ${t.taxa_inscricao.toFixed(2).replace('.',',')}</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#b0a0d0;margin-bottom:12px;">
            <span>📅 ${dataStr}</span>
            <span>👥 ${t.inscritos}/${t.max_participantes}</span>
          </div>
          ${t.inscrito
            ? '<div style="text-align:center;padding:11px;background:rgba(0,200,83,.15);border:1px solid rgba(0,200,83,.3);color:var(--green);border-radius:10px;font-weight:700;">✅ Você está inscrito!</div>'
            : lotado
              ? '<div style="text-align:center;padding:11px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:10px;font-weight:700;">Torneio lotado</div>'
              : `<button onclick="inscreverTorneio(${t.id})" style="width:100%;padding:12px;background:linear-gradient(135deg,#f0c040,#d4a020);color:#000;border:none;border-radius:10px;font-size:15px;font-weight:900;cursor:pointer;">INSCREVER-SE · R$ ${t.taxa_inscricao.toFixed(2).replace('.',',')}</button>`
          }
        </div>
      `;
    }).join('');
  } catch(e) { console.log('Erro torneios:', e); }
}

async function inscreverTorneio(id) {
  if (!confirm('Confirmar inscrição? A taxa será debitada do seu saldo.')) return;
  try {
    const res = await fetch('/api/torneios/' + id + '/inscrever', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (!res.ok) { alert(data.erro || 'Erro ao inscrever'); return; }
    alert('✅ Inscrição confirmada! Boa sorte! 🏆');
    await atualizarSaldoServidor();
    carregarTorneios();
  } catch(e) { alert('Erro de conexão'); }
}

// ===== TORNEIOS (ADMIN) =====
function abrirCriarTorneio() {
  document.getElementById('tNome').value = '';
  document.getElementById('tPremio').value = '';
  document.getElementById('tTaxa').value = '';
  document.getElementById('tErro').textContent = '';
  document.getElementById('modalCriarTorneio').style.display = 'flex';
}
function fecharCriarTorneio() {
  document.getElementById('modalCriarTorneio').style.display = 'none';
}

async function criarTorneio() {
  const nome = document.getElementById('tNome').value.trim();
  const jogo = document.getElementById('tJogo').value;
  const premio = parseFloat(document.getElementById('tPremio').value) || 0;
  const taxa = parseFloat(document.getElementById('tTaxa').value) || 0;
  const max = parseInt(document.getElementById('tMax').value);
  const data = document.getElementById('tData').value;
  const hora = document.getElementById('tHora').value;

  if (!nome) { document.getElementById('tErro').textContent = 'Informe o nome!'; return; }
  if (!data || !hora) { document.getElementById('tErro').textContent = 'Informe data e horário!'; return; }

  const data_hora = data + 'T' + hora + ':00';
  try {
    const res = await fetch('/api/admin/torneios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ nome, jogo, premio, taxa_inscricao: taxa, max_participantes: max, data_hora })
    });
    const d = await res.json();
    if (!res.ok) { document.getElementById('tErro').textContent = d.erro; return; }
    alert('✅ Torneio criado!');
    fecharCriarTorneio();
    carregarTorneiosAdmin();
  } catch(e) { document.getElementById('tErro').textContent = 'Erro de conexão'; }
}

async function carregarTorneiosAdmin() {
  try {
    const res = await fetch('/api/admin/torneios', { headers: { Authorization: 'Bearer ' + token } });
    const torneios = await res.json();
    const el = document.getElementById('adminTorneios');
    if (!torneios.length) { el.innerHTML = '<div class="empty">Nenhum torneio criado.</div>'; return; }
    const jogoEmoji = {airhockey:'🏒',flappy:'🐦',xadrez:'♟️',sinuca:'🎱',domino:'🁣'};
    el.innerHTML = torneios.map(t => {
      const data = new Date(t.data_hora);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      return `
        <div class="trans-item" style="flex-wrap:wrap;gap:6px;">
          <div class="trans-icon dep">${jogoEmoji[t.jogo]||'🎮'}</div>
          <div class="trans-desc">
            <div class="trans-name">${t.nome} ${t.status==='finalizado'?'<span style="color:#ef4444;font-size:11px;">(cancelado)</span>':''}</div>
            <div class="trans-date">${dataStr} · 👥 ${t.inscritos}/${t.max_participantes} · 🏆 R$${t.premio.toFixed(0)}</div>
          </div>
          ${t.status!=='finalizado' ? `<button onclick="cancelarTorneio(${t.id})" style="padding:5px 12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:6px;font-size:12px;cursor:pointer;">Cancelar</button>` : ''}
        </div>
      `;
    }).join('');
  } catch(e) {}
}

async function cancelarTorneio(id) {
  if (!confirm('Cancelar torneio? Todos os inscritos serão reembolsados.')) return;
  try {
    const res = await fetch('/api/admin/torneios/' + id + '/cancelar', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }
    });
    const d = await res.json();
    alert(`Torneio cancelado. ${d.reembolsados||0} jogadores reembolsados.`);
    carregarTorneiosAdmin();
  } catch(e) {}
}

function openGame(game) {
  alert(`🎮 ${game.charAt(0).toUpperCase() + game.slice(1)}\n\nEm breve disponível com apostas reais!`);
}