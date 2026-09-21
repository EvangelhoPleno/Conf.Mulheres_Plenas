const crypto = require('crypto');

// compara segredos sem vazar, pelo tempo de resposta, quantos caracteres bateram
function segredoConfere(recebido, esperado) {
    if (!recebido || !esperado) return false;
    const a = crypto.createHash('sha256').update(String(recebido)).digest();
    const b = crypto.createHash('sha256').update(String(esperado)).digest();
    return crypto.timingSafeEqual(a, b);
}

module.exports = { segredoConfere };
