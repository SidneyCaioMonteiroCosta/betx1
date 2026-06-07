// services/govbr.js
// OAuth 2.0 com Gov.br (acesso.gov.br)
// Docs: https://manual-roteiro-integracao-login-unico.servicos.gov.br/

const https = require('https');

const GOVBR_AUTH_URL  = 'https://sso.acesso.gov.br/authorize';
const GOVBR_TOKEN_URL = 'https://sso.acesso.gov.br/token';
const GOVBR_INFO_URL  = 'https://sso.acesso.gov.br/userinfo';

// Scopes necessários para obter CPF, nome e data de nascimento
const SCOPES = 'openid+profile+email+cpf+dataNascimento';

function getConfig() {
  return {
    clientId:     process.env.GOVBR_CLIENT_ID,
    clientSecret: process.env.GOVBR_CLIENT_SECRET,
    redirectUri:  (process.env.PUBLIC_URL || 'http://localhost:3000') + '/api/kyc/govbr/callback'
  };
}

// Gera a URL de autorização do Gov.br
function buildAuthUrl(state) {
  const { clientId, redirectUri } = getConfig();
  return `${GOVBR_AUTH_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&nonce=${Date.now()}`;
}

// Troca o code pelo token de acesso
async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: redirectUri
  }).toString();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const url = new URL(GOVBR_TOKEN_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta inválida do Gov.br: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Busca os dados do usuário com o access_token
async function getUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(GOVBR_INFO_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta inválida do userinfo: ' + data)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { buildAuthUrl, exchangeCode, getUserInfo };
