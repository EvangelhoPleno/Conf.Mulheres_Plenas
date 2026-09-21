# A planilha do Google — estrutura

A planilha **é o banco de dados** do sistema de ingressos. Não há outro: cada
pedido vira uma linha, e é dela que saem a conferência na portaria, o reenvio de
e-mail e os totais de venda.

Você não precisa criar nada à mão. Rode uma vez:

```bash
cd backend
npm run planilha:preparar   # cria/completa as abas
npm run planilha:testar     # confirma que a credencial lê e escreve
```

O script **não apaga nada**: se a planilha já tem outras abas, ele mexe só nas
duas de que precisa. Se a aba `Pedidos` já existir com dados e faltando colunas,
ele para e avisa em vez de estragar o que está lá.

---

## Aba `Pedidos` — uma linha por pedido

Cabeçalho na linha 1 (congelada, fundo tijolo, texto rosado). **17 colunas**, nesta ordem:

| | Coluna | O que é | Exemplo |
|---|---|---|---|
| A | `ID_Transação` | Id do pedido no gateway. Vazio até o pagamento ser criado. É por ele que o webhook encontra o pedido. | `mock_c24b8bed2aefb864` |
| B | `Data_Hora` | Quando o pedido foi criado, horário de Paragominas (`America/Belem`). | `21/09/2026 18:45:01` |
| C | `Nome_Cliente` | Nome completo digitado no checkout. | `Maria de Souza` |
| D | `CPF` | **Só dígitos**, sem pontos nem traço. | `52998224725` |
| E | `Email` | Para onde o ingresso foi enviado. | `maria@exemplo.com` |
| F | `Status` | Situação do pedido. Ver a lista abaixo. | `PAGO` |
| G | `Telefone` | WhatsApp, só dígitos com DDD. Opcional, pode ficar vazio. | `91999990000` |
| H | `Produto` | Nome do ingresso, já montado. | `Ingresso individual (1º lote)` |
| I | `Quantidade` | Quantos ingressos nesse pedido (1 a 5). | `2` |
| J | `Valor_Total` | **Em reais, não em centavos.** O sistema guarda centavos por dentro e divide por 100 ao gravar. | `110` |
| K | `Metodo` | Forma de pagamento escolhida. | `pix` ou `cartao` |
| L | `Pedido_ID` | Identificador do pedido no site. **É a chave**: é por ele que o sistema acha a linha para atualizar. | `MPwVj23O3Sjk8uLVws` |
| M | `Codigos_Ingresso` | Os códigos emitidos, **separados por espaço** — um por ingresso. Vazio enquanto não estiver pago. | `MP26-B4NU-RVGS MP26-PQ9T-TDA6` |
| N | `Email_Enviado` | Se o e-mail com o ingresso saiu. Ver a lista abaixo. | `SIM` |
| O | `Atualizado_Em` | Última mudança nessa linha, mesmo formato de `Data_Hora`. | `21/09/2026 18:52:14` |
| P | `Pix_Copia_Cola` | O código Pix, para a pessoa retomar um pagamento pendente. | `00020101021226860014BR.GOV.BCB.PIX…` |
| Q | `Link_Pagamento` | URL da página do banco, no pagamento por cartão. | `https://…` |

As colunas **A–F são as da especificação original**; da G em diante é o que o
fluxo precisa para reenviar e-mail, conferir ingresso na portaria e retomar um
Pix. A ordem das colunas é definida em um lugar só:
`src/services/sheetsService.js`, no array `COLUNAS`.

### Valores de `Status` (F)

| Valor | Significado |
|---|---|
| `PENDENTE` | Pedido criado, aguardando pagamento. É como toda linha nasce. |
| `PAGO` | Pagamento confirmado. **Só aqui os códigos de ingresso são gerados** e o e-mail sai. |
| `RECUSADO` | O banco não aprovou. Nada foi cobrado. |
| `EXPIRADO` | O Pix venceu antes do pagamento. |
| `CANCELADO` | Pedido cancelado. |
| `REEMBOLSADO` | Valor devolvido. |

Os cinco últimos são **finais**: o sistema não mexe mais na linha depois deles.

### Valores de `Email_Enviado` (N)

| Valor | Significado |
|---|---|
| `NAO` | Ainda não saiu (é o estado inicial, e também o de todo pedido não pago). |
| `SIM` | Enviado pelo Resend. |
| `SIMULADO` | Sem `RESEND_API_KEY` configurada: o e-mail foi só impresso no console. |
| `ERRO` | Tentou e falhou. **É o que você procura para reenviar** — a aba `Resumo` conta esses. |

### Formato dos códigos

- **Pedido** (`Pedido_ID`): `MP` + 16 caracteres — `MPwVj23O3Sjk8uLVws`
- **Ingresso** (`Codigos_Ingresso`): `MP26-XXXX-XXXX`, sem as letras e números que
  se confundem (sem `0`, `O`, `1`, `I`) — `MP26-B4NU-RVGS`

O QR Code do ingresso codifica exatamente esse texto, então na portaria dá para
conferir pelo código lido ou digitado à mão.

---

## Aba `Resumo` — totais automáticos

Criada pelo mesmo comando. **Não digite nada aqui**: são fórmulas que leem a aba
`Pedidos` e se atualizam sozinhas.

```
Resumo de vendas
  Pedidos pagos                          =COUNTIF(Pedidos!F:F;"PAGO")
  Ingressos vendidos                     =SUMIF(…;"PAGO";Pedidos!I:I)
  Arrecadado (R$)                        =SUMIF(…;"PAGO";Pedidos!J:J)
  Aguardando pagamento                   =COUNTIF(…;"PENDENTE")
  Recusados / expirados / cancelados
  Reembolsados
  E-mails com erro (reenviar)            =COUNTIF(Pedidos!N:N;"ERRO")

Vendas por ingresso
  Ingresso                        Ingressos    Valor (R$)
  Ingresso individual (1º lote)        …             …
  Ingresso individual (2º lote)        …             …
  Total                                …             …
```

A parte "Vendas por ingresso" tem **uma linha por item do catálogo**. Se você
mudar os lotes em `src/catalogo.js`, rode `npm run planilha:preparar` de novo: o
script reescreve essa parte e limpa as sobras da versão anterior.

> **Atenção:** "Ingressos vendidos" soma a coluna `Quantidade`, e "Pedidos pagos"
> conta linhas. Como um pedido pode ter até 5 ingressos, **os dois números são
> diferentes** — o que vale para as 350 vagas é "Ingressos vendidos".

---

## Como configurar o acesso

1. No Google Cloud, crie uma **conta de serviço** e baixe o JSON da chave.
2. **No seu computador:** salve o JSON como `backend/credenciais-google.json`
   (já está no `.gitignore`).
   **Na Vercel:** em vez do arquivo, preencha `GOOGLE_SERVICE_ACCOUNT_EMAIL` e
   `GOOGLE_PRIVATE_KEY` com o `client_email` e o `private_key` do JSON.
3. **Compartilhe a planilha com o e-mail da conta de serviço, como Editor.** É o
   passo que todo mundo esquece — sem isso dá erro de permissão.
4. Em `GOOGLE_SHEET_ID`, cole o ID **ou o link inteiro** da planilha; o código
   extrai o ID sozinho.

### Sem planilha configurada

O sistema **não quebra**: cai num repositório em memória, e os pedidos somem
quando o servidor reinicia. É o modo de desenvolvimento. Em produção, ele avisa
no log:

```
[planilha] GOOGLE_* não configurado: pedidos em MEMÓRIA, serão perdidos.
```

Para saber em qual modo está rodando, chame `GET /api/saude` e olhe o campo
`planilha`: `google-sheets` ou `memoria`.

---

## Coisas que é bom saber antes de mexer na mão

- **Não reordene nem renomeie as colunas.** O código acha cada uma **pelo nome do
  cabeçalho**, não pela posição — então inserir uma coluna no meio não quebra
  nada, mas renomear quebra. Colunas suas, a mais, são ignoradas e preservadas.
- **Não mexa em `Pedido_ID`.** É por ele que o sistema encontra a linha para
  atualizar. Mudou, o pedido vira órfão.
- **Editar `Status` na mão funciona** e é o jeito de cancelar um pedido — mas
  escrever `PAGO` à mão **não gera ingresso nem manda e-mail**, porque quem faz
  isso é o fluxo de pagamento. Para reenviar um e-mail (as linhas com
  `Email_Enviado = ERRO`), use a rota de admin, com o `ADMIN_TOKEN` do `.env`:

  ```bash
  curl -X POST https://SUA-API/api/admin/pedidos/MPwVj23O3Sjk8uLVws/reenviar-email \
       -H "Authorization: Bearer SEU_ADMIN_TOKEN"
  ```

  E para consultar um pedido inteiro (inclusive o CPF, que a rota pública nunca
  devolve): `GET /api/admin/pedidos/<Pedido_ID>`, com o mesmo cabeçalho.
- A leitura tem um **cache de 2 segundos** (a tela de pagamento consulta o status
  de 5 em 5 segundos). Uma alteração feita na mão pode levar esse tempinho para
  aparecer na API.
- A aba precisa se chamar **`Pedidos`** (definido em `config.google.aba`).
