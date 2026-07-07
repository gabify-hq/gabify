> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/compras/pagamentos.md).

# Pagamentos

Os pagamentos seguem a mesma estrutura anteriormente definida: São compostos por um cabeçalho, e linhas. Nesta nova versão, é possível criar ambas as componentes num só pedido, descrito de seguida.

### Criar Cabeçalho de sPagamento <a href="#criacao-de-cabecalhos-e-linhas" id="criacao-de-cabecalhos-e-linhas"></a>

Os detalhes do pedido POST para a criação de recibos estão descritos de seguida, em formato OpenAPI, e em cURL.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_purchases\_payments" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

Este pedido permite criar um pagamento, e respetivas linhas, em simultâneo.

{% code overflow="wrap" %}

```
curl -v -X POST -H 'Content-Type: application/vnd.api+json' -H 'Accept: application/json' -H 'Authorization: Bearer <access_token>' -d '<payload JSON>' '<API_URL>/v1/commercial_purchases_payments'
```

{% endcode %}

Neste, o payload JSON deverá vir no seguinte formato

```json
{
    "id":2,
    "lines": [
       {
            "payment_id": 2,
            "payable_type": "Purchases::Document",
            "payable_id": 2,
            "paid_value": 200,
            "settlement_percentage": 1.0,
            "cashed_vat_amount": null,
            "gross_total": 9.65,
            "settlement_amount": 0.0,
            "net_total": 5.0,
            "retention_total": 0.0,
        }
    ]
}
```

## Anulação de um Pagamento <a href="#anulacao-de-um-documento-caso-seja-preciso" id="anulacao-de-um-documento-caso-seja-preciso"></a>

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_purchases\_documents/{id}/void" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

## Atualizar Pagamento

O seguinte pedido pode ser realizado, após a criação do documento, e permite alterar informações sobre o documento. A estrutura do payload é a mesma do POST de criação. Neste, deverá enviar no id do pedido o id do documento a alterar. Os atributos enviados no body irão substituir os guardados no momento, e cada linha enviada dentro de lines irá substituir os dados guardados na linha com id especificado em payment\_line\_id

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_purchases\_payments/{id}" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

## Adicionar Linhas ao Pagamento <a href="#adicao-de-linhas" id="adicao-de-linhas"></a>

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_purchases\_payment\_lines" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

{% code title="Payload" %}

```json
{
  "data": {
    "type": "commercial_purchases_payment_lines",
    "attributes": {
      "payable_id": "<id do documento de compra a pagar>",
      "payable_type": "Purchases::Document",
      //"payment_id": "<id do pagamento a que pertence esta linha>"
     
      "paid_value": 50, // Valor total a pagar (não é necessário pagar a totalidade do documento, ou pode pagar-se mais do que um documento)
      // Indicar o atributo seguinte apenas se existir desconto no pagamento (3%, neste exemplo)
      "settlement_percentage": 3
    }
  }
}
```

{% endcode %}

{% hint style="info" %}
NOTA: É na linha que se indica qual o documento de compra (FC ou DSP) a pagar. Se necessário, podem criar-se mais do que uma linha (e nesse caso o pagamento é feito de uma só vez para todos os documentos)
{% endhint %}

## Remover Linhas de Pagamento <a href="#remocao-de-linhas" id="remocao-de-linhas"></a>

Do mesmo modo, caso pretenda remover linhas de um documento, pode utilizar a seguinte rota, onde apenas tem de indicar o id da linha a remover, no path.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_purchases\_payment\_lines" method="delete" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

## Obter Pagamento por Id <a href="#consultar-documento" id="consultar-documento"></a>

Por fim, se pretender obter informações sobre um dado documento, pode utilizar a seguinte rota, onde deverá especificar o id do documento a analisar no path.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/commercial\_purchases\_payments/{id}" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

## Obter Todos os Pagamentos <a href="#consultar-documento" id="consultar-documento"></a>

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/v1/commercial\_purchases\_payments/" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}
