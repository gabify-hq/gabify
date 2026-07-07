<!-- Source: https://www.moloni.pt/dev/controlo-de-erros/ — fetched 2026-07-07, extracted verbatim from raw HTML (raw copy in docs/raw/controlo-de-erros.html) -->

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

Moloni API / Controlo de Erros

# Controlo de Erros

Sempre que os seus pedidos à API não forem feitos de forma correta, podem ser devolvidos dois tipos de erros, que estão devidamente tipificados abaixo.

É importante que saiba interpretar e perceber esses erros.

## Erros de autenticação

Sempre que existe um erro de autenticação, é devolvido o HTTP status code 400. O corpo da resposta é no formato:

{
error: string,
error_description: string

}

### Os erros possíveis são os seguintes:

| Error
| Error Description
| Significado

| invalid_client
| No client id supplied
| O client id da API não foi fornecido no pedido.

| invalid_client
| The client id supplied is invalid
| O client id da API fornecido não é válido.

| invalid_client
| Client id does not exist
| O client id da API fornecido não existe.

| invalid_uri
| No redirect URI was supplied or stored
| O redirect URI não foi fornecido no pedido.

| invalid_uri
| The redirect URI must not contain a fragment
| O redirect URI não pode conter um fragmento (isto é, a parte a seguir a um #).

| redirect_uri_mismatch
| The redirect URI provided is missing or does not match
| O redirect URI fornecido não existe ou não é o mesmo declarado na informação de developer.

| redirect_uri_mismatch
| The redirect URI is mandatory and was not supplied
| O redirect URI não foi fornecido no pedido.

| invalid_request
| The grant type was not specified in the request
| O tipo de concessão (grant) não foi especificado.

| unsupported_grant_type
| Grant type [grant] not supported
| O tipo de concessão (grant) não é válido.

| invalid_client
| The client credentials are invalid
| As credenciais de acesso são inválidas.

| unauthorized_client
| The grant type is unauthorized for this client id
| O client id fornecido não tem acesso ao tipo de concessão (grant) especificado.

| invalid_request
| Invalid request for [grant] grant type
| O pedido é inválido para o tipo de concessão (grant) pedido.

| invalid_grant
| Unable to retrieve token for [grant] grant type
| Não foi possível fornecer um token para o tipo de concessão (grant) especificado.

| invalid_grant
| Token is no longer valid
| O token fornecido já não é válido.

| invalid_scope
| An unsupported scope was requested
| Foi pedido um âmbito (scope) não suportado.

| invalid_client
| Client credentials were not found in the headers or body
| Não foram encontradas credenciais de cliente no pedido.

| invalid_request
| Missing parameter: "code" is required
| O parâmetro obrigatório code não foi fornecido no pedido.

| invalid_grant
| Authorization code doesn't exist or is invalid for the client
| O código de autorização não existe ou é inválido para o cliente fornecido.

| redirect_uri_mismatch
| The redirect URI is missing or do not match
| O redirect URI não foi fornecido ou não é coincidente.

| invalid_grant
| The authorization code has expired
| O código de autorização expirou.

| invalid_request
| Missing parameter: "refresh_token" is required
| O parâmetro obrigatório refresh_token não foi fornecido no pedido.

| invalid_grant
| Invalid refresh token
| O refresh token fornecido é inválido.

| invalid_grant
| Refresh token has expired
| O refresh token expirou.

| invalid_request
| Missing parameters: "username" and "password" required
| O username e a password são obrigatórios; um, ou ambos, não foi fornecido.

| invalid_grant
| Invalid username and password combination
| O username e a password não coincidem.

| invalid_request
| Only one method may be used to authenticate at a time
| O pedido foi feito com mais do que um método de autenticação.

| invalid_request
| The access token was not found
| O access token fornecido não existe.

| invalid_request
| When putting the token in the body, the method must be POST
| Os dados dos pedidos deve ser fornecidos por POST.

| invalid_request
| The content type for POST requests must be "application/x-www-form-urlencoded"
| O content type do POST deve ser application/x-www-form-urlencoded.

## Erros de dados

A forma mais fácil de entender o workflow de um pedido que devolva erro, é testar com um exemplo na SandBox ou nos seus scripts.

Vamos tentar fazer update ao perfil do utilizador através do método updateMe da classe myProfile, falhando o preenchimento de alguns campos e inserir um endereço de e-mail inválido.

### Os parâmetros enviados são:

<?php
$my_data = array(
'name' => '',
'email' => 'fake email',
'cellphone' => '123456789',
'language_id' => 'xpt'
);
?>

###
Ao efetuar a chamada sem alguns dados, ou com dados no formato errado, a API devolve a seguinte resposta:

[
[0] => 1 name,
[1] => 3 email,
[2] => 2 language_id 1 0
]

Em caso de erro, a resposta vem sempre no formato "Código de erro + espaço + Nome do campo".

Perante esta resposta, devemos interpretar da seguinte forma:

[
/* O array tem 3 índices, por isso a resposta devolve 3 erros */
[0] => 1 name, /* código de erro 1. Significa que o campo name é obrigatório */
[1] => 3 email, /* código de erro 3. Significa que o campo email tem um endereço de e-mail inválido*/
[2] => 2 language_id 1 0 /* código de erro 2 1 0. Significa que o campo language_id um inteiro numérico e superior a zero (0) */
]

Erros verbosos:

Caso queira que lhe seja devolvida uma mensagem de erro mais verbal de forma a que o erro seja facilmente entendido pelo utilizador, poderá enviar por GET o parâmetro human_errors=true, e será-lhe devolvido um array com as mensagens de erro no seguinte formato:

[
[0] =>
[code] => 1 name,
[description] => "Field 'name' is required"
[1] =>
[code] => 3 email,
[description] => "Field 'email' must be a valid email address"
[2] =>
[code] => 2 language_id 1 0,
[description] => "Field 'language_id' must be integer, greater than 0"
]

A tabela seguinte, apresenta todos os códigos e respetivos significados para que possa perceber qual o erro devolvido pela API.

### Tabela de erros devolvidos pela API

| Erro
| Significado
| Parâmetros

| 1
| Campo obrigatório
| ---

| 2
| O campo é numérico [e é um inteiro {1}] [e maior que {2}] [e menor que {3}] [e maior ou igual que {4}] [e menor ou igual que {5}]
| 1: é um inteiro [1|0];
2: maior que [null|int];
3: menor que [null|int];
4: maior ou igual que [null|int];
5: menor ou igual que [null|int];

| 3
| O campo tem um endereço de e-mail inválido
| ---

| 4
| O campo deve ser único
| ---

| 5
| O campo deve ter um valor válido [{1}]
| 1: valores aceites (json format)

| 6
| O campo deve ser um URL
| ---

| 7
| O campo tem que ser um código postal válido
| ---

| 8
| O campo tem que ser um número de contribuinte português válido
| ---

| 9
| O campo deve ser uma data no formato YYYY-mm-dd
| ---

| 10
| Associação de documento inválida (O seu tipo não pode ser associado com o documento, ou não existe valor disponível para ser conciliado)
| ---

| 11
| O Documento não pode ser enviado para a Autoridade Tributária (AT)
| ---

| 12
| O campo é uma data e tem que ser {1} {2}
| 1: comparação [<|<=|=|>=|>]
2: outra data [datetime]

| 13
| O campo deve ser um contacto telefónico válido
| ---

| 14
| O artigo tem dois impostos, um do tipo "outro" e um IVA, mas o IVA está antes ou não é cumulativo.
| ---

| 15
| O artigo tem mais do que um IVA.
| ---

| 16
| Por imposição do n.º 15 do artigo 36º do CIVA, o cliente deve ser identificado com nome diferente de "Consumidor Final", morada e localidade diferente de "Desconhecido" e código postal diferente de "0000-000"
| ---

| 17
| O limite do campo foi atingido.
| ---

<div class="
