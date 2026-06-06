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
  if (id === 'ranking') carregarRankingGeral();
  if (id === 'admin') loadAdmin();
  if (id === 'profile') carregarPerfil();
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
      usuario = { admin: true, adminNivel: data.adminNivel || 1, email };
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
  const codigoConvite = (document.getElementById('regConvite')?.value || '').trim();
  if (!telefone) { err.textContent = 'Informe seu número de celular!'; return; }
  if (!validarTelBR(telefone)) { err.textContent = 'Número inválido! Use um celular brasileiro válido (ex: (11) 99999-9999)'; return; }
  if (!document.getElementById('checkIdade').checked) { err.textContent = 'Você deve ter 18 anos ou mais e aceitar os Termos de Uso!'; return; }
  try {
    const res = await fetch('/api/cadastro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha, telefone, codigoConvite })
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
  setTimeout(carregarNotificacoes, 1500);
  carregarBanners();
  aplicarStatusJogos();
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
      usuario.saldo = parseFloat(data.saldo) || 0;
      usuario.saldo_treino = parseFloat(data.saldo_treino) || 1000;
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
  const saldoNum = parseFloat(usuario.saldo) || 0;
  const treinoNum = parseFloat(usuario.saldo_treino) || 1000;
  const saldo = saldoNum.toFixed(2).replace('.', ',');
  const treino = Math.floor(treinoNum).toLocaleString('pt-BR');
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('balanceTop', saldo);
  set('walletBal', saldo);
  set('saqSaldo', saldo);
  set('saldoTreino', treino);
  set('saldoTreinoTop', treino);
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

let tipoPixSelecionado = 'cpf';
function setTipoPix(tipo, el) {
  tipoPixSelecionado = tipo;
  const cpf = document.getElementById('tipoCpf');
  const tel = document.getElementById('tipoTel');
  const ativo = (b) => { b.style.border = '2px solid var(--gold)'; b.style.background = 'rgba(240,192,64,.15)'; b.style.color = 'var(--gold)'; };
  const inativo = (b) => { b.style.border = '2px solid var(--border)'; b.style.background = 'transparent'; b.style.color = 'var(--muted)'; };
  if (tipo === 'cpf') { ativo(cpf); inativo(tel); document.getElementById('pixKey').placeholder = 'Digite seu CPF ou CNPJ (só números)'; }
  else { ativo(tel); inativo(cpf); document.getElementById('pixKey').placeholder = 'Digite seu telefone com DDD (só números)'; }
  document.getElementById('pixKey').value = '';
}

async function confirmarSaq() {
  const valor = parseFloat(document.getElementById('saqAmt').value) || pixAmt;
  let chave_pix = document.getElementById('pixKey').value.trim();
  if (!valor || valor <= 0) { alert('Escolha um valor!'); return; }
  if (!chave_pix) { alert('Informe sua chave Pix!'); return; }

  // Validar conforme o tipo
  const soNumeros = chave_pix.replace(/\D/g, '');
  if (tipoPixSelecionado === 'cpf') {
    if (soNumeros.length !== 11 && soNumeros.length !== 14) {
      alert('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.'); return;
    }
    chave_pix = soNumeros;
  } else {
    if (soNumeros.length < 10 || soNumeros.length > 11) {
      alert('Telefone inválido. Use DDD + número (10 ou 11 dígitos).'); return;
    }
    chave_pix = soNumeros;
  }

  try {
    const res = await fetch('/api/sacar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ valor, chave_pix, tipo_chave: tipoPixSelecionado })
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

function toggleAdminMenu() {
  const menu = document.getElementById('adminMenu');
  const overlay = document.getElementById('adminMenuOverlay');
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
  overlay.style.display = isOpen ? 'none' : 'block';
}

const ADMIN_TAB_LABELS = {
  saques: '💰 Saques', usuarios: '👥 Usuários', jogos: '🎮 Jogos',
  torneios: '🏆 Torneios', rankadmin: '📊 Ranking', tickets: '💬 Suporte',
  indicacoes: '🎁 Indicações', banners: '🖼️ Novidades', stats: '📊 Estatísticas'
};

function adminTab(tab) {
  const tabMap = {
    'saques': 'tabSaques',
    'usuarios': 'tabUsers',
    'jogos': 'tabJogos',
    'stats': 'tabStats',
    'torneios': 'tabTorneios',
    'tickets': 'tabTickets',
    'banners': 'tabBanners',
    'indicacoes': 'tabIndicacoes',
    'rankadmin': 'tabRankadmin'
  };
  // Mostrar/esconder os conteúdos
  Object.entries(tabMap).forEach(([t, divId]) => {
    const divEl = document.getElementById(divId);
    if (divEl) divEl.style.display = t === tab ? 'block' : 'none';
  });
  // Atualizar label no header
  const lbl = document.getElementById('adminTabAtual');
  if (lbl) lbl.textContent = ADMIN_TAB_LABELS[tab] || '';
  // Destacar item no menu
  document.querySelectorAll('.adminMenuItem').forEach(el => {
    const ativo = el.dataset.tab === tab;
    el.style.color = ativo ? 'var(--gold)' : 'var(--text)';
    el.style.background = ativo ? 'rgba(240,192,64,.1)' : 'transparent';
  });
  // Carregar dados
  if (tab === 'usuarios') carregarUsuariosAdmin();
  if (tab === 'jogos') carregarJogosAdmin();
  if (tab === 'stats') carregarStatsAdmin();
  if (tab === 'torneios') carregarTorneiosAdmin();
  if (tab === 'tickets') carregarTicketsAdmin();
  if (tab === 'banners') carregarBannersAdmin();
  if (tab === 'indicacoes') carregarIndicacoesAdmin();
  if (tab === 'rankadmin') carregarRankAdmin();
}

async function loadAdmin() {
  // Ajustar UI conforme nível do admin
  aplicarNivelAdmin();
  atualizarBadgeTickets();
  // Garantir que só a aba Saques aparece ao abrir (admin nível 1)
  if ((usuario?.adminNivel || 1) === 1) adminTab('saques');
  // Atualizar badge a cada 20s
  if (!window._ticketBadgeInterval) {
    window._ticketBadgeInterval = setInterval(atualizarBadgeTickets, 20000);
  }
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
            <div class="trans-name">${s.nome} — R$ ${parseFloat(s.valor).toFixed(2)}</div>
            <div class="trans-date">Chave Pix: ${s.chave_pix || 'não informada'}</div>
            <div class="trans-date">${new Date(s.criado_em).toLocaleString('pt-BR')}</div>
          </div>
          <button onclick="pagarSaque(${s.id})" style="padding:6px 14px;background:var(--green);color:#000;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">✅ PAGO</button>
        </div>
      `).join('');
    }
  } catch(e) { console.log('Erro admin:', e); }
}

// Admin 2 (nível 2) tem acesso reduzido: só vê Suporte e Stats
function aplicarNivelAdmin() {
  const nivel = usuario?.adminNivel || 1;
  if (nivel === 2) {
    // Admin 2: esconder itens do menu que ele não pode usar
    const esconder = ['saques', 'torneios', 'rankadmin', 'jogos']; // só admin 1 mexe nisso
    esconder.forEach(tab => {
      const el = document.querySelector(`.adminMenuItem[data-tab="${tab}"]`);
      if (el) el.style.display = 'none';
    });
    // Marcar como conta de suporte
    const lbl = document.getElementById('adminTabAtual');
    if (lbl) lbl.innerHTML = '💬 Suporte <span style="font-size:10px;color:#a855f7;">(limitado)</span>';
    // Ir direto para tickets
    setTimeout(() => adminTab('tickets'), 100);
  }
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
  const sv = document.getElementById('adminSaldoVal'); if (sv) sv.value = '';
  const ns = document.getElementById('adminNovaSenha'); if (ns) ns.value = '';
  document.getElementById('adminEditMsg').textContent = '';

  const nivel = usuario?.adminNivel || 1;
  const ehAdmin1 = nivel !== 2;

  // Botão bloquear/desbloquear (só admin 1)
  const btn = document.getElementById('btnBloquear');
  if (btn) {
    btn.style.display = ehAdmin1 ? 'block' : 'none';
    if (u.bloqueado) {
      btn.textContent = '✅ Desbloquear usuário';
      btn.style.background = 'rgba(0,200,83,.1)';
      btn.style.border = '1px solid rgba(0,200,83,.3)';
      btn.style.color = 'var(--green)';
    } else {
      btn.textContent = '🔒 Bloquear/Desativar usuário';
      btn.style.background = 'rgba(239,68,68,.1)';
      btn.style.border = '1px solid rgba(239,68,68,.3)';
      btn.style.color = '#ef4444';
    }
  }
  // Botão excluir (só admin 1)
  const btnEx = document.getElementById('btnExcluirUser');
  if (btnEx) btnEx.style.display = ehAdmin1 ? 'block' : 'none';
  // Seções de saldo e senha (só admin 1)
  document.querySelectorAll('#modalEditUser [data-admin1]').forEach(el => el.style.display = ehAdmin1 ? '' : 'none');

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


// ===== ADMIN: HISTÓRICO DE USUÁRIO =====
async function verHistoricoUsuario() {
  if (!userEditandoId) return;
  const el = document.getElementById('histUserContent');
  el.innerHTML = '<div class="empty">Carregando...</div>';
  document.getElementById('modalHistUser').style.display = 'flex';
  try {
    const res = await fetch('/api/admin/usuario/' + userEditandoId + '/historico', { headers: { Authorization: 'Bearer ' + token } });
    const d = await res.json();
    if (!res.ok) { el.innerHTML = '<div class="empty">' + (d.erro||'Erro') + '</div>'; return; }
    const u = d.user;
    const criado = new Date(u.criado_em).toLocaleDateString('pt-BR') + ' ' + new Date(u.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const saldo = parseFloat(u.saldo)||0;
    const totalDep = d.depositos.reduce((a,b)=>a+parseFloat(b.valor),0);
    const totalSaq = d.saques.reduce((a,b)=>a+parseFloat(b.valor),0);

    let html = `
      <div style="background:var(--bg);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-weight:700;font-size:16px;margin-bottom:8px;">${u.nome}</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.8;">
          📧 ${u.email}<br>
          📱 ${u.telefone || 'Sem telefone'}<br>
          📅 Conta criada: ${criado}<br>
          💰 Saldo atual: <strong style="color:var(--gold);">R$ ${saldo.toFixed(2)}</strong><br>
          🏅 Nível ${u.nivel||1} · 🏆 ${u.total_vitorias||0} vitórias · 😢 ${u.total_derrotas||0} derrotas
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:rgba(0,200,83,.08);border:1px solid rgba(0,200,83,.2);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);">Total Depósitos</div>
          <div style="font-size:16px;font-weight:700;color:#00c853;">R$ ${totalDep.toFixed(2)}</div>
        </div>
        <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);">Total Saques</div>
          <div style="font-size:16px;font-weight:700;color:#ef4444;">R$ ${totalSaq.toFixed(2)}</div>
        </div>
      </div>
    `;

    // Depósitos
    html += '<div style="font-size:13px;font-weight:700;color:var(--gold);margin:12px 0 8px;">💳 Depósitos</div>';
    if (d.depositos.length) {
      html += d.depositos.slice(0,10).map(t => `
        <div class="trans-item">
          <div class="trans-icon dep">💳</div>
          <div class="trans-desc"><div class="trans-name">${t.descricao}</div><div class="trans-date">${new Date(t.criado_em).toLocaleString('pt-BR')}</div></div>
          <div class="trans-val pos">+R$ ${parseFloat(t.valor).toFixed(2)}</div>
        </div>`).join('');
    } else { html += '<div style="font-size:12px;color:var(--muted);padding:8px;">Nenhum depósito</div>'; }

    // Saques
    html += '<div style="font-size:13px;font-weight:700;color:var(--gold);margin:12px 0 8px;">🏦 Saques</div>';
    if (d.saques.length) {
      html += d.saques.slice(0,10).map(t => `
        <div class="trans-item">
          <div class="trans-icon saq">🏦</div>
          <div class="trans-desc"><div class="trans-name">${t.descricao} · ${t.status}</div><div class="trans-date">${new Date(t.criado_em).toLocaleString('pt-BR')}</div></div>
          <div class="trans-val neg">-R$ ${parseFloat(t.valor).toFixed(2)}</div>
        </div>`).join('');
    } else { html += '<div style="font-size:12px;color:var(--muted);padding:8px;">Nenhum saque</div>'; }

    // Partidas
    html += '<div style="font-size:13px;font-weight:700;color:var(--gold);margin:12px 0 8px;">🎮 Últimas partidas e movimentações</div>';
    if (d.partidas.length) {
      html += d.partidas.slice(0,15).map(t => {
        const icon = t.tipo==='ganho'?'🏆':t.tipo==='bonus'?'🎁':t.tipo==='taxa'?'🎫':'🔄';
        return `
        <div class="trans-item">
          <div class="trans-icon dep">${icon}</div>
          <div class="trans-desc"><div class="trans-name">${t.descricao}</div><div class="trans-date">${new Date(t.criado_em).toLocaleString('pt-BR')}</div></div>
          <div class="trans-val ${t.tipo==='taxa'?'neg':'pos'}">${t.tipo==='taxa'?'-':'+'}R$ ${parseFloat(t.valor).toFixed(2)}</div>
        </div>`;
      }).join('');
    } else { html += '<div style="font-size:12px;color:var(--muted);padding:8px;">Nenhuma partida</div>'; }

    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="empty">Erro: ' + e.message + '</div>'; }
}

// ===== ADMIN: NOTIFICAÇÕES =====
let notifParaTodos = false;

function abrirNotificarTodos() {
  notifParaTodos = true;
  document.getElementById('notifDestino').textContent = '📢 Esta notificação será enviada para TODOS os usuários';
  document.getElementById('notifTitulo').value = '';
  document.getElementById('notifMsg').value = '';
  document.getElementById('notifErro').textContent = '';
  document.getElementById('modalNotificar').style.display = 'flex';
}

function abrirNotificarUm() {
  notifParaTodos = false;
  const u = todosUsuarios.find(u => u.id === userEditandoId);
  document.getElementById('notifDestino').textContent = '🔔 Para: ' + (u?.nome || 'usuário');
  document.getElementById('notifTitulo').value = '';
  document.getElementById('notifMsg').value = '';
  document.getElementById('notifErro').textContent = '';
  document.getElementById('modalNotificar').style.display = 'flex';
}

function fecharNotificar() {
  document.getElementById('modalNotificar').style.display = 'none';
}

async function enviarNotificacao() {
  const titulo = document.getElementById('notifTitulo').value.trim();
  const mensagem = document.getElementById('notifMsg').value.trim();
  if (!titulo || !mensagem) { document.getElementById('notifErro').textContent = 'Preencha título e mensagem!'; return; }
  try {
    const body = { titulo, mensagem };
    if (!notifParaTodos) body.userId = userEditandoId;
    const res = await fetch('/api/admin/notificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (!res.ok) { document.getElementById('notifErro').textContent = d.erro; return; }
    alert(notifParaTodos ? '✅ Notificação enviada para todos!' : '✅ Notificação enviada!');
    fecharNotificar();
  } catch(e) { document.getElementById('notifErro').textContent = 'Erro de conexão'; }
}


// ===== NOTIFICAÇÕES DO USUÁRIO =====
async function carregarNotificacoes() {
  try {
    const res = await fetch('/api/notificacoes', { headers: { Authorization: 'Bearer ' + token } });
    const notifs = await res.json();
    const naoLidas = notifs.filter(n => !n.lida);
    if (naoLidas.length > 0) {
      // Mostrar a mais recente como toast
      const n = naoLidas[0];
      mostrarToastNotif(n.titulo, n.mensagem, n.id);
    }
  } catch(e) {}
}

function mostrarToastNotif(titulo, msg, id) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;padding:16px 20px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:5000;max-width:90%;width:360px;animation:slideDown .3s;';
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div style="flex:1;">
        <div style="font-weight:800;font-size:15px;margin-bottom:4px;">🔔 ${titulo}</div>
        <div style="font-size:13px;opacity:.95;line-height:1.4;">${msg}</div>
      </div>
      <button onclick="this.closest('div').parentElement.remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;flex-shrink:0;">✕</button>
    </div>`;
  document.body.appendChild(div);
  // Marcar como lida
  fetch('/api/notificacoes/' + id + '/lida', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(()=>{});
  setTimeout(() => div.remove(), 8000);
}


// ===== SUPORTE / TICKETS (USUÁRIO) =====
function abrirSuporte() {
  document.getElementById('supAssunto').value = '';
  document.getElementById('supMsg').value = '';
  document.getElementById('supErro').textContent = '';
  document.getElementById('modalSuporte').style.display = 'flex';
  carregarMeusTickets();
}
function fecharSuporte() { document.getElementById('modalSuporte').style.display = 'none'; }

async function enviarTicket() {
  const assunto = document.getElementById('supAssunto').value.trim();
  const mensagem = document.getElementById('supMsg').value.trim();
  const err = document.getElementById('supErro');
  if (!assunto || !mensagem) { err.style.color='#ef4444'; err.textContent = 'Preencha assunto e mensagem!'; return; }
  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ assunto, mensagem })
    });
    const d = await res.json();
    if (!res.ok) { err.style.color='#ef4444'; err.textContent = d.erro; return; }
    err.style.color = 'var(--green)';
    err.textContent = '✅ Mensagem enviada! Responderemos em breve.';
    document.getElementById('supAssunto').value = '';
    document.getElementById('supMsg').value = '';
    carregarMeusTickets();
  } catch(e) { err.style.color='#ef4444'; err.textContent = 'Erro de conexão'; }
}

async function carregarMeusTickets() {
  try {
    const res = await fetch('/api/tickets', { headers: { Authorization: 'Bearer ' + token } });
    const tickets = await res.json();
    const el = document.getElementById('meusTickets');
    if (!tickets.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px;">📜 Minhas mensagens</div>' +
      tickets.map(t => `
        <div style="background:var(--bg);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-weight:700;font-size:13px;">${t.assunto}</span>
            <span style="font-size:11px;color:${t.status==='respondido'?'var(--green)':'var(--muted)'};">${t.status==='respondido'?'✅ Respondido':'⏳ Aguardando'}</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">${t.mensagem}</div>
          ${t.resposta ? `<div style="font-size:12px;color:var(--gold);background:rgba(240,192,64,.08);border-radius:6px;padding:8px;">💬 ${t.resposta}</div>` : ''}
        </div>
      `).join('');
  } catch(e) {}
}

// ===== EXCLUIR CONTA (USUÁRIO) =====
function abrirExcluirConta() { document.getElementById('modalExcluir').style.display = 'flex'; }

async function confirmarExcluirConta() {
  try {
    const res = await fetch('/api/perfil/excluir', {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
    });
    const d = await res.json();
    if (!res.ok) { alert(d.erro || 'Erro ao excluir'); return; }
    alert('Sua conta foi excluída. Sentiremos sua falta! 👋');
    localStorage.removeItem('superduelo_token');
    localStorage.removeItem('superduelo_user');
    window.location.reload();
  } catch(e) { alert('Erro de conexão'); }
}

// ===== TICKETS ADMIN =====
let ticketAtual = null;

async function carregarTicketsAdmin() {
  try {
    const res = await fetch('/api/admin/tickets', { headers: { Authorization: 'Bearer ' + token } });
    const tickets = await res.json();
    const el = document.getElementById('adminTickets');
    if (!tickets.length) { el.innerHTML = '<div class="empty">Nenhuma mensagem de suporte.</div>'; return; }
    el.innerHTML = tickets.map(t => {
      const data = new Date(t.criado_em).toLocaleString('pt-BR');
      const cor = t.status === 'aberto' ? '#ef4444' : 'var(--green)';
      const stLabel = t.status === 'aberto' ? '⏳ Aberto' : '✅ Respondido';
      return `
        <div onclick='abrirResponderTicket(${JSON.stringify(t).replace(/'/g,"&#39;")})' style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:10px;padding:14px;margin-bottom:10px;cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-weight:700;font-size:14px;">${t.assunto}</span>
            <span style="font-size:11px;color:${cor};">${stLabel}</span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">👤 ${t.nome} · ${t.email}</div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px;">${t.mensagem.slice(0,100)}${t.mensagem.length>100?'...':''}</div>
          <div style="font-size:11px;color:var(--muted);">${data}</div>
        </div>
      `;
    }).join('');
  } catch(e) { document.getElementById('adminTickets').innerHTML = '<div class="empty">Erro ao carregar</div>'; }
}

function abrirResponderTicket(t) {
  ticketAtual = t;
  const data = new Date(t.criado_em).toLocaleString('pt-BR');
  document.getElementById('ticketDetalhe').innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;">${t.assunto}</div>
    <div style="color:var(--muted);font-size:12px;margin-bottom:8px;">👤 ${t.nome} · ${t.email}<br>📅 ${data}</div>
    <div style="border-top:1px solid var(--border);padding-top:8px;">${t.mensagem}</div>
    ${t.resposta ? `<div style="margin-top:8px;color:var(--gold);">💬 Resposta anterior: ${t.resposta}</div>` : ''}
  `;
  document.getElementById('ticketResposta').value = t.resposta || '';
  document.getElementById('modalResponderTicket').style.display = 'flex';
}

async function responderTicket() {
  if (!ticketAtual) return;
  const resposta = document.getElementById('ticketResposta').value.trim();
  if (!resposta) { alert('Digite uma resposta!'); return; }
  try {
    const res = await fetch('/api/admin/tickets/' + ticketAtual.id + '/responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ resposta })
    });
    const d = await res.json();
    if (!res.ok) { alert(d.erro); return; }
    alert('✅ Resposta enviada ao usuário!');
    document.getElementById('modalResponderTicket').style.display = 'none';
    carregarTicketsAdmin();
    atualizarBadgeTickets();
  } catch(e) { alert('Erro de conexão'); }
}

async function atualizarBadgeTickets() {
  try {
    const res = await fetch('/api/admin/tickets/count', { headers: { Authorization: 'Bearer ' + token } });
    const d = await res.json();
    const badge = document.getElementById('ticketBadge');
    if (badge) {
      if (d.abertos > 0) { badge.style.display = 'inline'; badge.textContent = d.abertos; }
      else badge.style.display = 'none';
    }
  } catch(e) {}
}

// ===== EXCLUIR USUÁRIO (ADMIN) =====
async function adminExcluirUsuario() {
  if (!userEditandoId) return;
  const u = todosUsuarios.find(u => u.id === userEditandoId);
  if (!confirm(`Excluir permanentemente a conta de ${u?.nome}? Esta ação não pode ser desfeita.`)) return;
  try {
    const res = await fetch('/api/admin/usuario/' + userEditandoId, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
    });
    const d = await res.json();
    if (!res.ok) { alert(d.erro || 'Erro'); return; }
    alert('✅ Conta excluída!');
    fecharEditUser();
    carregarUsuariosAdmin();
  } catch(e) { alert('Erro de conexão'); }
}


// ===== CARROSSEL DE NOVIDADES (tela inicial) =====
async function carregarBanners() {
  try {
    const res = await fetch('/api/banners');
    const banners = await res.json();
    const track = document.getElementById('bannerCarousel');
    if (!track) return;
    if (!banners.length) { track.style.display = 'none'; return; }
    track.style.display = 'flex';
    track.innerHTML = banners.map(b => {
      const bgImg = b.imagem ? `background-image:linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.55)),url(${b.imagem});background-size:cover;background-position:center;` : `background:linear-gradient(135deg,${b.cor1},${b.cor2});`;
      return `
      <div class="carousel-slide" style="${bgImg}">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:34px;">${b.emoji||'🎉'}</span>
          <div>
            <div style="font-weight:800;font-size:17px;color:#fff;">${b.titulo}</div>
            <div style="font-size:13px;color:rgba(255,255,255,.9);margin-top:2px;">${b.subtitulo||''}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

// ===== ADMIN: GERENCIAR BANNERS =====
let bannerEditandoId = null;

async function carregarBannersAdmin() {
  try {
    const res = await fetch('/api/admin/banners', { headers: { Authorization: 'Bearer ' + token } });
    const banners = await res.json();
    const el = document.getElementById('adminBanners');
    if (!banners.length) { el.innerHTML = '<div class="empty">Nenhuma novidade criada.</div>'; return; }
    el.innerHTML = banners.map(b => `
      <div style="background:linear-gradient(135deg,${b.cor1},${b.cor2});border-radius:12px;padding:14px;margin-bottom:10px;${b.ativo?'':'opacity:.4;'}">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:26px;">${b.emoji||'🎉'}</span>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:15px;color:#fff;">${b.titulo} ${b.ativo?'':'<span style="font-size:11px;">(oculto)</span>'}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7);">${b.subtitulo||''} · ordem ${b.ordem}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button onclick='editarBanner(${JSON.stringify(b).replace(/'/g,"&#39;")})' style="flex:1;padding:7px;background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">✏️ Editar</button>
          <button onclick="toggleBanner(${b.id},${!b.ativo})" style="flex:1;padding:7px;background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">${b.ativo?'🙈 Ocultar':'👁️ Mostrar'}</button>
          <button onclick="excluirBanner(${b.id})" style="padding:7px 12px;background:rgba(239,68,68,.3);border:none;color:#fff;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">🗑️</button>
        </div>
      </div>
    `).join('');
  } catch(e) { document.getElementById('adminBanners').innerHTML = '<div class="empty">Erro ao carregar</div>'; }
}

function abrirCriarBanner() {
  bannerEditandoId = null;
  bannerImagemData = null;
  const bi = document.getElementById('bImagem'); if(bi) bi.value='';
  const bip = document.getElementById('bImagemPreview'); if(bip) bip.textContent='Nenhuma imagem · usará gradiente';
  const bp = document.getElementById('bannerPreview'); if(bp){ bp.style.backgroundImage='none'; }
  document.getElementById('bannerModalTitle').textContent = '🖼️ Nova Novidade';
  document.getElementById('bTitEmoji').value = '🎉';
  document.getElementById('bTitulo').value = '';
  document.getElementById('bSub').value = '';
  document.getElementById('bCor1').value = '#2a1a4a';
  document.getElementById('bCor2').value = '#4a2a6a';
  document.getElementById('bOrdem').value = '1';
  document.getElementById('bannerErro').textContent = '';
  atualizarPreviewBanner();
  document.getElementById('modalBanner').style.display = 'flex';
}

function editarBanner(b) {
  bannerEditandoId = b.id;
  bannerImagemData = b.imagem || null;
  const bip = document.getElementById('bImagemPreview');
  const bp = document.getElementById('bannerPreview');
  if(b.imagem){ if(bip) bip.textContent='✅ Imagem atual'; if(bp){bp.style.backgroundImage=`url(${b.imagem})`;bp.style.backgroundSize='cover';bp.style.backgroundPosition='center';} }
  else { if(bip) bip.textContent='Nenhuma imagem · usará gradiente'; if(bp) bp.style.backgroundImage='none'; }
  document.getElementById('bannerModalTitle').textContent = '✏️ Editar Novidade';
  document.getElementById('bTitEmoji').value = b.emoji || '🎉';
  document.getElementById('bTitulo').value = b.titulo || '';
  document.getElementById('bSub').value = b.subtitulo || '';
  document.getElementById('bCor1').value = b.cor1 || '#2a1a4a';
  document.getElementById('bCor2').value = b.cor2 || '#4a2a6a';
  document.getElementById('bOrdem').value = b.ordem || 1;
  document.getElementById('bannerErro').textContent = '';
  atualizarPreviewBanner();
  document.getElementById('modalBanner').style.display = 'flex';
}

function fecharBanner() { document.getElementById('modalBanner').style.display = 'none'; }

function atualizarPreviewBanner() {
  const emoji = document.getElementById('bTitEmoji').value || '🎉';
  const titulo = document.getElementById('bTitulo').value || 'Título';
  const sub = document.getElementById('bSub').value || 'Subtítulo';
  const c1 = document.getElementById('bCor1').value;
  const c2 = document.getElementById('bCor2').value;
  document.getElementById('bpEmoji').textContent = emoji;
  document.getElementById('bpTitulo').textContent = titulo;
  document.getElementById('bpSub').textContent = sub;
  document.getElementById('bannerPreview').style.background = `linear-gradient(135deg,${c1},${c2})`;
}

async function salvarBanner() {
  const dados = {
    emoji: document.getElementById('bTitEmoji').value || '🎉',
    titulo: document.getElementById('bTitulo').value.trim(),
    subtitulo: document.getElementById('bSub').value.trim(),
    cor1: document.getElementById('bCor1').value,
    cor2: document.getElementById('bCor2').value,
    ordem: parseInt(document.getElementById('bOrdem').value) || 1,
    imagem: bannerImagemData,
    ativo: true
  };
  if (!dados.titulo) { document.getElementById('bannerErro').textContent = 'Informe o título!'; return; }
  try {
    const url = bannerEditandoId ? '/api/admin/banners/' + bannerEditandoId : '/api/admin/banners';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(dados)
    });
    const d = await res.json();
    if (!res.ok) { document.getElementById('bannerErro').textContent = d.erro; return; }
    fecharBanner();
    carregarBannersAdmin();
  } catch(e) { document.getElementById('bannerErro').textContent = 'Erro de conexão'; }
}

async function toggleBanner(id, ativo) {
  try {
    // Buscar o banner atual para manter os dados
    const res = await fetch('/api/admin/banners', { headers: { Authorization: 'Bearer ' + token } });
    const banners = await res.json();
    const b = banners.find(x => x.id === id);
    if (!b) return;
    await fetch('/api/admin/banners/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ ...b, ativo })
    });
    carregarBannersAdmin();
  } catch(e) {}
}

async function excluirBanner(id) {
  if (!confirm('Excluir esta novidade?')) return;
  try {
    await fetch('/api/admin/banners/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    carregarBannersAdmin();
  } catch(e) {}
}


// ===== CONVITE / REFERRAL =====
let meuCodigoConv = '';
async function abrirConvite() {
  showScreen('convite');
  try {
    const res = await fetch('/api/convite', { headers: { Authorization: 'Bearer ' + token } });
    const d = await res.json();
    meuCodigoConv = d.codigo || '';
    document.getElementById('meuCodigoConvite').textContent = meuCodigoConv;
    document.getElementById('totalIndicados').textContent = d.totalIndicados || 0;
    document.getElementById('ganhoIndicacao').textContent = 'R$ ' + (d.ganhoTotal || 0);
    // Lista de indicados
    const resI = await fetch('/api/convite/indicados', { headers: { Authorization: 'Bearer ' + token } });
    const indicados = await resI.json();
    const el = document.getElementById('listaIndicados');
    if (!indicados.length) { el.innerHTML = '<div class="empty">Nenhum amigo indicado ainda.</div>'; return; }
    el.innerHTML = indicados.map(i => `
      <div class="trans-item">
        <div class="trans-icon dep">${i.completo?'✅':'⏳'}</div>
        <div class="trans-desc">
          <div class="trans-name">${i.nome}</div>
          <div class="trans-date">${i.partidas}/50 partidas ${i.completo?'· Bônus pago!':''}</div>
        </div>
        <div class="trans-val ${i.completo?'pos':''}" style="font-size:12px;">${i.completo?'+R$5':Math.round(i.partidas/50*100)+'%'}</div>
      </div>
    `).join('');
  } catch(e) {}
}
function copiarCodigoConvite() {
  navigator.clipboard?.writeText(meuCodigoConv);
  alert('Código ' + meuCodigoConv + ' copiado!');
}
function compartilharConvite() {
  const url = window.location.origin;
  const msg = `🎮 Jogue Super Duelo comigo! Use meu código *${meuCodigoConv}* no cadastro e vamos competir em Air Hockey e Flappy Duelo! ${url}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ===== BANNER: upload de imagem =====
let bannerImagemData = null;
function carregarImagemBanner(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 500000) { alert('Imagem muito grande! Use uma menor que 500KB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    bannerImagemData = e.target.result;
    document.getElementById('bImagemPreview').textContent = '✅ Imagem carregada';
    document.getElementById('bannerPreview').style.backgroundImage = `url(${bannerImagemData})`;
    document.getElementById('bannerPreview').style.backgroundSize = 'cover';
    document.getElementById('bannerPreview').style.backgroundPosition = 'center';
  };
  reader.readAsDataURL(file);
}


// ===== APLICAR CÓDIGO DE INDICAÇÃO =====
async function aplicarCodigoIndicacao() {
  const codigo = document.getElementById('inputCodigoIndicador').value.trim().toUpperCase();
  const msg = document.getElementById('msgIndicador');
  if (!codigo) { msg.style.color='#ef4444'; msg.textContent='Digite um código!'; return; }
  try {
    const res = await fetch('/api/convite/aplicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ codigo })
    });
    const d = await res.json();
    if (!res.ok) { msg.style.color='#ef4444'; msg.textContent = d.erro; return; }
    msg.style.color='var(--green)'; msg.textContent='✅ Código aplicado! Quem te indicou ganhará R$5 quando você jogar 50 partidas.';
    document.getElementById('inputCodigoIndicador').value='';
    document.getElementById('boxInserirCodigo').style.display='none';
  } catch(e) { msg.style.color='#ef4444'; msg.textContent='Erro de conexão'; }
}

// ===== RANKING GERAL (tela do usuário) =====
let rankJogo = 'airhockey', rankPer = 'semana';
function setRankJogo(j){
  rankJogo = j;
  document.getElementById('rjAir').style.borderColor = j==='airhockey'?'var(--gold)':'var(--border)';
  document.getElementById('rjAir').style.color = j==='airhockey'?'var(--gold)':'var(--muted)';
  document.getElementById('rjAir').style.background = j==='airhockey'?'rgba(240,192,64,.15)':'transparent';
  document.getElementById('rjFlap').style.borderColor = j==='flappy'?'var(--gold)':'var(--border)';
  document.getElementById('rjFlap').style.color = j==='flappy'?'var(--gold)':'var(--muted)';
  document.getElementById('rjFlap').style.background = j==='flappy'?'rgba(240,192,64,.15)':'transparent';
  carregarRankingGeral();
}
function setRankPer(p){
  rankPer = p;
  document.getElementById('rpSem').style.borderColor = p==='semana'?'var(--gold)':'var(--border)';
  document.getElementById('rpSem').style.color = p==='semana'?'var(--gold)':'var(--muted)';
  document.getElementById('rpSem').style.background = p==='semana'?'rgba(240,192,64,.1)':'transparent';
  document.getElementById('rpMes').style.borderColor = p==='mes'?'var(--gold)':'var(--border)';
  document.getElementById('rpMes').style.color = p==='mes'?'var(--gold)':'var(--muted)';
  document.getElementById('rpMes').style.background = p==='mes'?'rgba(240,192,64,.1)':'transparent';
  carregarRankingGeral();
}
async function carregarRankingGeral(){
  const el = document.getElementById('rankingGeralLista');
  el.innerHTML = '<div class="empty">Carregando...</div>';
  try {
    // Prêmios configurados
    const resP = await fetch(`/api/ranking-premios/${rankJogo}/${rankPer}`, {headers:{Authorization:'Bearer '+token}});
    const premios = await resP.json();
    const pInfo = document.getElementById('premiosInfo');
    if(premios.length){
      pInfo.innerHTML = '<div style="background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.2);border-radius:10px;padding:12px;"><div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:6px;">🏆 Prêmios deste ranking</div>' +
        premios.map(p=>`<span style="display:inline-block;font-size:12px;color:var(--text);margin-right:12px;">${p.posicao}º: <strong style="color:var(--gold)">R$${p.valor.toFixed(2)}</strong></span>`).join('') + '</div>';
    } else { pInfo.innerHTML=''; }

    const res = await fetch(`/api/ranking/${rankJogo}/${rankPer}`, {headers:{Authorization:'Bearer '+token}});
    const d = await res.json();
    if(!d.ranking || !d.ranking.length){ el.innerHTML='<div class="empty">Nenhum jogador no ranking ainda. Jogue para aparecer aqui! 🏆</div>'; return; }
    const medalhas=['🥇','🥈','🥉'];
    el.innerHTML = d.ranking.map((r,i)=>{
      const premiado = premios.find(p=>p.posicao===i+1);
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.05);${r.user_id===d.meuId?'background:rgba(240,192,64,.06);border-radius:8px;':''}">
        <div style="width:28px;text-align:center;font-size:${i<3?'18px':'14px'};font-weight:700;color:${i<3?'var(--gold)':'var(--muted)'};">${medalhas[i]||(i+1)}</div>
        <div style="flex:1;">
          <div style="font-size:14px;color:var(--text);">${r.nome}${r.user_id===d.meuId?' <span style="color:var(--gold);font-size:11px;">(você)</span>':''}</div>
          ${premiado?`<div style="font-size:11px;color:var(--green);">🏆 Prêmio: R$${premiado.valor.toFixed(2)}</div>`:''}
        </div>
        <div style="font-size:11px;color:var(--muted);">Nv${r.nivel||1}</div>
        <div style="font-size:15px;font-weight:700;color:${r.pontos>=0?'var(--green)':'#ef4444'};min-width:48px;text-align:right;">${r.pontos>0?'+':''}${r.pontos}</div>
      </div>`;
    }).join('');
  } catch(e){ el.innerHTML='<div class="empty">Erro ao carregar</div>'; }
}

// ===== ADMIN: INDICAÇÕES =====
async function carregarIndicacoesAdmin(){
  const el = document.getElementById('adminIndicacoes');
  try {
    const res = await fetch('/api/admin/indicacoes', {headers:{Authorization:'Bearer '+token}});
    const grupos = await res.json();
    if(!grupos.length){ el.innerHTML='<div class="empty">Nenhuma indicação ainda.</div>'; return; }
    el.innerHTML = grupos.map(g=>`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div><div style="font-weight:700;font-size:14px;">${g.nome}</div><div style="font-size:11px;color:var(--muted);">Código: ${g.codigo}</div></div>
          <div style="text-align:right;"><div style="font-size:16px;font-weight:700;color:var(--green);">R$${g.totalGanho.toFixed(2)}</div><div style="font-size:11px;color:var(--muted);">ganho</div></div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:8px;">
          ${g.indicados.map(i=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;">
              <span>${i.completo?'✅':'⏳'} ${i.nome}</span>
              <span style="color:${i.completo?'var(--green)':'var(--muted)'};">${i.completo?'R$5 pago':`${i.partidas}/50 partidas (faltam ${50-i.partidas})`}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  } catch(e){ el.innerHTML='<div class="empty">Erro ao carregar</div>'; }
}

// ===== ADMIN: RANKING + PRÊMIOS =====
let admRankJogo = 'airhockey', admRankPer = 'semana';
let premiosAtuais = [{posicao:1,valor:0}];

function setAdminRankJogo(j){
  admRankJogo = j;
  document.getElementById('arjAir').style.borderColor = j==='airhockey'?'var(--gold)':'var(--border)';
  document.getElementById('arjAir').style.color = j==='airhockey'?'var(--gold)':'var(--muted)';
  document.getElementById('arjAir').style.background = j==='airhockey'?'rgba(240,192,64,.15)':'transparent';
  document.getElementById('arjFlap').style.borderColor = j==='flappy'?'var(--gold)':'var(--border)';
  document.getElementById('arjFlap').style.color = j==='flappy'?'var(--gold)':'var(--muted)';
  document.getElementById('arjFlap').style.background = j==='flappy'?'rgba(240,192,64,.15)':'transparent';
  carregarRankAdmin();
}
function setAdminRankPer(p){
  admRankPer = p;
  document.getElementById('arpSem').style.borderColor = p==='semana'?'var(--gold)':'var(--border)';
  document.getElementById('arpSem').style.color = p==='semana'?'var(--gold)':'var(--muted)';
  document.getElementById('arpSem').style.background = p==='semana'?'rgba(240,192,64,.1)':'transparent';
  document.getElementById('arpMes').style.borderColor = p==='mes'?'var(--gold)':'var(--border)';
  document.getElementById('arpMes').style.color = p==='mes'?'var(--gold)':'var(--muted)';
  document.getElementById('arpMes').style.background = p==='mes'?'rgba(240,192,64,.1)':'transparent';
  carregarRankAdmin();
}
function renderPremiosConfig(){
  const el = document.getElementById('premiosConfig');
  el.innerHTML = premiosAtuais.map((p,i)=>`
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <span style="font-size:13px;color:var(--muted);min-width:50px;">${p.posicao}º lugar</span>
      <span style="font-size:13px;color:var(--muted);">R$</span>
      <input type="number" value="${p.valor}" onchange="premiosAtuais[${i}].valor=parseFloat(this.value)||0" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;color:var(--text);font-size:14px;">
      <button onclick="removerPosicaoPremio(${i})" style="padding:6px 10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:6px;font-size:12px;cursor:pointer;">✕</button>
    </div>
  `).join('');
}
function adicionarPosicaoPremio(){
  premiosAtuais.push({posicao: premiosAtuais.length+1, valor:0});
  renderPremiosConfig();
}
function removerPosicaoPremio(i){
  premiosAtuais.splice(i,1);
  premiosAtuais.forEach((p,idx)=>p.posicao=idx+1);
  renderPremiosConfig();
}
async function carregarRankAdmin(){
  // Carregar prêmios configurados
  try {
    const resP = await fetch(`/api/admin/ranking-premios/${admRankJogo}/${admRankPer}`, {headers:{Authorization:'Bearer '+token}});
    const premios = await resP.json();
    premiosAtuais = premios.length ? premios.map(p=>({posicao:p.posicao,valor:p.valor})) : [{posicao:1,valor:0}];
    renderPremiosConfig();
  } catch(e){ premiosAtuais=[{posicao:1,valor:0}]; renderPremiosConfig(); }
  // Carregar ranking atual
  const el = document.getElementById('adminRankLista');
  try {
    const res = await fetch(`/api/ranking/${admRankJogo}/${admRankPer}`, {headers:{Authorization:'Bearer '+token}});
    const d = await res.json();
    if(!d.ranking || !d.ranking.length){ el.innerHTML='<div class="empty">Ninguém no ranking ainda.</div>'; return; }
    const medalhas=['🥇','🥈','🥉'];
    el.innerHTML = d.ranking.map((r,i)=>`
      <div class="trans-item">
        <div style="width:28px;text-align:center;font-weight:700;color:${i<3?'var(--gold)':'var(--muted)'};">${medalhas[i]||(i+1)}</div>
        <div class="trans-desc"><div class="trans-name">${r.nome}</div><div class="trans-date">Nível ${r.nivel||1}</div></div>
        <div class="trans-val ${r.pontos>=0?'pos':'neg'}">${r.pontos>0?'+':''}${r.pontos} pts</div>
      </div>
    `).join('');
  } catch(e){ el.innerHTML='<div class="empty">Erro</div>'; }
}
async function salvarPremiosRanking(){
  try {
    const res = await fetch('/api/admin/ranking-premios', {
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body: JSON.stringify({ jogo: admRankJogo, periodo: admRankPer, premios: premiosAtuais })
    });
    const d = await res.json();
    if(!res.ok){ alert(d.erro); return; }
    alert('✅ Prêmios salvos!');
  } catch(e){ alert('Erro de conexão'); }
}
async function pagarPremiosRanking(){
  if(!confirm('Pagar os prêmios aos ganhadores atuais do ranking? Os valores serão creditados nas contas.')) return;
  try {
    const res = await fetch('/api/admin/ranking-premios/pagar', {
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body: JSON.stringify({ jogo: admRankJogo, periodo: admRankPer })
    });
    const d = await res.json();
    if(!res.ok){ alert(d.erro); return; }
    alert(`✅ ${d.pagos} jogador(es) premiado(s)!`);
  } catch(e){ alert('Erro de conexão'); }
}


// ===== STATUS DOS JOGOS (esconder desativados na tela inicial) =====
async function aplicarStatusJogos() {
  try {
    const res = await fetch('/api/jogos-status');
    const status = await res.json();
    // Mapear cada jogo ao seu elemento clicável na tela inicial
    const jogosMap = {
      airhockey: "/airhockey.html",
      flappy: "/flappy.html",
      xadrez: "/xadrez.html",
      sinuca: "/sinuca.html",
      domino: "/domino.html"
    };
    Object.entries(jogosMap).forEach(([jogo, url]) => {
      // Encontrar todos os cards que apontam para esse jogo
      const ativo = status[jogo] !== false; // default ativo se não tiver registro
      document.querySelectorAll(`[onclick*="${url}"]`).forEach(card => {
        if (!ativo) {
          card.style.opacity = '0.4';
          card.style.pointerEvents = 'none';
          card.style.position = 'relative';
          // Adicionar badge "Em breve" se ainda não tem
          if (!card.querySelector('.badge-inativo')) {
            const badge = document.createElement('div');
            badge.className = 'badge-inativo';
            badge.textContent = '🔒 Indisponível';
            badge.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;z-index:5;pointer-events:none;';
            card.appendChild(badge);
          }
        } else {
          card.style.opacity = '';
          card.style.pointerEvents = '';
          const b = card.querySelector('.badge-inativo');
          if (b) b.remove();
        }
      });
    });
  } catch(e) {}
}
function openGame(game) {
  alert(`🎮 ${game.charAt(0).toUpperCase() + game.slice(1)}\n\nEm breve disponível com apostas reais!`);
}