/* Notificação de pagamento do gateway. */
const express = require('express');
const { pagamento } = require('../services/pagamento');
const pedidoService = require('../services/pedidoService');

const router = express.Router();

router.post('/webhook', async function (req, res) {
    const provedor = pagamento();

    if (!provedor.validarWebhook(req)) {
        console.warn('[webhook] assinatura/token inválido de', req.ip);
        return res.status(401).json({ ok: false });
    }

    const aviso = provedor.lerWebhook(req);
    if (!aviso) {
        // formato que não conhecemos: 200 para o gateway não ficar reenviando
        console.warn('[webhook] corpo sem ID de transação:', JSON.stringify(req.body).slice(0, 500));
        return res.status(200).json({ ok: true, ignorado: true });
    }

    try {
        const resultado = await pedidoService.processarNotificacao(aviso.transacaoId);
        console.log('[webhook]', aviso.transacaoId, resultado);
        res.status(200).json({ ok: true });
    } catch (erro) {
        // Falha nossa (planilha fora do ar, por exemplo): responde 500 de
        // propósito para o gateway tentar de novo mais tarde. Pedidos já
        // processados não são duplicados na nova tentativa.
        console.error('[webhook] erro ao processar', aviso.transacaoId, erro);
        res.status(500).json({ ok: false });
    }
});

module.exports = router;
