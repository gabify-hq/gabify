> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/vendas/descarregar-pdf-de-documentos-de-venda.md).

# Descarregar PDF de Documentos de Venda

### Obter Caminho para Ficheiro

{% hint style="warning" %}
Para um documento ser descarregado, o mesmo deve estar com um estado (status) de finalizado (status = 1) .
{% endhint %}

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/url\_for\_print/{salesDocumentId}" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

<pre data-title="Endpoint" data-overflow="wrap"><code><strong>https://app.toconline.pt/api/url_for_print/&#x3C;id do documento de venda>?filter[type]=Document&#x26;filter[copies]=1
</strong></code></pre>

{% hint style="info" %}
Para obter o id do Documento de Compra pretendido (document\_id) poderá consultar: [Documentos de Compra](/apis/compras/documentos-de-compra.md#obter-todos-os-documentos-de-compra-finalizados)
{% endhint %}

Tal como nos restantes pedidos especificados anteriormente, o \<access\_token> corresponde ao token de acesso válido devolvido pelo serviço de OAuth

### Descarregar Ficheiro

Utilizando a resposta recebida, deverá concatenar os atributos: scheme + "://" + host + path, e irá obter o link através do qual a transferência é imediata. Neste caso, seria:

```
https://app.toconline.pt/public-file/path_to_file
```
