> For the complete documentation index, see [llms.txt](https://api-docs.toconline.pt/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-docs.toconline.pt/autenticacao-detalhada.md).

# Autenticação Detalhada

Para utilizar a nossa API através do Postman, é necessário seguir o processo de autenticação descrito nesta página para obter a chave de acesso. Depois de adquirida, essa chave pode ser introduzida no Postman como parâmetro de autenticação Bearer Token nas solicitações à nossa API. Isso permite testar facilmente os endpoints da API e interagir com o nosso sistema de forma programática durante o desenvolvimento e testes.

Ao conectar a nossa API com o Postman, siga os seguintes passos interligados à autenticação:

1. **Obtenha a chave de acesso** seguindo o processo de autenticação descrito anteriormente. Esta etapa envolverá fornecer credenciais necessárias para acessar a nossa API comercial.
2. **Configure o Postman** para usar esta chave de acesso. No Postman, vá até as configurações de autenticação da requisição que você está criando e selecione o tipo de autenticação como "Bearer Token".
3. **Insira a chave de acesso** no campo disponível após selecionar o tipo de autenticação como Bearer Token. Certifique-se de que a chave de acesso obtida não é de serviços externos como Google, mas sim obtida diretamente conforme o nosso processo de autenticação.

Seguindo esses passos, você poderá utilizar o Postman para testar e interagir com nossa API de forma segura e eficiente, garantindo que todos os pedidos estejam devidamente autenticados.

## Passo 1: Obtenção das credenciais de acesso à nossa API comercial

Neste passo, deverão ser obtidos os seguintes dados, necessários para que possam aceder à nossa API comercial:

> * Identificador (a que chamamos "OAUTH\_CLIENT\_ID", ou simplesmente "client\_id", nos exemplos posteriores)
> * Segredo (a que chamamos "OAUTH\_CLIENT\_SECRET", ou simplesmente "secret", nos exemplos posteriores)
> * Endereço de autenticação por OAuth (a que chamamos "OAUTH\_URL" nos exemplos posteriores)
> * Endereço de acesso à API (a que chamamos "API\_URL" nos exemplos posteriores)

Os três primeiros são requisitos para a autenticação (via OAuth) na API, juntamente com um outro, o endereço de retorno a que chamamos "OAUTH\_REDIRECT\_URL" nos exemplos posteriores e no exemplo em Ruby que foi enviado. O quarto é o endereço base de todos os pedidos feitos à API.O endereço de retorno, OAUTH\_REDIRECT\_URL, vem pré-fixado pelo nosso serviço de OAuth, e é o endereço "<https://oauth.pstmn.io/v1/callback>".

Os quatro dados de acesso acima indicados são todos obtidos directamente da empresa à qual se pretende aceder via API. Para os obter, ou alterar o endereço de redirect, deverá fazer o seguinte:

1. Entrar na empresa com uma conta de Empresário

<figure><img src="/files/uRM2cLAd9QEPdWS2h5Ur" alt=""><figcaption></figcaption></figure>

2. Aceder através do menu à opção Empresa > Configurações > Dados API

<figure><img src="/files/Xqtv3LbbCQdahcLIfM8k" alt=""><figcaption></figcaption></figure>

3. Introduzir os dados do integrador, que irá receber os dados de acesso à API através de um link temporário, de 72h.
4. Abrir o link de acesso enviado no email

<figure><img src="/files/ycISVdJ0hFwdGZaghVXo" alt=""><figcaption></figcaption></figure>

## Passo 2: Autenticação no nosso serviço de OAuth e obtenção do token de acesso à API

Antes de poder aceder à API, o utilizador deverá autenticar-se no nosso serviço de OAuth e obter um token de acesso, chamado a partir de agora "access token", executando os passos seguintes. Esses passos, e um exemplo de código (Ruby) a executar, são também demonstrados no exemplo enviado.De acordo com as especificações do OAuth, a obtenção do código de acesso é feita em dois passos:

### Passo 2.1: Obtenção de um código de autorização ("authorization\_code")

Neste passo, deverá ser feito um pedido GET ao endereço OAUTH\_URL/auth com:

1. Na query do Url, os parâmetros:

> * `client_id=OAUTH_CLIENT_ID`- este é o primeiro dado dos quatro obtidos no [#passo-1-obtencao-das-credenciais-de-acesso-a-nossa-api-comercial](#passo-1-obtencao-das-credenciais-de-acesso-a-nossa-api-comercial "mention")
> * `redirect_uri=OAUTH_REDIRECT_URL` - salvo alteração posterior, é o endereço fixo indicado no passo 1.
> * `response_type=code`
> * `scope=commercial`

2. Nos headers, os seguinte:

> `Content-Type: application/json`

{% hint style="info" %}
Nota: Caso esteja a usar **Postman**, deverá ir a settings e desativar o campo '**Automatically follow redirects**'. O resultado, na consola, irá conter o *code* necessário
{% endhint %}

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

Ou seja, a resposta esperada é um status 302 (Moved Temporarily) e deve conter um header chamado "Location" no qual se encontra o parâmetro "code" com o valor do código de autorização ("authorization\_code").

Enquanto o utilizador não implementar um diferente deste, que exista e possa efectivamente ser chamado (ver o passo 1 para como fazê-lo), o pedido efectuado, que responde com um status 302, não deverá prosseguir com o *redirect* solicitado pela resposta.A única forma de responder a esse pedido é a de ignorar esse *redirect*, não chamando a “Location” devolvida, e simplesmente obter o código de autorização ("authorization\_code”) directamente do header “Location” da resposta.A forma de ignorar o *redirect* depende do cliente Http utilizado, e terá que ser vista e implementada caso a caso. No caso do curl, que usámos nos exemplos anteriormente enviados, os *redirect* são ignorados por omissão, só sendo executados se se utilizar a opção “-L”.Quando for configurado um "`OAUTH_REDIRECT_URL`" diferente (ver o passo 1 para como fazê-lo), então será feito um pedido a esse endereço, de onde poderá também ser obtido o "authorization\_code", que é enviado a esse endereço como o parâmetro "code" do Url.

### Passo 2.2: Obtenção de um token de acesso à API ("access\_token" válido por 4 horas) e de um código de actualização deste ("refresh\_token" válido por 8 horas)

Neste passo, deverá ser feito um pedido POST ao endereço OAUTH\_URL/token com:

1. No **body** do pedido, uma query "Url-encoded" com os parâmetros:

> * `grant_type=authorization_code`
> * `code=authorization_code` - obtido do passo anterior.
> * `scope=commercial`

2. Nos **headers**, os seguinte:

> * `Content-Type: application/x-www-form-urlencoded`
> * `Accept: application/json`
> * `Authorization`: o texto "Basic", seguido dum espaço, seguido dum texto formado pela concatenação do "client\_id", seguido de ':', seguido do "secret", tudo codificado em base 64. Por exemplo, se o "client\_id" fosse "test" e o "secret" fosse "abcdef", o valor deste header seria "Basic dGVzdDphYmNkZWY=", sendo "dGVzdDphYmNkZWY=" o texto "test:abcdef" em base 64.

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
POST /oauth/token HTTP/1.1 > 
Content-Type: application/x-www-form-urlencoded > 
Accept: application/json > 
Authorization: Basic dGVzdHM6ZWJhOTI3NjM3MzRlN2MwMg== > 
< HTTP/1.1 200 OK < Content-Type: application/json;charset=utf-8 
< {"access_token":"10dc1d36e24b790540d087ea238ec345abd1a02daa73ae45a09",
"expires_in":14400,
"refresh_token":"f71824c9e4675a8aa9661f18ae5341e977d37",
"token_type":"Bearer"}
```

Ou seja, a resposta esperada é um status 200 (OK) e um JSON no qual se encontra o parâmetro "`access_token`" e o "`refresh_token`".

O "`access_token`" e o "`refresh_token`" deverão ser guardados para uso posterior. O "access\_token" terá que ser enviado (ver Passo 3) em TODOS os pedidos de acesso à API, tendo a validade definida no parâmetro "expires\_in" (em s) da resposta anterior. Após este tempo, os pedidos à API começarão a devolver um erro 401 (Unauthorized), e terá que ser pedido um novo "access\_token" (repetindo os passos 2.1 e 2.2) ou renovado o existente usando o "refresh\_token" (executando o passo 2.3).

### Passo 2.3: Actualização do token de acesso à API ("access\_token") depois deste expirado, usando o código de actualização ("refresh\_token") obtido em 2.2

Neste passo, deverá ser feito um pedido POST ao endereço OAUTH\_URL/token com:

1. No body do pedido, uma query "Url-encoded" com os parâmetros:

> * `grant_type=refresh_token`
> * `refresh_token=refresh_token` obtido do passo anterior, que deve ser guardado para esse efeito.
> * `scope=commercial`

2. Nos headers, os seguinte:

> * `Content-Type: application/x-www-form-urlencoded`
> * `Accept: application/json`
> * `Authorization`: o texto "Basic", seguido dum espaço, seguido dum texto formado pela concatenação do "client\_id", seguido de ':', seguido do "secret", tudo codificado em base 64. Por exemplo, se o "client\_id" fosse "test" e o "secret" fosse "abcdef", o valor deste header seria "`Basic dGVzdDphYmNkZWY=`", sendo "dGVzdDphYmNkZWY=" o texto "test:abcdef" em base 64.

O exemplo seguinte ilustra o pedido feito no terminal, usando o curl:

```bash
curl -v -X POST -H 'Content-Type: application/x-www-form-urlencoded'\ 
-H 'Accept: application/json'\
-H 'Authorization: Basic <client_id + ':' + secret, codificados em base 64>'\ 
-d 'grant_type=refresh_token&refresh_token=<refresh_token>&scope=commercial' \
'<OAUTH_URL>/token'
```

A resposta esperada é como a seguinte:

```http
POST /oauth/token HTTP/1.1 
Content-Type: application/x-www-form-urlencoded 
Accept: application/json 
Authorization: Basic dGVzdHM6ZWJhOTI3NjM3MzRlN2MwMg==
< HTTP/1.1 200 OK < Content-Type: application/json;charset=utf-8 
< {"access_token":"b5604dacd4257355cb3692c79fe39490429b",
"expires_in":14400,
"token_type":"Bearer"}
```

\
Ou seja, a resposta esperada é um status 200 (OK) e um JSON no qual se encontra o (novo) parâmetro "access\_token" e o (novo) "refresh\_token".O novo "access\_token" e o novo "refresh\_token", tal como no passo 2.2, deverão ser guardados para uso posterior.

### Passo 3: Acesso autenticado à API comercial, usando o "access\_token" obtido de 2.2 e guardado

Todos os pedidos à API, cujos endereços são os documentados em [https://toconline.gitbook.io/documentacao-api](broken://spaces/yOlkai8btiTTydekYpN2), são feitos para o endereço "API\_URL" seguido do nome do recurso. Além disso, todos os pedidos deverão conter obrigatoriamente os seguintes headers:

> * `Content-Type: application/vnd.api+json`
> * `Accept: application/json`
> * `Authorization`: o texto "Bearer", seguido dum espaço, seguido do "access\_token" obtido do passo 2.2.

Os parâmetros adicionais a passar na query (no caso de GET) ou no body dos pedidos são os especificados pelo padrão JSONAPI, a que a nossa API obedece, e que estão documentados em [jsonapi.org](http://jsonapi.org/).

Como exemplo, indica-se um pedido GET ao recurso "commercial\_sales\_documents" (documentos de venda), paginado para devolver apenas os 5 primeiros registos.

```bash
curl -v -H 'Content-Type: application/vnd.api+json' \
-H 'Accept: application/json'\ 
-H 'Authorization: Bearer <access_token>' \
'<API_URL>/commercial_sales_documents?page[size]=5'
```

A resposta esperada, neste caso, é como a seguinte:

```http
GET /commercial_sales_documents?page[size]=5 HTTP/1.1 
Content-Type: application/vnd.api+json 
Accept: application/json 
Authorization: Bearer  <access_token> 
HTTP/1.1 200 OK 
Content-Type: application/vnd.api+json;charset=utf-8 
{"data":[{"type":"commercial_sales_documents","id":"...","attributes":{...}}, ...]}
```

Ou seja, e se não ocorrer nenhum erro (como o tentar uma consulta a algo que não existe, ou criar um registo com valores incorrectos), a resposta esperada é um status 200 (OK) e um JSON, no formato JSONAPI, contendo o registo ou os registos devolvidos (no caso dos GET), criados (POST) ou alterados (PATCH).Como se disse no passo 2.2, se o pedido devolver um status 401 (Unauthorized), provavelmente o "access\_token" já expirou, e terá que ser actualizado, ou pedido um novo efectuando novamente o passo 2.
