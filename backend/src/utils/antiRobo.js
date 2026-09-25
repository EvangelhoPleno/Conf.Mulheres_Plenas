/* Cloudflare Turnstile no checkout: cada POST /api/checkout cria um Pix de
   verdade no Mercado Pago e gasta uma das 60 escritas/min da planilha. Sem
   isto, um script com alguns IPs enchia a aba Pedidos de pedidos falsos e
   esgotava a cota do Google — as compradoras de verdade ficavam sem vender.

   Só vale com TURNSTILE_SECRET_KEY definida. A ordem para ligar é:
   1. turnstileSiteKey no config.js (o site passa a mandar o token);
   2. depois TURNSTILE_SECRET_KEY na Vercel (o servidor passa a exigir).
   Na ordem inversa, todo checkout seria recusado.
   Documentação: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ */
const axios = require('axios');
const config = require('../config');

const VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function pareceHumano(token, ip) {
    if (!config.turnstile.segredo) return true;
    if (typeof token !== 'string' || !token || token.length > 2048) return false;

    let dados;
    try {
        const resposta = await axios.post(VERIFICAR, new URLSearchParams({
            secret: config.turnstile.segredo,
            response: token,
            remoteip: ip || ''
        }), { timeout: 8000 });
        dados = resposta.data || {};
    } catch (erro) {
        /* Cloudflare fora do ar: deixa passar. Barrar aqui fecharia a venda
           de todo mundo por causa de um terceiro; o limite por IP continua
           valendo, e o Pix só vira ingresso se for pago. */
        console.error('[anti-robô] verificação indisponível, deixando passar:', erro.message);
        return true;
    }

    if (!dados.success) {
        console.warn('[anti-robô] token recusado:', (dados['error-codes'] || []).join(', '));
        return false;
    }
    // o token de outro widget (outra ação) não serve para comprar
    return !dados.action || dados.action === 'checkout';
}

module.exports = { pareceHumano };
