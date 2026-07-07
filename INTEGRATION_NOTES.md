# INTEGRATION_NOTES.md — TOConline v1 (push de compras)

> **Estado: IMPLEMENTADO / NÃO TESTADO CONTRA API REAL.**
> Todo o código desta integração nasceu de documentação (doc-driven), por decisão
> explícita do dono do projeto. Nenhum pedido foi feito ao TOConline real.
> Antes de usar em produção, seguir o **Checklist de validação humana** no fim.

## Fontes de verdade guardadas no repo

| Ficheiro | Origem | Conteúdo |
|---|---|---|
| `integrations/toconline/openapi.json` | `https://api.swaggerhub.com/apis/toconline.pt/toc-online_open_api/1.0.0` (referido na Introdução da doc) | Spec OpenAPI 3.0.3 oficial, 68 paths |
| `integrations/toconline/types.ts` | Gerado por `npm run toconline:types` (openapi-typescript) | Tipos TS do spec — nunca editar à mão |
| `integrations/toconline/docs/*.md` | `https://api-docs.toconline.pt/<página>.md` (versões markdown oficiais) | Cópia verbatim das páginas usadas |

**Regra aplicada:** nenhum endpoint, campo ou header foi inventado — tudo o que o
código usa existe no spec ou nas páginas de doc guardadas. Onde spec e página
markdown divergem, prevalece a mais completa e a leitura mais conservadora
(registado abaixo).

## Endpoints usados e onde estão documentados

| Pedido | Fonte |
|---|---|
| `GET {OAUTH_URL}/auth?client_id&redirect_uri&response_type=code&scope=commercial` → 302 com `code` no header `Location` | `docs/autenticacao-detalhada.md` §2.1 (e simplificada §2) |
| `POST {OAUTH_URL}/token` (`grant_type=authorization_code`, header `Authorization: Basic base64(client_id:secret)`, body url-encoded) → `{access_token, expires_in, refresh_token}` | `docs/autenticacao-detalhada.md` §2.2 |
| `POST {OAUTH_URL}/token` (`grant_type=refresh_token`) | `docs/autenticacao-detalhada.md` §2.3 |
| `GET {API_URL}/api/suppliers?filter[tax_registration_number]=<NIF>` | Nota 2 de `docs/apis_compras_documentos-de-compra.md`; rota no spec (`/api/suppliers` GET) |
| `POST {API_URL}/api/suppliers` (JSONAPI `{data:{type:'suppliers',attributes:{tax_registration_number, business_name}}}`) | `docs/apis_empresa_fornecedores.md` (payload + resposta de exemplo); spec `criarFornecedor` |
| `POST {API_URL}/api/v1/commercial_purchases_documents` (payload plano: `document_type`, `date`, `supplier_id`, `due_date`, `retention_total`, `external_reference`, `lines[]`) — cria cabeçalho+linhas e **finaliza automaticamente** | `docs/apis_compras_documentos-de-compra.md` (payload completo); spec `criarCabeAlhoDeDocumentosDeCompra` |
| `GET {API_URL}/api/commercial_purchases_documents?filter[status]=1&filter[supplier_tax_registration_number]=<NIF>` (verificação de idempotência) | `docs/apis_versoes-anteriores_compras_documentos-de-compra.md` §2 ("Em alternativa pode realizado um filtro… usando o estado do documento e número de registro fiscal do fornecedor"); spec documenta os 3 filtros (`document_no`, `status`, `supplier_tax_registration_number`) |

### Endpoints de LEITURA (slice de pull de faturas emitidas)

| Pedido | Fonte |
|---|---|
| `GET {API_URL}/api/commercial_sales_documents?filter[status]=1&page[size]=50&page[number]=N` | rota + `filter[status]` no spec guardado; paginação `page[size]` em `docs/caracteristicas-dos-pedidos.md` (+ padrão JSONAPI, referenciado pela doc de autenticação §3 → jsonapi.org) |
| filtro incremental `filter=documents.updated_at>'YYYY-MM-DD'::date` | mecanismo genérico documentado em `docs/caracteristicas-dos-pedidos.md` (exemplo com `document_lines.created_at>'2022-01-01'::date` e mapa de prefixos `commercial_sales_documents → documents`); `updated_at` existe na resposta documentada |
| Atributos da resposta (document_no, date, due_date, gross_total, vat_incidence_{ise,red,int,nor}, vat_total_*, vat_percentage_*, retention_value, customer_business_name, customer_tax_registration_number, external_reference, …) | exemplo completo de resposta em `docs/apis_versoes-anteriores_vendas_documentos-de-venda.md` (FT 2023/3) |
| `GET {API_URL}/api/commercial_sales_documents/{id}/lines` | rota no spec; atributos das linhas na tabela "Atualizar Linha…" da página v0 ("equivalente à que é obtida após criação ou obtenção") |
| `GET {API_URL}/api/url_for_print/{salesDocumentId}?filter[type]=Document&filter[copies]=1` → `{scheme, host, path}` → download em `scheme://host/path` | `docs/apis_vendas_descarregar-pdf-de-documentos-de-venda.md` + exemplo de resposta no spec; só documentos finalizados (status=1) |

Headers obrigatórios em todos os pedidos à API (não ao OAuth):
`Content-Type: application/vnd.api+json`, `Accept: application/json`,
`Authorization: Bearer <access_token>` — `docs/caracteristicas-dos-pedidos.md`.

Estados de documento de compra (doc v0): `0` = não finalizado, `1` = finalizado,
`4` = anulado. O POST v1 cria já finalizado (aviso vermelho na página v1).

## Ambiguidades encontradas e decisões tomadas

1. **Content-Type no POST v1 de compras** — o spec diz `application/json`; a página
   "Características dos pedidos" diz `application/vnd.api+json` "comuns a todos os
   pedidos". Decisão: seguir a página de características (`application/vnd.api+json`)
   por ser a instrução explícita e transversal da doc. A validar no teste real.
2. **Schema de linhas incompleto no spec** — o `requestBody` do POST v1 só declara
   `item_id/item_type/tax_id/unit_of_measure_id` nas linhas; a página markdown
   documenta o payload completo (`description`, `quantity`, `unit_price`,
   `tax_percentage`, `tax_country_region`, `settlement_expression`). Decisão: a página
   markdown prevalece (o spec tem claramente exemplos truncados — descrições "@@@@@@@@@").
   O contract test valida contra a união dos dois (spec + campos da página guardada).
3. **Resposta do POST v1 de compras não documentada** (spec: `200` sem schema).
   Decisão conservadora: aceitar `id` em `data.id` (JSONAPI, como todas as outras
   respostas da doc) OU `id` no topo; se nenhum existir → estado `ERROR` com o corpo
   registado para diagnóstico, sem asserções sobre mais nenhum campo.
4. **Idempotência** — não há campo de idempotência nativo. Decisão: gravar
   `external_reference = "GABIFY:<document.id>"` (campo livre "Vossa Ref.",
   documentado) e, antes de criar, `GET /api/commercial_purchases_documents?filter[status]=1&filter[supplier_tax_registration_number]=<NIF>`
   procurando esse marcador client-side. O nome do atributo na resposta
   (`external_reference`) vem do payload documentado da v0 — não confirmado na
   resposta real. Se a API real não devolver o campo, a idempotência degrada para
   o estado local (`toconlinePushStatus`), que continua a impedir re-push.
5. **Linhas isentas (0%)** — o POST exige `tax_exemption_reason_id` se houver linha
   isenta, e o motivo legal (M01–M99) não é derivável do documento com segurança.
   Decisão: **não suportado na v1** — push de documento com banda de IVA a 0% falha
   com erro claro em PT ("linha isenta requer motivo de isenção"), sem adivinhar
   motivos fiscais (princípio: o Gabify nunca faz interpretação fiscal autónoma).
6. **`supplier_id` numérico vs `id` JSONAPI string** — as respostas JSONAPI devolvem
   `id` como string ("7"); o POST de compras exemplifica `supplier_id: 1` numérico.
   Decisão: converter com `Number()` e validar inteiro positivo; falha → `ERROR`.
7. **Moeda ≠ EUR** — `currency_conversion_rate` é obrigatório e o Gabify não guarda
   taxa de câmbio. Decisão: v1 só faz push de documentos em EUR; outros → erro claro.
8. **`refresh_token` válido por 8h** — sessões longas exigem re-autenticação completa.
   Decisão: o cliente re-executa o fluxo `authorization_code` (não interativo — o GET
   `/auth` devolve 302 com o code diretamente) sempre que o refresh falhar. As
   credenciais do integrador ficam guardadas (encriptadas) precisamente para isto.
9. **Licença GC** — a doc avisa que POSTs exigem licença GC ativa na empresa.
   Registado no checklist de validação; erros 4xx por licença aparecem como `ERROR`
   com o corpo da resposta.
10. **`redirect_uri`** — a doc fixa `https://oauth.pstmn.io/v1/callback` como valor
    pré-configurado pelo serviço OAuth deles. Usado como constante; se o integrador
    tiver alterado o redirect na empresa, a ligação falha — documentado na UI.
11. **Refresh sem `refresh_token` novo** — o exemplo documentado da resposta ao
    refresh (§2.3) NÃO traz `refresh_token`, mas o texto fala em "novo
    refresh_token". Decisão conservadora: se o campo vier, usa-se; se não vier,
    mantém-se o anterior. Como fallback final existe sempre o fluxo
    authorization_code completo.
12. **`retention_type`** — quando há retenção enviamos só `retention_total`; o
    tipo (TD/TI/C/P/CPS/O) não é derivável do documento com segurança e a API
    assume TD por omissão. Escolher TI automaticamente seria interpretação
    fiscal — fica visível no preview para o contabilista confirmar. A rever com
    contabilista na validação humana.
13. **Ordenação/incremental no pull** — a doc NÃO garante ordenação da lista de
    documentos de venda nem um filtro de data dedicado. Decisão: cada pull
    pagina a lista finalizada completa (`page[size]=50`, cap de 200 páginas) e
    a correção vem SEMPRE do dedup por id (ToconlineEntityMap SALES_DOCUMENT);
    quando há `lastPullAt`, aplica-se o filtro genérico documentado
    (`filter=documents.updated_at>'…'::date`, granularidade de dia) com
    sobreposição de 24h — apenas como otimização de custo. `lastPullAt` só
    avança quando o pull termina sem erro (falha → re-scan completo barato).
14. **Bandas de IVA do pull** — construídas a partir dos campos por taxa do
    cabeçalho documentado (`vat_incidence_{ise,red,int,nor}` +
    `vat_total_*` + `vat_percentage_*`); banda `ise` entra com taxa 0. As
    linhas (`/lines`) são um extra best-effort para `documentLines` — falha na
    leitura de linhas nunca falha a importação.
15. **PDF do pull** — documentado (`url_for_print` + link público
    "transferência imediata", sem Bearer). Falha no PDF → documento importado
    SEM ficheiro (best effort, sem retry dedicado); registado no documento
    apenas quando o upload ao R2 sucede.
16. **Anti-eco** — vendas com `external_reference` a começar por `GABIFY:` são
    pushes nossos e nunca criam Document. Nota: o push cria COMPRAS e o pull lê
    VENDAS, portanto o eco direto nem devia ocorrer — a guarda existe como
    defesa em profundidade (e o seletor de push também recusa `API_PULL`).

## Arquitetura (resumo)

- `src/server/export-targets/` — interface `ExportTarget` + `FileExportTarget`
  (delegação fina para o `runExport` existente — zero mudança de comportamento) +
  `ToconlineExportTarget` (novo destino).
- `src/server/toconline/` — `toconline-client.ts` (HTTP + OAuth + retry/backoff 3x
  só em 5xx/timeout, timeout 30s, rate limit interno 2 req/s por ligação),
  `toconline-push-service.ts` (resolução de fornecedor + EntityMap + payload de
  compra a partir do `vatBreakdown` em cêntimos — conversão para euros SÓ na
  fronteira da API), `toconline-connection-service.ts` (CRUD + criptografia).
- Job assíncrono BullMQ `toconline-push` (`src/queues/toconline-push.{worker,processor}.ts`).
- Dry-run (default): o processor executa o fluxo todo mas escreve o pedido exato em
  `ToconlinePushPreview` em vez de tocar na rede. Só OWNER desliga (`toconline:goLive`).

## Checklist de validação humana (primeiro teste real)

Pré-requisito: uma empresa de TESTE no TOConline (nunca validar contra empresa real
de cliente) com licença GC ativa.

1. **Obter credenciais de integrador** — entrar na empresa de teste com conta de
   Empresário → menu **Empresa > Configurações > Dados API** → introduzir os dados
   do integrador → abrir o link (72h) recebido por email → anotar os 4 dados:
   `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_URL`, `API_URL`.
2. **Ligar no Gabify** — ficha do cliente → "Integração TOConline" → colar os 4
   dados → guardar. Verificar que o estado fica "Ativa" (o Gabify faz o fluxo
   OAuth completo ao guardar). Se falhar: confirmar que o redirect da empresa é o
   default (`https://oauth.pstmn.io/v1/callback`).
3. **Push em dry-run (default)** — escolher 1 documento VALIDADO simples (fatura
   recebida, 1 taxa, EUR, sem retenção) → "Enviar para TOConline" → abrir a
   pré-visualização e conferir manualmente: endpoint, `document_type: FC`, data,
   NIF do fornecedor, linhas (base por taxa, `tax_percentage`), total implícito.
4. **Comparar com a doc** — confirmar que o corpo bate certo com
   `integrations/toconline/docs/apis_compras_documentos-de-compra.md`.
5. **Desligar dry-run** — como OWNER, na ligação do cliente → confirmar o aviso
   ("Esta integração nunca foi testada contra o TOConline real…").
6. **Push real de 1 documento** — repetir o push do MESMO documento. Verificar no
   Gabify: estado `ENVIADO` + `toconlineDocumentId` preenchido.
7. **Verificar no TOConline** — Compras → conferir fornecedor (criado ou reutilizado
   por NIF), documento FC finalizado, datas, linhas por taxa, totais ao cêntimo,
   campo "Vossa Ref." = `GABIFY:<id>`.
8. **Idempotência real** — repetir o push do mesmo documento → tem de ser no-op
   com aviso ("já enviado"), sem documento duplicado no TOConline.
9. **Casos de erro** — testar 1 push com token expirado (esperar 4h ou revogar) e
   confirmar refresh/re-auth transparente; testar 1 documento com linha isenta e
   confirmar o erro claro (não suportado v1).
10. **Rever ambiguidades 1, 3, 4 e 6 acima** contra o comportamento real e corrigir
    este ficheiro + testes/mocks com as respostas reais observadas.

### Extensão do checklist — pull de faturas emitidas

11. **Preparar** — na MESMA empresa de teste, emitir 2–3 faturas de venda (FT)
    finalizadas com taxas diferentes (23% e 6%).
12. **Ativar pull em dry-run** — na ficha do cliente → Ligações → ligar o toggle
    "Fonte — importar faturas emitidas" (dry-run ainda ativo) → "Sincronizar
    agora" → conferir as pré-visualizações (números, datas, cliente final, NIF,
    bandas de IVA ao cêntimo) SEM documentos criados.
13. **Pull real** — desligar o dry-run (OWNER) → "Sincronizar agora" → verificar
    que entram exatamente as 2–3 faturas, uma vez cada, com estado
    Pré-validado, origem API_PULL, PDF anexado, e que a fila de revisão as
    mostra sem passar pela IA.
14. **Importação única** — "Sincronizar agora" outra vez → confirmar ZERO novos
    (contagem importada inalterada).
15. **Ciclo automático** — emitir UMA fatura nova no TOConline → esperar o ciclo
    do scan (default 30 min, `TOCONLINE_PULL_INTERVAL_MS`) → confirmar que entra
    uma e UMA só.
16. **Anti-eco real** — fazer 1 push de compra (checklist principal) e correr um
    pull a seguir → confirmar que o documento enviado NÃO reaparece como
    importado.
17. **Rever ambiguidades 13–15** contra o comportamento real (aceitação do
    filtro `documents.updated_at`, paginação, PDF) e corrigir este ficheiro +
    mocks.
