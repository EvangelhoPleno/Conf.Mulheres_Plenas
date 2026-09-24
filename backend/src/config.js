/* Lê o .env uma vez só e expõe tudo já tratado. Nenhum outro arquivo
   deve ler process.env diretamente. */
const fs = require('fs');
const path = require('path');
/* O .env fica em backend/, mas os comandos agora rodam da raiz do projeto
   (é de lá que a Vercel monta o site e a função). Apontar o caminho na mão
   evita depender de onde o comando foi chamado. */
require('dotenv').config({ quiet: true, path: path.resolve(__dirname, '..', '.env') });

function lista(valor) {
    return (valor || '')
        .split(',')
        .map(function (item) { return item.trim().replace(/\/+$/, ''); })
        .filter(Boolean);
}

function semBarraFinal(url, padrao) {
    return (url || padrao).trim().replace(/\/+$/, '');
}

// A chave do Google costuma chegar com "\n" literais quando colada numa
// variável de ambiente; aqui voltam a ser quebras de linha de verdade.
function chavePrivada(valor) {
    if (!valor) return '';
    return valor.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

// aceita o ID puro ou o link inteiro da planilha (https://docs.google.com/spreadsheets/d/<ID>/edit...)
function idDaPlanilha(valor) {
    const texto = String(valor || '').trim();
    const achado = texto.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return achado ? achado[1] : texto;
}

// Credencial do Google: variáveis de ambiente (Vercel) ou, no computador, o
// arquivo JSON baixado do Google Cloud salvo como backend/credenciais-google.json
function credencialGoogle() {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim(), chave: chavePrivada(process.env.GOOGLE_PRIVATE_KEY), origem: 'variáveis de ambiente' };
    }
    const arquivo = path.resolve(__dirname, '..', process.env.GOOGLE_CREDENTIALS_FILE || 'credenciais-google.json');
    if (fs.existsSync(arquivo)) {
        try {
            const json = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
            return { email: json.client_email || '', chave: json.private_key || '', origem: path.basename(arquivo) };
        } catch (erro) {
            console.error('[config] não consegui ler', arquivo, '-', erro.message);
        }
    }
    return { email: '', chave: '', origem: '' };
}

const credencial = credencialGoogle();

const siteUrl = semBarraFinal(process.env.SITE_URL, 'https://evangelhopleno.github.io/Conf.Mulheres_Plenas');
const siteOrigem = new URL(siteUrl).origin;

const config = {
    ambiente: process.env.NODE_ENV || 'development',
    porta: Number(process.env.PORT) || 3000,
    siteUrl,
    apiUrl: semBarraFinal(process.env.API_URL, 'http://localhost:3000'),
    origensPermitidas: Array.from(new Set([siteOrigem].concat(lista(process.env.ALLOWED_ORIGINS)))),

    pagamento: {
        provedor: (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase()
    },

    mercadoPago: {
        accessToken: (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim(),
        // "Assinatura secreta" do webhook, no painel Suas integrações
        webhookSecret: (process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim(),
        // só a auditoria usa: gera o token de um cartão de teste
        publicKey: (process.env.MERCADOPAGO_PUBLIC_KEY || '').trim(),
        // máximo de parcelas oferecidas no cartão (1 = só à vista)
        parcelasMax: Math.max(1, Math.min(12, Number(process.env.MERCADOPAGO_PARCELAS_MAX) || 1))
    },

    google: {
        planilhaId: idDaPlanilha(process.env.GOOGLE_SHEET_ID),
        email: credencial.email,
        chave: credencial.chave,
        origemCredencial: credencial.origem,
        aba: 'Pedidos'
    },

    email: {
        resendApiKey: process.env.RESEND_API_KEY || '',
        remetente: process.env.EMAIL_FROM || 'Ingressos Conferência <onboarding@resend.dev>',
        responderPara: process.env.EMAIL_REPLY_TO || ''
    },

    adminToken: process.env.ADMIN_TOKEN || ''
};

// fora de produção, o site aberto no próprio computador (Live Server etc.) também pode chamar a API
if (config.ambiente !== 'production') {
    ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080', 'http://127.0.0.1:8080'].forEach(function (origem) {
        if (!config.origensPermitidas.includes(origem)) config.origensPermitidas.push(origem);
    });
}

/* O Mercado Pago tem uma URL só; quem diz o ambiente é a credencial.
   TEST-... é de teste; APP_USR-... é de produção (ou de um usuário de teste,
   que o Mercado Pago também trata como teste do lado dele). */
config.mercadoPago.ambiente = config.mercadoPago.accessToken.startsWith('TEST-') ? 'teste' : 'producao';
config.mercadoPago.configurado = Boolean(config.mercadoPago.accessToken);

config.google.configurado = Boolean(config.google.planilhaId && config.google.email && config.google.chave);
config.email.configurado = Boolean(config.email.resendApiKey);

module.exports = config;
