<!-- Source: https://www.moloni.pt/dev/autenticacao/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/autenticacao.html) -->

sectionHoldContent">

Documentação API

-

Introdução

-

Visão geral

-

Criar uma conta

-

Autenticação

-

Exemplos

-

Utilização

-

Controlo de Erros

-

Sandbox

-

ChangeLog

-

Plugins

-

Account & Profile

-

-

My Profile

-

Company

-

-

Company

-

Subscription

-

Users

-

Entities

-

-

Customers

-

Customer Alternate Addresses

-

Suppliers

-

Salesmen

-

Products

-

-

Products

-

Product Categories

-

Product Stocks

-

Price Classes

-

Documents

-

-

Documents

-

Invoices

-

Receipts

-

Credit Notes

-

Debit Notes

-

Simplified Invoices

-

Delivery Notes

-

Bills of Lading

-

Own Asset MG

-

Waybills

-

Customer Return Note

-

Estimates

-

Internal Documents

-

Invoice Receipts

-

Payment Returns

-

Purchase Order

-

Supplier Purchase Order

-

Supplier Invoices

-

Supplier Simplified Invoices

-

Supplier Credit Notes

-

Supplier Debit Notes

-

Supplier Return Notes

-

Supplier Receipts

-

Supplier Warranty Requests

-

Global Guides

-

Settings

-

-

Bank Accounts

-

CAE Codes

-

Payment Methods

-

Maturity Dates

-

Delivery Methods

-

Vehicles

-

Deductions

-

Tax & Fees

-

Measurement Units

-

Identification Templates

-

Document Sets

-

Warehouses

-

Product Properties

-

Global Data

-

-

Countries

-

Fiscal Zones

-

Languages

-

Currencies

-

Document Models

-

Tax Exemptions

-

Currency Exchange

-

Multibanco Gateways

Moloni API / Autenticação

# Autenticação

Para que a sua aplicação possa aceder aos dados de contas no Moloni tem que estar devidamente autenticada!
O primeiro passo é ativar uma conta de Developer com acesso à API no Moloni, definir um Developer ID, uma URI de Resposta e receber um Client Secret, que funciona como a sua Chave de Acesso à API.
Depois deste procedimento terá que se ligar à API através do protocolo OAuth e estabelecer uma coneção entre a sua aplicação e os servidores do Moloni.

Como método de autenticação, a nossa API usa o protocolo OAuth (Especificação 2.0), com a qual deverá estar familiarizado. Para informações adicionais, consulte a informação disponibilizada no site oficial, e poderá ser implementado na maioria das linguagens que se usam, seja na web, desktop ou mobile.

Neste processo convém que esteja familiarizado com termos como tokens, pedidos por GET ou POST, parâmetros, entre outras designações utilizadas.

### Pronto para começar?

Resolvemos esquematizar por passos o exemplo de um processo de autenticação através do OAuth numa conta do Moloni.

- Para aplicações web, são necessários 3 passos;

- Para aplicações nativas, para plugins de instalação em vários sites, ou qualquer outra situação onde o anterior não seja aplicável, o processo é diferente e é feito apenas com uma chamada.

## Aplicações web

É o método de autenticação que nós sugerimos!
Está menos disposto a ataques, porque as credênciais do cliente são diretamente colocadas no login do Moloni e não passam por interfaces de terceiros, acabando por se estabelecer uma relação de confiança entre o utilizador e a plataforma desenvolvida, porque sabe que está a inserir diretamente os dados no Moloni. Este processo é mais minuncioso na implementação e é o indicado para todas as plataformas web.

### 1º Passo

O primeiro contacto é feito redireccionando o seu utilizador para o endpoint da API com 3 parâmetros GET.

#### URL e parâmetros necessários

https://www.moloni.pt/ac/root/oauth/?response_type=code&client_id=[your_developer_id]&redirect_uri=[your_callback_url]

response_type string
Tipo de resposta. Deve ser code. Preenchimento obrigatório

client_id string
O seu Developer ID que está disponível na Área de Cliente. Preenchimento obrigatório

redirect_uri string
O seu Redirect URI que está disponível na Área de Cliente. Preenchimento obrigatório

### 2º Passo

Após ter feito o pedido, irá ser mostrado o formulário de Login na API, que deverá preencher com os dados do utilizador Moloni, cuja conta pretende ter acesso através da API.

Se o login for bem sucedido, será apresentada uma mensagem perguntando ao utilizador que a aplicação está a tentar aceder à sua conta e com isso terá acesso a informação confidencial.

Se o utilizador aceitar, será redireccionado para o redirect_uri especificado na chamada com o parâmetro GET code preenchido com o authorization_code que necessita para solicitar o seu access_token.

### 3º Passo

O próximo passo será trocar o authorization_code que recebeu por um access_token e um refresh_token (Vêm sempre os dois juntos).

O pedido para estes dois códigos é feito por GET para o URL do end-point da API com 5 parâmetros.

#### URL e parâmetros necessários

https://api.moloni.pt/v1/grant/?grant_type=authorization_code&client_id=[your_developer_id]&redirect_uri=[your_callback_url]&client_secret=[your_client_secret_code]&code=[your_authorization_code]

grant_type (string)
Tipo de autorização. Deve ser authorization_code para solicitar os tokens de acesso. Preenchimento obrigatório

client_id (string)
O seu Developer ID e está disponível na Área de Cliente. Preenchimento obrigatório

redirect_uri (string)
O seu Redirect URI e está disponível na Área de Cliente. Preenchimento obrigatório

client_secret (string)
O seu Client Secret (Chave Secreta) e está disponível na Área de Cliente. Preenchimento obrigatório

code (string)
É o authorization_code que acabou de receber. Preenchimento obrigatório

#### A resposta chega em formato JSON

{
access_token: 'bad936989865c810e14a81ea9fc2cd8ea8d5e9f6'
expires_in: 3600
token_type: 'bearer'
scope: null
refresh_token: '96f84474f2ed3ae07e4e1b5d08fe1893d08a204f'
}

## Aplicações nativas

Este processo é consideravelmente mais simples que o anterior, usando directamente as credenciais do utilizador para obter os tokens. No entanto, terá que tomar medidas adicionais de segurança para as proteger. A nossa recomendação é que a password do utilizador não seja persistida, sendo-lhe pedida quando (e se) o refresh token expirar (mais sobre a validades dos tokens abaixo).

Basta enviar as suas credenciais de developer em conjunto com as credenciais de acesso do seu utilizador e ser-lhe-ão devolvidos os tokens.

#### URL e parâmetros necessários

https://api.moloni.pt/v1/grant/?grant_type=password&client_id=[your_developer_id]&client_secret=[your_client_secret_code]&username=[your_user_username]&password=[your_user_password]

grant_type string
Tipo de pedido de acesso. Deve ser password. Preenchimento obrigatório

client_id string
O seu Developer ID que está disponível na Área de Cliente. Preenchimento obrigatório

client_secret string
O seu Client Secret (Chave Secreta) que está disponível na Área de Cliente. Preenchimento obrigatório

username string
O nome usado pelo seu utilizador para entrar na plataforma. Preenchimento obrigatório

password string
A password do seu utilizador. Preenchimento obrigatório.

## Em caso de erro

Caso ocorra algum erro, é sempre devolvido um HTTP status com o código 400 (Bad request). Como este erro é demasiado genérico, no corpo da resposta é também devolvido um objecto JSON com os campos error e error_description, que identificam claramente o problema ocorrido.

## Depois de ter os tokens

A partir deste momento, deve fazer os pedidos normalmente para a API, sendo que por GET deve enviar sempre o access_token.

Quanto aos restantes dados, terá que ter em atenção que estes deverão ser enviados no BODY do POST, e podem ser enviados em dois formatos diferentes, sendo que por defeito a API aceita valores em formato Query String., ou se preferir, pode enviar os seus dados em formato JSON.

Para enviar os seus dados em formato de JSON, terá que enviar o header correcto (application/x-www-form-urlencoded), bem como enviar por GET o parâmetro json=true.

A título de exemplo, em PHP pode usar a classe cURL que lhe facilita bastante todas as operações de envio da comunicação e existem paralelos ao cURL em várias linguagens.

### Validade dos tokens

Os tokens de acesso têm uma validade limitada, por isso convém que o sistema criado tenha em conta estes timings para que possa desenvolver rotinas de requisação de novos tokens.

Refresh token: tem validade de 14 dias

Access token: validade 1 hora

### Fazer refresh ao Access Token

Antes que o access_token expire, o mecanismo que criar tem que fazer um pedido de refresh por GET para o URL do end-point da API com 5 parâmetros. Ser-lhe-ão devolvidos novos tokens, tanto de access como de refresh.

#### URL e parâmetros necessários

https://api.moloni.pt/v1/grant/?grant_type=refresh_token&client_id=[your_developer_id]&client_secret=[your_client_secret_code]&refresh_token=[your_refresh_token_code]

grant_type (string)
Tipo de autorização. Deve ser refresh_token para solicitar um novo token de acesso. Preenchimento obrigatório

client_id (string)
O seu Developer ID e está disponível na Área de Cliente. Preenchimento obrigatório

client_secret (string)
O seu Client Secret (Chave Secreta) e está disponível na Área de Cliente. Preenchimento obrigatório

refresh_token (string)
O refresh_token actual. Preenchimento obrigatório

Se o refresh_token ultrapassar os 14 dias de validade, o utilizador terá que voltar a autenticar-se segundo um dos dois métodos acima.

<div class="
