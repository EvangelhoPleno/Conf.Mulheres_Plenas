# Prompt de auditoria — Conferência Mulheres Plenas

Cole o conteúdo abaixo (da linha `---` em diante) numa sessão nova, ou diga
apenas: **"execute o PROMPT-AUDITORIA.md"**.

---

Você vai auditar um sistema de venda de ingressos que está **no ar e vendendo
de verdade**, para um evento de igreja. Dinheiro de terceiros passa por ele.
Uma falha aqui não é um bug: é uma mulher que pagou R$ 55,00 e não recebeu o
ingresso, ou um ingresso emitido sem o dinheiro ter entrado.

Leia este documento inteiro antes de rodar o primeiro comando.

## O que é o sistema

Landing page estática + API Express na Vercel, no mesmo domínio
(`evangelhoplenoparagominas.com.br`). A compradora escolhe um lote, preenche
os dados, paga por Pix ou cartão no Asaas, e recebe um ingresso por e-mail.
O pedido é gravado numa planilha do Google.

O evento é **16 e 17 de outubro de 2026**. A venda do 1º lote abre em
**27/09/2026, sozinha, pelo relógio** — não existe botão de "publicar". Antes
disso o `/api/checkout` devolve 409; depois, para de devolver.

Comece lendo `ESTADO.md` na raiz. Ele é a memória do projeto: o que está
provado, o que falta, e as armadilhas já pagas. **Mas não confie nele como
verdade** — ele registra o que era verdade quando foi escrito. Sua primeira
obrigação é conferir se ainda é.

## Regras de conduta

1. **Não quebre a produção.** O site está vendendo. Nenhuma mudança vai para
   `main` sem os testes passando. Se precisar correr risco, diga antes e
   espere resposta.
2. **Prove, não suponha.** "O código parece certo" não é resultado. Rode,
   meça, mostre a saída. Afirmação sem evidência é falha sua, não achado.
3. **Ceticismo com a própria ferramenta.** Se um comando devolver algo
   estranho, desconfie primeiro do comando. Caso real deste projeto: o
   terminal Windows lê como cp1252 e faz a API parecer que serve acentuação
   quebrada quando ela está correta. Decodifique explicitamente como UTF-8
   antes de acusar.
4. **Não invente escopo.** Achou algo fora do pedido? Anote no relatório. Não
   conserte sem falar.
5. **Segredo nunca sai de `backend/.env`.** Não ecoe valor de chave, não
   escreva em arquivo novo, não mande para serviço nenhum. E nunca ponha
   token na URL do remote — isso já bloqueou o `git push` aqui.

## Fase 0 — Terreno

```
npm test                 # 26 testes de unidade
npm run auditar          # 61 verificações: compra inteira no sandbox + portas
```

Rodam na **raiz**, não em `backend/`. Se algum falhar, **pare e conserte
antes de auditar qualquer outra coisa** — auditar sobre base quebrada produz
achado falso.

Depois, mapeie o que está no ar de verdade:

- `curl -s https://evangelhoplenoparagominas.com.br/api/saude`
- Os 7 registros de DNS, consultados em **`d.sec.dns.br`**. Nunca em
  `a.auto.dns.br`: ele responde pelo domínio com uma cópia velha do template
  de fábrica, e dá diagnóstico falso com cara de autoritativo.

## Fase 1 — Varredura linha por linha

Leia **todo** o código de `backend/src/`, mais `script.js`, `pedido.js` e
`config.js` da raiz. Não amostre: leia. São poucos arquivos.

Em cada um, procure:

- **Caminho de erro sem tratamento.** O que acontece se o Asaas responder
  500? Se a planilha der timeout? Se o Resend recusar? A compradora vê o quê?
- **Estado parcial.** Existe ponto onde o dinheiro entra e o pedido não é
  gravado, ou o contrário? Liste cada um.
- **Valor cravado no código** que deveria vir de configuração — datas,
  preços, URLs, IDs. Caso real: `paymentDate: '2026-09-22'` fixo na
  auditoria, que a fazia quebrar todo dia seguinte ao ensaio.
- **Dado da compradora vazando** em resposta de API, log ou mensagem de erro:
  CPF, telefone, e-mail inteiro, ID de transação antes do pagamento.
- **Comparação de segredo sem tempo constante**, validação que aceita quando
  devia recusar, `||` que transforma erro em valor padrão silencioso.

## Fase 2 — Orquestração das integrações (o coração da auditoria)

Aqui é onde um erro custa dinheiro. Para **cada** integração, descreva o
contrato e depois procure onde ele se rompe.

### Asaas (pagamento)

- A chave e a URL combinam? `$aact_hmlg_` só com `api-sandbox.asaas.com`,
  `$aact_prod_` só com `api.asaas.com`. Trocado dá **401 sem explicação**.
- O webhook valida o token? Rejeita corpo sem ID de transação **com 200**?
  Se devolver erro, o Asaas suspende a fila inteira.
- **Idempotência:** o webhook e a consulta de status podem chegar juntos. O
  ingresso pode ser emitido duas vezes? O e-mail pode sair duas vezes? Onde
  está a trava, e ela funciona?
- A cobrança carrega o `Pedido_ID` em `externalReference`? Sem isso o webhook
  não sabe qual pedido confirmar.
- Cobrança mínima é **R$ 5,00** — R$ 1,00 é recusado.
- Sem chave Pix ativa na conta, o primeiro QR falha com 400.

### Google Sheets (planilha)

- `google-spreadsheet` é ESM: **só com `import()`**. Com `require()` o
  carregador da Vercel mata a API inteira.
- Sem as variáveis `GOOGLE_*`, o checkout deve recusar com **503**, não
  aceitar em memória. Pedido em memória na Vercel = dinheiro cobrado e
  ingresso nenhum. Confirme que essa porta continua fechada.
- Escrita concorrente: duas compras no mesmo segundo podem sobrescrever
  linha? Perder pedido?

### Resend (e-mail)

- O remetente é o domínio próprio, e o domínio está **Verified**?
- Os 4 registros de e-mail no DNS estão intactos? (`resend._domainkey`,
  `send`, `rsend`, `_dmarc`.) Uma edição de zona distraída derruba um deles e
  o e-mail passa a cair no spam sem ninguém perceber.
- Falha de envio derruba a confirmação do pagamento, ou o pedido continua
  pago e o e-mail é reenviável pelo admin? **O dinheiro entrou; o e-mail não
  pode ser o que impede o ingresso de existir.**
- O link dentro do e-mail aponta para o domínio certo? Ele vem de `SITE_URL`.

### Vercel (hospedagem) e DNS

- As variáveis de ambiente batem com o que o código lê? **Variável nova só
  vale no próximo deploy** — gravar não basta.
- `ALLOWED_ORIGINS` existe e contém o que precisa? Em produção a única origem
  liberada por padrão é a do `SITE_URL`; o resto vem dessa variável.
- O Registro.br **republica a zona de forma assíncrona**: logo depois de
  salvar, o serial do SOA ainda é o antigo. Não é erro, é fila.

### Ponta a ponta

Percorra o fluxo inteiro e desenhe onde cada peça entra:
`site → /api/checkout → Asaas → QR/link → webhook → planilha → e-mail →
página de confirmação`. Em cada seta, responda: **o que acontece se falhar
aqui?** Entregue essa lista.

## Fase 3 — Consistência entre fontes de verdade

As datas dos lotes moram em **três** lugares:

- `backend/src/catalogo.js` — o que a API vende e recusa
- `index.html`, `data-inicio` / `data-fim` — o selo da landing
- `backend/test/fluxo.test.js` — as quatro datas cravadas (é a trava)

Confirme que os três contam a mesma história. O mês em `new Date` é **base
zero**: `new Date(2026, 8, 27)` é 27 de setembro.

Procure outras duplicações do mesmo tipo: preço, nome do evento, endereço do
site, limites de quantidade. Onde a mesma verdade mora em dois lugares, diga.

## Fase 4 — Segurança

Confira **em produção**, com `curl`, não só no código:

- `/api/dev/simular-pagamento` → **404** (só pode existir em modo mock)
- `/api/admin/...` sem token e com token errado → **401**
- `/api/webhook` sem token → **401**
- Origem estranha no CORS → sem permissão
- `/backend/.env` pela web → **404**
- Limite de requisições funciona? Dá para criar 500 pedidos num minuto?

E no repositório: nenhum segredo versionado, nenhum token na URL do remote.

## Fase 5 — Limpeza

**Só depois** de terminar as fases anteriores e ter o relatório pronto.

Encontre e remova:

- **Código morto**: função que ninguém chama, rota inalcançável, `if` que
  nunca é verdadeiro, variável calculada e não usada, import não utilizado,
  bloco comentado que virou arqueologia.
- **Arquivo inútil**: sobra de teste, documento que não descreve mais a
  realidade, imagem que nenhuma página referencia, dependência no
  `package.json` que ninguém importa.
- **Duplicação**: a mesma lógica escrita duas vezes.

Regras, sem exceção:

1. **Prove que é morto antes de apagar.** `grep` no projeto inteiro. Se
   aparecer em qualquer lugar, não é morto — explique por que acha que é.
2. **Nunca apague** `backend/.env`, nada dentro de `.git/`, nem arquivo
   ignorado que não seja lixo evidente.
3. **Arquivo que não é código** (documento, PDF, planilha, imagem): **não
   apague — pergunte.** Você não sabe o que a igreja ainda usa.
4. Depois de cada remoção, `npm test` e `npm run auditar`. Quebrou, reverta
   aquela remoção, não todas.
5. Na dúvida, **não apague.** Liste no relatório como candidato.

## Fase 6 — Entrega

1. `npm test` e `npm run auditar` — os dois verdes. Sem exceção.
2. Confirme que a produção continua respondendo: `/api/saude` e a trava de
   janela do checkout.
3. Atualize o `ESTADO.md`: o que mudou, o que foi provado, armadilha nova que
   você descobriu.
4. Commit com mensagem que explica **por quê**, não o quê. Push para `main`
   (é de lá que a Vercel implanta).
5. Acompanhe o deploy até `READY` e confirme o site no ar depois dele.

## Relatório final

Entregue, nesta ordem:

1. **P0 — quebra dinheiro ou ingresso.** O que é, como reproduzir, o que você
   fez. Isto se conserta na hora, não se anota.
2. **P1 — quebra a experiência** sem perder dinheiro.
3. **P2 — dívida técnica** que ainda não mordeu.
4. **Removido**, com a prova de que era morto.
5. **Candidato a remoção**, que você não apagou, e por quê.
6. **Não verificado** — e este é o item mais importante do relatório. Tudo
   que você não conseguiu provar, dito com todas as letras. Um "não
   verificado" honesto vale mais do que dez "ok" presumidos.
