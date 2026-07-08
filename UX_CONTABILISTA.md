# UX_CONTABILISTA.md — Auditoria de experiência como a Fátima

**Persona:** Fátima, 52 anos, contabilista certificada, gabinete com 2 colaboradoras e 45 dossiês. Competente no TOConline e no Excel, desconfiada de software novo, sem paciência para tutoriais. Desktop no escritório, telemóvel em casa de clientes. Cada clique repetido 50×/mês é fricção real.

**Método:** app real em dev com `seed:demo` (3 clientes, 31 documentos, 16 movimentos bancários, 1 rascunho de email), navegação autenticada como OWNER, leitura dos componentes para os estados que a navegação não expõe. Viewport mobile avaliado pelo código (não havia browser ligado — mas o problema mobile é estrutural e inequívoco, ver Jornada 0).

Classificação: **BLOQUEANTE** (desiste ou liga a pedir ajuda) / **IRRITANTE** (consegue, mas resmunga) / **COSMÉTICO**.

---

## Jornada 0 — O telemóvel (transversal, avaliada primeiro porque contamina tudo)

- **BLOQUEANTE — O dashboard não tem layout mobile.** A sidebar é `w-56 shrink-0` sem qualquer variante responsiva, sem menu hambúrguer, sem barra inferior (`src/components/dashboard/sidebar.tsx:72`, `layout.tsx:43`). Num ecrã de 380px, 224px são sidebar — sobra um corredor de ~156px para tabelas de documentos e conciliação bancária. A ironia: os componentes internos (fila de revisão, fila do banco) estão escritos "mobile-first" com cards que fazem wrap — mas vivem dentro de uma moldura que os esmaga. A Fátima em casa de um cliente não consegue usar nada disto no telemóvel.
- **Exceção honrosa:** o portal do cliente final (`/portal`) tem layout próprio simples que funciona em mobile — mas esse é para os clientes dela, não para ela.

---

## Jornada 1 — Primeiro contacto (convite → acesso → aterrar)

1. Recebe o email "Convite para o Gabify — Gabinete Demo". Texto em português decente, diz que expira em 72h. Bom.
2. Clica no link. **BLOQUEANTE — 404.** O link aponta para `/accept-invite?token=...`, página que não existe. Ainda por cima o 404 é o genérico do Next, **em inglês** ("This page could not be found"). A Fátima não sabe o que é um 404; sabe que "o programa não funciona". Liga ao Edgar ou desiste ali. *(Detalhe cruel: o fluxo até funcionaria se ela ignorasse o link e fosse a `/login` escrever o email — mas nada lho diz.)*
3. Cenário reparado (via /login): página de login limpa, uma caixa, "Enviar link de acesso". Bom. **COSMÉTICO→MÉDIO:** promete "link válido durante 10 minutos"; na realidade dura 24 horas. Se algum dia alguém lhe disser isso, a confiança ressente-se.
4. Aterra em `/inbox`. A sidebar tem 7 entradas com nomes que ela entende: Caixa de entrada, Clientes, Documentos, Rever, Banco, Assistente, Definições. **Em 30 segundos percebe o mapa? Sim** — é dos melhores aspetos do produto. O aviso "1 rascunho pendente" com ponto pulsante puxa-a para a primeira ação certa.
5. **IRRITANTE — Não há onboarding nenhum.** Com o gabinete vazio (sem seed), a caixa de entrada diz "Nenhum email recebido ainda." e mais nada. Nada lhe diz "1º passo: ligue o email do gabinete em Definições; 2º: crie os clientes". Ela não vai adivinhar que a magia começa nas Definições — o TOConline dela nunca lhe pediu para "ligar uma conta Microsoft Graph".

**Empty states no geral:** existem em todo o lado e são educados ("Nada para rever. Todos os documentos estão validados." com ✓ verde é ótimo; "Importe um extrato para começar a conciliar." diz o próximo passo). O problema não são os empty states — é não haver um fio condutor entre eles no primeiro dia.

---

## Jornada 2 — Chegou uma leva de documentos

**Encontrar a fila:** "Rever" na sidebar é óbvio. Os separadores "Tudo / A rever / Pré-validados" fazem sentido. Contadores no topo (A rever, Pré-validados, Duplicados?, Por exportar) dão-lhe a fotografia do dia. Bom.

**Os nomes dos estados fazem sentido para ela?** "A rever" ✓, "Pré-validado" ✓ (percebe-se: "a máquina acha que está bem, falta o meu carimbo"), "Validado" ✓. As flags "Duplicado?", "Cliente errado?", "Totais não batem certo" com ponto de interrogação são **excelentes** — linguagem dela, formuladas como pergunta e não como veredicto. Menos bom: **IRRITANTE** — no detalhe do documento aparece "66 %" solto ao lado do nome do ficheiro sem rótulo (66% de quê?), e a origem "Importado de folha" mistura-se com isso sem hierarquia.

**Rever 10 documentos seguidos — cliques:**
- Documento limpo pré-validado: **1 clique** (Validar na própria lista). Excelente.
- Vários pré-validados: botão "Validar N pré-validados" aparece no topo quando N>1 — o bulk **é descobrível** porque se auto-anuncia. Excelente.
- Documento a corrigir: 1 clique para abrir → corrige o campo → Validar. O formulário de correção é denso mas completo (tipo, fornecedor, NIF, datas, IVA por taxa com regiões, conta SNC, cliente) e o pré-visualizar do PDF está ao lado. Para uma profissional, densidade é feature. Bom.
- **A correção de um NIF é óbvia?** O campo está lá com placeholder "9 dígitos". Mas aceita qualquer 9 dígitos — **IRRITANTE→grave:** não valida o dígito de controlo (o import de folhas valida!). Ela emenda um NIF à mão, engana-se num dígito, o sistema diz que está tudo bem e o erro segue para o export.
- **BLOQUEANTE — o botão "Rejeitar".** Está colado ao "Validar", vermelho, e **um clique apaga o documento sem confirmação, sem motivo, sem undo**. Em 50 revisões/mês com o rato em piloto automático, ela VAI acertar-lhe. O documento desaparece de todas as listas e ela não tem forma de o recuperar nem de perceber para onde foi. (O "Ignorar" do banco pede motivo — o padrão certo existe no próprio produto, a três cliques dali.)

**BLOQUEANTE — a página "Documentos" mente.** Com 31 documentos no gabinete, mostra "0 docs · Nenhum documento encontrado", porque só lista documentos vindos de email (bug C-2 do REVIEW_ISSUES.md). Pior: tem uma zona de upload no topo — ela arrasta 5 PDFs, o upload "acontece"... e a lista continua vazia. Para a Fátima isto significa "perdeu os meus documentos". É o tipo de momento que encerra a avaliação de um software novo. (A fila "Rever" mostra-os, mas ela não tem razão para saber disso.)

**Feedback de progresso pós-upload:** inexistente. O parse é assíncrono e não há indicador "3 documentos a processar…" em lado nenhum; combinado com o bug acima, o silêncio é total.

---

## Jornada 3 — Um duplicado suspeito e um "cliente errado"

**Duplicado:** o chip "Duplicado?" na fila diz-lhe *o quê*. Mas quando abre o documento… **BLOQUEANTE (funcional):** não há botões "É duplicado — arquivar / São documentos distintos". O backend tem essa resolução completa (manter/apagar/distinto, com auditoria) mas nenhuma rota ou botão a expõe. As opções reais dela são Validar (a flag fica lá a assombrar) ou Rejeitar (apaga — qual deles?!). Sem manual, ela não consegue terminar a tarefa que o próprio sistema lhe pôs à frente; com manual, também não, porque a funcionalidade não existe na UI.

**Cliente errado:** melhor. O chip "Cliente errado?" + no formulário o dropdown de cliente mostra "Silva & Costa Consultores, Lda **(sugerido)**". Ela percebe: "chegou à caixa do Tacho mas é da Silva & Costa", troca no dropdown, valida. **IRRITANTE apenas:** falta uma frase de contexto ("O NIF do comprador neste documento pertence a Silva & Costa") — o "(sugerido)" obriga a inferir; ela infere, mas resmunga.

---

## Jornada 4 — Fim do mês: extrato do banco e conciliação

**Importar:** wizard "1 Ficheiro → 2 Mapeamento → 3 Resultado" com instruções à frente ("CSV ou Excel, máx. 10MB. As colunas são detetadas automaticamente — confirma antes de importar"). É o fluxo mais bem desenhado do produto. A deteção de colunas por cabeçalhos PT (Data Valor, Descritivo, Débito/Crédito, Saldo) vai acertar na maioria dos bancos; a confirmação humana obrigatória dá-lhe controlo. Duplicados são ignorados e reportados linha a linha. **Bom, genuinamente.**

**Aceitar sugestões:** filtros "Por conciliar / Sugeridas / Conciliadas / Ignoradas" — nomes dela ✓. Movimento com sugestão: fornecedor, nº de fatura, data, valor, e um badge com o score. Botão "Aceitar" de 1 clique nas autoMatch. "Reverter" existe para arrependimentos ✓. "Ignorar" pede motivo ✓ (o padrão que falta ao Rejeitar dos documentos).

- **O score/breakdown diz-lhe alguma coisa?** O número (95, 75) com verde/amarelo passa a mensagem "confiança alta/média" — suficiente. Mas o detalhe é "M50 · D25 · E20 · R0": **IRRITANTE, ruído técnico** — iniciais de pesos internos que nada lhe dizem, escondidas em tooltip no desktop e simplesmente invisíveis no mobile (onde tooltips não existem). Ou se traduz ("valor exato ✓ · data próxima ✓ · nome do fornecedor no descritivo ✓") ou não se mostra.
- **BLOQUEANTE — tratar as que não têm match:** um movimento sem sugestões só tem o botão "Ignorar". **Não existe forma de conciliar manualmente** contra um documento que ela conhece ("isto é a fatura 55 da Adega, eu sei") — não há pesquisa de documento, não há "associar a…". A API aceita `documentIds` arbitrários; a UI só oferece as sugestões. No fim do mês vão sobrar sempre movimentos, e a ferramenta responde-lhes com um encolher de ombros. Ela volta ao Excel exatamente na parte que mais lhe custava.
- **IRRITANTE:** conciliação parcial multi-documento existe (checkboxes + soma comparada — bem feito!), mas de novo só entre sugestões.

---

## Jornada 5 — Exportar o mês de um cliente

**BLOQUEANTE — não existe.** Não há botão "Exportar" em lado nenhum: nem na página do cliente, nem nos Documentos, nem nas Definições. O contador "Por exportar" na fila de revisão até lhe acena com o conceito — e depois não há porta nenhuma para o ato. O motor está feito (ZIP Cliente/Ano/Mês/Tipo, CSV pt-PT com BOM, resumo de IVA, XLSX — exatamente o que ela quereria entregar ao software de contabilidade), mas só é alcançável por API. Para a jornada pedida: ela não consegue exportar, ponto. E mesmo quando a UI existir, atenção ao conteúdo: o CSV parte-se com `;` nos nomes e engole taxas dos Açores/Madeira (REVIEW_ISSUES A-1/A-2) — ela confia em ficheiros; ficheiros errados são pior do que nenhuns.

---

## Jornada 6 — Convidar um cliente final para o portal

1. Página do cliente → secção "Acessos do portal" com uma frase de enquadramento certeira ("O cliente entra num portal próprio onde apenas carrega documentos e vê o estado dos seus") — é literalmente o guião do telefonema dela. Input de email + botão "Convidar". Estados dos convites em português (pendente/aceite/expirado/revogado). **Bom.**
2. O cliente recebe o email e clica… **BLOQUEANTE — o mesmo 404 da Jornada 1.** Agora é pior: quem vê o erro é o cliente *dela*, e quem fica mal é *ela*. "Fátima, aquilo que me mandaste não funciona."
3. **Explicar ao telefone o que ele vai ver** (se o acesso funcionasse): fácil — "entras, vês 'Os seus documentos', arrastas os papéis para lá, e vês se já foram tratados". O portal é minimalista no bom sentido: pesquisa, lista, upload, estados públicos simplificados. Dos ecrãs mais fáceis de explicar por telefone em todo o produto.

---

## Jornada 7 — Ligar o Moloni de um cliente

- Painel "Ligações — Fontes de faturação" na página do cliente. **Positivo e raro:** o aviso permanente "Conector implementado mas NÃO TESTADO contra a API real. Valide os primeiros documentos importados manualmente." é de uma honestidade que gera confiança em vez de a destruir.
- **As instruções são exequíveis por ela?** Meio-termo. "Introduza o utilizador e a palavra-passe da conta Moloni do cliente e o ID da empresa (Moloni → Definições → Empresas)" — o caminho de menu ajuda, mas: **IRRITANTE (1)** o rótulo "ID da empresa (company_id)" mete jargão de API onde bastava "o número que aparece em Definições → Empresas"; **IRRITANTE (2), e sério:** o fluxo exige que ela peça ao cliente **a palavra-passe do Moloni dele** e a escreva num software terceiro. Ela vai hesitar — e devia. Não há alternativa técnica no Moloni v1, mas a UI precisava de uma frase a explicar porquê e a tranquilizar (diz "guardadas cifradas", é pouco).
- InvoiceXpress: "subdomínio é a parte antes de .app.invoicexpress.com" + caminho para a chave API — instruções melhores, exequíveis.
- Depois de ligar: "Última sincronização: … · N importados", botão "Sincronizar agora", erros visíveis no painel ("Último erro: …"). Feedback honesto. "Sincronização em fila — os documentos novos aparecem em breve." ✓.

---

## Jornada 8 — Fazer uma pergunta ao assistente e confiar na resposta

- Página com promessa clara antes da primeira pergunta: "O assistente só consulta — nunca altera nada. Cada resposta cita os dados encontrados e pode ser exportada em CSV." Para uma pessoa desconfiada, é exatamente o contrato certo. Chips de exemplos clicáveis ("Há faturas duplicadas?") ensinam o registo sem tutorial. **Muito bom.**
- Testei ao vivo ("Quanto IVA a 23% foi pago pela Silva & Costa este trimestre?"): respondeu em pt-PT correto e, em vez de inventar, pediu para confirmar o trimestre. Comportamento certo para confiança; **IRRITANTE leve** para o tempo dela (uma pergunta vira duas voltas).
- **COSMÉTICO:** a resposta veio com `**2.º trimestre**` — asteriscos literais no ecrã, porque o chat renderiza texto simples (`whitespace-pre-wrap`). Faz o assistente parecer estragado precisamente no ecrã que devia inspirar confiança.
- Rate limit e mensagens de erro limpas ("O assistente não conseguiu responder — tente novamente"). ✓

---

## Avaliações transversais

**Mensagens de erro — culpam-na ou ajudam-na?** Ajudam. O tom é consistentemente decente: "Sem ligação ao servidor. Tente novamente.", "Documento atualizado por outro utilizador — a lista foi recarregada.", "Este ficheiro já foi importado para esta conta", erros de import linha a linha com motivo. Nenhum código de erro cru visto em todo o percurso. A exceção que estraga a média: o 404 inglês do convite — o erro mais visto pelo utilizador mais frágil.

**Linguagem técnica que ela não usa:** "Regex simples" nas regras bancárias (para ela isso é grego — e sem exemplo do que um padrão faz); "M50 · D25 · E20 · R0"; "company_id"; "ISO" no campo Moeda; "dry-run" aparece mas sempre acompanhado de "modo de teste" (bom compromisso). No conjunto, o produto fala português de contabilista **acima da média** — os deslizes são localizados.

**Feedback de progresso — ela sabe que o sistema está a trabalhar?** Nos fluxos síncronos, sim (spinners e estados "A carregar…" em todo o lado, botões desativados durante submissão). Nos assíncronos, não: upload → parse não tem nenhum "a processar 3 documentos"; sync de email idem; ela só sabe que algo aconteceu quando refresca e a fila muda.

**Surpresas pela positiva (mereceram-se):**
1. Um documento com QR da AT entra já preenchido e certo, sem IA — magia instantânea que ela associa ao selo da AT, em que confia.
2. "Validar 12 pré-validados" num clique — a manhã de segunda-feira encolhe visivelmente.
3. O rascunho de email em pt-PT natural que **nunca** é enviado sem o clique dela — e o aviso do Gmail/Drive ("o anexo veio como link do Drive, peça o ficheiro") mostra conhecimento do mundo real dela.
4. O aviso honesto "NÃO TESTADO contra a API real" nas integrações.
5. "Ignorar" movimento bancário exige motivo — auditoria que um contabilista respeita.

---

## Veredicto (3 frases)

Hoje, a Fátima não adotava: o convite morre num 404, os documentos que ela carrega "desaparecem", não há botão de exportar e o telemóvel não funciona — quatro paredes com que ela bate na primeira semana, cada uma suficiente para arrumar o assunto como "ainda não está pronto". A tragédia é que o miolo é invulgarmente bom para software desta idade — fila de revisão de 1 clique, conciliação com sugestões honestas, linguagem de contabilista, auditoria em tudo — e está escondido atrás de falhas de "última milha" que são todas baratas de corrigir. Resolvidas essas quatro mais o Rejeitar-sem-rede e a conciliação manual, ela não só adotava como o mostrava a colegas — é o TOConline a arrumar-lhe a secretária antes de ela lá chegar.

## Top 10 de fricções por impacto na adoção

> **Registo vivo (08/07/2026):** itens ✅ corrigidos no branch `feature/audit-fixes`
> (commit entre parêntesis); itens sem marca ficaram em [BACKLOG.md](BACKLOG.md).

1. ✅ (ca11fd9) **Convite → 404 em inglês** (Jornadas 1 e 6) — `/accept-invite` existe, valida o token, fala pt-PT em todos os estados de erro e aterra por role.
2. ✅ (dec7331) **Página Documentos mostra 0 e "engole" uploads** (J2) — todas as origens listadas, estado real, badge+filtro de origem.
3. ✅ (e42bbf6) **Exportação sem UI** (J5) — página /exports: formulário, job em fila, histórico com estado, download por signed URL.
4. ✅ (50ac229) **Dashboard inutilizável no telemóvel** (J0) — sidebar `hidden md:flex` + MobileNav com drawer acessível abaixo de 768px.
5. ✅ (4fd1e40) **"Rejeitar" apaga sem confirmação nem undo** (J2) — confirmação inline obrigatória + "Anular" que restaura via /restore.
6. ✅ (4fd1e40) **Movimentos sem match não têm conciliação manual** (J4) — "Conciliar manualmente" com pesquisa de candidatos e a mesma validação de soma do servidor.
7. ✅ (4fd1e40) **Duplicados sem botões de resolução** (J3) — "É duplicado — arquivar" / "São documentos distintos" no detalhe do documento.
8. **Nenhum onboarding/primeiro-passo** (J1) — gabinete vazio não diz "ligue o email"; ela fica à porta sem saber onde é a maçaneta. *(BACKLOG)*
9. **Sem feedback de processamento assíncrono** (J2) — silêncio após upload/sync lê-se como avaria. *(BACKLOG)*
10. **Ruído técnico localizado** — ✅ "M50·D25·E20·R0" ganhou labels por extenso (50ac229); "Regex simples", "company_id" e o `**bold**` cru do assistente ficam no BACKLOG.
