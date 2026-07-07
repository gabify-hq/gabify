# Related Documents

Endpoint: GET /document/{document-id}/related_documents.json
Version: 2.0.0
Security: apiKeyAuth

## Path parameters:

  - `document-id` (integer, required)
    The ID of the document.
    Example: 1050

## Query parameters:

  - `api_key` (string, required)
    Your API Key.
    Example: "YOUR_API_KEY"

## Response 200 fields (application/json):

  - `documents` (array)

  - `documents.id` (integer)
    Example: 541793

  - `documents.status` (string)
    Example: "final"

  - `documents.archived` (boolean)
    Example: true

  - `documents.type` (string)
    Example: "Invoice"

  - `documents.sequence_number` (string)
    Example: "28/A"

  - `documents.inverted_sequence_number` (string)
    Example: "A/28"

  - `documents.atcud` (string)
    Example: "ABCD1234-28"

  - `documents.date` (string)
    Example: "27/06/2017"

  - `documents.due_date` (string)
    Example: "27/06/2017"

  - `documents.reference` (string)
    Example: "foo"

  - `documents.observations` (string)
    Example: "foo"

  - `documents.retention` (string)
    Example: "foo"

  - `documents.permalink` (string)
    Example: "https://www.app.invoicexpress.com/documents/541793e1ab2ebd5c06def40c346ffbe0ff2b463eb1c0f0"

  - `documents.saft_hash` (string)
    Example: "Tdik"

  - `documents.sum` (number)
    Example: 1

  - `documents.discount` (number)

  - `documents.before_taxes` (number)
    Example: 1

  - `documents.taxes` (number)
    Example: 0.07

  - `documents.total` (number)
    Example: 1.07

  - `documents.currency` (string)
    Example: "Euro"

  - `documents.sequence_id` (string)
    Example: "12345"

  - `documents.tax_exemption` (string)
    Example: "M01"

  - `documents.client` (object)

  - `documents.client.name` (string)
    Example: "John"

  - `documents.client.country` (string)
    Example: "Portugal"

  - `documents.items` (array)

  - `documents.items.description` (string)
    Example: "foo"

  - `documents.items.unit_price` (string)
    Example: "1.0"

  - `documents.items.unit` (string)
    Example: "foo"

  - `documents.items.quantity` (string)
    Example: "1.0"

  - `documents.items.subtotal` (number)
    Example: 1

  - `documents.items.tax_amount` (number)
    Example: 0.07

  - `documents.items.discount_amount` (number)

  - `documents.items.tax` (object)

  - `documents.items.tax.value` (number)
    Example: 7

## Response 401 fields (application/json):

  - `errors` (object)

  - `errors.error` (string)
    Example: "Invalid API key"


## Response 404 fields
