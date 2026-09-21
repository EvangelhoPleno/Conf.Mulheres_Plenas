/* =============================================================
   Confere se o backend consegue usar a planilha (npm run planilha:testar)
   Lê as abas, confere o cabeçalho e grava + apaga uma linha de teste
   para provar que a conta de serviço tem permissão de editor.
   Não altera nada que já existe.
   ============================================================= */
const { config, abrirPlanilha, explicarErro } = require('./conexaoPlanilha');
const { CABECALHO } = require('../src/services/sheetsService');

async function main() {
    console.log('Credencial:', config.google.email, '(' + config.google.origemCredencial + ')');
    console.log('Planilha ID:', config.google.planilhaId);

    const doc = await abrirPlanilha();
    console.log('✓ Acesso de leitura: "' + doc.title + '"');
    console.log('  Abas:', doc.sheetsByIndex.map(function (s) { return s.title; }).join(', '));

    const aba = doc.sheetsByTitle[config.google.aba];
    if (!aba) {
        console.log('\n⚠ Ainda não existe a aba "' + config.google.aba + '". Rode: npm run planilha:preparar');
        return;
    }

    let cabecalho = [];
    try {
        await aba.loadHeaderRow();
        cabecalho = aba.headerValues;
    } catch (e) { /* aba vazia */ }

    const faltando = CABECALHO.filter(function (c) { return !cabecalho.includes(c); });
    if (faltando.length) {
        console.log('\n⚠ Aba "' + config.google.aba + '" sem as colunas: ' + faltando.join(', '));
        console.log('  Rode: npm run planilha:preparar');
        return;
    }
    console.log('✓ Cabeçalho da aba "' + config.google.aba + '" completo');

    const linhas = await aba.getRows();
    console.log('  Pedidos já registrados:', linhas.length);

    const teste = await aba.addRow({
        'ID_Transação': 'TESTE-CONEXAO',
        'Nome_Cliente': 'Linha de teste (será apagada)',
        'Status': 'TESTE'
    }, { raw: true, insert: true });
    await teste.delete();
    console.log('✓ Permissão de editor (linha de teste gravada e apagada)');

    console.log('\nTudo certo: a planilha está pronta para receber os pedidos.');
}

main().catch(explicarErro);
