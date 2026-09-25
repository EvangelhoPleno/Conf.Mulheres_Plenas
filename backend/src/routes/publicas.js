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
const { pareceHumano } = require('../utils/antiRobo');

const router = express.Router();

const CORES_QR = { dark: '#3E1A10', light: '#FFFFFF' };

/* A página de pagamento consulta a cada 5 s e cada resposta leva o QR do
   Pix: gerar o PNG de novo toda vez era CPU jogada fora. O copia-e-cola não
   muda durante a vida do pedido, então o QR fica guardado por ele. */
const qrsDoPix = new Map();

async function comQrDoPix(visao) {
    if (visao.pix && visao.pix.copiaECola) {
        const codigo = visao.pix.copiaECola;
        let qr = qrsDoPix.get(codigo);
        if (!qr) {
            qr = await QRCode.toDataURL(codigo, { margin: 1, width: 320, color: CORES_QR });
            if (qrsDoPix.size >= 500) qrsDoPix.delete(qrsDoPix.keys().next().value);  // o mais antigo sai
            qrsDoPix.set(codigo, qr);
        }
        visao.pix.qrCode = qr;
    }
    return visao;
}

router.get('/saude', function (req, res) {
    const provedor = pagamento();
    const saude = {
        ok: true,
        pagamento: provedor.nome,
        simulado: Boolean(provedor.simulado),
        metodos: provedor.metodos,
        planilha: pedidos().tipo,
        email: config.email.configurado ? 'resend' : 'desligado',
        antiRobo: Boolean(config.turnstile.segredo)
    };

    /* Sem o Access Token toda compra dá 503; sem a assinatura secreta todo
       webhook dá 401 e o ingresso só sai quando ela abre a página de pagamento.
       Os dois derrubam o ok — e nenhum segredo sai daqui. */
    if (provedor.nome === 'mercadopago') {
        saude.mercadopago = {
            ambiente: config.mercadoPago.ambiente,
            credencial: config.mercadoPago.configurado,
            webhookAssinado: Boolean(config.mercadoPago.webhookSecret),
            parcelasMax: config.mercadoPago.parcelasMax
        };
        if (!config.mercadoPago.configurado || !config.mercadoPago.webhookSecret) saude.ok = false;
    }

    /* No ar, venda simulada ou pedido em memória fecham o checkout, e sem
       e-mail o ingresso nunca chega: nenhum deles pode passar por "ok". */
    if (config.ambiente === 'production' && (saude.simulado || saude.planilha === 'memoria' || !config.email.configurado)) {
        saude.ok = false;
    }

    res.json(saude);
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

/* Limites pensados para o culto em que o link é divulgado: 20–30 mulheres
   comprando juntas, todas atrás do MESMO IP do Wi-Fi da igreja (ou da mesma
   operadora). O checkout conta por IP, com folga para o salão inteiro; a
   consulta de status conta por IP + pedido — cada página consulta a cada 5 s
   (12/min) e uma não pode gastar a cota da vizinha. */
const limiteCheckout = limitar({ janelaMs: 10 * 60 * 1000, maximo: 60 });
const limiteConsultaPorPedido = limitar({
    janelaMs: 60 * 1000,
    maximo: 40,
    chave: function (req) { return req.ip + ' ' + req.params.pedidoId; }
});
const limiteConsultaPorIp = limitar({ janelaMs: 60 * 1000, maximo: 900 });
/* Quem procura pedido que não existe está chutando IDs: a compradora de
   verdade só abre o link que o checkout lhe deu. Cada chute custava uma
   leitura do Google; 30 em 10 min por IP é folga até para o Wi-Fi da igreja. */
const limiteNaoEncontrado = limitar({
    janelaMs: 10 * 60 * 1000,
    maximo: 30,
    contar: function (res) { return res.statusCode === 404; }
});

router.post('/checkout', limiteCheckout, async function (req, res) {
    const corpo = req.body || {};
    if (!(await pareceHumano(corpo.turnstile, req.ip))) {
        return res.status(403).json({ erro: 'Não conseguimos concluir a verificação de segurança. Recarregue a página e tente de novo.' });
    }
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

router.get('/pedidos/:pedidoId', limiteNaoEncontrado, limiteConsultaPorIp, limiteConsultaPorPedido, async function (req, res) {
    if (!PADRAO_PEDIDO.test(req.params.pedidoId)) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const pedido = await pedidoService.consultarPedido(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.set('Cache-Control', 'no-store');
    res.json(await comQrDoPix(pedidoService.visaoPublica(pedido)));
});

/* Imagem do QR Code do ingresso. Nenhuma tela usa mais (vale o código, desde
   e9ccd28), mas os e-mails enviados antes disso carregam a imagem daqui.
   Cada chamada gera um PNG: o limite por IP impede que isso vire um jeito
   barato de ocupar a função. Quem abre o e-mail pede uma imagem por ingresso. */
const limiteQrDoIngresso = limitar({ janelaMs: 60 * 1000, maximo: 30 });

router.get('/ingressos/:codigo/qr.png', limiteQrDoIngresso, async function (req, res) {
    const codigo = String(req.params.codigo).toUpperCase();
    if (!PADRAO_INGRESSO.test(codigo)) return res.status(404).end();
    const png = await QRCode.toBuffer(codigo, { margin: 1, width: 360, color: CORES_QR, errorCorrectionLevel: 'M' });
    // s-maxage: a borda da Vercel guarda a imagem e as repetições nem chegam à função
    res.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.type('png').send(png);
});

module.exports = router;
