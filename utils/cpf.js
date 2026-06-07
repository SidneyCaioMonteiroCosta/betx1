// utils/cpf.js
// Validação de CPF pelo algoritmo oficial (dígitos verificadores)
// + cálculo de idade pra checar 18+

function cleanCPF(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

function isValidCPF(cpf) {
  const c = cleanCPF(cpf);
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false; // 00000000000, 11111111111, etc.

  const calcDigit = (slice) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += parseInt(slice[i], 10) * (slice.length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcDigit(c.slice(0, 9));
  const d2 = calcDigit(c.slice(0, 10));
  return d1 === parseInt(c[9], 10) && d2 === parseInt(c[10], 10);
}

function formatCPF(cpf) {
  const c = cleanCPF(cpf);
  if (c.length !== 11) return cpf;
  return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}`;
}

// birthDate: 'YYYY-MM-DD' ou Date
function getAge(birthDate) {
  const b = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function isAdult(birthDate) {
  const age = getAge(birthDate);
  return age !== null && age >= 18;
}

module.exports = { cleanCPF, isValidCPF, formatCPF, getAge, isAdult };
