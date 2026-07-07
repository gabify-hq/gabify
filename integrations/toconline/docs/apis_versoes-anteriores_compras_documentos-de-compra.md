> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/versoes-anteriores/compras/documentos-de-compra.md).

# Documentos de Compra

## Criação de Documentos de Compra

Para a criação de compras no sistema, é necessário seguir dois passos principais: a criação do cabeçalho e a inserção de uma ou mais linhas correspondentes aos itens adquiridos.

1. **Cabeçalho da Compra**: O cabeçalho contém informações gerais sobre a compra, como data, fornecedor e condições de pagamento.
2. **Linhas da Compra**: Cada linha detalha um item específico comprado, incluindo a descrição, quantidade e preço.
3. **Finalização de Documento de Compra**

### 1. Criar Cabeçalho de Documentos de Compra

De modo a criar uma compra, deverá inicialmente criar o cabeçalho do documento. Para este efeito, deverá realizar o seguinte pedido:

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_sales\_document\_lines" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido acima, o \<access\_token> corresponde ao token de acesso válido devolvido pelo serviço de OAuth

Caso a compra seja realizada em euros, o \<payload JSON> deverá vir de acordo com os exemplos seguintes:

#### 1.1 Criar Cabeçalho de Documento de Venda para uma Nova Empresa

```json

{
  "data": {
    "type": "commercial_purchases_documents",
    "attributes": {
      "document_type": "FC", //[OBRIGATÓRIO] Pode ser FC (fatura de compra), NCF (nota de crédito), NDF (nota de débito), DSP (fatura de despesaa)
      "date": "2020-05-25", // Por omissão, a data de hoje
      "due_date": "2020-05-25", // Por omissão, a data do documento
      "currency_conversion_rate": 0.813 // Obrigatório quando a moeda não é EUR. Taxa de conversão da moeda para EUR (1 EUR = x)
      "supplier_tax_registration_number": "888888880", // Por omissão, o fornecedor indiferenciado (999999990)
      
      //**** Para uma empresa que já existe
      "company_id": 2,

      //id da moeda usada
      "currency_id" :2
      
      //id de um fornecedor
      "supplier_id": 2,
      
      // Indicar o atributo seguinte, com o valor true, apenas se os preços indicados nas linhas forem preços com IVA incluído
      "external_reference": "Texto livre, referente ao campo Vossa Ref.", //
      "vat_included_prices": true,
      // Indicar o atributo seguinte apenas se existir desconto de cabeçalho (7,5%, neste exemplo)
      "settlement_expression": "7.5",
      // Indicar o atributo seguinte apenas se existir retenção (10€, neste exemplo)
      "retention_total": 10
      
      // Associação à série de documentos. Pode ser omitida, se for para usar a série por omissão
     "commercial_document_series_id": "<id da série de documentos associada>" // Este id pode ser obtido por um GET /commercial_document_series?filter[document_type]=FC|NCF|...&filter[prefix]=2020|ou outro qualquer...
    }
  }
}
```

{% hint style="warning" %}
Após criar o cabeçalho, a resposta TEM QUE ser consultada para obtenção do identificador interno ("id") da compra criada. Este identificador será necessário para a criação de todas as linhas.
{% endhint %}

#### 1.2 Criar Cabeçalho de Documento de Venda para uma Empresa Existente

```json
{
  "data": {
    "type": "commercial_purchases_documents",
    "attributes": {
      "document_type": "FC", //[OBRIGATÓRIO] Pode ser FC (fatura de compra), NCF (nota de crédito), NDF (nota de débito), DSP (fatura de despesaa)
      "date": "2020-05-25", // Por omissão, a data de hoje
      "due_date": "2020-05-25", // Por omissão, a data do documento
      "currency_conversion_rate": 0.813 // Obrigatório quando a moeda não é EUR. Taxa de conversão da moeda para EUR (1 EUR = x)
      "supplier_tax_registration_number": "888888880", // Por omissão, o fornecedor indiferenciado (999999990)

      //**** Para uma empresa que já existe
      "company_id": 2,
      
      // Indicar o atributo seguinte, com o valor true, apenas se os preços indicados nas linhas forem preços com IVA incluído
      "external_reference": "Texto livre, referente ao campo Vossa Ref.", //
      "vat_included_prices": true,
      // Indicar o atributo seguinte apenas se existir desconto de cabeçalho (7,5%, neste exemplo)
      "settlement_expression": "7.5",
      // Indicar o atributo seguinte apenas se existir retenção (10€, neste exemplo)
      "retention_total": 10
      
      // Associação à série de documentos. Pode ser omitida, se for para usar a série por omissão
     "commercial_document_series_id": "<id da série de documentos associada>" // Este id pode ser obtido por um GET /commercial_document_series?filter[document_type]=FC|NCF|...&filter[prefix]=2020|ou outro qualquer...
    }
  }
}
```

### 2. Criar Linhas de Documentos de Compra

Em todos os pedidos seguintes, é necessário saber qual o id do documento de compra. Este id pode ser guardado a partir da resposta (JSON) ao pedido de criação anterior, ou pode ser consultado via API. Via API, o id do documento pode ser obtido por um filtro a todos os Documentos de Compra usando o número do documento (finalizado).

{% code overflow="wrap" %}

```
GET /commercial_purchases_documents?filter[document_no]=<número do documento, ex: FC 2020/1> 
```

{% endcode %}

Se o documento ainda não estiver finalizado (fechado), então ainda não tem número atribuído, e o GET anterior não poderá ser feito! Em alternativa pode realizado um filtro a todos os Documentos de Compra usando o estado do documento e número de registro fiscal do fornecedor.

{% code overflow="wrap" %}

```
GET /commercial_purchases_documents?filter[status]=0&filter[supplier_tax_registration_number]=<número de registro fiscal do fornecedor>
```

{% endcode %}

De modo a inserir linhas na compra criada, deverá realizar o seguinte pedido

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_purchases\_payment\_lines" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido acima, o \<access\_token> corresponde ao token de acesso válido devolvido pelo serviço de OAuth. O payload JSON deverá vir no seguinte formato, dependendo se se trata de um produto, ou categoria de despesa.

{% hint style="warning" %}
Nos documentos de despesas (tipo de documento DSP), só são aceites linhas de Categorias de Despesa, não de Produtos.
{% endhint %}

#### 2.1 Criar Linha para Produto

```json
{
  "data": {
    "type": "commercial_purchases_document_lines",
    "attributes": {
      "quantity": 1,
      "unit_price": 20,
      "item_type": "Product",
      "item_code": "PTEST", // NOTA: já tem que existir o produto com este código
      // Indicar o atributo seguinte apenas se existir desconto de linha (3%, neste exemplo)
      "settlement_expression":"3",
      "document_id": 2, // Associação ao documento de compra
      "tax_id":1  // O id da taxa de IVA pode ser obtido por um GET /taxes?filter[tax_code]=NOR|INT|RED|ISE
    }
  }
}
```

#### 2.2 Criar Linha para Categoria de Despesas

```json
{
  "data": {
    "type": "commercial_purchases_document_lines",
    "attributes": {
      "quantity": 1,
      "unit_price": 20,
      "item_type": "Purchases::ExpenseCategory",
      "item_code": "ETEST", // NOTA: já tem que existir a categoria de despesa com este código
    
      "documet_id": 2,
      "tax_id": 2
    }
  }
}
```

{% hint style="info" %}
Para mais informações acerca de Categorias de Despesa visite a página: [Categorias de Despesa](/apis/apis-auxiliares/categorias-de-despesa.md)
{% endhint %}

### 3. Finalização de um Documento de Compra

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_purchases\_documents/{id}/finalize" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

{% code title="Payload" %}

```json
{
  "type": "commercial_purchases_documents",
  "id": "<id do documento>",
  "data": {
    "attributes": {
      "status": 1
    }
  }
}
```

{% endcode %}

{% hint style="info" %}
NOTA: o documento e as linhas podem continuar a ser alterados mesmo depois de finalizados (fechados)
{% endhint %}

###

## Alteração de Documento de Compra

### Anulação do Documento de Compra

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_purchases\_documents/{id}/void" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

{% code title="Payload" %}

```json
{
  "data": {
    "type": "commercial_purchases_documents",
    "id": "<id do documento>",
    "attributes": {
      "status": 4,
      "voided_reason": "Texto livre com o motivo pelo qual se está a anular o documento" // Opcional, não precisa de ser indicada
    }
  }
}
```

{% endcode %}

### Obter Todos os Documentos de Compra Finalizados

{% code title="Endpoint" %}

```
{{base_url}}/api/commercial_purchases_documents?filter[status]=1
```

{% endcode %}

***

## Linhas de Documento de Compra

### Remover Linha de Documento

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_purchases\_payment\_lines" method="delete" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}
