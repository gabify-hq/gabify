> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/caracteristicas-dos-pedidos.md).

# Características dos pedidos

Nas seguintes páginas são exemplificados alguns dos pedidos mais comuns à API. Estes estão subdivididos em diferentes áreas.

#### Pré-requesitos para a realização de qualquer um dos pedidos:

* Um acesso autenticado à empresa de trabalho, via OAuth (o modo de autenticação está documentado na página anterior
* A empresa de trabalho deverá ter uma licença de GC activa, excepto para os GET, que serão autorizados mesmo quando a licença expira

#### Conteúdos dos Headers, comuns a todos os pedidos

> * `Content-Type: application/vnd.api+json`
> * `Accept: application/json`
> * `Authorization`: Bearer \<access\_token> (token de acesso válido devolvido pelo serviço de OAuth)

#### Filtro de parâmetros:

De momento não estão disponíveis rotas que cubram todo o tipo de informação que está disponível através do software. No entanto, muitos recursos que não têm uma rota dedicada podem ser acedidos por outras rotas, utilizando os filtros de parâmetros.

Por exemplo, apesar de não existir nenhuma rota para documentos de venda pendentes, existe uma rota de documentos de venda. Estes documentos contém um atributo de valor pendente.

Como tal, é possível obter apenas os documentos com valor pendente, da seguinte forma:

## Obter Documentos de Compra

<mark style="color:blue;">`GET`</mark> `/api/commercial_sales_documents`

#### Path Parameters

| Name        | Type   | Description                  |
| ----------- | ------ | ---------------------------- |
| page\[size] | String | 10                           |
| filter      | String | "documents.pending\_total>0" |

De notar que deverá indicar o tipo de documento no atributo que procura filtrar. Neste caso, deverá ser documents.pending\_total.

> commercial\_sales\_documents -> **documents**
>
> commercial\_sales\_receipts -> **receipts**
>
> commercial\_purchases\_documents -> **purchases\_documents**
>
> commercial\_purchases\_payments -> **payments**

Da mesma forma, poderá filtrar, por exemplo, pela data.

## Obter Linha de Documento de Compras

<mark style="color:blue;">`GET`</mark> `/api/commercial_sales_document_lines`

#### Path Parameters

| Name        | Type   | Description                                      |
| ----------- | ------ | ------------------------------------------------ |
| page\[size] | String | 10                                               |
| filter      | String | "document\_lines.created\_at>'2022-01-01'::date" |

Deverá também indicar o tipo de linhas de documento pelo qual está a filtrar, tal como na lista acima. De seguida está um exemplo de como poderá realizar um pedido utilizando este filtro

{% code overflow="wrap" %}

```bash
curl -v -X GET -H 'Content-Type: application/vnd.api+json' -H 'Accept: application/json' -H 'Authorization: Bearer <access_token>' '<API_URL>/v1/commercial_sales_documents?filter="document_lines.created_at>'2022-01-01'::date"'
```

{% endcode %}

É recomendável utilizar paginação, caso haja um grande número de resultados para ser apresentado
