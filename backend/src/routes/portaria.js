/* Rotas da portaria (portaria.html).
   Entrada em dois passos, só para os e-mails de PORTARIA_EMAILS:
     POST /portaria/codigo  { email }          -> código de 6 números por e-mail
     POST /portaria/entrar  { email, codigo }  -> sessão de 48 h
   Os dois passam pelo anti-robô (Turnstile). As demais rotas pedem
   Authorization: Bearer <sessão>. Acesso próprio, separado do ADMIN_TOKEN: a
   equipe da porta vê nomes e um pedaço do CPF, mas não reenvia e-mail nem
   mexe em pedido. */
const express = require('express');
const config = require('../config');
const { portaria } = require('../services/portariaService');
const acesso = require('../services/portariaAcesso');
const { enviarCodigoPortaria } = require('../services/emailService');
const { pareceHumano } = require('../utils/antiRobo');
const { limitar } = require('../utils/limite');
const { PADRAO_INGRESSO } = require('../utils/codigos');

const router = express.Router();
const DEZ_MIN = 10 * 60 * 1000;

// pedir código: por IP (os celulares da porta dividem o Wi-Fi) e por e-mail
const pedidosPorIp = limitar({ janelaMs: DEZ_MIN, maximo: 12 });
const pedidosPorEmail = limitar({ janelaMs: DEZ_MIN, maximo: 4, chave: function (req) { return 'e:' + req.emailPortaria; } });
// código errado: 5 por e-mail e 15 por IP a cada 10 minutos
const errosPorEmail = limitar({
    janelaMs: DEZ_MIN, maximo: 5,
    chave: function (req) { return 'e:' + req.emailPortaria; },
    contar: function (res) { return res.statusCode === 401; }
});
// só as respostas 401 gastam a cota: quem está usando a página não é barrado
const errosPorIp = limitar({ janelaMs: DEZ_MIN, maximo: 15, contar: function (res) { return res.statusCode === 401; } });

function ligada(req, res, next) {
    if (!config.portaria.configurada) return res.status(503).json({ erro: 'Portaria não configurada.' });
    res.set('Cache-Control', 'no-store');
    next();
}

function comEmail(req, res, next) {
    const email = acesso.normalizarEmail(req.body && req.body.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(422).json({ erro: 'Digite um e-mail válido.' });
    req.emailPortaria = email;
    next();
}

async function humano(req, res, next) {
    if (await pareceHumano(req.body && req.body.turnstile, req.ip, 'portaria')) return next();
    res.status(403).json({ erro: 'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.' });
}

/* A resposta é a mesma para e-mail cadastrado ou não: quem está de fora não
   descobre quais e-mails têm acesso. */
router.post('/portaria/codigo', ligada, pedidosPorIp, comEmail, humano, pedidosPorEmail, async function (req, res) {
    const email = req.emailPortaria;
    if (acesso.autorizado(email)) {
        try {
            await enviarCodigoPortaria(email, acesso.codigoAtual(email));
        } catch (erro) {
            console.error('[portaria] código não enviado:', erro.message);
            return res.status(502).json({ erro: 'Não consegui enviar o e-mail agora. Tente de novo em instantes.' });
        }
    }
    res.json({ ok: true });
});

router.post('/portaria/entrar', ligada, errosPorIp, comEmail, errosPorEmail, humano, function (req, res) {
    const email = req.emailPortaria;
    if (!acesso.codigoConfere(email, req.body && req.body.codigo)) {
        return res.status(401).json({ erro: 'Código incorreto ou vencido.' });
    }
    console.log('[portaria] entrou:', email);
    res.json(acesso.criarSessao(email));
});

function exigirSessao(req, res, next) {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!acesso.lerSessao(token)) return res.status(401).json({ erro: 'Sessão da portaria vencida. Entre de novo.' });
    next();
}

// nome de quem está na porta, para a coluna Entrada ("18:42 · Ana")
function quem(req) {
    return String((req.body && req.body.por) || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 30);
}

function codigoValido(req, res, next) {
    const codigo = String((req.body && req.body.codigo) || '').trim().toUpperCase();
    if (!PADRAO_INGRESSO.test(codigo)) return res.status(422).json({ erro: 'Código de ingresso inválido.' });
    req.codigo = codigo;
    next();
}

router.use('/portaria', ligada, errosPorIp, exigirSessao);

router.get('/portaria/lista', async function (req, res) {
    res.json(await portaria().listar());
});

router.post('/portaria/entrada', codigoValido, async function (req, res) {
    const r = await portaria().confirmar(req.codigo, quem(req));
    res.status(r.situacao === 'ja-entrou' ? 409 : 200).json(r);
});

router.post('/portaria/desfazer', codigoValido, async function (req, res) {
    res.json(await portaria().desfazer(req.codigo));
});

module.exports = router;
