# @rudyrustam/workflow

Agent-to-Agent (A2A) interoperability server (`/.well-known/agent.json`, `/a2a/tasks/*`) and SQLite-backed Durable Workflow + Saga compensation engine (`CentauryWorkflowEngine`) for the Centaury Framework.

## Features
- **A2A Protocol Plugin (`a2aPlugin`)**: Exposes standard `GET /.well-known/agent.json` Agent Cards plus task dispatch (`POST /a2a/tasks/send`), polling (`GET /a2a/tasks/:id`), and cancellation (`POST /a2a/tasks/:id/cancel`).
- **Durable Workflow & Saga Engine (`CentauryWorkflowEngine`)**: Step-level retries with exponential/linear backoff, deterministic SQLite (`_centaury_workflow_steps`) checkpoint replay, and reverse-order Saga compensation on permanent step failures.
