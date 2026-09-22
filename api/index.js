/* Entrada da API na Vercel.

   A Vercel serve o site estático da raiz e transforma cada arquivo de api/
   numa função. O vercel.json manda todo /api/... para cá, e o Express
   resolve o resto: /api/checkout, /api/webhook, /api/pedidos/:id ...

   O código fica em backend/; este arquivo só o acorda.

   Se o acordar falhar, a Vercel sozinha devolve uma página de erro que não
   diz nada ("FUNCTION_INVOCATION_FAILED") e o motivo só existe num log que
   nem sempre dá para ler. Então guardamos a falha e a contamos em JSON. */
let app = null;
let falhaAoIniciar = null;

try {
    app = require('../backend/src/app').criarApp();
} catch (erro) {
    falhaAoIniciar = erro;
    console.error('[api] falha ao iniciar:', erro && erro.stack);
}

module.exports = function (req, res) {
    if (falhaAoIniciar) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({
            erro: 'A API não conseguiu iniciar.',
            detalhe: String(falhaAoIniciar.message || falhaAoIniciar),
            onde: String(falhaAoIniciar.stack || '').split('\n').slice(1, 6).map(function (l) { return l.trim(); })
        }));
    }
    return app(req, res);
};
