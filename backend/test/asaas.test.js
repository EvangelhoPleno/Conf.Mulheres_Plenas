/* Provedor Asaas: conversões e regras que não dependem de rede.
   O que fala com a API fica de fora — isso é o roteiro de homologação
   no sandbox, em PLANILHA.md/README. Rode com: npm test */
process.env.NODE_ENV = 'test';
process.env.ASAAS_API_KEY = 'chave-de-teste';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const asaas = require('../src/services/pagamento/asaasProvider');
const { segredoConfere } = require('../src/utils/seguranca');

test('a interface do provedor está completa', function () {
    ['criarCobranca', 'consultarStatus', 'validarWebhook', 'lerWebhook'].forEach(function (metodo) {
        assert.equal(typeof asaas[metodo], 'function', 'falta ' + metodo);
    });
    assert.equal(asaas.nome, 'asaas');
    assert.equal(asaas.simulado, false, 'nunca pode ser simulado: cobra de verdade');
    assert.deepEqual(asaas.metodos, ['pix', 'cartao']);
});

test('valor vai em reais, não em centavos', function () {
    assert.equal(asaas._emReais(5500), 55);
    assert.equal(asaas._emReais(16500), 165);
    assert.equal(asaas._emReais(11050), 110.5, 'centavos quebrados');
    assert.equal(typeof asaas._emReais(5500), 'number', 'string faria o Asaas recusar');
});

test('status do Asaas viram os status da planilha', function () {
    ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].forEach(function (s) {
        assert.equal(asaas._mapearStatus(s), 'PAGO', s);
    });
    ['PENDING', 'AWAITING_RISK_ANALYSIS'].forEach(function (s) {
        assert.equal(asaas._mapearStatus(s), 'PENDENTE', s);
    });
    assert.equal(asaas._mapearStatus('OVERDUE'), 'EXPIRADO');
    assert.equal(asaas._mapearStatus('DELETED'), 'CANCELADO');
    ['REFUNDED', 'CHARGEBACK_REQUESTED'].forEach(function (s) {
        assert.equal(asaas._mapearStatus(s), 'REEMBOLSADO', s);
    });
});

test('status desconhecido não vira PAGO por engano', function () {
    [null, undefined, '', 'QUALQUER_COISA_NOVA'].forEach(function (s) {
        assert.equal(asaas._mapearStatus(s), null, JSON.stringify(s));
    });
});

test('só os status finais de pagamento liberam ingresso', function () {
    // AWAITING_RISK_ANALYSIS é cartão em análise: não pode emitir ingresso
    assert.equal(asaas._mapearStatus('AWAITING_RISK_ANALYSIS'), 'PENDENTE');
});

/* ---------- webhook ---------- */
function requisicao(cabecalhos, corpo) {
    return {
        get: function (nome) { return cabecalhos[nome.toLowerCase()]; },
        body: corpo
    };
}

test('webhook exige o token no cabeçalho asaas-access-token', function () {
    const config = require('../src/config');
    const token = config.asaas.webhookToken;

    assert.equal(asaas.validarWebhook(requisicao({}, {})), false, 'sem cabeçalho');
    assert.equal(asaas.validarWebhook(requisicao({ 'asaas-access-token': 'errado' }, {})), false);
    if (token) {
        assert.equal(asaas.validarWebhook(requisicao({ 'asaas-access-token': token }, {})), true);
    }
});

test('token vazio no .env nunca autoriza', function () {
    assert.equal(segredoConfere('qualquer', ''), false, 'senão um webhook forjado passaria');
});

test('webhook lê o id da cobrança em payment.id', function () {
    const aviso = asaas.lerWebhook(requisicao({}, { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_080225913252', status: 'RECEIVED' } }));
    assert.deepEqual(aviso, { transacaoId: 'pay_080225913252' });
});

test('webhook de formato desconhecido devolve null', function () {
    assert.equal(asaas.lerWebhook(requisicao({}, {})), null);
    assert.equal(asaas.lerWebhook(requisicao({}, { event: 'PAYMENT_RECEIVED' })), null, 'sem payment');
    assert.equal(asaas.lerWebhook(requisicao({}, null)), null);
});

/* Celular implausível derrubava a compra inteira num campo opcional.
   Confirmado no sandbox: POST /customers com 11 dígitos iguais devolve
   400 com code invalid_mobilePhone. */
test('reconhece a recusa de telefone para refazer o cadastro sem ele', function () {
    const recusa = { response: { data: { errors: [{ code: 'invalid_mobilePhone', description: 'O celular informado é inválido.' }] } } };
    assert.equal(asaas._ehErroDeTelefone(recusa), true);

    const outroErro = { response: { data: { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF inválido.' }] } } };
    assert.equal(asaas._ehErroDeTelefone(outroErro), false, 'só o telefone pode ser descartado');

    assert.equal(asaas._ehErroDeTelefone(new Error('timeout')), false, 'erro de rede não é recusa de campo');
    assert.equal(asaas._ehErroDeTelefone({ response: { data: {} } }), false);
});
