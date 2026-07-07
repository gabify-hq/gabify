> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/compras/documentos-de-compra.md).

# Documentos de Compra

Os documentos de compra na versão v1 da API têm a mesma estrutura anteriormente descrita para a v0: são compostos por um cabeçalho e uma ou mais linhas. Nesta nova versão, é possível criar ambos num só pedido, descrito de seguida.

## Criar Documento de Compra

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_purchases\_documents" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

O *payload* JSON a enviar contém a seguinte informação:

```json
{
  // Identificação do documento
  "document_type": "FC|DSP",                                      // [OBRIGATÓRIO] Tipo de documento. "FC": fatura, "DSP": fatura de despesas.
  "date": "2023-01-01",                                           // [OPCIONAL] Data do documento; por omissão, a data do pedido.

  // [OPCIONAL] Identificação da série do documento. Por omissão, aplicam-se as regras configuradas na empresa para escolha da série.
  // Se a série for indicada, usar apenas um dos dois campos seguintes (o "id" ou o prefixo). Se se indicarem os dois, então devem ser consistentes.
  "document_series_id": 1,                                        // [OPCIONAL] Identificador interno da série. Ver NOTA 1 abaixo.
  "document_series_prefix": "Prefixo da série",                   // [OPCIONAL] Em alternativa ao campo "document_series_id".

  // [OPCIONAL] Identificação do fornecedor. Por omissão, é o fornecedor indiferenciado (NIF "999999990").
  // Se o fornecedor for indicado, usar apenas um dos dois campos seguintes (o "id" ou o NIF). Se se indicarem os dois, então devem ser consistentes.
  "supplier_id": 1,                                               // [OPCIONAL] Identificador interno do fornecedor. Ver NOTA 2.
  "supplier_tax_registration_number": "999999990",                // [OPCIONAL] NIF do fornecedor. se o fornecedor com o NIF indicado não existir, será criado automaticamente. Se o país ("supplier_country") for Portugal ("PT", "PT-AC" ou "PT-MA"), deve ser um NIF português válido.
  // [OPCIONAL] Os atributos seguintes são usados na criação do fornecedor, se não existir ainda.
  // Se o fornecedor já existir, são guardados no documento, mas a ficha do fornecedor não é actualizada.
  "supplier_business_name": "Nome do fornecedor",                 // [OBRIGATÓRIO] caso o fornecedor ainda não exista e tenha que ser criado. [OPCIONAL] nos outros casos, a não ser que exista mais do que um fornecedor com o NIF indicado, usando-se então o nome para o identificar.
  "supplier_address_detail": "Morada do fornecedor",              // [OPCIONAL]
  "supplier_postcode": "0000-000",                                // [OPCIONAL] Código postal do fornecedor, no formato 0000-000.
  "supplier_city": "Cidade/Localidade do fornecedor",             // [OPCIONAL]
  "supplier_country": "PT",                                       // [OPCIONAL] País do fornecedor. Por omissão, "PT"; é o código ISO alpha-2 do país do fornecedor (vd. https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2; ver também a NOTA 3.

  // [OPCIONAL] Condições de pagamento
  "due_date": "2023-02-01",                                       // [OPCIONAL] Data de vencimento; por omissão, a data do documento, ou a referente ao prazo de pagamento configurado no fornecedor, se o fornecedor tiver configurado um prazo de pagamento.
  "settlement_expression": "7.5",                                 // [OPCIONAL] Desconto no cabeçalho, em percentagem; são suportados descontos compostos, como "3+5"

  // [OPCIONAL] IVA
  "vat_included_prices": false,                                   // [OPCIONAL] Os preços nas linhas são com IVA incluído? Por omissão, não (false).
  "tax_exemption_reason_id": 1,                                   // Motivo de isenção de IVA. [OBRIGATÓRIO] apenas se o documento tiver pelo menos uma linha isenta de IVA. Não deve ser indicado nos restantes casos. Ver NOTA 4.

  // [OPCIONAL] Moeda. Por omissão, "EUR".
  // Se a moeda for indicada, usar apenas um dos dois campos seguintes (o "id" ou o código ISO). Se se indicarem os dois, então devem ser consistentes.
  "currency_id": 1,                                               // [OPCIONAL] Identificador interno da moeda. Ver NOTA 5.
  "currency_iso_code": "USD",                                     // [OPCIONAL] É o código ISO da moeda do documento (vd. https://en.wikipedia.org/wiki/ISO_4217).
  "currency_conversion_rate": 1.21,                               // [OMITIDO] se a moeda for "EUR". [OBRIGATÓRIO] nos restantes casos; é a taxa de conversão para EUR (1 EUR = n USD|...).

  // [OPCIONAL] Retenção
  "retention_total": 9.99,                                        // [OPCIONAL] Valor total de retenção.
  "retention_type": "TD|TI|C|P|CPS|O",                            // [OPCIONAL] Tipo de retenção. TD: Trabalho dependente, TI: Trabalho independente, C: Capitais, P: Prediais, CPS: Comissões e Prestações de Serviços, O: Outros. Por omissão, "TD".

  // [OPCIONAL] Outras informações
  "notes": "Notas ao documento",                                  // [OPCIONAL]
  "external_reference": "Referência do documento externo",        // [OPCIONAL]

  // [OBRIGATÓRIO] Linhas do documento

  "lines": [
      {
          // [OPCIONAL] Identificação do item. Se nada for indicado, assume-se uma linha apenas de descrição.
          "item_type": "Product|Purchases::ExpenseCategory",      // [OPCIONAL] Tipo de item: "Product": produto, "Purchases::ExpenseCategory": categoria de despesas. Por omissão fica vazio (linha de descrição).
          // Se o item for indicado, usar apenas um dos dois campos seguintes (o "id" ou o código). Se se indicarem os dois, então devem ser consistentes entre si, e consistentes com o "item_type".
          "item_id": 1,                                           // [OPCIONAL] Identificador interno do item. Ver NOTA 6.
          "item_code": "Código do produto/categoria de despesas", // [OPCIONAL] Já tem que existir o produto/categoria de despesas com este código. Por omissão, é usado o item identificado pelo campo "item_id". Se nada for indicado, assume-se uma linha apenas de descrição.
          "description": "Descrição da linha",                    // [OPCIONAL] Por omissão é usada a descrição associada ao item, se este for indicado. [OBRIGATÓRIO] Para uma linha apenas de descrição.

          // [OPCIONAL] Unidade de medida. Por omissão é a configurada no item (se for produto), ou a por omissão na empresa.
          // Se a unidade de medida for indicada, usar apenas um dos dois campos seguintes (o "id" ou o código). Se se indicarem os dois, então devem ser consistentes entre si.
          "unit_of_measure_id": 1,                                // [OPCIONAL] Identificador interno da unidade de medida. Ver NOTA 7.
          "unit_of_measure": "Unidade de medida",                 // [OPCIONAL] Por omissão é a configurada no item (se for produto), ou a por omissão na empresa.
          // Quantidades e valores. [OBRIGATÓRIO] Para linhas de descrição valorizadas.
          "quantity": 1,                                          // [OPCIONAL] Por omissão 1, se não for uma linha de descrição valorizada. [OBRIGATÓRIO] Para uma linha de descrição valorizada.
          "unit_price": 9.99,                                     // [OPCIONAL] Se for indicado um produto. Por omissão é usado o PVP associado ao produto. [OBRIGATÓRIO] Para uma linha de categoria de despesas ou de descrição valorizada.
          "settlement_expression": "3",                           // [OPCIONAL] Desconto de linha, em percentagem; são suportados descontos compostos, como "3+5".

          // [OPCIONAL] IVA. Por omissão é aplicado o IVA associado ao item, ou à taxa normal, na região onde a empresa está localizada.
          // Se a taxa de IVA for indicada, usar apenas ou o campo "id" ou um ou mais dos três campos seguintes. Se se indicarem todos os campos, então devem ser consistentes entre si.
          "tax_id": 1,                                            // [OPCIONAL] Identificador interno da taxa de IVA. Ver NOTA 8.
          "tax_code": "NOR|INT|RED|ISE",                          // [OPCIONAL] Por omissão é usado o tipo de IVA associado ao item, ou "NOR" se nenhum associado. Os tipos de IVA suportados são "NOR" (normal), "INT" (intermédio), "RED" (reduzido), "ISE" (isento).
          "tax_percentage": 22,                                   // [OPCIONAL] Percentagem de IVA a usar: serve para indicar uma taxa de outra região (se o campo "tax_country_region" não for indicado) ou uma taxa antiga, já não em vigor.
          "tax_country_region": "PT-MA"                           // [OPCIONAL] Região do IVA. Por omissão (e se o campo "tax_percentage" não for indicado) aplica-se a taxa de IVA da região onde a empresa está localizada.
    },
      // Outras linhas, se existirem
      ...
  ]
}
```

{% hint style="info" %}
**Nota 1:** A série associada ao documento tem já que existir, e o seu "id" interno pode ser obtido por um

{% code overflow="wrap" %}

```
GET /commercial_document_series?filter[document_type]=<o tipo de documento ex: FC> &filter[prefix]=<o prefixo da série a usar, ex: 2020> 
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
Nota 2: Se o fornecedor for identificado pelo seu "id" interno tem já que existir, e o seu "id" interno pode ser obtido por um

<pre data-overflow="wrap"><code><strong>GET /suppliers?filter[tax_registration_number]=&#x3C;o NIF do fornecedor>
</strong></code></pre>

{% endhint %}

{% hint style="info" %}
**Nota 3**: São também suportados dois "países" adicionais: "PT-AC" (Portugal, Açores) e "PT-MA" (Portugal, Madeira). Os países disponíveis podem ser consultados por um GET /countries, ou um em particular por um

```
GET /countries?filter[iso_alpha_2]=PT|<o código do país>
```

{% endhint %}

{% hint style="info" %}
**Nota 4**: O "id" interno do motivo de isenção deve ser obtido por um

{% code overflow="wrap" %}

```
GET /tax_exemption_reasons?filter[code]=M07|<o código legal do motivo de isenção>
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
**Nota 5**: O "id" interno da moeda deve ser obtido por um

{% code overflow="wrap" %}

```
GET /currencies?filter[iso_code]=USD|<o código ISO da moeda> 
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
Nota 6: O item (produto ou categoria de despesas) tem já que existir, e o seu "id" interno pode ser obtido por um

{% code overflow="wrap" %}

```
GET /products?filter[item_code]=<o código do produto> 
ou
GET /expense_categories?filter[accounting_number]=<o código da categoria de despesas, ex: 331> 
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
**Nota 7**: A unidade de medida tem já que existir, e o seu "id" interno pode ser obtido por um

{% code overflow="wrap" %}

```
GET /units_of_measure?filter[unit_of_measure]=<o código da unidade de medida, ex: un> 
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
**Nota 8:** O "id" interno da taxa de IVA deve ser obtido por um

{% code overflow="wrap" %}

```
GET /taxes?filter[tax_code]=NOR|<o tipo de IVA>&filter[tax_country_region]=PT|<a região do IVA>
ou
GET /taxes?filter[tax_code]=<o tipo de IVA, ex:NOR> &filter[tax_country_region]=<a região do IVA, ex: PT> &filter[tax_percentage]=<a percentagem IVA, ex:22>
```

{% endcode %}
{% endhint %}

## Alteração do Documento de Compra

{% hint style="danger" %}
Após a criação de um documento de compra este fica automaticamente finalizado, se pretender criar documentos sem finalizar pode consultar a versão anterior desta API: [Documentos de Compra](/apis/versoes-anteriores/compras/documentos-de-compra.md)
{% endhint %}

Quando um documento é criado em um estado finalizado, torna-se impossível executar as seguintes operações em documentos de compra:

* Finalização do Documento de Compra
* Anulação do Documento de Compra
* AtualizarDocumento de Compra
* Eliminação do Documento de Compra

## Consulta do documento

Os documentos podem ser consultados a qualquer altura, antes ou depois de finalizados, e mesmo depois de anulados.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_purchases\_documents" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}
