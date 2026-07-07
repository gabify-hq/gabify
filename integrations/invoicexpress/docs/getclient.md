# Get Client

Returns a specific client.

Endpoint: GET /clients/{client_id}.json
Version: 2.0.0
Security: apiKeyAuth

## Path parameters:

  - `client_id` (string, required)
    ID of the client.
    Example: "12345"

## Query parameters:

  - `api_key` (string, required)
    Your API Key.
    Example: "YOUR_API_KEY"

## Response 200 fields (application/json):

  - `client` (object)

  - `client.id` (string)
    Example: "1"

  - `client.name` (string)
    Example: "Ricardo Pereira"

  - `client.email` (string)
    Example: "someone@example.com"

  - `client.address` (string)
    Example: "Lisbon"

  - `client.city` (string)
    Example: "Lisbon"

  - `client.postal_code` (string)
    Example: "1750-455"

  - `client.fiscal_id` (string)
    Example: "508025338"

  - `client.website` (string)
    Example: "www.invoicexpress.com"

  - `client.country` (string)
    Example: "Portugal"

  - `client.phone` (string)
    Example: "2313423424"

  - `client.fax` (string)
    Example: "2313423425"

  - `client.preferred_contact` (object)

  - `client.observations` (string)
    Example: "Computer Processed"

  - `client.open_account_link` (string)
    Example: "https://www.app.invoicexpress.com/suppliers/1f7bba947948c50e04af20d329db5bc67c38cf89"

  - `client.send_options` (string)
    Example: "1"

  - `client.payment_days` (string)
    Example: "0"

  - `client.tax_exemption_code` (string)
    Example: "M00"

## Response 401 fields (application/json):

  - `errors` (object)

  - `errors.error` (string)
    Example: "Invalid API key"


## Response 404 fields
