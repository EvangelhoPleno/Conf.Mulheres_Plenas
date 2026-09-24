/* Monta o app Express. Não chama listen(): quem sobe é o server.js
   (local) ou o api/index.js (Vercel). */
const express = require('express');
const cors = require('cors');
const config = require('./config');

function criarApp() {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    app.use(cors({
        origin: function (origem, callback) {
            // sem Origin = chamada servidor-a-servidor (webhook, curl)
            callback(null, !origem || config.origensPermitidas.includes(origem));
        },
        methods: ['GET', 'POST'],
        maxAge: 600
    }));

    app.use(express.json({ limit: '100kb' }));
    app.use(express.urlencoded({ extended: false, limit: '100kb' }));

    app.get('/', function (req, res) {
        res.json({ servico: 'Conferência Mulheres Plenas — API de ingressos', saude: '/api/saude' });
    });

    app.use('/api', require('./routes/publicas'));
    app.use('/api', require('./routes/webhook'));
    app.use('/api', require('./routes/admin'));

    app.use(function (req, res) {
        res.status(404).json({ erro: 'Rota não encontrada.' });
    });

    // Express 5 já encaminha para cá os erros de funções async
    // eslint-disable-next-line no-unused-vars
    app.use(function (erro, req, res, next) {
        if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });

        const status = erro.status || 500;
        if (status >= 500) console.error('[erro]', req.method, req.originalUrl, erro);

        res.status(status).json({
            erro: erro.publico || 'Não foi possível concluir agora. Tente novamente em instantes.',
            erros: erro.erros
        });
    });

    return app;
}

module.exports = { criarApp };
