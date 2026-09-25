/* Anti-robô no checkout (Cloudflare Turnstile), com a Cloudflare simulada.
   Rode com: npm test */
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.GOOGLE_SHEET_ID = '';
process.env.RESEND_API_KEY = '';
process.env.TURNSTILE_SECRET_KEY = 'segredo-turnstile-de-teste';
process.env.SITE_URL = 'https://evangelhoplenoparagominas.com.br';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { criarApp } = require('../src/app');

let servidor, base;
const postOriginal = axios.post;
let cloudflare;       // o que a "Cloudflare" responde nesta vez
let perguntas = [];   // o que chegou até ela

before(async function () {
    axios.post = async function (url, corpo) {
        if (!String(url).includes('challenges.cloudflare.com')) return postOriginal.apply(axios, arguments);
        perguntas.push(Object.fromEntries(new URLSearchParams(String(corpo))));
        return cloudflare();
    };
    servidor = criarApp().listen(0);
    await new Promise(function (ok) { servidor.once('listening', ok); });
    base = 'http://127.0.0.1:' + servidor.address().port + '/api';
});

after(function () { axios.post = postOriginal; servidor.close(); });
beforeEach(function () { perguntas = []; });

const COMPRA = { produto: 'lote-1', quantidade: 1, metodo: 'pix', nome: 'Maria de Souza', email: 'maria@exemplo.com', cpf: '529.982.247-25' };

function checkout(extra) {
    return fetch(base + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, COMPRA, extra))
    });
}

test('/saude mostra o anti-robô ligado', async function () {
    const saude = await (await fetch(base + '/saude')).json();
    assert.equal(saude.antiRobo, true);
});

test('sem token, o checkout é recusado sem nem perguntar à Cloudflare', async function () {
    cloudflare = async function () { throw new Error('não devia ser chamada'); };
    const r = await checkout();
    assert.equal(r.status, 403);
    assert.equal(perguntas.length, 0);
});

test('token recusado pela Cloudflare: 403', async function () {
    cloudflare = async function () { return { data: { success: false, 'error-codes': ['invalid-input-response'] } }; };
    assert.equal((await checkout({ turnstile: 'token-falso' })).status, 403);
});

test('token de outra ação não serve para comprar', async function () {
    cloudflare = async function () { return { data: { success: true, action: 'login' } }; };
    assert.equal((await checkout({ turnstile: 'token-de-outro-widget' })).status, 403);
});

test('token válido: pedido criado, e o segredo e o token chegam à Cloudflare', async function () {
    cloudflare = async function () { return { data: { success: true, action: 'checkout' } }; };
    const r = await checkout({ turnstile: 'token-bom' });
    assert.equal(r.status, 201);
    assert.equal(perguntas[0].secret, 'segredo-turnstile-de-teste');
    assert.equal(perguntas[0].response, 'token-bom');
});

test('Cloudflare fora do ar não fecha a venda', async function () {
    cloudflare = async function () { throw new Error('timeout of 8000ms exceeded'); };
    assert.equal((await checkout({ turnstile: 'token-qualquer' })).status, 201);
});
