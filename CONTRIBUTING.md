# Contributing

JARVIS v0.1 is being implemented in sequential gates.

Before opening an implementation pull request:

1. Read `docs/PRD.md` and `AGENTS.md`.
2. Keep the change focused on the active approved gate.
3. Include tests for new state transitions or persistence behavior.
4. Use deterministic fake providers for automated workflow tests.
5. Document new dependencies and their licenses.
6. Record directly adapted code in `docs/DESIGN_REFERENCES.md`.
7. Keep provider-specific behavior behind the shared adapter contract.
8. Never use dangerous permission-bypass flags.
9. Do not remove the Python implementation until TypeScript parity is verified.
