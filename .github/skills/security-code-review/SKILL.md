---
name: security-code-review
description: OWASP-focused code review for client-side vulnerabilities, input validation, and dependency safety.
---

# Security Code Review

Use this skill when reviewing code for security vulnerabilities. Focus on the OWASP Top 10 as applicable to a client-side-only web application.

## Priority Areas

### 1. Injection (XSS)

- Never use `innerHTML`, `outerHTML`, or `document.write()` with user-supplied data.
- SPC metadata (ID666 tags) must be rendered with `textContent` or framework-safe rendering (React auto-escapes JSX).
- URL parameters must be validated and sanitized before use.
- No `eval()`, `Function()`, or `setTimeout(string)`.

### 2. Broken Access Control

Minimal concern for single-user client-side app. However:

- Deep links should not expose internal state that could confuse the app.
- Service worker should only serve cached content from the same origin.

### 3. Security Misconfiguration

- Content Security Policy must be strict: `default-src 'self'`, no `unsafe-inline` or `unsafe-eval`.
- COOP/COEP headers if SharedArrayBuffer is used.
- No sensitive data in error messages or console output.

### 4. Vulnerable Components

- Check `npm audit` output. Block on critical/high severity.
- Prefer libraries with active maintenance and security response.
- Pin dependency versions. Use lockfile.

### 5. Software Integrity

- Subresource Integrity (SRI) for any CDN-loaded resources.
- Service worker update integrity (verify hash before activation).
- Build reproducibility: same source should produce same output.

## Binary Parsing Review Checklist

- [ ] All buffer reads are bounds-checked.
- [ ] No reads past buffer length.
- [ ] Integer arithmetic checks for overflow.
- [ ] String decoding handles invalid UTF-8/Shift-JIS gracefully.
- [ ] Loop iteration is bounded (max iterations to prevent infinity).
- [ ] Memory allocation is capped.

## WASM Security

- WASM memory is isolated (sandboxed linear memory).
- Validate all data crossing the JS-WASM boundary.
- Cap WASM memory growth to prevent exhaustion.
- No raw pointer exposure to JS.
