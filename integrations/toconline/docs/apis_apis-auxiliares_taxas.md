> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/apis-auxiliares/taxas.md).

# Taxas

### Obter Todas as Taxas

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/taxes" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

### Filtro por Código de Taxa e pelo Código da Região

{% code title="Endpoint" overflow="wrap" %}

```
GET /taxes?filter[tax_code]=<código de Taxa> &filter[tax_country_region]=<código da região> 
```

{% endcode %}

**Exemplo:**

{% tabs %}
{% tab title="Endpoint" %}
{% code title="Exemplo de Endpoint" %}

```
GET /api/taxes?filter[tax_code]=NOR&filter[tax_country_region]=BE
```

{% endcode %}
{% endtab %}

{% tab title="Response" %}
{% code title="Exemplo de Response" %}

```json
{
    "data": [
        {
            "type": "taxes",
            "id": "103",
            "attributes": {
                "tax_country_region": "BE",
                "tax_code": "NOR",
                "description": "Normal",
                "tax_percentage": "21",
                "tax_expiration_date": null,
                "vat_tax_id": null
            }
        }
    ]
}
```

{% endcode %}
{% endtab %}
{% endtabs %}

### Filtro por Código de Taxa e pela Região e Percentagem de Taxa

{% code title="Endpoint" overflow="wrap" %}

```
GET /taxes?filter[tax_code]=<código de Taxa> &filter[tax_country_region]=<a região do IVA>&filter[tax_percentage]=<a percentagem de taxa>
```

{% endcode %}

**Exemplo:**

{% tabs %}
{% tab title="Endpoint" %}
{% code title="Exemplo de Endpoint" overflow="wrap" %}

```
{{base_url}}/api/taxes?filter[tax_code]=NOR&filter[tax_country_region]=BE&filter[tax_percentage]=21
```

{% endcode %}
{% endtab %}

{% tab title="Response" %}
{% code title="Exemplo de Response" %}

```json
{
    "data": [
        {
            "type": "taxes",
            "id": "103",
            "attributes": {
                "tax_country_region": "BE",
                "tax_code": "NOR",
                "description": "Normal",
                "tax_percentage": "21",
                "tax_expiration_date": null,
                "vat_tax_id": null
            }
        }
    ]
}
```

{% endcode %}
{% endtab %}
{% endtabs %}

### Obter Todas as Taxas de OSS (One Stop Shop)

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/oss\_taxes" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}
