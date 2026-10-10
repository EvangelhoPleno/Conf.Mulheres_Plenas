/* =============================================================
   Portaria: confirmação de entrada no dia da conferência (portaria.html).
   Quem pode entrar = quem está PAGO na aba Pedidos, um ingresso por código.
   A entrada fica gravada na aba "Portaria" (criada por npm run portaria):
   caixinha Presente + "16/10 18:42 · Ana" na coluna Entrada.

   Cota do Google (60 leituras/min, a MESMA conta do site): a lista inteira
   sai numa leitura só (Pedidos + Portaria juntas) e confirmar custa uma
   leitura e uma escrita. Com 4 celulares atualizando a cada 20 s e uma fila
   de ~20 entradas por minuto, fica perto de 30 leituras/min.
   ============================================================= */
const { JWT } = require('google-auth-library');
const config = require('../config');
const { REPETICAO, repetindoSeOcupado } = require('./sheetsService');

const ABA = 'Portaria';
// quem pode entrar na página: um e-mail por linha, na coluna A (npm run portaria:usuarios)
const ABA_USUARIOS = 'Usuários Portaria';
// colunas da aba (ver backend/scripts/portaria.js): A Nome, B Código,
// C CPF, D Telefone, E Presente, F Entrada, G Pedido
const COL = { nome: 0, codigo: 1, cpf: 2, telefone: 3, presente: 4, entrada: 5, pedido: 6 };

function texto(valor) {
    return String(valor == null ? '' : valor).trim();
}

function marcado(valor) {
    return valor === true || /^(true|verdadeiro)$/i.test(texto(valor));
}

// mesmos formatos do npm run portaria (backend/scripts/portaria.js)
function formatarCpf(d) {
    d = String(d || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;
}

function formatarTelefone(d) {
    d = String(d || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return d;
}

// ingresso -> linha da aba (colunas A–G); nome em maiúsculas, como no npm run portaria
function linhaDaAba(ingresso, presente, entrada) {
    return [
        texto(ingresso.nome).replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR'),
        ingresso.codigo,
        formatarCpf(ingresso.cpf),
        formatarTelefone(ingresso.telefone),
        presente,
        entrada,
        texto(ingresso.pedido)
    ];
}

/* "16/10 18:42:07 · Ana" no horário de Paragominas (os segundos põem em
   ordem quem entrou no mesmo minuto, no histórico da página) */
function carimbo(agora, por) {
    const quando = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Belem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(agora).replace(',', '');
    return por ? quando + ' · ' + por : quando;
}

/* Junta os pagos (Pedidos) com as entradas (Portaria), pelo código. Um
   código que está na Portaria mas não está mais PAGO (reembolso) sai. */
function montarLista(pagos, linhasPortaria) {
    const entradas = {};
    linhasPortaria.forEach(function (l) {
        const codigo = texto(l[COL.codigo]);
        if (codigo && marcado(l[COL.presente])) entradas[codigo] = texto(l[COL.entrada]) || 'sim';
    });
    const ingressos = pagos.map(function (p) {
        return Object.assign({}, p, { entrada: entradas[p.codigo] || null });
    });
    ingressos.sort(function (a, b) {
        return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
    return ingressos;
}

/* O que vai para o celular da porta: o CPF inteiro e o telefone NÃO saem do
   servidor. Vão só os 6 números do meio do CPF (o bastante para conferir com
   o documento e para a busca) e um número de grupo, igual para os ingressos
   comprados no mesmo CPF (acompanhantes). Se o acesso vazar, não vaza CPF. */
function visaoDaPorta() {
    const grupos = {};
    let proximo = 0;
    return function (ingresso) {
        const completo = ingresso.cpf.length === 11;
        if (completo && !grupos[ingresso.cpf]) grupos[ingresso.cpf] = ++proximo;
        return {
            codigo: ingresso.codigo,
            nome: ingresso.nome,
            cpfMeio: completo ? ingresso.cpf.slice(3, 9) : '',
            grupo: completo ? grupos[ingresso.cpf] : 0,
            entrada: ingresso.entrada
        };
    };
}

/* linhas da aba Pedidos (valores, 1ª linha = cabeçalho) -> ingressos pagos */
function pagosDosPedidos(valores) {
    const cab = (valores[0] || []).map(texto);
    const i = function (nome) { return cab.indexOf(nome); };
    const iStatus = i('Status'), iNome = i('Nome_Cliente'), iCpf = i('CPF'), iCod = i('Codigos_Ingresso'), iPed = i('Pedido_ID'), iTel = i('Telefone');
    if ([iStatus, iNome, iCpf, iCod, iPed].some(function (n) { return n < 0; })) {
        throw new Error('Aba Pedidos sem as colunas esperadas.');
    }
    const pagos = [];
    valores.slice(1).forEach(function (l) {
        if (texto(l[iStatus]) !== 'PAGO') return;
        texto(l[iCod]).split(/\s+/).filter(Boolean).forEach(function (codigo) {
            pagos.push({
                codigo: codigo,
                nome: texto(l[iNome]).replace(/\s+/g, ' '),
                cpf: texto(l[iCpf]).replace(/\D/g, ''),
                telefone: iTel < 0 ? '' : texto(l[iTel]).replace(/\D/g, ''),
                pedido: texto(l[iPed])
            });
        });
    });
    return pagos;
}

/* ---------- planilha do Google ---------- */
function criarArmazemPlanilha() {
    let docPromessa = null;
    let idPromessa = null;

    function documento() {
        if (!docPromessa) {
            docPromessa = (async function () {
                const { GoogleSpreadsheet } = await import('google-spreadsheet');
                const auth = new JWT({
                    email: config.google.email,
                    key: config.google.chave,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets']
                });
                return new GoogleSpreadsheet(config.google.planilhaId, auth, { retryConfig: REPETICAO });
            })().catch(function (erro) {
                docPromessa = null;
                throw erro;
            });
        }
        return docPromessa;
    }

    async function lerVarias(intervalos, render) {
        const doc = await documento();
        const busca = intervalos.map(function (r) { return 'ranges=' + encodeURIComponent(r); }).join('&');
        const resposta = await doc.sheetsApi.get('values:batchGet?' + busca + '&valueRenderOption=' + render).json();
        return (resposta.valueRanges || []).map(function (v) { return v.values || []; });
    }

    async function gravar(intervalo, valores) {
        const doc = await documento();
        // POST não é repetido pelo ky; regravar a mesma célula é inofensivo
        await repetindoSeOcupado(function () {
            return doc.sheetsApi.post('values:batchUpdate', {
                json: { valueInputOption: 'RAW', data: [{ range: intervalo, values: valores }] }
            });
        });
    }

    return {
        // [pagos, linhas da Portaria a partir da 2]
        async lerTudo() {
            const [pedidos, portaria] = await lerVarias([config.google.aba + '!A:Q', ABA + '!A2:G'], 'FORMATTED_VALUE');
            return { pagos: pagosDosPedidos(pedidos), portaria: portaria };
        },
        async lerPortaria() {
            return (await lerVarias([ABA + '!A2:G'], 'FORMATTED_VALUE'))[0];
        },
        async lerUsuarios() {
            return (await lerVarias(["'" + ABA_USUARIOS + "'!A2:A"], 'FORMATTED_VALUE'))[0];
        },
        // linha = número da linha na planilha (2 em diante)
        async marcar(linha, presente, entrada) {
            await gravar(ABA + '!E' + linha + ':F' + linha, [[presente, entrada]]);
        },
        /* Ingresso pago depois da última rodada do npm run portaria: entra
           logo abaixo da última linha da lista, já com a caixinha. É uma
           gravação só (appendCells leva valor e caixinha juntos). */
        async acrescentar(linhas) {
            const doc = await documento();
            const sheetId = await idDaAba();
            const celulas = linhas.map(function (valores) {
                return {
                    values: valores.map(function (valor, coluna) {
                        if (coluna === COL.presente) {
                            return { userEnteredValue: { boolValue: valor === true }, dataValidation: { condition: { type: 'BOOLEAN' } } };
                        }
                        return { userEnteredValue: { stringValue: texto(valor) } };
                    })
                };
            });
            await repetindoSeOcupado(function () {
                return doc.sheetsApi.post(':batchUpdate', {
                    json: { requests: [{ appendCells: { sheetId: sheetId, rows: celulas, fields: 'userEnteredValue,dataValidation' } }] }
                });
            });
        }
    };

    // o número interno da aba não muda: uma leitura por instância
    function idDaAba() {
        if (!idPromessa) {
            idPromessa = (async function () {
                const doc = await documento();
                const meta = await doc.sheetsApi.get('?fields=sheets(properties(sheetId,title))').json();
                const aba = (meta.sheets || []).find(function (s) { return s.properties.title === ABA; });
                if (!aba) throw new Error('A planilha não tem a aba "' + ABA + '". Rode "npm run portaria".');
                return aba.properties.sheetId;
            })().catch(function (erro) {
                idPromessa = null;
                throw erro;
            });
        }
        return idPromessa;
    }
}

/* ---------- memória (testes) ---------- */
function criarArmazemMemoria(pagos) {
    const portaria = [];
    const usuarios = [];  // e-mails da aba Usuários Portaria
    return {
        pagos: pagos,
        portaria: portaria,
        usuarios: usuarios,
        async lerUsuarios() { return usuarios.map(function (email) { return [email]; }); },
        async lerTudo() { return { pagos: pagos.slice(), portaria: portaria.map(function (l) { return l.slice(); }) }; },
        async lerPortaria() { return portaria.map(function (l) { return l.slice(); }); },
        async marcar(linha, presente, entrada) {
            portaria[linha - 2][COL.presente] = presente;
            portaria[linha - 2][COL.entrada] = entrada;
        },
        async acrescentar(linhas) { linhas.forEach(function (l) { portaria.push(l.slice()); }); }
    };
}

/* ---------- regras ---------- */
function criarPortaria(armazem, opcoes) {
    opcoes = opcoes || {};
    const agora = opcoes.agora || function () { return new Date(); };
    const CACHE_MS = 4000;  // celulares que atualizam juntos dividem uma leitura
    let cache = { em: 0, dados: null };
    /* A lista de quem pode entrar é conferida a cada toque na página: uma
       leitura por minuto por instância basta. Quem for tirado da aba perde
       o acesso em até 1 minuto. */
    const USUARIOS_MS = 60000;
    let usuariosCache = { em: 0, emails: [] };

    async function lerTudo(fresco) {
        if (!fresco && cache.dados && Date.now() - cache.em < CACHE_MS) return cache.dados;
        const dados = await armazem.lerTudo();
        cache = { em: Date.now(), dados: dados };
        return dados;
    }

    function acharNaPortaria(linhas, codigo) {
        const i = linhas.findIndex(function (l) { return texto(l[COL.codigo]) === codigo; });
        return i < 0 ? null : { linha: i + 2, valores: linhas[i] };
    }

    function naoAchado() {
        const erro = new Error('Ingresso não encontrado entre os pagos.');
        erro.status = 404;
        erro.publico = 'Ingresso não encontrado entre os pagos. Confira o código.';
        return erro;
    }

    return {
        // e-mails da aba Usuários Portaria (minúsculos)
        async usuarios() {
            if (Date.now() - usuariosCache.em < USUARIOS_MS) return usuariosCache.emails;
            try {
                const emails = (await armazem.lerUsuarios()).map(function (l) { return texto(l[0]).toLowerCase(); })
                    .filter(function (email) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email); });
                usuariosCache = { em: Date.now(), emails: emails };
            } catch (erro) {
                // aba apagada ou Google ocupado: vale a última lista lida; tenta de novo em 15 s
                console.error('[portaria] não li a aba ' + ABA_USUARIOS + ':', erro.message);
                usuariosCache.em = Date.now() - USUARIOS_MS + 15000;
            }
            return usuariosCache.emails;
        },
        esquecerUsuarios() { usuariosCache.em = 0; },

        async listar() {
            const dados = await lerTudo(false);
            const ingressos = montarLista(dados.pagos, dados.portaria).map(visaoDaPorta());
            return {
                ingressos: ingressos,
                total: ingressos.length,
                presentes: ingressos.filter(function (i) { return i.entrada; }).length
            };
        },

        /* Relê a Portaria antes de gravar: se outro celular já confirmou
           este código, devolve quando e quem, sem gravar de novo. */
        async confirmar(codigo, por) {
            codigo = texto(codigo).toUpperCase();
            const linhas = await armazem.lerPortaria();
            let achado = acharNaPortaria(linhas, codigo);
            let pago;

            if (achado && marcado(achado.valores[COL.presente])) {
                return { situacao: 'ja-entrou', codigo: codigo, entrada: texto(achado.valores[COL.entrada]) || 'sim' };
            }
            // confere que continua PAGO (e acha quem pagou depois da lista)
            const dados = await lerTudo(!achado);
            pago = dados.pagos.find(function (p) { return p.codigo === codigo; });
            if (!pago) throw naoAchado();

            const entrada = carimbo(agora(), por);
            if (achado) {
                await armazem.marcar(achado.linha, true, entrada);
            } else {
                await armazem.acrescentar([linhaDaAba(pago, true, entrada)]);
            }
            cache.em = 0;
            return { situacao: 'confirmado', codigo: codigo, entrada: entrada };
        },

        /* Pedido que acabou de ser pago: os ingressos dele entram na aba na
           hora (pedidoService.confirmarPagamento). Relê a aba antes, para o
           webhook e a página de pagamento não gravarem a mesma linha duas
           vezes. Devolve quantas linhas entraram. */
        async incluir(pedido) {
            const codigos = (pedido.codigos || []).map(texto).filter(Boolean);
            if (!codigos.length) return 0;
            const linhas = await armazem.lerPortaria();
            const faltam = codigos.filter(function (codigo) { return !acharNaPortaria(linhas, codigo); });
            if (!faltam.length) return 0;
            await armazem.acrescentar(faltam.map(function (codigo) {
                return linhaDaAba({ nome: pedido.nome, codigo: codigo, cpf: pedido.cpf, telefone: pedido.telefone, pedido: pedido.pedidoId }, false, '');
            }));
            cache.em = 0;
            return faltam.length;
        },

        async desfazer(codigo) {
            codigo = texto(codigo).toUpperCase();
            const achado = acharNaPortaria(await armazem.lerPortaria(), codigo);
            if (!achado) throw naoAchado();
            await armazem.marcar(achado.linha, false, '');
            cache.em = 0;
            return { situacao: 'desfeito', codigo: codigo };
        }
    };
}

let instancia = null;

function portaria() {
    if (!instancia) {
        instancia = criarPortaria(config.google.configurado ? criarArmazemPlanilha() : criarArmazemMemoria([]));
    }
    return instancia;
}

// os testes trocam a planilha por uma lista em memória
function usarArmazem(armazem, opcoes) {
    instancia = criarPortaria(armazem, opcoes);
    return instancia;
}

module.exports = { ABA_USUARIOS, portaria, usarArmazem, criarArmazemMemoria, pagosDosPedidos, montarLista, carimbo };
