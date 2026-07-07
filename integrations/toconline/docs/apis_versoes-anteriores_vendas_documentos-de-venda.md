> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/versoes-anteriores/vendas/documentos-de-venda.md).

# Documentos de Venda

## Criação do Documento de Venda

**1. Criação do cabeçalho**

Para dar início à criação de um documento comercial, começa-se pelo cabeçalho. Isto é realizado através de uma solicitação POST usando cURL, onde é necessário incluir um token de acesso (`access_token`), e o conteúdo (`payload JSON`) que detalha as especificações do documento, incluindo o tipo de documento (fatura, fatura simplificada, fatura-recibo), informação sobre o cliente (novo ou existente), condições de pagamento, detalhes sobre o IVA, entre outros atributos opcionais.

**2. Adição de Linhas**

Após a criação do cabeçalho, é possível adicionar uma ou mais linhas ao documento. Este passo permite detalhar os produtos ou serviços que estão sendo transacionados.

**3. Finalização do Documento**

O documento pode ser finalizado após a adição de todas as informações necessárias. Uma vez finalizado, o documento não pode ser alterado ou eliminado, apenas anulado se necessário.

Cada passo é crucial para assegurar que o documento comercial seja criado de forma precisa e conforme as necessidades do usuário. A atenção aos detalhes durante o processo de criação e finalização é fundamental para a integridade do documento.

***

### 1. Criar Cabeçalho de Documento de Venda

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_sales\_documents" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido acima, o *access\_token* é o *token* de acesso válido devolvido pelo serviço de OAuth. O *payload* JSON a enviar contém a seguinte informação:

<table><thead><tr><th width="298">Atributo</th><th width="325">Descrição</th><th>Obrigatório</th></tr></thead><tbody><tr><td>document_type</td><td>Tipo de documento. "FT": fatura, "FS": fatura simplificada, "FR": fatura-recibo.</td><td>Sim</td></tr><tr><td>date</td><td>Data do documento; por omissão, a data do pedido.</td><td>Não</td></tr><tr><td>document_series_prefix</td><td>Em alternativa ao campo "document_series_id".</td><td>Não</td></tr><tr><td>customer_tax_registration_number</td><td>NIF do cliente. Se o cliente com o NIF indicado não existir, será criado automaticamente.</td><td>Não</td></tr><tr><td>customer_business_name</td><td>Nome do cliente.</td><td>Sim</td></tr><tr><td>customer_address_detail</td><td>Morada do cliente.</td><td>Não</td></tr><tr><td>customer_postcode</td><td>Código postal do cliente, no formato 0000-000.</td><td>Não</td></tr><tr><td>customer_city</td><td>Cidade/Localidade do cliente.</td><td>Não</td></tr><tr><td>customer_country</td><td>País do cliente. Por omissão, "PT"; é o código ISO alpha-2 do país do cliente.</td><td>Não</td></tr><tr><td>customer_id</td><td>No caso do cliente já existir e não pretender criar um novo.</td><td>Não</td></tr><tr><td>due_date</td><td>Data de vencimento; por omissão, a data do documento, ou a referente ao prazo de pagamento configurado no cliente.</td><td>Não</td></tr><tr><td>settlement_expression</td><td>Desconto no cabeçalho, em percentagem; são suportados descontos compostos, como "3+5"</td><td>Não</td></tr><tr><td>payment_mechanism</td><td>Modos de pagamento aceites.</td><td>Não</td></tr><tr><td>vat_included_prices</td><td>Os preços nas linhas são com IVA incluído? Por omissão, não (false).</td><td>Não</td></tr><tr><td>operation_country</td><td>A região de operação para efeitos de IVA.</td><td>Não</td></tr><tr><td>currency_iso_code</td><td>É o código ISO da moeda do documento.</td><td>Não</td></tr><tr><td>currency_conversion_rate</td><td>É a taxa de conversão para EUR.</td><td>Não</td></tr><tr><td>retention</td><td>Percentagem de retenção a aplicar sobre os serviços.</td><td>Não</td></tr><tr><td>retention_type</td><td>Tipo de retenção ("IRS" ou "IRC"). Por omissão, "IRS".</td><td>Não</td></tr><tr><td>apply_retention_when_paid</td><td>A retenção é feita logo no documento (false) ou apenas no recebimento (true). Por omissão, false.</td><td>Não</td></tr><tr><td>notes</td><td>Notas ao documento.</td><td>Não</td></tr><tr><td>external_reference</td><td>Referência do documento externo.</td><td>Não</td></tr></tbody></table>

{% hint style="info" %}
**Nota 1 -** A série associada ao documento tem já que existir, e o seu "id" interno pode ser obtido por um:

{% code overflow="wrap" %}

```
GET /commercial_document_series?filter[document_type]=<o tipo de documento>&filter[prefix]=<o prefixo da série a usar> 
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
**Nota 2 -** Se o cliente for identificado pelo seu "id" interno tem já que existir, e o seu "id" interno pode ser obtido por um:

```
GET /customers?filter[tax_registration_number]=<o NIF do cliente>
```

{% endhint %}

{% hint style="info" %}
**Nota 3 -** São também suportados dois "países" adicionais: "PT-AC" (Portugal, Açores) e "PT-MA" (Portugal, Madeira). Os países disponíveis podem ser consultados por um GET /countries, ou um em particular por um:

```
GET /countries?filter[iso_alpha_2]=<o código do país>
```

{% endhint %}

{% hint style="info" %}
**Nota 4 -** O "id" interno da conta bancária da empresa deve ser obtido por um:

```
GET /company_bank_accounts?filter[iban]=<IBAN da conta> 
ou 
GET /company_bank_accounts?filter[name]=<nome da conta>
```

{% endhint %}

{% hint style="info" %}
**Nota 5** - O "id" interno da conta de caixa da empresa deve ser obtido por um

```
GET /cash_accounts?filter[name]=<nome da conta>
```

{% endhint %}

{% hint style="info" %}
**Nota 6** - O "id" interno do motivo de isenção deve ser obtido por um

{% code overflow="wrap" %}

```
GET /tax_exemption_reasons?filter[code]=<o código legal do motivo de isenção>  
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
**Nota 7** - O "id" interno da moeda deve ser obtido por um

```
GET /currencies?filter[iso_code]=<o código ISO da moeda>
```

{% endhint %}

### 2. Criação da(s) linha(s)

Após a criação do documento, é possível personalizar as linhas do mesmo para detalhar produtos, serviços, ou outros descritores específicos. As linhas podem ser configuradas para refletir várias especificidades fiscais e comerciais, incluindo a opção de adicionar linhas apenas descritivas, com ou sem valor associado.

As linhas podem referenciar três tipos de itens: produtos, serviços ou descritores (juros, imobilizado, impostos especiais...). Para cada um destes o *payload* é ligeiramente diferente, e cada um será descrito de seguida.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_sales\_receipt\_lines" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido mencionado acima, o `access_token` representa o token de acesso validado pelo serviço de OAuth. O payload JSON a ser enviado contém informações distintas para um produto, um serviço ou um descritor, conforme será detalhado nas etapas seguintes.ccc

#### 2.1. Criar Linha de Documento de Venda para um Produto

<table><thead><tr><th width="158">Atributo</th><th width="363">Descrição</th><th>Obrigatório</th></tr></thead><tbody><tr><td>document_id</td><td>ID do documento ao qual esta linha está associada.</td><td>Sim</td></tr><tr><td>item_type</td><td>Tipo de item: "Product" para produto.</td><td>Sim</td></tr><tr><td>quantity</td><td>Quantidade do item. Por omissão, 1.</td><td>Não</td></tr><tr><td>unit_price</td><td>Preço unitário do item. Por omissão, é usado o PVP associado ao produto.</td><td>Não</td></tr><tr><td>settlement_expression</td><td>Desconto de linha, em percentagem; são suportados descontos compostos, como "3+5".</td><td>Não</td></tr><tr><td>item_id</td><td>ID do produto.</td><td>Não</td></tr><tr><td>unit_of_measure_id</td><td>ID da unidade de medida. Por omissão, é a configurada no produto ou a padrão da empresa.</td><td>Não</td></tr><tr><td>tax_id</td><td>ID do imposto associado ao item. Por omissão, é aplicado o IVA associado ao produto ou a taxa normal da empresa.</td><td>Não</td></tr></tbody></table>

#### 2.2. Criar Linha de Documento de Venda para um Serviço

{% hint style="warning" %}
Já deve ter um Serviço criado previamente. Pode consultar mais informação em [Produtos e Serviços](/apis/empresa/produtos-e-servicos.md#criar-servicos)
{% endhint %}

| Atributo               | Descrição                                                           | Obrigatório |
| ---------------------- | ------------------------------------------------------------------- | ----------- |
| type                   | Tipo de linha de documento.                                         | Sim         |
| document\_id           | ID do documento ao qual esta linha está associada.                  | Sim         |
| item\_type             | Tipo de item: "Service" (serviço).                                  | Sim         |
| quantity               | Quantidade do serviço.                                              | Não         |
| unit\_price            | Preço unitário do serviço.                                          | Não         |
| settlement\_expression | Expressão de liquidação, em percentagem.                            | Não         |
| item\_id               | ID do serviço associado à linha.                                    | Não         |
| unit\_of\_measure\_id  | ID da unidade de medida.                                            | Não         |
| tax\_id                | ID do imposto sobre o valor acrescentado (IVA) aplicado ao serviço. | Não         |

#### 2.3. Criar Linha de Documento de Venda para um Descritor

{% hint style="warning" %}
Já deve ter um Descritor criado previamente. Pode consultar mais informação em [Descritores de Taxa](/apis/apis-auxiliares/descritores-de-taxa.md#criar-descritores)
{% endhint %}

<table><thead><tr><th width="230">Atributo</th><th width="351">Descrição</th><th>Obrigatório</th></tr></thead><tbody><tr><td>document_id</td><td>ID do documento ao qual esta linha está associada.</td><td>Sim</td></tr><tr><td>item_type</td><td>Tipo de item: "Service" para serviço.</td><td>Sim</td></tr><tr><td>quantity</td><td>Quantidade do serviço. Por omissão, 1.</td><td>Não</td></tr><tr><td>unit_price</td><td>Preço unitário do serviço. Por omissão, é usado o PVP associado ao serviço.</td><td>Não</td></tr><tr><td>settlement_expression</td><td>Desconto de linha, em percentagem; são suportados descontos compostos, como "3+5".</td><td>Não</td></tr><tr><td>item_id</td><td>ID do serviço.</td><td>Não</td></tr><tr><td>unit_of_measure_id</td><td>ID da unidade de medida. Por omissão, é a configurada no serviço ou a padrão da empresa.</td><td>Não</td></tr><tr><td>tax_id</td><td>ID do imposto associado ao serviço. Por omissão, é aplicado o IVA associado ao serviço ou a taxa normal da empresa.</td><td>Não</td></tr></tbody></table>

#### 2.5. Criar Linha de Documento de Venda para uma Descrição Sem Valor

Para o caso particular de uma linha de descrição sem valor, este *payload* contém a seguinte informação:

| Atributo     | Descrição                                 | Obrigatório |
| ------------ | ----------------------------------------- | ----------- |
| description  | Descrição da linha do documento.          | Sim         |
| document\_id | ID do documento ao qual a linha pertence. | Sim         |

### 3. Finalização do documento

Após todas as linhas criadas, e se não houver mais nenhuma alteração ao documento, este pode ser finalizado.

{% hint style="danger" %}
Após a finalização, a alteração ou eliminação do cabeçalho e das linhas deixa de ser possível, assim como a criação de linhas adicionais.
{% endhint %}

No pedido acima, o *access\_token* é o *token* de acesso válido devolvido pelo serviço de OAuth e o *id do documento* é o "id" interno do documento (cabeçalho) é o devolvido no campo "id" da resposta ao seu pedido de criação (ver ponto **1. Criação do cabeçalho**). O *payload* JSON a enviar contém a seguinte informação:

<table><thead><tr><th width="144">Atributo</th><th>Descrição</th><th>Obrigatório</th></tr></thead><tbody><tr><td>type</td><td>Tipo de documento.</td><td>Sim</td></tr><tr><td>id</td><td>Identificador interno do documento (cabeçalho). Este "id" é devolvido na resposta ao pedido de criação do cabeçalho.</td><td>Sim</td></tr><tr><td>status</td><td>Identificação do estado do documento. 1: documento finalizado.</td><td>Sim</td></tr></tbody></table>

<details>

<summary>Exemplo de Response</summary>

```json
{
    "meta": {
        "observed": {
            "scalar": 1
        }
    },
    "data": {
        "type": "commercial_sales_documents",
        "id": "12",
        "attributes": {
            "document_no": "FT 2023/3",
            "status": 1,
            "date": "2023-01-01",
            "payment_mechanism": null,
            "gross_total": 11.38,
            "notes": "Notas ao documento",
            "document_type": "FT",
            "pending_total": 11.38,
            "retention": 7.5,
            "settlement": null,
            "settlement_total": 0.75,
            "due_date": "2023-01-01",
            "emailed": null,
            "tax_payable": 2.13,
            "net_total": 9.25,
            "document_hash_sum": "k8FEN8/xf+GErWsPiATVpAWd5jM64132yWVldc6qg7XNxpjt+JCJTwgqQ5fswUsXw0MbbtBzHpN/aZozPiiiRHiHAR+TM4hJ8u5XnAe5hiss2Tn//QiCxbvolLywCqRw4cIt1UcbhMEP97YYj0FdLgzrPTF1amU+Xk81EkBzq54=",
            "hash_control": "1",
            "reference": null,
            "customer_tax_registration_number": "229659179",
            "customer_business_name": "Ricardo Ribeiro",
            "customer_address_detail": "Praceta da Liberdade n5",
            "customer_postcode": "1000-101",
            "customer_city": "Lisboa",
            "created_at": "2024-02-21 16:41:50.588385",
            "updated_at": "2024-02-22 18:21:13.512872",
            "is_receipt": null,
            "vehicle_registration": null,
            "shipment_address_detail": null,
            "shipment_postcode": null,
            "shipment_city": null,
            "vat_incidence_ise": 0,
            "vat_incidence_red": 0,
            "vat_incidence_int": 0,
            "vat_incidence_nor": 9.25,
            "vat_total_red": 0,
            "vat_total_int": 0,
            "vat_total_nor": 2.13,
            "customer_tax_country_region": "PT",
            "currency_amount": null,
            "customer_country": "PT",
            "printed": null,
            "currency_conversion_rate": 1,
            "currency_iso_code": "EUR",
            "system_entry_date": "2024-02-22 18:21:13.512872",
            "retention_value": 0.69,
            "parent_document_reference": "",
            "acts_as_shipment_document": false,
            "manual_registration_series": "",
            "manual_registration_number": "",
            "shipment_loading_time": null,
            "expected_shipment_unloading_time": null,
            "apply_retention_when_paid": true,
            "retention_aware_gross_total": 10.69,
            "pending_retention_value": 0.69,
            "communication_status": "unsent",
            "shipment_country": null,
            "is_invoice_receipt": null,
            "due_days": null,
            "scheduled_start_date": null,
            "scheduled_end_date": null,
            "scheduled_description": null,
            "scheduled_interval": null,
            "base_currency_gross_total": null,
            "base_currency_net_total": null,
            "base_currency_pending_total": null,
            "base_currency_settlement_total": null,
            "base_currency_retention_total": null,
            "base_currency_retention_aware_gross_total": null,
            "base_currency_tax_payable": null,
            "base_currency_vat_incidence_nor": null,
            "base_currency_vat_total_nor": null,
            "base_currency_vat_incidence_int": null,
            "base_currency_vat_total_int": null,
            "base_currency_vat_incidence_red": null,
            "base_currency_vat_total_red": null,
            "base_currency_vat_incidence_ise": null,
            "base_currency_conversion_difference": null,
            "start_date": null,
            "end_date": null,
            "periodicity": null,
            "description": null,
            "reference_document_type": null,
            "is_active": null,
            "scheduled_invoice_id": null,
            "issue_finalized": null,
            "periodicity_type": null,
            "invoice_counter": null,
            "expired": null,
            "send_email": null,
            "communication_code": null,
            "shipment_from_address_detail": null,
            "shipment_from_postcode": null,
            "shipment_from_city": null,
            "shipment_from_country": null,
            "is_third_party": false,
            "is_document_to_self": false,
            "manual_registration_type": null,
            "third_party_type": 0,
            "document_area": "FT",
            "parent_document_type": null,
            "parent_document_area": null,
            "communication_code_source": "webservice",
            "cashed_vat": false,
            "made_available_to": true,
            "other_taxes_total": 0,
            "base_currency_other_taxes_total": null,
            "other_retentions": 0,
            "base_currency_other_retentions": null,
            "retention_type": null,
            "net_settlement_total": null,
            "external_reference": "Referência do documento externo",
            "document_series_prefix": "2023",
            "document_series_no": 3,
            "email_readed": false,
            "vat_included_prices": false,
            "voided_reason": null,
            "settlement_with_tax": 0.92,
            "settlement_without_tax": 0.75,
            "line_settlement_with_tax": 0,
            "line_settlement_without_tax": 0,
            "total_pending_quantity": null,
            "child_documents_ids": null,
            "parent_documents_ids": null,
            "receipts_ids": null,
            "operation_country": "PT",
            "sort_status": 1,
            "settlement_percentage": 7.500000000000000000000,
            "settlement_expression": "7.5",
            "vat_percentage_red": null,
            "vat_percentage_int": null,
            "vat_percentage_nor": 23.0,
            "vat_incidence_ise_unrounded": 0,
            "vat_incidence_red_unrounded": 0,
            "vat_incidence_int_unrounded": 0,
            "vat_incidence_nor_unrounded": 0,
            "vat_total_red_unrounded": 0,
            "vat_total_int_unrounded": 0,
            "vat_total_nor_unrounded": 0,
            "settlement_with_tax_unrounded": 0,
            "settlement_without_tax_unrounded": 0,
            "line_settlement_with_tax_unrounded": 0,
            "line_settlement_without_tax_unrounded": 0,
            "retention_value_unrounded": 0,
            "required_mask": 10,
            "fulfilled_mask": 0,
            "public_link": "https://app.toconline.pt/public_links/link/uDdZazxttzBsJwrne83w6kSUwkbM2a8vlYIiXztqKlYhRRdNIR8hFfDLi0sxw98g-0CWzNyMJ0RlBfRMbjBomsK-QOysT0Gm3D7poBTOivqjzCsRTIPTbcs3s3lN3LyGQoILoexjjctqpvK6CBSjOA"
        },
        "relationships": {
            "bank_accounts": {
                "data": null
            },
            "cash_accounts": {
                "data": null
            },
            "commercial_document_series": {
                "data": {
                    "type": "commercial_document_series",
                    "id": "72"
                }
            },
            "company": {
                "data": {
                    "type": "current_company",
                    "id": "800000046"
                }
            },
            "currency": {
                "data": {
                    "type": "currencies",
                    "id": "1"
                }
            },
            "customer": {
                "data": {
                    "type": "customers",
                    "id": "57"
                }
            },
            "lines": {
                "data": []
            },
            "tax_exemption_reasons": {
                "data": null
            },
            "user": {
                "data": {
                    "type": "current_company_users",
                    "id": "800000863"
                }
            }
        }
    }
}
```

</details>

{% hint style="info" %}
Este pedido é equivalente ao pedido de alteração do cabeçalho do documento (ver **Alteração do cabeçalho do documento**). Por isso, a finalização do documento — que é a alteração do atributo "status" do cabeçalho — pode ser realizada juntamente com a alteração de outros atributos ou relações do cabeçalho, num único pedido.
{% endhint %}

***

## Alteração do Documento de Venda

Enquanto o documento não for finalizado, tanto o seu cabeçalho como qualquer uma das suas linhas podem ser alteradas a qualquer momento. Além disso, qualquer uma das linhas pode ser eliminada (ver **Eliminação de uma linha**), e novas linhas criadas e adicionadas (ver **2. Criação da(s) linha(s)**).

### Atualizar Linha de Documento de Venda

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_sales\_document\_lines" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

O exemplo de *payload* acima deve por isso ser ajustado consoante se trate da alteração duma linha de produto, de serviço, de descritor ou de descrição. É ainda possível alterar o tipo de linha (de uma linha de serviço para uma de produto, por exemplo).

{% hint style="info" %}
O *access\_token* é o *token* de acesso válido devolvido pelo serviço de OAuth.

O *id da linha* é o "id" interno da linha do documento, devolvido no campo "id" da resposta ao seu pedido de criação (ver ponto [#id-2.-criacao-da-s-linha-s](#id-2.-criacao-da-s-linha-s "mention") )
{% endhint %}

A informação que pode ser enviada no pedido de alteração da linha do documento é equivalente à que é obtida após criação ou obtenção de Documentos de Venda.

<table><thead><tr><th width="329">Atributo</th><th>Descrição</th></tr></thead><tbody><tr><td>type</td><td>Tipo de linha de documento.</td></tr><tr><td>id</td><td>Identificador interno da linha do documento.</td></tr><tr><td>item_id</td><td>ID do item associado à linha.</td></tr><tr><td>item_code</td><td>Código do item.</td></tr><tr><td>description</td><td>Descrição da linha.</td></tr><tr><td>amount</td><td>Valor total da linha.</td></tr><tr><td>unit_price</td><td>Preço unitário do item.</td></tr><tr><td>quantity</td><td>Quantidade do item.</td></tr><tr><td>tax_code</td><td>Tipo de IVA aplicado.</td></tr><tr><td>tax_percentage</td><td>Percentagem de IVA.</td></tr><tr><td>tax_amount</td><td>Valor do IVA aplicado.</td></tr><tr><td>settlement_amount</td><td>Valor de liquidação da linha.</td></tr><tr><td>settlement_percentage</td><td>Percentagem de liquidação da linha.</td></tr><tr><td>exemption_reason</td><td>Motivo da isenção de imposto.</td></tr><tr><td>created_at</td><td>Data e hora de criação da linha.</td></tr><tr><td>updated_at</td><td>Data e hora da última atualização da linha.</td></tr><tr><td>tax_country_region</td><td>Região do IVA aplicado.</td></tr><tr><td>item_unit_price_includes_vat</td><td>Indica se o preço unitário do item inclui IVA.</td></tr><tr><td>net_amount</td><td>Valor líquido da linha.</td></tr><tr><td>net_unit_price</td><td>Preço unitário líquido do item.</td></tr><tr><td>net_tax_amount</td><td>Valor líquido do IVA.</td></tr><tr><td>date</td><td>Data associada à linha.</td></tr><tr><td>retention_value</td><td>Valor de retenção.</td></tr><tr><td>pending_total</td><td>Total pendente.</td></tr><tr><td>pending_retention_value</td><td>Valor de retenção pendente.</td></tr><tr><td>locked</td><td>Indica se a linha está bloqueada.</td></tr><tr><td>base_currency_amount</td><td>Valor total da linha na moeda base.</td></tr><tr><td>base_currency_unit_price</td><td>Preço unitário do item na moeda base.</td></tr><tr><td>base_currency_tax_amount</td><td>Valor do IVA na moeda base.</td></tr><tr><td>base_currency_net_unit_price</td><td>Preço unitário líquido do item na moeda base.</td></tr><tr><td>base_currency_net_amount</td><td>Valor líquido da linha na moeda base.</td></tr><tr><td>base_currency_settlement_without_tax</td><td>Valor de liquidação sem IVA na moeda base.</td></tr><tr><td>original_document_no</td><td>Número do documento original associado à linha.</td></tr><tr><td>net_settlement_amount</td><td>Valor líquido de liquidação.</td></tr><tr><td>net_amount_with_header_settlement</td><td>Valor líquido da linha com liquidação no cabeçalho.</td></tr><tr><td>amount_with_header_settlement</td><td>Valor total da linha com liquidação no cabeçalho.</td></tr><tr><td>settlement_with_tax</td><td>Valor de liquidação com IVA.</td></tr><tr><td>settlement_without_tax</td><td>Valor de liquidação sem IVA.</td></tr><tr><td>base_currency_settlement_with_tax</td><td>Valor de liquidação com IVA na moeda base.</td></tr><tr><td>item_type</td><td>Tipo de item: "Product" (produto), "Service" (serviço) ou "TaxDescriptor" (descritor de imposto).</td></tr><tr><td>pending_quantity</td><td>Quantidade pendente.</td></tr><tr><td>imported_quantity</td><td>Quantidade importada.</td></tr><tr><td>settlement_expression</td><td>Expressão de liquidação.</td></tr><tr><td>tax_descriptor_id</td><td>ID do descritor de imposto associado à linha.</td></tr></tbody></table>

Por favor, note que alguns atributos podem estar marcados como `null`, o que significa que não foram fornecidos valores para esses atributos no JSON.

{% hint style="info" %}
**Nota 1 -** O `"id"` interno do documento, associado ao cabeçalho, corresponde ao "id" fornecido na resposta ao pedido de criação desse cabeçalho. Consulte a secção [#id-1.-criacao-do-cabecalho](#id-1.-criacao-do-cabecalho "mention") para mais detalhes.
{% endhint %}

{% hint style="info" %}
**Nota 2 -** O item (serviço, produto ou descritor) já deve existir, e o seu "`id"` interno pode ser obtido por um

```
GET /services?filter[item_code]=<o código do serviço> 
ou 
GET /products?filter[item_code]=<o código do produto> 
ou 
GET /tax_descriptors?filter[notation]=<o código do descritor>
```

{% endhint %}

{% hint style="info" %}
**Nota 3 -** Além de "PT" (Portugal Continental), são também suportadas as regiões autónomas de IVA "PT-AC" (Açores) e "PT-MA" (Madeira).

Para consultar os regimes de IVA no âmbito do OSS, é importante notar que os códigos de região correspondem aos códigos dos países. Estes códigos podem ser obtidos através do seguinte pedido:

```
GET /countries?filter[iso_alpha_2]=<o código do país OSS>
```

{% endhint %}

{% hint style="info" %}
**Nota 4 -** A unidade de medida deve existir previamente, e seu identificador `"id"` interno pode ser obtido através de um

{% code overflow="wrap" %}

```
GET /units_of_measure?filter[unit_of_measure]=<o código da unidade de medida>
```

{% endcode %}
{% endhint %}

{% hint style="info" %}
**Nota 5** - O "id" interno da taxa de IVA deve ser obtido por um

{% code overflow="wrap" %}

```
GET /taxes?filter[tax_code]=&filter[tax_country_region]=<a região do IVA>
ou
GET /taxes?filter[tax_code]=&filter[tax_country_region]=<a região do IVA>&filter[tax_percentage]=<a percentagem IVA>
```

{% endcode %}
{% endhint %}

### Remover Linha de Documento de Venda

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_sales\_document\_lines/{salesDocumentLineId}" method="delete" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido acima, o *access\_token* é o *token* de acesso válido devolvido pelo serviço de OAuth e o *id da linha* é o "id" interno da linha do documento, devolvido no campo "id" da resposta ao seu pedido de criação (ver ponto **2. Criação da(s) linha(s)**).

***

## Anulação do documento

Após a sua finalização, o documento deixa de poder ser eliminado, podendo apenas ser anulado.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_sales\_receipts/{salesReceiptId}/void" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido acima, o *access\_token* é o *token* de acesso válido devolvido pelo serviço de OAuth e o *id do documento* é o "id" interno do documento (cabeçalho) é o devolvido no campo "id" da resposta ao seu pedido de criação (ver ponto **1. Criação do cabeçalho**). O *payload* JSON a enviar contém a seguinte informação:

```json
{
  "data": {
    "type": "commercial_sales_documents",                             // [OBRIGATÓRIO]
    "id": "1",                                                        // [OBRIGATÓRIO] Identificador interno do documento (cabeçalho). Este "id" é o devolvido na resposta ao pedido de criação do cabeçalho, ver acima.
    "attributes": {                                                   // [OBRIGATÓRIO] Os atributos do documento
      "status": 4,                                                    // [OBRIGATÓRIO] Identificação do estado do documento. 4: documento anulado.
      "voided_reason": "Motivo pelo qual se anula o documento"        // [OBRIGATÓRIO]
    }
  }
}
```

{% hint style="danger" %}
Após a sua anulação, o documento deixa de poder ser alterado. Esta operação é irreversível.
{% endhint %}

***

## Remover Documento de Venda

{% hint style="success" %}
Enquanto estiver em preparação, o documento pode ser eliminado.
{% endhint %}

{% hint style="danger" %}
Após a **finalização**, a sua eliminação — assim como a sua alteração — deixa de ser possível. Para saber mais consulte: [#id-3.-finalizacao-do-documento](#id-3.-finalizacao-do-documento "mention")
{% endhint %}

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_sales\_documents/{id}" method="delete" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido acima, o *access\_token* é o *token* de acesso válido devolvido pelo serviço de OAuth e o *id do documento* é o "id" interno do documento (cabeçalho) é o devolvido no campo "id" da resposta ao seu pedido de criação (ver ponto **1. Criação do cabeçalho**).

{% hint style="warning" %}
Esta operação é irreversível.
{% endhint %}
