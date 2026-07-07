---
name: Feature request
about: Propose a new template, template field, admin capability, or operator polish.
title: ''
labels: enhancement
assignees: ''
---

## Problem

What are you trying to do that the current repo doesn't support? Frame it
as a user need, not a solution.

## Proposed solution

A description of the change you want. Reference the relevant
contract / data model / file:

- Template contract: `packages/shared/src/template.ts` or `TEMPLATES.md`
- DB schema: `packages/db/migrations/`
- Admin pages: `apps/web/src/app/admin/`
- Orchestrator API: `apps/orchestrator/src/server.ts`
- Public MCP: `open_source/jobops/src/mcp/server.ts`

## Alternatives

What other approaches did you consider, and why is your preferred one
better?

## Impact

Who benefits and how? Operator, recruiter, end-user?

## Persona invariant

If the change affects the public site or admin, does it introduce any
real-persona content? (It shouldn't — keep `apps/` and `packages/`
persona-neutral.)

## Risk

- Backward compatibility for the on-disk DB schema?
- Encrypted-settings impact?
- Public MCP surface — does it stay closed?

## Test plan

How will you prove the change works? (Hint: extend the existing vitest
or pytest suites; the public-MCP contract is enforced at the jobops layer.)
