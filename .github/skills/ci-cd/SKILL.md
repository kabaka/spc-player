---
name: ci-cd
description: GitHub Actions CI/CD — build, test, lint, and deploy pipeline for GitHub Pages.
---

# CI/CD

Use this skill when creating or modifying GitHub Actions workflows, deployment pipelines, or build automation.

## Pipeline Structure

```
push/PR → lint → type-check → unit tests → build → e2e tests → deploy (main only)
```

All steps except deploy run on every push and PR. Deploy runs only on pushes to `main`.

## GitHub Actions Workflow

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  build:
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: [build, e2e]
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

## Key Principles

- **Fast feedback**: lint and type-check run first (fastest checks).
- **Cache dependencies**: use `actions/setup-node` with `cache: npm`.
- **Fail fast**: stop the pipeline on first failure.
- **Reproducible builds**: use `npm ci` (not `npm install`).
- **Pin action versions**: use specific versions (e.g., `@v4`), not `@latest`.

## GitHub Pages Setup

- Enable Pages in repo settings → Source: GitHub Actions.
- Set COOP/COEP headers via a `_headers` file or meta tags (needed for SharedArrayBuffer).
- Custom 404.html for SPA routing support.

## Matrix Testing (Future)

When browser-specific tests are needed:

```yaml
strategy:
  matrix:
    browser: [chromium, firefox, webkit]
```

## Secrets and Environment

- No secrets needed for a static site deploy.
- If adding analytics or external services, use GitHub Secrets.
- Never commit API keys or tokens.
