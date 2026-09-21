/* Rotas de apoio da organização e do modo de teste. */
const express = require('express');
const config = require('../config');
const { pagamento } = require('../services/pagamento');
const { pedidos } = require('../services/sheetsService');
const pedidoService = require('../services/pedidoService');
const { segredoConfere } = require('../utils/seguranca');

const router = express.Router();

/* ---------- modo de teste: só existe com PAYMENT_PROVIDER=mock ---------- */
router.post('/dev/simular-pagamento/:pedidoId', async function (req, res) {
    const provedor = pagamento();
    if (!provedor.simulado) return res.status(404).json({ erro: 'Não encontrado.' });

    const pedido = await pedidos().buscarPorId(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    provedor.marcarComoPago(pedido.transacaoId);
    const atualizado = await pedidoService.confirmarPagamento(pedido.pedidoId);
    res.json(pedidoService.visaoPublica(atualizado));
});

/* ---------- administração: Authorization: Bearer <ADMIN_TOKEN> ---------- */
function exigirAdmin(req, res, next) {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!config.adminToken || !segredoConfere(token, config.adminToken)) {
        return res.status(401).json({ erro: 'Não autorizado.' });
    }
    next();
}

router.get('/admin/pedidos/:pedidoId', exigirAdmin, async function (req, res) {
    const pedido = await pedidos().buscarPorId(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(pedido);
});

router.post('/admin/pedidos/:pedidoId/reenviar-email', exigirAdmin, async function (req, res) {
    const pedido = await pedidos().buscarPorId(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.status !== 'PAGO') return res.status(409).json({ erro: 'Pedido não está pago.' });

    const atualizado = await pedidoService.enviarEmailDoPedido(pedido, { reenvio: true });
    res.json({ emailEnviado: atualizado.emailEnviado });
});

module.exports = router;
