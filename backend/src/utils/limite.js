/* Limite simples de requisições por IP, em memória. Em serverless cada
   instância conta separado, então é um freio contra abuso, não uma garantia. */
function limitar({ janelaMs, maximo }) {
    const contagem = new Map();

    return function (req, res, next) {
        const agora = Date.now();
        const chave = req.ip;
        const registro = contagem.get(chave);

        if (!registro || agora > registro.reinicia) {
            contagem.set(chave, { total: 1, reinicia: agora + janelaMs });
        } else if (++registro.total > maximo) {
            res.set('Retry-After', Math.ceil((registro.reinicia - agora) / 1000));
            return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
        }

        if (contagem.size > 5000) {
            for (const [ip, r] of contagem) if (agora > r.reinicia) contagem.delete(ip);
        }
        next();
    };
}

module.exports = { limitar };
