# Estado do projeto — 23/09/2026

Resumo para retomar o trabalho sem reler o histórico. Evento: **Conferência
Mulheres Plenas, 16 e 17 de outubro de 2026, Paragominas–PA**.

---

## O que já está no ar e provado

**https://evangelhoplenoparagominas.com.br** — site e API no mesmo domínio.
(`conf-mulheres-plenas.vercel.app` continua respondendo, como endereço interno.)

| Peça | Estado |
|---|---|
| Vercel | projeto `conf-mulheres-plenas`, implanta da branch `main`, Root Directory na raiz |
| API | `api/index.js` acorda o Express de `backend/`; `vercel.json` manda `/api/...` para ele |
| Pagamento | Asaas **SANDBOX** (`PAYMENT_PROVIDER=asaas`) |
| Webhook | cadastrado no Asaas e **testado no ar: status 200** |
| Planilha | Google Sheets gravando (`/api/saude` mostra `planilha: google-sheets`) |
| E-mail | Resend no domínio próprio, **Verified** (sa-east-1). Teste no Gmail em 23/09: SPF, DKIM e DMARC **PASS** nos três |
| Variáveis | as 12 + `EMAIL_REPLY_TO`. Atenção: `EMAIL_FROM` e `EMAIL_REPLY_TO` foram criadas **só em Production** |
| Domínio | **https://evangelhoplenoparagominas.com.br** — site, API e e-mail, tudo no domínio próprio desde 23/09 |
| Git | remote **sem token na URL**; autenticação no Git Credential Manager (cofre do Windows). `git push` funciona direto |
| GitHub Pages | **desligado** em 23/09 — `github.io` devolve 404 |
| Repositório | **público** — foi privado por algumas horas em 23/09 e isso quebrou o deploy (ver armadilha); voltou a ser público e o push implanta de novo |
| `www` | responde com **308** para a raiz |

**Ensaio completo feito em 22/09 e depois limpo:** compra pelo site → cobrança
no Asaas → Pix com QR → pedido na planilha → pagamento → webhook 200 → ingresso
`MP26-XXXX-XXXX` → e-mail entregue → aba Resumo somando certo.

### Lotes (as datas moram em TRÊS lugares e têm que andar juntas)

| Lote | Janela | Preço |
|---|---|---|
| 1º | 27/09 a 06/10 | R$ 55,00 |
| 2º | 07/10 a 15/10 | R$ 65,00 |

- `backend/src/catalogo.js`, linha ~31 — o que a API vende (e recusa)
- `index.html`, linhas 458 e 482, `data-inicio` / `data-fim` — o selo da landing
- `backend/test/fluxo.test.js`, linhas 61-64 — as quatro datas cravadas

Se mudar uma e esquecer a outra, o teste `janela de venda de cada lote` falha.
Ele existe para isso: o teste é a trava, não um quarto lugar que "também"
precisa mudar. Mexeu nos dois primeiros, o teste quebra de propósito — aí
você ajusta as linhas 61-64 e, se moveu as bordas, os `new Date(...)` das
linhas 66-73 (mês é base zero: `new Date(2026, 8, 27)` é 27 de setembro).

---

## O que falta, em ordem

### 1. Domínio — CONCLUÍDO em 23/09

**`evangelhoplenoparagominas.com.br`**. Correção de 23/09: a delegação no
TLD `.br` é **`d.sec.dns.br` / `f.sec.dns.br`** (conjunto assinado com
DNSSEC), não `a.auto.dns.br` / `b.auto.dns.br` como estava escrito aqui.
Os `auto` ainda respondem com uma cópia velha do template de fábrica —
**não conferir DNS por eles**, dão resposta errada com ar de autoritativa.

**Os três registros de fábrica saíram da zona** (o null MX, o `v=spf1 -all`
da raiz e o `_dmarc p=reject`). Confirmado nos dois autoritativos. O
`p=reject` que trabalhava contra nós não existe mais.

#### Metade do e-mail: FEITA em 23/09

Zona hoje (4 registros, conferidos em `d.sec` e `f.sec`):

| Nome | Tipo | Valor |
|---|---|---|
| `resend._domainkey` | TXT | chave DKIM do Resend |
| `send` | CNAME | `send.forge.rmta.net` |
| `rsend` | CNAME | `rsend-sae1.forge.rmta.net` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:jadisonribeiro1996@gmail.com` |

O setup novo do Resend dispensa MX e SPF próprios: o CNAME do `send.`
entrega os dois (MX de bounce `feedback.forge.rmta.net` e o SPF do Resend).
Não falta registro nenhum.

Resend **Verified**, região São Paulo (`sa-east-1`). Remetente
`ingressos@evangelhoplenoparagominas.com.br`, reply-to no Gmail do Jadison —
sem MX na raiz, resposta sem reply-to volta pro remetente.

Teste de 23/09 (`npm run email:testar`): entregue, e o "Mostrar original" do
Gmail deu **SPF PASS, DKIM PASS alinhado ao domínio, DMARC PASS**.

Quando o DMARC tiver alguns dias de relatório limpo, dá para apertar o
`p=none` para `p=quarantine` no Registro.br.


#### Provado em produção no domínio novo (23/09)

| Verificação | Resultado |
|---|---|
| `config.js` servido | aponta para o domínio próprio |
| `/api/saude` | Asaas, Google Sheets e Resend de pé |
| Trava de janela | `POST /api/checkout` devolve **409**, "abre em 27/09" |
| Acentuação | UTF-8 correto ponta a ponta |
| Certificado | emitido pela Vercel alguns minutos depois do `A` |

Registros `A` na raiz: `216.198.79.1` e `64.29.17.1` (faixa nova; o
`76.76.21.21` ainda funciona mas é a antiga).

`ALLOWED_ORIGINS` **foi criada na Vercel** e não existe no Git. Sem ela, em
produção a única origem liberada é a do `SITE_URL` — o checkout do Pages
teria quebrado por CORS no instante do deploy. Hoje vale
`conf-mulheres-plenas.vercel.app` e o `www`.

**Parcialmente verificado (23/09, auditoria):** o `EMAIL_FROM` gravado em
Production é `Ingressos Conferência <ingressos@evangelhoplenoparagominas.com.br>`
— o remetente configurado está no domínio próprio, e o domínio está `verified`
no Resend. O que continua **não verificado** é a entrega de uma compra real:
a trava de 27/09 impede o teste, e `/api/saude` não expõe o remetente.

### 2. Limpeza de segredo — FEITA em 23/09

- Token da Vercel revogado e substituído; o novo vive em `backend/.env`
- Token do GitHub revogado. **Não foi substituído no projeto, e nem precisa:**
  o `git push` autentica pelo Git Credential Manager, que tem credencial
  OAuth própria no cofre do Windows. O remote não carrega segredo nenhum.
- `backend/.env.vercel` **apagado** (40 linhas, 12 chaves, todas já na
  Vercel). Sobraram só `backend/.env` e `.env.example`.

Fica valendo: o `VERCEL_TOKEN` em `backend/.env` é o que dá acesso ao
projeto na Vercel e está em texto claro no disco. O site não precisa dele
para funcionar — é ferramenta de manutenção. Revogar quando o projeto
estabilizar depois de 27/09.

E nunca pôr token na URL do remote: era o que bloqueava o `git push`.

### 3. Antes de divulgar (domingo, 27/09) — FEITO

Em 23/09: GitHub Pages desligado (`github.io` devolve 404), `github.io`
removido do `ALLOWED_ORIGINS`, repositório fechado (privado) e `www`
redirecionando para a raiz com 308.

Sobrou um endereço público de venda, que é o certo.

Zona de DNS final, 7 registros:

| Nome | Tipo | Valor |
|---|---|---|
| (raiz) | A | `216.198.79.1` |
| (raiz) | A | `64.29.17.1` |
| `www` | CNAME | `dc089d8ac3330511.vercel-dns-017.com` |
| `resend._domainkey` | TXT | chave DKIM |
| `send` | CNAME | `send.forge.rmta.net` |
| `rsend` | CNAME | `rsend-sae1.forge.rmta.net` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=...` |

O Registro.br **republica a zona de forma assíncrona**: logo depois de
salvar, o serial do SOA ainda é o antigo e o registro novo não existe. Não é
erro, é fila — esperar alguns minutos. E conferir sempre em `d.sec.dns.br`,
nunca em `a.auto.dns.br`.

### 4. Asaas de produção — DUAS etapas pendentes, não uma

**Situação em 23/09** (conferida no painel):

| Etapa | Estado |
|---|---|
| Preenchimento dos Dados Comerciais | **Aprovado** |
| Envio de documentos | **Em análise** |
| Aprovação geral | **Pendente** — só começa depois das anteriores |
| Chave Pix | bloqueada, depende da mesma fila |

**Decisão tomada em 23/09: manter a abertura em 27/09 e reavaliar no sábado,
26/09.** O endereço ainda não foi divulgado, então a exposição é pequena.

**Isto não é "quando der": em 27/09 a janela do 1º lote abre sozinha, pelo
relógio.** Se a conta não estiver aprovada até lá, a compradora recebe um QR
de **sandbox**, que o banco dela não reconhece: ela não consegue pagar, o
pedido fica pendente na planilha e o ingresso não sai.

#### O que fazer no sábado, 26/09

Se a aprovação geral **não** tiver saído, adiar a abertura. Mudança sugerida:
1º lote de `2026-10-01` a `2026-10-06`, 2º lote intacto. São os três lugares
da seção "Lotes" acima, e depois `npm test`.

Se tiver saído:

1. Gerar a chave de produção **sem permissão de saque** e sem expiração curta
   (chargeback chega até ~90 dias depois)
2. Na Vercel: `ASAAS_API_URL=https://api.asaas.com/v3` e a chave `$aact_prod_`
   — **e redeployar**, senão a função continua com a de sandbox
3. Cadastrar o webhook na conta de produção — mesma URL
   (`https://evangelhoplenoparagominas.com.br/api/webhook`), mesmo
   `ASAAS_WEBHOOK_TOKEN`, mesmos 6 eventos, v3, não sequencial
4. Conferir se a **chave Pix** está ativa (sem ela o primeiro QR falha com 400)
5. Cobrança real de teste de **R$ 5,00 ou mais** (o Asaas recusa R$ 1,00) —
   e é ela que finalmente prova de que endereço o e-mail de ingresso chega

### 5. Teste com os pastores — decidido: NÃO antes do Asaas

Perguntado em 23/09 se dava para os pastores testarem o fluxo inteiro até o
e-mail chegar. **Dá**, e sem quebrar nada: eles compram, recebem o QR, e a
cobrança é marcada como paga pela API do sandbox (o mesmo `receiveInCash` da
auditoria), o que dispara o webhook real, emite o ingresso e manda o e-mail
de verdade. O único passo impossível é pagar — QR de sandbox não é aceito
por banco nenhum.

**O custo:** a janela de venda teria que ficar aberta durante o teste, e aí
o site fica genuinamente comprável por qualquer um com o endereço. Além
disso o e-mail deles **não** viria marcado como teste (o `[TESTE]` no
assunto só sai quando a transação começa com `mock_`; pelo sandbox do Asaas
ela começa com `pay_`), e os pedidos entrariam na planilha real.

**Decisão: não fazer.** O mesmo teste sai mais fiel e sem exposição nenhuma
depois da aprovação do Asaas, com uma cobrança real de R$ 5,00 que se estorna
— e é ele que também vai provar de que endereço o e-mail de ingresso chega.

### 6. Varredura de segurança de 23/09 (tudo passou)

Conferido **em produção**, no domínio novo:

| Porta | Resposta |
|---|---|
| `/api/dev/simular-pagamento` | 404 (só existe com `PAYMENT_PROVIDER=mock`) |
| `/api/admin/...` sem token e com token errado | 401 |
| `/api/webhook` sem token | 401 |
| rota inventada | 404 |
| CORS de origem estranha | sem permissão |
| `/backend/.env` pela web | 404 |

E no repositório: `.env` e `.env.vercel` fora do Git, remote sem token na
URL, os 4 registros de e-mail no ar.

Tudo o que estava pendente aqui foi feito no mesmo dia — ver item 2.

### 7. Opcional

O contador "X de 350 vendidos" da landing nunca aparece: `/api/produtos` não
devolve o campo `vagas`. Dá para ligar contando os pedidos PAGOS da planilha.

---

## Auditoria completa de 23/09 (PROMPT-AUDITORIA.md)

`npm test` (26) e `npm run auditar` (61) verdes antes e depois.

### Corrigido

**A janela de venda era decidida pelo fuso do servidor.** `catalogo.js` montava
as bordas com `new Date(ano, mes, dia)`. Na Vercel, que roda em UTC, o 1º lote
abriria às 21 h de 26/09 e fecharia às 21 h de 06/10, não às 23:59.

O estrago não era abrir cedo: era a noite de **06/10, das 21:00 às 23:59**. A
landing (que usa o fuso do navegador, o certo) ainda mostra "vendas abertas" a
R$ 55 e deixa clicável só o lote 1 — que a API já recusa com 409 — enquanto o
lote 2, que a API já aceita, está sem link. **Ninguém consegue comprar durante
as 3 h em que o preço vira.** O mesmo nas últimas 3 h de 15/10, a véspera do
evento. Agora as bordas são instantes absolutos (UTC-3 fixo) e o teste as crava
em UTC, então o mesmo erro não volta: rodando com `TZ=UTC`, o teste novo falha
contra o código antigo e passa contra o corrigido. **No ar desde 23/09** (deploy
`7ce2305`).

### Provado nesta auditoria

| O quê | Como |
|---|---|
| Os 7 registros de DNS | consultados em `d.sec.dns.br` (200.160.0.14); todos intactos, SOA serial 2026266003 |
| Resend | API `/domains`: `verified`, `sa-east-1`, domínio próprio |
| `EMAIL_FROM` em produção | `Ingressos Conferência <ingressos@evangelhoplenoparagominas.com.br>` — o remetente **está** no domínio próprio |
| Asaas em produção | chave e URL **os dois em sandbox**, combinando (sem a armadilha do 401) |
| As 14 variáveis | todas presentes em Production; nenhuma que o código lê está faltando |
| `ALLOWED_ORIGINS` | `conf-mulheres-plenas.vercel.app` + `www...`; mais a origem do `SITE_URL`, somada pelo código |
| Portas fechadas | `/api/dev/simular-pagamento` 404, admin e webhook 401 sem token e com token errado, `/backend/.env` 404, CORS estranho sem permissão |
| Trava de janela no ar | `POST /api/checkout` devolve 409 |
| Segredo no Git | nenhum, nem no histórico: só `.env.example` |
| Código morto | procurado e **não encontrado**: as 8 dependências são usadas, as 12 imagens são referenciadas, e `sipagProvider` é citado pelo `README` e por `fluxo.test.js` |

### Pendente, e é o mais urgente

**1. O `git push` não implantava — RESOLVIDO em 23/09.** Desde que o
repositório virou privado, todo deploy voltava `BLOCKED` com
`seatBlock.blockCode = TEAM_ACCESS_REQUIRED`: o projeto fica sob um *team* e a
conta é Hobby, que não aceita membro de time. Nem o botão Redeploy funcionava.
Os 5 commits daquele intervalo nunca foram ao ar — por sorte eram só `.md`.

**Saída tomada: o repositório voltou a ser público**, que é o único estado em
que este projeto comprovadamente implanta. Conferido antes de abrir: nenhum
segredo versionado, nem no histórico — só `.env.example`. O que protege o site
são as variáveis no painel da Vercel, não a privacidade do código. Se um dia
fechar de novo, o deploy volta a quebrar: a alternativa grátis é deploy pela
CLI com um token **de conta** (o do `.env` é escopado ao projeto e o CLI recusa).

Deploy `7ce2305` **READY** em 23/09, com a correção do fuso. Verificado no ar:
`/api/saude` de pé, checkout devolvendo 409, as 4 páginas em 200 e as 6 portas
fechadas.

**2. O 1º lote abre em 27/09 com o Asaas ainda em sandbox.** Confirmado nesta
auditoria: a chave e a URL em produção são as duas de sandbox. Se a aprovação
não sair até sábado, a compradora recebe um QR que o banco dela não reconhece.
A decisão do item 4 continua de pé — reavaliar no sábado, 26/09.

**3. Dois ingressos podem sair com códigos diferentes.** `confirmarPagamento()`
segura a corrida dentro de uma instância (`emAndamento`), mas o webhook e a
consulta da página de pagamento podem cair em instâncias diferentes da Vercel.
Se as duas lerem o pedido ainda `PENDENTE`, cada uma gera um par de códigos e a
segunda sobrescreve a planilha. O e-mail sai uma vez só (a chave de idempotência
do Resend segura), mas **com os códigos da primeira, enquanto a planilha fica
com os da segunda** — a portaria não confere. A janela é curta (as duas leituras
antes da primeira escrita) e não foi observada acontecendo. Saída sugerida:
derivar os códigos do `Pedido_ID` em vez de sortear, para que as duas instâncias
cheguem ao mesmo resultado.

---

## Comandos (rodam na RAIZ do repositório, não em `backend/`)

```bash
npm test                 # 26 testes de unidade
npm run auditar          # 61 verificações: compra inteira no sandbox + portas fechadas
npm run asaas:testar     # só o Asaas, ponta a ponta
npm run planilha:testar  # acesso e permissão na planilha
npm run email:testar -- voce@gmail.com   # dispara um ingresso falso ([TESTE] no assunto)
npm run dev              # API local em http://localhost:3000
```

O `.env` fica em `backend/.env` (o `config.js` aponta o caminho na mão).

---

## Armadilhas já pagas — não redescobrir

| O quê | Por quê |
|---|---|
| `google-spreadsheet` só com `import()` | é ESM; o carregador da Vercel não aceita `require()` e a API morria inteira |
| Cobrança mínima do Asaas: **R$ 5,00** | R$ 1,00 é recusado — o teste em produção precisa ser maior |
| Chave Pix na conta | sem ela o primeiro QR do Pix falha com 400 |
| Celular "implausível" (11 dígitos iguais) | o Asaas recusa com `invalid_mobilePhone` e derrubava a compra; agora o cadastro é refeito sem telefone |
| Prefixo da chave × URL | `$aact_hmlg_` só com sandbox, `$aact_prod_` só com produção; trocado dá 401 sem explicação |
| Sem `GOOGLE_*` em produção | o checkout recusa com 503 de propósito: pedido em memória na Vercel = dinheiro cobrado e ingresso nenhum |
| `onboarding@resend.dev` | só entrega para o dono da conta Resend, e mesmo assim no spam (resolvido em 23/09) |
| `a.auto.dns.br` responde pelo domínio | e responde **errado** — a delegação real é `d.sec`/`f.sec`. Conferir DNS por ele dá diagnóstico falso |
| Variável nova na Vercel sem redeploy | fica gravada e a função continua com a antiga até o próximo deploy |
| Previews da Vercel | têm proteção de login e devolvem 302; só a URL de produção é aberta |
| Data cravada no `receiveInCash` | a auditoria tinha `paymentDate: '2026-09-22'` fixo e passou a falhar com 400 no dia seguinte ao ensaio; o Asaas exige data entre a criação da cobrança e hoje |
| Fuso do servidor na janela de venda | `new Date(ano, mes, dia)` usa o fuso de quem roda. A Vercel roda em UTC e a máquina de desenvolvimento está em UTC-3, igual a Paragominas: o erro passava despercebido no teste e deslocava a venda em 3 h no ar. Corrigido em 23/09 — as bordas agora são instantes absolutos |
| `TZ=` no Windows | o Node desta máquina só respeita `TZ=UTC`; `TZ=America/Belem`, `Asia/Tokyo` etc. caem silenciosamente no fuso da máquina. Conferir com `getTimezoneOffset()` antes de confiar num teste "em outro fuso" |
| Ler variável da Vercel pela API | `/v9/projects/.../env` devolve o valor **cifrado** mesmo com `decrypt=true`; quem devolve texto claro é `/v1/projects/.../env/<id>`, um id por vez. E variável do tipo `sensitive` (hoje só `EMAIL_REPLY_TO`) **nunca** devolve valor — `undefined` ali significa "não revelado", não "vazio" |
| Token na URL do remote | `git push` era bloqueado por vazamento de credencial; a saída é remote limpo + Git Credential Manager |
| Repositório privado em conta Hobby | **derruba o deploy inteiro.** Em 23/09 o repo virou privado e todo push passou a voltar `BLOCKED`: `seatBlock.blockCode` = `TEAM_ACCESS_REQUIRED`, "the commit author doesn't have permission to create deployments". O projeto fica sob um *team*, e Hobby não aceita membro de time — nem o botão Redeploy funciona, ele só oferece *Upgrade to Pro*. **Saída tomada: repositório de volta a público.** O motivo está em `readyStateReason`/`seatBlock`, não em `errorCode`/`blockedReason` |
| Deploy `BLOCKED` não pode ser reimplantado | a API responde `deployment_can_never_deploy` — "please try again from a fresh commit". Não adianta insistir no redeploy: resolva a causa e faça um commit novo (vazio serve) |
| `VERCEL_TOKEN` do `.env` é escopado ao projeto | serve para a API do projeto (deployments, variáveis), mas **o CLI não autentica com ele**: o `vercel` chama `/v2/user` primeiro e recebe `User not found`. Para usar o CLI, gerar um token de conta |

---

## Onde as coisas moram

```
novo-evento/
  index.html  checkout.html  pagamento.html  confirmacao.html
  config.js                  endereço da API para o site
  script.js  pedido.js       landing / telas de compra
  api/index.js               entrada da API na Vercel
  vercel.json                manda /api/... para a função
  package.json               dependências e comandos (raiz)
  PROMPT-AUDITORIA.md        runbook de auditoria completa (fases, regras,
                             limpeza e formato do relatorio)
  backend/
    .env                     segredos (fora do Git)
    src/catalogo.js          lotes, preços e janelas
    src/config.js            lê o .env e valida
    src/routes/              publicas, webhook, admin
    src/services/            pagamento/, sheetsService, emailService, pedidoService
    scripts/                 auditar-fluxo, auditar-portas, testar-asaas, testar-email, planilha
    test/                    26 testes
```
