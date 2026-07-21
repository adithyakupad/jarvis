# Security Policy

## Current status

JARVIS is pre-release software. Do not grant it broad filesystem, credential, deployment, purchasing, or messaging permissions.

JARVIS v0.1 launches locally authenticated coding agents against user-selected repositories. Treat provider output, repository instructions, commands, and file paths as untrusted until validated.

## Core security principles

- Project-scoped filesystem access
- Explicit execution envelopes
- No silent scope expansion
- No credentials committed to the repository
- Verification before completion claims
- Append-only audit events for meaningful actions
- Read-only inspection before plan approval
- Approval sealed to one proposal revision and expected scope
- Provider processes spawned without a shell
- Provider output validated before persistence or display
- Secret redaction before event persistence or UI streaming
- Localhost-only application server
- Preservation of pre-existing user changes
- No dangerous permission-bypass flags
- Confirmation before deletion, deployment, publication, installation, submission, or purchase

## Reporting

Until a formal security channel exists, open a private security advisory in the GitHub repository rather than posting sensitive details in a public issue.
