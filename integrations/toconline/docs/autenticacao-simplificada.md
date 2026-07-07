> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/autenticacao-simplificada.md).

# Autenticação Simplificada

{% hint style="info" %}
A presente página apresenta uma versão simplificada do processo de autenticação. Caso este não seja suficiente para a sua aplicação, ou encontre algum erro, ou dificuldade, consulte: [Autenticação Detalhada](/autenticacao-detalhada.md)
{% endhint %}

### Passo 1: Obtenção das credenciais de acesso à nossa API comercial

Neste passo, deverão ser obtidos os seguintes dados, necessários para que possam aceder à nossa API comercial:

> * Identificador (a que chamamos "`OAUTH_CLIENT_ID`", ou simplesmente "`client_id`", nos exemplos posteriores)
> * Segredo (a que chamamos "`OAUTH_CLIENT_SECRET`", ou simplesmente "`secret`", nos exemplos posteriores)
> * Endereço de autenticação por OAuth (a que chamamos "`OAUTH_URL`" nos exemplos posteriores)
> * Endereço de acesso à API (a que chamamos "`API_URL`" nos exemplos posteriores)

Os quatro dados de acesso acima indicados são todos obtidos directamente da empresa à qual se pretende aceder via API. Para os obter, deverá fazer o seguinte:

1. Entrar na empresa com uma conta de Empresário

<figure><img src="/files/uRM2cLAd9QEPdWS2h5Ur" alt=""><figcaption></figcaption></figure>

2. Aceder através do menu à opção Empresa > Configurações > Dados API

<figure><img src="/files/Xqtv3LbbCQdahcLIfM8k" alt=""><figcaption></figcaption></figure>

3. Introduzir os dados do integrador, que irá receber os dados de acesso à API através de um link temporário, de 72h.
4. Abrir o link de acesso enviado no email

<figure><img src="/files/ycISVdJ0hFwdGZaghVXo" alt=""><figcaption></figcaption></figure>

### Passo 2: Obtenção do *authorization\_code*

{% hint style="info" %}

#### Caso esteja a utilizar Postman, deverá desativar a opção "Automatically follow redirects", nas definições do pedido

{% endhint %}

Neste passo, deverá ser feito um pedido GET ao endereço OAUTH\_URL/auth com:

Na query do Url, os **parâmetros**:

> * `client_id=OAUTH_CLIENT_ID`
> * `redirect_uri=OAUTH_REDIRECT_URL`
> * `response_type=code`
> * `scope=commercial`

Nos **headers**, o seguinte:

> * `Content-Type: application/json`

O exemplo seguinte ilustra o pedido feito no terminal, usando o curl:

```bash
curl -v -H 'Content-Type: application/json' \
'<OAUTH_URL>/auth?client_id=<client_id>\
&redirect_uri=<OAUTH_REDIRECT_URL>\
&response_type=code&scope=commercial'
```

A resposta esperada é como a seguinte:

```http
GET /oauth/auth?client_id HTTP/1.1
<client_id>&redirect_uri=<OAUTH_REDIRECT_URL>
&response_type=code&scope=commercial
HTTP/1.1 > Accept: */* > Content-Type: application/json >
< HTTP/1.1 302 Moved Temporarily
< Content-Type: text/html
< Location: <OAUTH_REDIRECT_URL>?
code=<authorization_code>
```

Utilizando o authorization\_code recebido na resposta, deverá seguir o próximo passo

### Passo 3: Obtenção do access\_code (válido por 4 horas)

### Passo 3: Obtenção do access\_code

Neste passo, deverá ser feito um pedido POST ao endereço OAUTH\_URL/token com:

1. No body do pedido, os parâmetros:

> * grant\_type=authorization\_code
> * code= o "authorization\_code" obtido do passo anterior.
> * scope=commercial

2. Nos headers, os seguinte:

> * Content-Type: application/x-www-form-urlencoded
> * Accept: application/json
> * Authorization: o texto "Basic", seguido dum espaço, seguido dum texto formado pela concatenação do "client\_id", seguido de ':', seguido do "secret", tudo codificado em base 64. Por exemplo, se o "client\_id" fosse "test" e o "secret" fosse "abcdef", o valor deste header seria "Basic dGVzdDphYmNkZWY=", sendo "dGVzdDphYmNkZWY=" o texto "test:abcdef" em base 64.

O exemplo seguinte ilustra o pedido feito no terminal, usando o curl:

```bash
curl -v -X POST -H 'Content-Type: application/x-www-form-urlencoded'\
-H 'Accept: application/json'\
-H 'Authorization: Basic <client_id + ':' + secret, codificados em base 64>' \
-d 'grant_type=authorization_code&\
code=<authorization_code>&scope=commercial' \
'<OAUTH_URL>/token'    
```

A resposta esperada é como a seguinte:

```http
POST /oauth/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded > 
Accept: application/json > 
Authorization: Basic dGVzdHM6ZWJhOTI3NjM3MzRlN2MwMg== > 
< HTTP/1.1 200 OK < Content-Type: application/json;charset=utf-8 
< {"access_token":"10dc1d36e24b790540d087ea238ec345abd1a02daa73ae45a09",
"expires_in":14400,
"refresh_token":"f71824c9e4675a8aa9661f18ae5341e977d37",
"token_type":"Bearer"}
```

Daqui, tem então o access\_token necessário para a utilização da API, referenciado nas restantes páginas de pedidos de exemplo
