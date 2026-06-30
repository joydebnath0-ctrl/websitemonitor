# API Documentation

Base URL: `http://localhost:3000`

## Start a Scan

`POST /api/scans`

Body:

```json
{
  "domain": "example.com",
  "consent": true
}
```

Returns `202 Accepted`:

```json
{
  "id": "scan-id",
  "status": "queued",
  "pollUrl": "/api/scans/scan-id"
}
```

Validation blocks malformed domains and domains resolving to private, loopback, link-local, or local addresses.

## Poll Scan Status

`GET /api/scans/:id`

Returns live job state with `status`, `progress`, `activeStep`, category results, issue list, score, and grade.

## Domain History

`GET /api/history/:domain`

Returns the latest locally stored completed scans for a domain.

## PDF Report

`GET /api/scans/:id/report.pdf`

Downloads a stakeholder-friendly PDF summary for completed in-memory scans.

## Built-In Docs

`GET /api/docs`

Returns this API document as Markdown.
