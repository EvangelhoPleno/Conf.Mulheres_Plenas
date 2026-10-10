/* Rotas da portaria (portaria.html): Authorization: Bearer <PORTARIA_SENHA>.
   Senha própria, separada do ADMIN_TOKEN: a equipe da porta vê a lista de
   nomes e CPFs, mas não reenvia e-mail nem mexe em pedido. */
const express = require('express');
const config = require('../config');
const { portaria } = require('../services/portariaService');
const { segredoConfere } = require('../utils/seguranca');
const { limitar } = require('../utils/limite');
const { PADRAO_INGRESSO } = require('../utils/codigos');

const router = express.Router();

// só as senhas erradas gastam a cota: os 4 celulares da porta saem pelo
// mesmo IP do Wi-Fi e não podem ser barrados por usarem a página
const tentativas = limitar({
    janelaMs: 10 * 60 * 1000,
    maximo: 15,
    contar: function (res) { return res.statusCode === 401; }
});

function exigirSenha(req, res, next) {
    if (!config.portariaSenha) return res.status(503).json({ erro: 'Portaria não configurada.' });
    const senha = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!segredoConfere(senha, config.portariaSenha)) {
        return res.status(401).json({ erro: 'Senha da portaria incorreta.' });
    }
    res.set('Cache-Control', 'no-store');
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

router.use('/portaria', tentativas, exigirSenha);

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
