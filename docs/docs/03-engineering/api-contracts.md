---
title: "API Contracts"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# API Contracts

## HTTP Endpoint Schema Contracts

All backend routes are hosted by the local Hono server. Responses return consistent JSON schemas validated with Zod.

### POST `/api/workflows`
- **Purpose:** Stage or update a draft workflow proposal.
- **Request Body (Zod):**
  ```json
  {
    "project_id": "string",
    "dag_layout": "object"
  }
  ```
- **Response Shape:**
  ```json
  {
    "success": true,
    "workflow_id": "string"
  }
  ```

### POST `/api/workflows/:id/runs`
- **Purpose:** Trigger a run on an approved workflow.
- **Response Shape:**
  ```json
  {
    "success": true,
    "run_id": "string",
    "status": "pending"
  }
  ```
