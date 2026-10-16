/* Rotas da portaria (portaria.html).
   Entrada em dois passos, só para os e-mails da aba "Usuários Portaria"
   (e os de PORTARIA_EMAILS):
     POST /portaria/codigo  { email }          -> código de 6 números por e-mail
     POST /portaria/entrar  { email, codigo }  -> sessão de 48 h
   Os dois passam pelo anti-robô (Turnstile). As demais rotas pedem
   Authorization: Bearer <sessão>. Acesso próprio, separado do ADMIN_TOKEN: a
   equipe da porta vê nomes e um pedaço do CPF, mas não reenvia e-mail nem
   mexe em pedido. */
const express = require('express');
const config = require('../config');
const { portaria, MOTIVO_LIVRE } = require('../services/portariaService');
const acesso = require('../services/portariaAcesso');
const { enviarCodigoPortaria } = require('../services/emailService');
const { pareceHumano } = require('../utils/antiRobo');
const { limitar } = require('../utils/limite');
const { PADRAO_INGRESSO } = require('../utils/codigos');

const router = express.Router();
const DEZ_MIN = 10 * 60 * 1000;

// pedir código: por IP (os celulares da porta dividem o Wi-Fi) e por e-mail.
// 5 pessoas da equipe entrando juntas, com um ou outro reenvio, passavam de 12;
// o e-mail só sai para quem está na aba, e o limite por e-mail continua 4
const pedidosPorIp = limitar({ janelaMs: DEZ_MIN, maximo: 30 });
const pedidosPorEmail = limitar({ janelaMs: DEZ_MIN, maximo: 4, chave: function (req) { return 'e:' + req.emailPortaria; } });
// código errado: 5 por e-mail e 15 por IP a cada 10 minutos. O do e-mail
// reserva a vaga na chegada: chutes mandados juntos não passam do limite
const errosPorEmail = limitar({
    janelaMs: DEZ_MIN, maximo: 5, reservar: true,
    chave: function (req) { return 'e:' + req.emailPortaria; },
    contar: function (res) { return res.statusCode === 401; }
});
// só as respostas 401 gastam a cota: quem está usando a página não é barrado
const errosPorIp = limitar({ janelaMs: DEZ_MIN, maximo: 15, contar: function (res) { return res.statusCode === 401; } });

function ligada(req, res, next) {
    if (!config.portaria.configurada) return res.status(503).json({ erro: 'Check-in não configurado.' });
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
    if (await acesso.autorizado(email)) {
        try {
            await enviarCodigoPortaria(email, acesso.codigoAtual(email));
        } catch (erro) {
            console.error('[portaria] código não enviado:', erro.message);
            return res.status(502).json({ erro: 'Não consegui enviar o e-mail agora. Tente de novo em instantes.' });
        }
    }
    res.json({ ok: true });
});

router.post('/portaria/entrar', ligada, errosPorIp, comEmail, errosPorEmail, humano, async function (req, res) {
    const email = req.emailPortaria;
    if (!(await acesso.codigoConfere(email, req.body && req.body.codigo))) {
        return res.status(401).json({ erro: 'Código incorreto ou vencido.' });
    }
    console.log('[portaria] entrou:', email);
    res.json(acesso.criarSessao(email));
});

async function exigirSessao(req, res, next) {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const email = await acesso.lerSessao(token);
    if (!email) return res.status(401).json({ erro: 'Sessão do check-in vencida. Entre de novo.' });
    req.usuarioPortaria = email;  // o e-mail da sessão não é digitado: vai para o registro dos desfeitos
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

// texto digitado na porta: uma linha só, sem caracteres de controle
function limpo(valor, maximo) {
    return String(valor == null ? '' : valor).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximo);
}

/* Desfazer exige motivo: um dos prontos da página ou "Outro motivo" com o
   texto escrito. A página antiga (guardada no celular) não manda motivo e
   cai aqui: a mensagem manda recarregar. */
function motivoValido(req, res, next) {
    const motivo = limpo(req.body && req.body.motivo, 60);
    const detalhe = limpo(req.body && req.body.detalhe, 200);
    if (motivo.length < 3) {
        return res.status(422).json({ erro: 'Escolha o motivo para desfazer o check-in. Se a tela não pediu o motivo, recarregue a página.' });
    }
    if (motivo === MOTIVO_LIVRE && detalhe.length < 3) {
        return res.status(422).json({ erro: 'Escreva o motivo para desfazer o check-in.' });
    }
    req.motivo = { motivo: motivo, detalhe: detalhe };
    next();
}

/* Check-in especial: a pessoa é a linha + o nome que a página mostrou
   (a aba não tem código; o servidor confere o nome na planilha) */
function pessoaEspecial(req, res, next) {
    const linha = Number(req.body && req.body.linha);
    const nome = limpo(req.body && req.body.nome, 120);
    if (!Number.isInteger(linha) || linha < 2 || linha > 5000 || !nome) {
        return res.status(422).json({ erro: 'Pessoa inválida. Atualize a página.' });
    }
    req.especial = { linha: linha, nome: nome };
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

router.post('/portaria/desfazer', codigoValido, motivoValido, async function (req, res) {
    res.json(await portaria().desfazer(req.codigo, {
        motivo: req.motivo.motivo,
        detalhe: req.motivo.detalhe,
        por: quem(req),
        email: req.usuarioPortaria
    }));
});

router.post('/portaria/especial/entrada', pessoaEspecial, async function (req, res) {
    const r = await portaria().confirmarEspecial(req.especial.linha, req.especial.nome, quem(req));
    res.status(r.situacao === 'ja-entrou' ? 409 : 200).json(r);
});

router.post('/portaria/especial/desfazer', pessoaEspecial, motivoValido, async function (req, res) {
    res.json(await portaria().desfazerEspecial(req.especial.linha, req.especial.nome, {
        motivo: req.motivo.motivo,
        detalhe: req.motivo.detalhe,
        por: quem(req),
        email: req.usuarioPortaria
    }));
});

module.exports = router;
