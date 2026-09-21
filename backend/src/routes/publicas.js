/* Rotas chamadas pelo site. */
const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');
const { listarProdutos, formatarReais, evento } = require('../catalogo');
const { pagamento } = require('../services/pagamento');
const { pedidos } = require('../services/sheetsService');
const pedidoService = require('../services/pedidoService');
const { PADRAO_INGRESSO, PADRAO_PEDIDO } = require('../utils/codigos');
const { limitar } = require('../utils/limite');

const router = express.Router();

const CORES_QR = { dark: '#3E1A10', light: '#FFFFFF' };

async function comQrDoPix(visao) {
    if (visao.pix && visao.pix.copiaECola) {
        visao.pix.qrCode = await QRCode.toDataURL(visao.pix.copiaECola, { margin: 1, width: 320, color: CORES_QR });
    }
    return visao;
}

router.get('/saude', function (req, res) {
    const provedor = pagamento();
    res.json({
        ok: true,
        pagamento: provedor.nome,
        simulado: Boolean(provedor.simulado),
        metodos: provedor.metodos,
        planilha: pedidos().tipo,
        email: config.email.configurado ? 'resend' : 'desligado'
    });
});

router.get('/produtos', function (req, res) {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
        evento,
        metodos: pagamento().metodos,
        simulado: Boolean(pagamento().simulado),
        produtos: listarProdutos().map(function (p) {
            return Object.assign({}, p, { precoFormatado: formatarReais(p.precoUnitario) });
        })
    });
});

router.post('/checkout', limitar({ janelaMs: 10 * 60 * 1000, maximo: 12 }), async function (req, res) {
    const corpo = req.body || {};
    const { pedido } = await pedidoService.criarPedido({
        produto: corpo.produto,
        quantidade: corpo.quantidade,
        metodo: corpo.metodo,
        nome: corpo.nome,
        email: corpo.email,
        cpf: corpo.cpf,
        telefone: corpo.telefone
    });

    const visao = await comQrDoPix(pedidoService.visaoPublica(pedido));
    res.status(201).json(Object.assign(visao, {
        // o site vai para cá: a página de pagamento mostra o Pix ou
        // redireciona para o link do cartão
        proximaEtapa: config.siteUrl + '/pagamento.html?pedido=' + encodeURIComponent(pedido.pedidoId)
    }));
});

router.get('/pedidos/:pedidoId', limitar({ janelaMs: 60 * 1000, maximo: 40 }), async function (req, res) {
    if (!PADRAO_PEDIDO.test(req.params.pedidoId)) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const pedido = await pedidoService.consultarPedido(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.set('Cache-Control', 'no-store');
    res.json(await comQrDoPix(pedidoService.visaoPublica(pedido)));
});

// imagem do QR Code do ingresso (usada no e-mail e na página de confirmação)
router.get('/ingressos/:codigo/qr.png', async function (req, res) {
    const codigo = String(req.params.codigo).toUpperCase();
    if (!PADRAO_INGRESSO.test(codigo)) return res.status(404).end();
    const png = await QRCode.toBuffer(codigo, { margin: 1, width: 360, color: CORES_QR, errorCorrectionLevel: 'M' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('png').send(png);
});

module.exports = router;
