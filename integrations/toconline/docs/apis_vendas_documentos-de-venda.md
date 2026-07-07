> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/vendas/documentos-de-venda.md).

# Documentos de Venda

## Criar Documento de Venda

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_sales\_documents" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

#### Cabeçalho Documentos de Venda

| Atributo                            | Descrição                                                                                                          | Obrigatório |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| document\_type                      | Tipo de documento. "FT": fatura, "FS": fatura simplificada, "FR": fatura-recibo.                                   | Sim         |
| date                                | Data do documento. Por omissão, a data do pedido.                                                                  | Não         |
| document\_series\_id                | Identificador interno da série.                                                                                    | Não         |
| document\_series\_prefix            | Prefixo da série.                                                                                                  | Não         |
| customer\_id                        | Identificador interno do cliente.                                                                                  | Não         |
| customer\_tax\_registration\_number | NIF do cliente.                                                                                                    | Não         |
| customer\_business\_name            | Nome do cliente.                                                                                                   | Sim         |
| customer\_address\_detail           | Morada do cliente.                                                                                                 | Não         |
| customer\_postcode                  | Código postal do cliente, no formato 0000-000.                                                                     | Não         |
| customer\_city                      | Cidade/Localidade do cliente.                                                                                      | Não         |
| customer\_country                   | País do cliente. Por omissão, "PT".                                                                                | Não         |
| due\_date                           | Data de vencimento. Por omissão, a data do documento, ou a referente ao prazo de pagamento configurado no cliente. | Não         |
| settlement\_expression              | Desconto no cabeçalho, em percentagem. São suportados descontos compostos, como "3+5".                             | Não         |
| payment\_mechanism                  | Modo de pagamento.                                                                                                 | Não         |
| bank\_account\_id                   | Identificador interno da conta bancária da empresa para onde o recebimento é feito.                                | Não         |
| cash\_account\_id                   | Identificador interno da conta de caixa da empresa para onde o recebimento é feito.                                | Não         |
| vat\_included\_prices               | Os preços nas linhas são com IVA incluído? Por omissão, não (false).                                               | Não         |
| tax\_exemption\_reason\_id          | Motivo de isenção de IVA.                                                                                          | Não         |
| operation\_country                  | A região de operação para efeitos de IVA.                                                                          | Não         |
| currency\_id                        | Identificador interno da moeda.                                                                                    | Não         |
| currency\_iso\_code                 | Código ISO da moeda do documento.                                                                                  | Não         |
| currency\_conversion\_rate          | Taxa de conversão para EUR (1 EUR = n USD                                                                          | Nãão        |
| retention                           | Percentagem de retenção a aplicar sobre os serviços.                                                               | Não         |
| retention\_type                     | Tipo de retenção ("IRS" ou "IRC"). Por omissão, "IRS".                                                             | Não         |
| apply\_retention\_when\_paid        | A retenção é feita logo no documento (false) ou apenas no recebimento (true). Por omissão, false.                  | Não         |
| notes                               | Notas ao documento.                                                                                                | Não         |
| external\_reference                 | Referência do documento externo.                                                                                   | Não         |
| lines                               | Lista de linhas do documento.                                                                                      | Sim         |

#### Linha de Documentos de Venda

| Atributo               | Descrição                                                                                    | Obrigatório |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| item\_type             | Tipo de item: "Service": serviços, "Product": produtos, "TaxDescriptor": descritores.        | Sim         |
| item\_id               | Identificador interno do item.                                                               | Não         |
| item\_code             | Código do serviço/produto/descritor.                                                         | Não         |
| description            | Descrição da linha. Por omissão é usada a descrição associada ao item, se este for indicado. | Sim         |
| unit\_of\_measure\_id  | Identificador interno da unidade de medida.                                                  | Não         |
| unit\_of\_measure      | Unidade de medida. Por omissão é a configurada no item (se for serviço ou produto).          | Não         |
| quantity               | Quantidade da linha.                                                                         | Sim         |
| unit\_price            | Preço unitário da linha.                                                                     | Sim         |
| settlement\_expression | Desconto de linha, em percentagem.                                                           | Não         |
| tax\_id                | Identificador interno da taxa de IVA.                                                        | Não         |
| tax\_code              | Tipo de IVA associado ao item.                                                               | Não         |
| tax\_percentage        | Percentagem de IVA a usar.                                                                   | Não         |
| tax\_country\_region   | Região do IVA.                                                                               | Não         |

{% hint style="info" %}
**Nota 1 -** A série associada ao documento tem já que existir, e o seu "id" interno pode ser obtido por um:

`GET /commercial_document_series?filter[document_type]=<o tipo de documento>&filter[prefix]=<o prefixo da série a usar>`
{% endhint %}

{% hint style="info" %}
**Nota 2 -** Se o cliente for identificado pelo seu "id" interno tem já que existir, e o seu "id" interno pode ser obtido por um:

`GET /customers?filter[tax_registration_number]=<o NIF do cliente>`
{% endhint %}

{% hint style="info" %}
**Nota 3 -** São também suportados dois "países" adicionais: "PT-AC" (Portugal, Açores) e "PT-MA" (Portugal, Madeira). Os países disponíveis podem ser consultados por um GET /countries, ou um em particular por um:

`GET /countries?filter[iso_alpha_2]=<o código do país>`
{% endhint %}

{% hint style="info" %}
**Nota 4 -** O "id" interno da conta bancária da empresa deve ser obtido por um:

`GET /company_bank_accounts?filter[iban]=<IBAN da conta>`

`ou`

`GET /company_bank_accounts?filter[name]=<nome da conta>`
{% endhint %}

{% hint style="info" %}
**Nota 5** - O "id" interno da conta de caixa da empresa deve ser obtido por um

`GET /cash_accounts?filter[name]=<nome da conta>`
{% endhint %}

{% hint style="info" %}
**Nota 6** - O "id" interno do motivo de isenção deve ser obtido por um

`GET /tax_exemption_reasons?filter[code]=<o código legal do motivo de isenção>`
{% endhint %}

{% hint style="info" %}
**Nota 7** - O "id" interno da moeda deve ser obtido por um

`GET /currencies?filter[iso_code]=<o código ISO da moeda>`
{% endhint %}

{% hint style="info" %}
**Nota 8:** O item (serviço, produto ou descritor) tem já que existir, e o seu "id" interno pode ser obtido por um

`GET /services?filter[item_code]=<o código do serviço>`

`ou`

`GET /products?filter[item_code]=<o código do produto>`

`ou`

`GET /tax_descriptors?filter[notation]=<o código do descritor de taxa>`
{% endhint %}

{% hint style="info" %}
**Nota 9**: A unidade de medida tem já que existir, e o seu "id" interno pode ser obtido por um

`GET /units_of_measure?filter[unit_of_measure]=un|<o código da unidade de medida>`
{% endhint %}

{% hint style="info" %}
**Nota 10**: O "id" interno da taxa de IVA deve ser obtido por um

`GET /taxes?filter[tax_code]=<Código de Taxa> &filter[tax_country_region]=<Código da Região>`

`ou`

`GET /taxes?filter[tax_code]=<Código de Taxa> &filter[tax_country_region]=PT|<Código da Região>&filter[tax_percentage]=`\<a percentagem IVA>
{% endhint %}

{% hint style="info" %}
**Nota 11:** Para as faturas-recibos (FR), o recibo associado é criado automaticamente quando a FR é finalizada.
{% endhint %}

{% hint style="success" %}
Ao submenter o documento de venda fica automaticamente **finalizado**!
{% endhint %}

## Alteração do Documento de Venda

{% hint style="danger" %}
Após a criação de um documento de venda este fica automaticamente finalizado, se pretender criar documentos sem finalizar pode consultar a versão anterior desta API:[Documentos de Venda](/apis/vendas/documentos-de-venda.md)
{% endhint %}

Quando um documento é criado em um estado finalizado, torna-se impossível executar as seguintes operações em documentos de venda:

* Finalização do Documento de Venda
* Anulação do Documento de Venda
* Atualizar Documento de Venda
* Eliminação do Documento de Venda

***

## Obter Documento de Venda por Id

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_sales\_documents/{salesDocumentId}" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

## Obter Todos os Documentos de Venda

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_sales\_documents/" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}
