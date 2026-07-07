# Generate PDF

Endpoint: GET /api/pdf/{document-id}.json
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

  - `second_copy` (boolean)

## Response 200 fields (application/json):

  - `output` (object)

  - `output.pdfUrl` (string)
    Example: "url.pdf"

## Response 401 fields (application/json):

  - `errors` (object)

  - `errors.error` (string)
    Example: "Invalid API key"


## Response 202 fields

## Response 404 fields
