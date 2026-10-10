/* =============================================================
   Quem entra na página da portaria: só os e-mails de PORTARIA_EMAILS.
   A pessoa digita o e-mail, recebe um código de 6 números e, com ele, ganha
   uma sessão que vale 48 h naquele aparelho. Nada disso é guardado: código
   e sessão são assinaturas feitas com PORTARIA_SEGREDO, então qualquer
   instância da Vercel confere o que outra emitiu.
   Tirar um e-mail da lista derruba a sessão dele no próximo toque.
   ============================================================= */
const crypto = require('crypto');
const config = require('../config');
const { segredoConfere } = require('../utils/seguranca');

const JANELA_MS = 10 * 60 * 1000;        // o código vale de 10 a 20 minutos
const SESSAO_MS = 48 * 60 * 60 * 1000;   // cobre a sexta à noite e o sábado

function assinar(texto) {
    return crypto.createHmac('sha256', config.portaria.segredo).update(texto).digest();
}

function normalizarEmail(valor) {
    return String(valor || '').trim().toLowerCase().slice(0, 120);
}

function autorizado(email) {
    return Boolean(email) && config.portaria.emails.includes(email);
}

function codigoDaJanela(email, janela) {
    const numero = assinar('codigo|' + email + '|' + janela).readUInt32BE(0) % 1000000;
    return String(numero).padStart(6, '0');
}

function codigoAtual(email, agora) {
    return codigoDaJanela(email, Math.floor((agora || Date.now()) / JANELA_MS));
}

// aceita o código desta janela e o da anterior (quem pediu no fim de uma)
function codigoConfere(email, codigo, agora) {
    codigo = String(codigo || '').replace(/\D/g, '');
    if (codigo.length !== 6 || !autorizado(email)) return false;
    const janela = Math.floor((agora || Date.now()) / JANELA_MS);
    return segredoConfere(codigo, codigoDaJanela(email, janela)) ||
        segredoConfere(codigo, codigoDaJanela(email, janela - 1));
}

function criarSessao(email, agora) {
    const vence = (agora || Date.now()) + SESSAO_MS;
    const corpo = Buffer.from(JSON.stringify({ e: email, x: vence })).toString('base64url');
    return { sessao: corpo + '.' + assinar('sessao|' + corpo).toString('base64url'), vence: vence };
}

// devolve o e-mail da sessão, ou null (assinatura errada, vencida, e-mail fora da lista)
function lerSessao(token, agora) {
    const partes = String(token || '').split('.');
    if (partes.length !== 2 || !partes[0] || token.length > 600) return null;
    if (!segredoConfere(partes[1], assinar('sessao|' + partes[0]).toString('base64url'))) return null;
    try {
        const dados = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'));
        if (typeof dados.x !== 'number' || dados.x < (agora || Date.now())) return null;
        return autorizado(dados.e) ? dados.e : null;
    } catch (erro) {
        return null;
    }
}

module.exports = { normalizarEmail, autorizado, codigoAtual, codigoConfere, criarSessao, lerSessao };
