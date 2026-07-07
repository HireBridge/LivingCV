---
name: Bug report
about: Something is broken. (Not security — use GitHub security advisories for those.)
title: ''
labels: bug
assignees: ''
---

## What happened

A clear, factual description of the bug.

## Reproduction

The smallest set of steps to reproduce. List the commands you ran, the
inputs you gave, and what you saw.

```
e.g.
$ docker compose up -d
$ curl http://localhost:3000/
...
```

## Expected

What you expected to happen.

## Actual

What actually happened. Include error messages, log snippets, and
screenshots when relevant.

## Environment

- Repository version: (commit hash, branch, or release tag)
- Deployment: (Docker compose, local dev, …)
- Node: `node -v`
- OS: (e.g. Ubuntu 22.04 on Ampere A1)
- Browser (if web): (e.g. Firefox 119)

## Scope

- [ ] Self-hosted (your own data)
- [ ] Demo persona
- [ ] Affects the operator-facing admin
- [ ] Affects the recruiter-facing chat/voice
- [ ] Affects the public MCP surface

## What you've tried

Workarounds, bisects, etc. — anything that might save a reviewer time.
