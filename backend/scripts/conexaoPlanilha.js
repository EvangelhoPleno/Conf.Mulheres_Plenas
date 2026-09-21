/* Conexão compartilhada pelos comandos planilha:testar e planilha:preparar. */
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('../src/config');

function conferirConfiguracao() {
    const faltando = [];
    if (!config.google.planilhaId) faltando.push('GOOGLE_SHEET_ID no .env (pode ser o link inteiro da planilha)');
    if (!config.google.email || !config.google.chave) {
        faltando.push('a credencial: salve o JSON do Google Cloud como backend/credenciais-google.json');
    }
    if (faltando.length) {
        console.error('Falta configurar:');
        faltando.forEach(function (item) { console.error('  -', item); });
        process.exit(1);
    }
}

async function abrirPlanilha() {
    conferirConfiguracao();
    const auth = new JWT({
        email: config.google.email,
        key: config.google.chave,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const doc = new GoogleSpreadsheet(config.google.planilhaId, auth);
    await doc.loadInfo();
    return doc;
}

function explicarErro(erro) {
    const texto = String(erro && (erro.message || erro));
    console.error('\nFalhou:', texto);
    if (/invalid_grant|DECODER|private key|PEM/i.test(texto)) {
        console.error('→ Chave inválida ou apagada. Baixe de novo o JSON da conta de serviço e salve como credenciais-google.json.');
    } else if (/has not been used|disabled/i.test(texto)) {
        console.error('→ Ative a Google Sheets API no Google Cloud Console e espere 1 ou 2 minutos.');
    } else if (/403|permission|PERMISSION_DENIED/i.test(texto)) {
        console.error('→ Compartilhe a planilha com', config.google.email, 'como EDITOR (botão Compartilhar).');
        console.error('→ Confira se a Google Sheets API está ativada no projeto do Google Cloud.');
    } else if (/404|not found|NOT_FOUND/i.test(texto)) {
        console.error('→ ID da planilha errado. Use o trecho entre /d/ e /edit do link, ou o link inteiro.');
    } else if (/ESHEETNAME|Excel|xlsx|This operation is not supported/i.test(texto)) {
        console.error('→ O arquivo é .xlsx. No Google, use Arquivo > Salvar como Planilhas Google e use o link do novo arquivo.');
    }
    process.exit(1);
}

module.exports = { config, abrirPlanilha, explicarErro };
