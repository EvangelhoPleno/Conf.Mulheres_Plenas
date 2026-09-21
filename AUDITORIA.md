# Auditoria e limpeza — Conferência Mulheres Plenas 2026

Auditoria completa do site, feita na branch `chore/auditoria-limpeza`.
Data: 21/09/2026.

---

## Resumo executivo

O projeto já estava, em código, **muito mais limpo do que o esperado**: zero
`console.log`, zero `debugger`, zero `TODO`, zero `innerHTML`, zero segredo
exposto, zero dependência sem uso, zero `@keyframes` ou variável CSS morta, e
apenas **1** das 245 classes CSS sem uso real. Não existe nenhum script de
terceiros de rastreamento (analytics, pixel, GTM, chat) — nada a consultar
nesse ponto.

A sujeira estava toda em **arquivos**, não em código: 946 KB de exportações de
logo que nenhuma página referencia, incluindo uma duplicata exata.

Foram corrigidos três defeitos reais, sendo um deles grave:

1. **O backend cobrava R$ 150,00 num ingresso que a landing anuncia por R$ 55.**
   Quem comprasse veria um preço no site e outro no checkout. O catálogo foi
   alinhado com a landing.
2. O `index.html` nunca carregava o `config.js`, deixando o painel de ingressos
   vendidos morto na landing.
3. Faltavam as metatags do cartão de compartilhamento — e a própria imagem de
   compartilhamento, que foi criada.

**A página está visual e funcionalmente idêntica à original** — verificado com
diff de pixels (detalhes em *Como isso foi verificado*).

O ganho de peso por visita foi **zero**: veja a ressalva honesta na tabela
abaixo. Os ganhos de performance que valem a pena estão todos em
*Recomendações*.

---

## Métricas antes × depois

| Medida | Antes | Depois | Δ |
|---|---:|---:|---:|
| Pasta `assets/` | 2.683.799 B (2,56 MB) | 1.815.107 B (1,73 MB) | **−868.692 B (−32,4%)** |
| Arquivos em `assets/` | 28 | 23 | −5 (−7 apagados, +2 da arte de compartilhamento) |
| Arquivos versionados (sem `node_modules`) | 70 | 63 | −7 |
| Código front (9 arquivos) | 244.848 B | 245.029 B | +181 B |
| └ `style.css` | 84.720 B | 84.512 B | −208 B |
| └ `script.js` | 62.375 B | 62.271 B | −104 B |
| └ `index.html` | 45.910 B | 46.403 B | +493 B |
| Produtos no catálogo do backend | 8 (2 setores × 4 tipos) | 2 (os 2 lotes) | −6 |
| Preço no backend × na landing | R$ 150 × R$ 55/65 (**divergente**) | R$ 55/65 × R$ 55/65 | **alinhado** |
| Dependências backend | 8 | 8 | 0 |
| `npm audit` | 0 vulnerabilidades | 0 vulnerabilidades | 0 |
| `npm test` | 9/9 passando | 9/9 passando (asserções reescritas) | 0 |
| Referências quebradas (404) | 5 | 4 | **−1** (og:image resolvido; as 4 do line-up são placeholder proposital) |
| **Peso da 1ª visita (desktop)** | 1.668,2 KB / 26 req | 1.669,2 KB / 27 req | **+1,0 KB / +1 req** |
| **Peso da 1ª visita (mobile)** | 2.472,0 KB / 31 req | 2.473,0 KB / 32 req | **+1,0 KB / +1 req** |

### Por que o peso da visita não caiu (e até subiu 1 KB)

Isto é importante e não vou maquiar: **os 946 KB apagados nunca eram baixados
pelo navegador.** Eram arquivos órfãos no repositório — nenhum HTML, CSS ou JS
apontava para eles. Apagá-los deixa o repositório e o deploy 35% mais leves e
tira o risco de alguém reutilizar a arte errada, mas **não acelera a página em
nada**.

O +1 KB é o `config.js` passando a ser carregado no `index.html` (a correção de
um bug real, descrita abaixo). É um custo consciente.

Uma ressalva de medição: rodando em `localhost`, o `config.js` aponta sozinho
para `http://localhost:3000` e a página faz uma requisição a mais
(`GET /api/produtos`, ~0,9 KB), o que dá 1.670,4 KB / 28 req. **Em produção isso
não acontece**: com `apiUrl` vazio o `configurarVagas()` sai antes de buscar
qualquer coisa. Os números da tabela são os de produção.

Quem quiser página mais rápida precisa mexer nas **imagens**: elas são 1.040 KB
dos 1.669 KB no desktop e 1.844 KB dos 2.473 KB no mobile. Está tudo detalhado
em *Recomendações*, item 1.

### Sobre bundle e Lighthouse

- **Não existe bundle.** O projeto não tem build, bundler nem `package.json` na
  raiz: os arquivos são servidos como estão. Por isso a métrica comparável é o
  peso real da visita, medido na rede, que está na tabela.
- **Lighthouse não está instalado** e o `npx` exigiria baixar o pacote. No lugar
  dele montei uma verificação própria via Chrome DevTools Protocol, que mede
  peso de rede por tipo e origem, requisições com status ≥ 400, overflow
  horizontal, altura de cada seção, contraste real de texto, alvos de toque,
  hierarquia de títulos e imagens sem `alt`/dimensão. Os números deste relatório
  vêm dela.
- As medidas de rede foram feitas **sem gzip** (servidor local). Em produção o
  CSS e o JS chegam bem menores; as imagens, não.

---

## Removido

| Item | Tipo | Caminho | Motivo / prova |
|---|---|---|---|
| `variaçao de cores logo 02@4x (1).png` | Imagem | `assets/imagens/` | **Duplicata exata**: md5 `a4613008a1b3…` idêntico ao `variaçao de cores logo 02@4x.png`. Nome de cópia do Windows. |
| `Prancheta 1 cópia 2@4x.png` | Imagem | `assets/imagens/` | 281 KB. Nenhuma referência. |
| `logo cores originais  01@4x.png` | Imagem | `assets/imagens/` | 109 KB. Nenhuma referência. |
| `logo cores originais  02@4x.png` | Imagem | `assets/imagens/` | 112 KB. Nenhuma referência. |
| `simbolo cor original@4x.png` | Imagem | `assets/imagens/` | 111 KB. Nenhuma referência. |
| `variaçao de cores logo 01@4x.png` | Imagem | `assets/imagens/` | 109 KB. Nenhuma referência. |
| `variaçao de cores logo 02@4x.png` | Imagem | `assets/imagens/` | 112 KB. Nenhuma referência. |
| `CONFIG.links.caravana` | Código JS | `script.js` | Não existe nenhum elemento `data-link="caravana"` no site; o `configurarLinks()` só lê chaves que têm elemento correspondente. A chave nunca era usada. |
| `somenteDigitos`, `emailValido` | Export | `backend/src/utils/validacao.js` | Usados **só dentro do próprio arquivo**. Nenhum outro módulo importa. As funções continuam existindo. |
| `criarRepositorioMemoria` | Export | `backend/src/services/sheetsService.js` | Idem: chamado só na linha 176 do próprio arquivo. |
| `.sublinhado` | Regra CSS | `style.css` | Classe definida e nunca aplicada em nenhum HTML nem adicionada por JS. |

**Prova das imagens:** busca por `assets/[^"')\s]+` em todo o projeto (HTML, CSS,
JS, JSON, backend), comparada com a listagem real da pasta. Os 7 arquivos acima
não aparecem em nenhuma referência — nem direta, nem montada por variável.

**Todos os arquivos apagados continuam no histórico do git** e voltam com:

```bash
git checkout e1871de -- 'assets/imagens/<arquivo>'
```

### O que parecia morto e foi mantido de propósito

A varredura ingênua de CSS aponta 8 classes "sem uso". Todas foram conferidas
uma a uma e **nenhuma** pode ser apagada:

| Classe | Por que fica |
|---|---|
| `.is-aberto`, `.is-encerrado` | Montadas por concatenação: `lote.classList.add('is-' + estado)` no `configurarLotes()`. |
| `.ticket-status--aberto`, `--espera`, `--fim` | Idem: `selo.classList.add('ticket-status--' + …)`. |
| `.lenis-smooth`, `.lenis-stopped` | Aplicadas pela própria biblioteca Lenis em tempo de execução. |
| `.w3` | Falso positivo: pedaço de `www.w3.org` dentro de um `data:` URI de SVG. |

O mesmo vale para as "variáveis CSS mortas" `--aberto` e `--destaque`: são
falsos positivos vindos de `.ticket-status--aberto::before` e
`.ticket--destaque:hover`. **O CSS não tem nenhuma variável nem `@keyframes`
morto de verdade.**

---

## Corrigido

| Correção | Arquivo | O que era |
|---|---|---|
| **`config.js` não era carregado na landing** | `index.html` | O comentário do próprio HTML documenta `window.MP_CONFIG.vagas (config.js)` como origem nº 1 do painel de ingressos vendidos, e o `configurarVagas()` lê `window.MP_CONFIG` — mas o `index.html` nunca carregava o arquivo. As outras três páginas carregavam. **O painel de vendidos e o fallback para `GET /api/produtos` estavam mortos no index.** Com `apiUrl` vazio (o padrão) nada muda na tela: a função sai cedo e o painel continua `hidden`. |
| **Cartão de compartilhamento incompleto** | `index.html` | Faltavam `og:site_name`, `og:locale` e `twitter:card`. Sem `twitter:card`, as tags `og:` já existentes não geram prévia no X/Twitter. |
| **Aviso sobre `og:image` relativo** | `index.html` | Anotado no comentário que a URL precisa ser absoluta — WhatsApp, Facebook e X não resolvem caminho relativo. O arquivo em si continua faltando (ver *Itens incertos*). |
| **Backend vendia produto e preço diferentes da landing** | `backend/src/catalogo.js` (+4 arquivos) | O catálogo tinha 8 produtos (setores `central`/`arquibancada` × tipos `individual`/`dupla`/`trio`/`caravana`) a **R$ 150,00**, enquanto a landing anuncia **um ingresso individual em 2 lotes, a R$ 55 e R$ 65**. Agora são só `lote-1` (R$ 55) e `lote-2` (R$ 65), quantidade 1 a 5 por pedido. Como `produto.setor` deixou de existir, os 4 lugares que montavam o nome do produto concatenando `setor + tipo + lote` passaram a usar um `descreverProduto()` único — inclusive o `pedido.js`, que mostrava **"undefined · Ingresso individual"** no resumo do checkout. |
| **`evento.data` estava "Data a confirmar"** | `backend/src/catalogo.js` | Ia assim no e-mail do ingresso. As datas já estão firmes na landing: agora é "16 e 17 de outubro de 2026". |
| **Imagem de compartilhamento criada** | `assets/imagens/compartilhamento.jpg` | 1200×630, 71,9 KB, com a identidade do site. Fonte versionada em `assets/compartilhamento-fonte.html`. |
| Limpeza de código morto | vários | Ver tabela *Removido*. |

---

## Itens incertos

Nada aqui foi apagado. São decisões que dependem de você.

### 1. As 4 fotos do line-up dão 404 — RESPONDIDO

`assets/imagens/lineup/1.jpg` … `4.jpg` continuam dando 404 e **isso é
proposital**: você confirmou que insere as fotos quando as tiver. O mecanismo
`configurarMidias()` + `.midia.is-missing` + `data-rotulo` já mostra um rótulo de
marcação no lugar, então a seção não quebra enquanto isso.

Para ligar, basta criar a pasta `assets/imagens/lineup/` com `1.jpg` … `4.jpg`
(proporção 4:5 — o `.lineup-foto` já tem `aspect-ratio`, então não há salto de
layout) e trocar os nomes e as bios nos `<template>` do `index.html`.

### 2. `og:image` — RESOLVIDO

A arte foi gerada e está em `assets/imagens/compartilhamento.jpg`:
**1200×630, 71,9 KB**, montada com a identidade do próprio site (fundo rosado
com a mesma textura granulada, faixa tijolo + faixa nude da data, o nome da
marca, a frase do hero em Fraunces itálico, o local em Bebas, o coração de três
pétalas com halo e o ramo de folhas). Só usa assets que já existiam em
`assets/imagens/marca/`.

O HTML que gera a arte ficou versionado em `assets/compartilhamento-fonte.html`:
abra no navegador e capture 1200×630 para regerar quando a data mudar.

Foram acrescentados também `og:image:width`, `og:image:height` e `og:image:alt`.

**Falta um passo, e ele depende de você:** trocar o caminho por **URL absoluta**
quando o domínio estiver definido. WhatsApp, Facebook e X não resolvem caminho
relativo em `og:image`. Está anotado no comentário do `index.html`.

### 3. As 6 exportações de logo apagadas eram a arte-fonte da marca?

Foram apagadas por estarem comprovadamente sem referência (946 KB), e **continuam
recuperáveis pelo git**. Mas são exportações @4x da identidade — possivelmente as
originais de onde saíram os arquivos otimizados de `assets/imagens/marca/`.

*Pergunta: você tem essa arte guardada em outro lugar (Drive, Illustrator)?* Se o
repositório for a única cópia, eu recomendo trazer de volta para uma pasta
`arte-fonte/` fora do site, em vez de deixar só no histórico.

### 4. Catálogo do backend divergente — RESOLVIDO

Você confirmou que **o preço real é R$ 55 e R$ 65** e que o catálogo deve
espelhar a landing. Feito: ver a seção *Corrigido*.

### 5. A landing não leva ao checkout — RESPONDIDO, mantido de propósito

`CONFIG.links.ingressos` continua vazio e os cartões apontam para `#setores`.
**Isso fica assim por ora**: você está integrando o backend. Quando a venda
estiver pronta, o caminho é um só — preencher `CONFIG.links.ingressos` no
`script.js`, ou apontar os cartões para `checkout.html?produto=lote-1` e
`checkout.html?produto=lote-2`.

### 6. O PDF da especificação fica público no site

`Especificacao_Backend_Sipag_EvangelhoPleno.pdf` está na raiz do repositório.
Como o site é publicado pelo GitHub Pages a partir dessa raiz, o arquivo fica
baixável por qualquer pessoa que adivinhe a URL. Não é segredo crítico, mas é a
especificação do seu backend de pagamento exposta sem necessidade.

*Sugestão: mover para uma pasta `docs/` com `.nojekyll`, ou tirar do repositório.*
Não movi porque mexer na raiz publicada pode afetar seu deploy.

---

## Recomendações

### Prioridade alta

**1. Otimizar as imagens — é o único ganho real de performance disponível.**
As imagens são 62% do peso no desktop e 75% no mobile.

| Arquivo | Hoje |
|---|---:|
| `1.jpeg` | 227 KB |
| `3.jpeg` | 168 KB |
| `2.jpeg` | 134 KB |
| thumb do YouTube (`i.ytimg.com`) | 220 KB |

As 8 fotos da galeria são JPEG sem otimização. Convertidas para WebP com
qualidade ~80, caem tipicamente 60–70% — algo como **600 KB a menos por visita
no mobile**, sem diferença visível. Dá para servir com `<picture>` mantendo o
JPEG como fallback, sem mudar nada no layout.

**2. Contraste abaixo do mínimo WCAG AA em textos pequenos.**
Medido na página renderizada:

| Elemento | Cor sobre fundo | Contraste | Mínimo |
|---|---|---:|---:|
| `.espera-pre` (13 px) | terracota `#B8684F` sobre papel `#FBF5F2` | **3,79:1** | 4,5:1 |
| `.ticket-tipo` (15 px) | terracota sobre papel | **3,79:1** | 4,5:1 |
| `.cal-ano` | terracota sobre papel | **3,79:1** | 4,5:1 |
| `.espera-num` (decorativo) | nude `#DFB9A6` sobre papel | 1,67:1 | 4,5:1 |

**Não mexi**, porque terracota sobre papel é identidade visual e você pediu para
não alterar isso. Se quiser corrigir sem perder a cara do site: escurecer o
terracota só nesses rótulos pequenos (um `#A0553C` já passa de 4,5:1) ou
aumentá-los para 18,66 px + peso 700, quando o mínimo cai para 3:1. Os números
grandes `01/02/03` são decorativos e `aria-hidden` — ali o baixo contraste é
proposital e eu deixaria como está.

**3. Definir o destino da compra.** Ver *Itens incertos* 4 e 5. Hoje a landing
não vende: o botão "Garanta seu ingresso" rola a página e para ali.

### Prioridade média

**4. `canonical` e `og:url`.** Ambos ausentes. Não adicionei porque precisam da
URL definitiva e um `canonical` errado atrapalha o SEO mais do que a ausência
dele. Pelo `backend/.env.example`, hoje o site é
`https://evangelhopleno.github.io/Conf.Mulheres_Plenas` e o domínio próprio
planejado é `evangelhoplenoparagominas.com.br`. **Me diga qual vale** e eu
acrescento `canonical`, `og:url`, `robots.txt` e `sitemap.xml` de uma vez.

**5. Dados estruturados de evento (JSON-LD `Event`).** Fariam o Google mostrar
data, local e preço direto no resultado de busca — vale muito para um evento.
Não adicionei porque parte dos dados ainda é placeholder (o menu mobile diz
"00 e 00 de mês") e dado estruturado errado é pior que nenhum.

**6. Formulário de checkout sem proteção contra spam.** O `checkout.html` não tem
honeypot nem captcha. O backend **tem** limite de requisições
(`src/utils/limite.js`), o que já ajuda bastante, mas um honeypot é barato.

**7. `.gitignore` na raiz.** Só existe `backend/.gitignore`. Um na raiz evitaria
que `.DS_Store`, `Thumbs.db` e afins entrem no repositório publicado.

### Prioridade baixa

**8. Alvos de toque um pouco menores que o mínimo.** `.nav-link` (52×21 px) e
`.pedido-voltar` (96×20 px) ficam abaixo dos 24×24 px do WCAG 2.2. Só aparecem no
desktop (no mobile o menu vira overlay, e lá **nenhum** alvo ficou pequeno), onde
o ponteiro é preciso. Uns 3 px de `padding` vertical resolvem.

**9. Thumb do YouTube carregada de terceiro em toda visita.** São 220 KB vindos
de `i.ytimg.com` no primeiro carregamento. Salvar a capa localmente e otimizá-la
tira um domínio de terceiro do caminho crítico. O `<iframe>` do vídeo já é criado
só no clique e já usa `youtube-nocookie.com` — isso está muito bem feito.

**10. `og:image` precisa de URL absoluta** — já anotado no código, ver
*Itens incertos* 2.

---

## Como isso foi verificado

Depois de **cada** categoria de remoção: `npm test` no backend e nova captura da
página, comparada pixel a pixel com a captura original.

**O problema:** a página nunca fica parada. O anel do hero gira, a faixa rolante
não para, as pétalas têm paralaxe, os cards da galeria sorteiam rotação a cada
carregamento (`gsap.utils.random`) e o relógio da contagem regressiva muda de
segundo. Duas capturas do **mesmo código** já diferem entre 0,06% e 0,35% dos
pixels — então "o diff deu 0,36%" não prova nada sozinho.

**A verificação que vale** foi localizar *onde* os pixels diferem, em faixas de
200 px:

| Faixa | Código idêntico (ruído) | Baseline × final |
|---|---:|---:|
| y = 0 … 1000 (hero, anel, faixa rolante) | 20.174 px | 34.462 px |
| y = 7200 … 7600 (relógio da regressiva) | 6.165 px | 9.455 px |
| **todas as outras faixas** | **0** | **0** |

As faixas que mudam são exatamente as mesmas nos dois casos, e são as únicas que
animam sem parar. **Todo o resto da página é pixel a pixel idêntico.**

Somado a isso, bateram exatamente antes e depois:

- altura de cada seção (`.hero` 900, `.recap` 1036, `.sobre` 1980, `.espera` 1119,
  `.lineup` 956, `.ingressos` 936, `.regressiva` 686, `.rodape` 761);
- altura total do documento: **8383 px** no desktop, **8877 px** no mobile;
- ausência de overflow horizontal em 1440×900 e em 390×844;
- lista de requisições com status ≥ 400: nenhuma nova;
- `npm test`: 9/9 em todos os passos.

As medições emulam `prefers-reduced-motion: no-preference`. **Isso é essencial
nesta máquina**, que força "reduzir movimento" no Windows: sem emular, eu estaria
auditando uma versão do site sem animação nenhuma, que não é a que o público vê.

---

## Como reverter

Todo o trabalho está na branch `chore/auditoria-limpeza`. A `main` não foi tocada.

**Desfazer tudo:**

```bash
git checkout main
git branch -D chore/auditoria-limpeza
```

**Voltar ao estado exato de antes, mantendo a branch:**

```bash
git reset --hard 81b1746
```

**Desfazer só uma categoria** (os commits são pequenos e separados de propósito):

| Commit | O que faz |
|---|---|
| `81b1746` | baseline — estado exato de antes da auditoria |
| `19d1165` | remove o arquivo duplicado |
| `66c3706` | remove as 6 imagens de marca sem referência |
| `e8ff9b1` | remove código morto de JS (front + backend) |
| `d732fa4` | remove CSS morto |
| `e0e9d89` | carrega `config.js` no index + metatags sociais |
| `f50029e` | primeira versão deste relatório |
| `00a5ab0` | alinha o catálogo do backend com a landing (R$ 55/65) |
| `bf9639a` | arte de compartilhamento 1200×630 |

```bash
git revert 66c3706   # por exemplo, só trazer as imagens de volta
```

**Observação sobre o commit baseline:** ele versionou arquivos que estavam
apenas soltos na pasta (`backend/`, as 4 páginas do fluxo de pedido, `config.js`,
`pedido.css`, `pedido.js` e o PDF da especificação), para que o snapshot fosse
fiel. Se você preferia que o `backend/` continuasse fora do git, me diga que eu
ajusto.

O `backend/.env` **não** entrou em nenhum commit — está corretamente coberto pelo
`backend/.gitignore`. Como ele não é versionado, guardei uma cópia à parte antes
de começar; ele não foi tocado em momento nenhum.

---

## Critério de conclusão

| Critério | Situação |
|---|---|
| Build de produção sem erros nem warnings novos | **N/A** — não há build. `npm test` do backend: 9/9. `npm audit`: 0 vulnerabilidades. Fluxo de compra testado de ponta a ponta com o backend no ar. |
| Nenhuma referência quebrada nova | **OK** — nenhuma foi criada, e uma das 5 anteriores (`og:image`) foi resolvida. As 4 restantes são as fotos do line-up, placeholder proposital confirmado por você. |
| Página visual e funcionalmente idêntica | **OK** — verificado por faixas de pixels, altura de seções e altura do documento. |
| Nenhum código morto, arquivo órfão ou dependência sem uso | **OK** — exceto o listado em *Itens incertos*. |
| `AUDITORIA.md` entregue | **OK** |
