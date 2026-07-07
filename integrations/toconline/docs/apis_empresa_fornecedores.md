> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/apis/empresa/fornecedores.md).

# Fornecedores, Morada e E-mail

### Obter Todos os Fornecedores

Esta primeira rota permite obter a informação de todos os fornecedores disponíveis. Para tal, deve apenas realizar o seguinte pedido:

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/suppliers" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

{% tabs %}
{% tab title="Endpoint" %}

<pre data-title="Endpoint"><code><strong>https://api/v1.toconline.com/api/suppliers
</strong></code></pre>

{% endtab %}

{% tab title="cURL" %}
{% code title="cURL" overflow="wrap" %}

```
curl -v -X GET -H 'Content-Type: application/vnd.api+json' -H 'Accept: application/json' -H 'Authorization: Bearer <access_token>' '<API_URL>/api/suppliers'
```

{% endcode %}
{% endtab %}
{% endtabs %}

### Obter Fornecedor por Id

Se pretender obter a informação de um fornecedor específico, deverá realizar o mesmo pedido, especificando o id do fornecedor que deseja consultar

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/addresses/{id}" method="get" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

<details>

<summary>Exemplo de Resposta</summary>

{% code title="Response" %}

```json
{
    "data": {
        "type": "suppliers",
        "id": "7",
        "attributes": {
            "tax_registration_number": "533186331",
            "business_name": "A Empresa",
            "website": "www.a_empresa.pt",
            "is_taxable": false,
            "is_tax_exempt": false,
            "tax_exemption_reason_id": null,
            "self_billing": null,
            "document_series_id": null,
            "internal_observations": null,
            "tax_country_region": "PT-AC",
            "is_independent_worker": false,
            "country_iso_alpha_2": "PT-AC",
            "saft_import_id": null,
            "accounting_number": null,
            "trusted_email_source": false
        },
        "relationships": {
            "addresses": {
                "data": [
                    {
                        "type": "addresses",
                        "id": "45"
                    }
                ]
            },
            "bank_accounts": {
                "data": [
                    {
                        "type": "bank_accounts",
                        "id": "4"
                    }
                ]
            },
            "company": {
                "data": {
                    "type": "current_company",
                    "id": "800000046"
                }
            },
            "contacts": {
                "data": [
                    {
                        "type": "contacts",
                        "id": "17"
                    }
                ]
            },
            "defaults": {
                "data": {
                    "type": "suppliers_defaults",
                    "id": "4"
                }
            },
            "main_address": {
                "data": {
                    "type": "addresses",
                    "id": "45"
                }
            },
            "main_contact": {
                "data": {
                    "type": "contacts",
                    "id": "17"
                }
            },
            "tax_exemption_reason": {
                "data": null
            }
        }
    }
}
```

{% endcode %}

</details>

### Criar Fornecedor

Permite a criação de novas instâncias de fornecedores. De modo a realizar um pedido para esta rota, terá de enviar alguns parâmetros no body do pedido.\
Tal como está descrito no pedido em baixo.\
Dentro de data, deverá colocar todos os parâmetros obrigatórios e poderá também colocar os restantes parâmetros, se for do seu interesse. O tipo dos parâmetros está também especificado.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/suppliers" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

{% tabs %}
{% tab title="Payload" %}

<pre class="language-json" data-title="Payload"><code class="lang-json"><strong>{
</strong>    "data": {
        "type": "suppliers",
        "attributes": {
            "tax_registration_number": 533186331,    //OBRIGATÓRIO
            "business_name": "A Empresa",           //OBRIGATÓRIO  
            "website": null,
            "is_taxable": null,
            "is_tax_exempt": null,
            "self_billing": null,
            "document_series_id": null,
            "internal_observations": null,
            "tax_country_region": null,
            "is_independent_worker": null
        }
    }
}
</code></pre>

{% endtab %}

{% tab title="Response" %}

<pre class="language-json" data-title="Response"><code class="lang-json"><strong>{
</strong>    "data": {
        "type": "suppliers",
        "id": "7",
        "attributes": {
            "tax_registration_number": "533186331",
            "business_name": "A Empresa",
            "website": null,
            "is_taxable": false,
            "is_tax_exempt": false,
            "tax_exemption_reason_id": null,
            "self_billing": null,
            "document_series_id": null,
            "internal_observations": null,
            "tax_country_region": "PT",
            "is_independent_worker": false,
            "country_iso_alpha_2": "PT",
            "saft_import_id": null,
            "accounting_number": null,
            "trusted_email_source": false
        },
        "relationships": {
            "addresses": {
                "data": []
            },
            "bank_accounts": {
                "data": []
            },
            "company": {
                "data": {
                    "type": "current_company",
                    "id": "800000046"
                }
            },
            "contacts": {
                "data": []
            },
            "defaults": {
                "data": null
            },
            "main_address": {
                "data": null
            },
            "main_contact": {
                "data": null
            },
            "tax_exemption_reason": {
                "data": null
            }
        }
    }
}
</code></pre>

{% endtab %}
{% endtabs %}

<table><thead><tr><th>Atributo</th><th width="360">Descrição</th><th>Obrigatório</th></tr></thead><tbody><tr><td>type</td><td>Tipo de entidade (neste caso, fornecedor).</td><td>Sim</td></tr><tr><td>tax_registration_number</td><td>Número de identificação fiscal do fornecedor.</td><td>Sim</td></tr><tr><td>business_name</td><td>Nome comercial ou razão social do fornecedor.</td><td>Sim</td></tr><tr><td>website</td><td>Website do fornecedor (opcional).</td><td>Não</td></tr><tr><td>is_taxable</td><td>Indica se o fornecedor é tributável (opcional).</td><td>Não</td></tr><tr><td>is_tax_exempt</td><td>Indica se o fornecedor está isento de impostos (opcional).</td><td>Não</td></tr><tr><td>self_billing</td><td>Indica se o fornecedor permite a autogestão de faturas (opcional).</td><td>Não</td></tr><tr><td>document_series_id</td><td>ID da série de documentos associada ao fornecedor (opcional).</td><td>Não</td></tr><tr><td>internal_observations</td><td>Observações internas sobre o fornecedor (opcional).</td><td>Não</td></tr><tr><td>tax_country_region</td><td>Região fiscal do fornecedor (opcional).</td><td>Não</td></tr><tr><td>is_independent_worker</td><td>Indica se o fornecedor é um trabalhador independente (opcional).</td><td>Não</td></tr></tbody></table>

### Associar morada a Fornecedor

A sequência de passos delineada no diagrama proporciona uma compreensão do processo, desde a criação do forncedor até a sua associação com uma morada.

<figure><img src="/files/QYq1pWnIpXLQvGsElk6s" alt=""><figcaption></figcaption></figure>

{% hint style="warning" %}
Quando um forncedor é criado, uma morada principal fica associada ao fornecedor. Esta morada por default vem vazia e é necessário atualizar com os dados da nova morada do fornecedor.
{% endhint %}

Através do `id` obtido pela response do [#criar-fornecedor](#criar-fornecedor "mention") este deverá ser usado para obter o id da morada ao fazer um `GET /suppliers/{id}`

<details>

<summary>Exemplo de resposta de um GET Supplier por ID</summary>

{% code title="Response" %}

```json
{
    "data": {
        "type": "suppliers",
        "id": "7",
        "attributes": {
            "tax_registration_number": "533186331",
            "business_name": "A Empresa",
            "website": "www.a_empresa.pt",
            "is_taxable": false,
            "is_tax_exempt": false,
            "tax_exemption_reason_id": null,
            "self_billing": null,
            "document_series_id": null,
            "internal_observations": null,
            "tax_country_region": "PT-AC",
            "is_independent_worker": false,
            "country_iso_alpha_2": "PT-AC",
            "saft_import_id": null,
            "accounting_number": null,
            "trusted_email_source": false
        },
        "relationships": {
            "addresses": {
                "data": [
                    {
                        "type": "addresses",
                        "id": "45"
                    }
                ]
            },
            "bank_accounts": {
                "data": [
                    {
                        "type": "bank_accounts",
                        "id": "4"
                    }
                ]
            },
            "company": {
                "data": {
                    "type": "current_company",
                    "id": "800000046"
                }
            },
            "contacts": {
                "data": [
                    {
                        "type": "contacts",
                        "id": "17"
                    }
                ]
            },
            "defaults": {
                "data": {
                    "type": "suppliers_defaults",
                    "id": "4"
                }
            },
            "main_address": {
                "data": {
                    "type": "addresses",
                    "id": "45"
                }
            },
            "main_contact": {
                "data": {
                    "type": "contacts",
                    "id": "17"
                }
            },
            "tax_exemption_reason": {
                "data": null
            }
        }
    }
}
```

{% endcode %}

</details>

O `id` da morada obtido anteriormente, será usado para atualizar os dados da morada através de um `PATCH / addresses`.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/addresses" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

O body deste pedido (payload JSON) deverá conter as informações de cliente que se pretende atualizar nos respetivos atributos.

{% tabs %}
{% tab title="Payload" %}
{% code title="Payload " %}

```json
{
    "data": {
        "type": "addresses",
        "id": "45",
        "attributes": {
             "address_detail": "Avenida Principal",
            "city": "Setúbal",
            "postcode": "2910-099",
            "region": "Setúbal",
            "country_id": "3"
        }
    }
}
```

{% endcode %}
{% endtab %}

{% tab title="Response" %}
{% code title="Response" %}

```json
{
    "data": {
        "type": "addresses",
        "id": "45",
        "attributes": {
            "is_primary": true,
            "address_detail": "Avenida Principal",
            "city": "Setúbal",
            "postcode": "2910-099",
            "region": "Setúbal",
            "name": "Sede",
            "for_discharge": false,
            "for_charge": false,
            "subtype": null,
            "is_saturday_workday": false,
            "is_sunday_workday": false,
            "is_national_holidays_workday": false,
            "code": null,
            "payroll_enumerations_tax_office_id": null
        },
        "relationships": {
            "company": {
                "data": null
            },
            "country": {
                "data": {
                    "type": "countries",
                    "id": "3"
                }
            },
            "customer": {
                "data": null
            },
            "supplier": {
                "data": null
            },
            "user": {
                "data": null
            }
        }
    }
}
```

{% endcode %}
{% endtab %}
{% endtabs %}

### Remover Fornecedor

A seguinte rota permite a remoção de um dado fornecedor. Esta rota deve ser utilizada de forma cautelosa dado que é irreversível, e mesmo que este cliente volte a ser criado, o seu id nunca será o mesmo que teria anteriormente.

\
Utilizando o id do forncedor que quer eliminar, que poderá fazer utilizando a primeira rota desta página, por exemplo, terá simplesmente de fazer o pedido:

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/suppliers/{supplierId}" method="delete" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

### Atualizar Fornecedor

A rota PATCH permite a edição de um fornecedor existente. O body deste pedido deverá ser igual ao descrito na rota POST, contendo todas as informações obrigatórias do fornecedor, atualizadas para os valores que tenciona alterar, além do "id" do fornecedor. Álem disto, o pedido deverá ser feito a `https://apiv1.toconline.com/suppliers/{id}`, sendo que {id} é o identificador do fornecedor que tenciona atualizar.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/suppliers" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

<details>

<summary>Exemplo de Payload</summary>

No exemplo que se segue foi atualizado o website da empresa

{% code title="Payload" %}

```json
{
    "data": {
        "type": "suppliers",
        "id": "7",
        "attributes": {
            "tax_registration_number": "533186331",
            "business_name": "A Empresa",
            "website": "www.a_empresa.pt",
            "is_taxable": false,
            "is_tax_exempt": false,
            "tax_exemption_reason_id": null,
            "self_billing": null,
            "document_series_id": null,
            "internal_observations": null,
            "tax_country_region": "PT",
            "is_independent_worker": false,
            "country_iso_alpha_2": "PT",
            "saft_import_id": null,
            "accounting_number": null,
            "trusted_email_source": false
        }
    }
}
```

{% endcode %}

</details>

<details>

<summary>Exemplo de Response</summary>

{% code title="" %}

```json
{
    "data": {
        "type": "suppliers",
        "id": "7",
        "attributes": {
            "tax_registration_number": "533186331",
            "business_name": "A Empresa",
            "website": null,
            "is_taxable": false,
            "is_tax_exempt": false,
            "tax_exemption_reason_id": null,
            "self_billing": null,
            "document_series_id": null,
            "internal_observations": null,
            "tax_country_region": "PT",
            "is_independent_worker": false,
            "country_iso_alpha_2": "PT",
            "saft_import_id": null,
            "accounting_number": null,
            "trusted_email_source": false
        },
        "relationships": {
            "addresses": {
                "data": []
            },
            "bank_accounts": {
                "data": []
            },
            "company": {
                "data": {
                    "type": "current_company",
                    "id": "800000046"
                }
            },
            "contacts": {
                "data": []
            },
            "defaults": {
                "data": null
            },
            "main_address": {
                "data": null
            },
            "main_contact": {
                "data": null
            },
            "tax_exemption_reason": {
                "data": null
            }
        }
    }
}
```

{% endcode %}

</details>

***

## Morada

### Criar Morada

Quando um Fornecedor é criado este já tem uma morada vazia associada, mas é possível adicionar mais do que uma morada ao Fornecedor.

De modo a associar uma morada a um cliente, deverá realizar o seguinte pedido

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/addresses" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

No pedido acima, o \<access\_token> corresponde ao token de acesso válido devolvido pelo serviço de OAuth, e o \<payload JSON> deverá ter o seguinte formato

{% code title="Payload" %}

```json
{
    "data": {
        "type": "addresses",
        "attributes": {
            "addressable_type": "Supplier", //OBRIGATÓRIO
            "addressable_id": 7,            //OBRIGATÓRIO - ID da morada do Fornecedor
            "address_detail": "teste 3",
            "city": "Setúbal",
            "postcode": "2910-099",
            "region": "Setúbal",
            "country_id" : 1            // 1 = PT (Portugal Continental); 2 = PT_MA (Madeira); //3 = PT_AC (Açores)...Ver Get/countries
        }
    }
}
```

{% endcode %}

| Atributo          | Descrição                                                                   | Obrigatório |
| ----------------- | --------------------------------------------------------------------------- | ----------- |
| type              | Tipo de entidade (neste caso, endereço).                                    | Sim         |
| addressable\_type | Tipo de entidade à qual o endereço está associado (neste caso, fornecedor). | Sim         |
| addressable\_id   | ID do fornecedor associado ao endereço.                                     | Sim         |
| address\_detail   | Detalhes específicos do endereço, como rua e número.                        | Não         |
| city              | Cidade do endereço.                                                         | Não         |
| postcode          | Código postal do endereço.                                                  | Não         |
| region            | Região do endereço (por exemplo, província, estado).                        | Não         |
| country\_id       | ID do país do endereço (1 = Portugal Continental, 2 = Madeira, 3 = Açores). | Não         |

{% hint style="info" %}
"addressable\_id" - corresponde ao id da morada do cliente obtido da relação entre fornecedor e morada, através do [#obter-fornecedor](#obter-fornecedor "mention")
{% endhint %}

{% hint style="info" %}
Para usar outro país que não seja Portugal, poderá consultar mais informação em: [Países](/apis/apis-auxiliares/paises.md)
{% endhint %}

***

## E-mail

### Criar E-mail de Fornecedor

Para proceder à criação do E-mail de um fornecedor pela primeira vez deverá utilizar a `POST / contacts`.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/contacts" method="post" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

O body deste pedido (\<payload JSON>) deverá conter as informações de fornecedor que se pretende atualizar, sendo obrigatório campo "**contactable\_id**" identificador do fornecedor que tenciona atualizar e o "**contactable\_type**" sendo este do tipo "**Supplier**"

{% tabs %}
{% tab title="Payload" %}
{% code title="Exemplo de Payload" %}

```json

{
    "data": {
        "type": "contacts",
        "attributes": {
            "is_primary": true,
            "name": "teste_cmo",
            "position": null,
            "phone_number": null,
            "mobile_number": null,
            "email": "61_manuel@email.pt",
            "categories": [
                "general"
            ],
            "contactable_id": 61,
            "contactable_type": "Customer"
        }
    }
}
```

{% endcode %}
{% endtab %}

{% tab title="Response" %}
{% code title="Exemplo de Response" %}

````json
{
    "data": {
        "type": "contacts",
        "id": "29",
        "attributes": {
            "is_primary": true,
            "name": "teste_supplier",
            "position": null,
            "phone_number": null,
            "mobile_number": null,
            "email": "4_sup@email.pt"
        },
        "relationships": {
            "supplier": {
                "data": null
            }
        }
    }
}
```
````

{% endcode %}
{% endtab %}
{% endtabs %}

<figure><img src="/files/XfgKXSQ1WpawtCnMZTKk" alt=""><figcaption><p>Exemplo de Criação de E-mail para Fornecedor</p></figcaption></figure>

### Atualizar E-mail de Cliente

{% hint style="warning" %}
Já deve ter realizado [#criar-e-mail-de-fornecedor](#criar-e-mail-de-fornecedor "mention")
{% endhint %}

Usando o `GET / supplier{id}` deverá obter o id correspondente ao contacto do fornecedor, que se encontra localizado na área de relationships-> main\_contact, como pode observar no exemplo de response abaixo.

<details>

<summary>Exemplo de response de um GET/supplier/{id}</summary>

```json
{
    "data": {
        "type": "customers",
        "id": "61",
        "attributes": {
            "tax_registration_number": "229659179",
            "business_name": "Manuel Ricardo Ribeiro",
            "contact_name": null,
            "website": null,
            "phone_number": null,
            "mobile_number": null,
            "email": null,
            "observations": null,
            "internal_observations": null,
            "not_final_customer": false,
            "cashed_vat": false,
            "tax_country_region": "PT",
            "country_iso_alpha_2": "PT",
            "saft_import_id": null,
            "is_tax_exempt": false,
            "data": {}
        },
        "relationships": {
            "addresses": {
                "data": [
                    {
                        "type": "addresses",
                        "id": "67"
                    }
                ]
            },
            "company": {
                "data": {
                    "type": "current_company",
                    "id": "800000046"
                }
            },
            "defaults": {
                "data": {
                    "type": "customers_defaults",
                    "id": "31"
                }
            },
            "email_addresses": {
                "data": [
                    {
                        "type": "email_addresses",
                        "id": "24"
                    }
                ]
            },
            "main_address": {
                "data": {
                    "type": "addresses",
                    "id": "67"
                }
            },
            "main_email_address": {
                "data": {
                    "type": "email_addresses",
                    "id": "24"
                }
            },
            "tax_exemption_reason": {
                "data": null
            }
        }
    }
}
```

</details>

Para proceder à atualização do E-mail de um fornecedor deverá utilizar a `PATCH / contacts` usando o id obtido do main\_contact obtido do fornecedor pretendido.

{% openapi src="/files/LrXEg3IjIacAycCz7IWE" path="/api/contacts" method="patch" %}
[TOConline Open API.yaml](https://1863668386-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fk7sif7BY0rPzivMcj1HB%2Fuploads%2Fgit-blob-1f7bd9dd692716d3f3f93d9c9a4f7226d78277e3%2FTOConline%20Open%20API.yaml?alt=media)
{% endopenapi %}

O body deste pedido (\<payload JSON>) deverá conter as informações de cliente que se pretende atualizar, sendo obrigatório campo "`id`" id do contacto correspondente ao utilizador que tenciona atualizar e o "`email`" novo a ser alterado.

{% tabs %}
{% tab title="Payload" %}
{% code title="Exemplo de Payload" %}

```json
{
    "data": {
        "type": "contacts",
        "id": "24",
        "attributes": {
            "email": "novo@email.pt"
        }
    }
}
```

{% endcode %}
{% endtab %}

{% tab title="Response" %}
{% code title="Exemplo de Response" %}

```json
{
    "data": {
        "type": "contacts",
        "id": "24",
        "attributes": {
            "is_primary": true,
            "name": "teste",
            "position": null,
            "phone_number": null,
            "mobile_number": null,
            "email": "novo@email.pt"
        },
        "relationships": {
            "supplier": {
                "data": null
            }
        }
    }
}
```

{% endcode %}
{% endtab %}
{% endtabs %}

<figure><img src="/files/ZSrspBRtpRXTILZ9Hn0s" alt=""><figcaption><p>Exemplo de Criação de E-mail para Fornecedor</p></figcaption></figure>
