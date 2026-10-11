---
name: 🧪 Field Report
about: Measured behavior from a running extension + server pair — evidence first
title: '[FIELD] '
labels: field-report
assignees: ''
---

## 🧪 Field Report

**Extension version** (manifest.json / the popup footer), **server version** (from `GET /api/health` on the paired instance), and **instance type** (cloud / appliance):

```
vX.Y.Z @ vX.Y.Z (appliance)
```

**Surface under measurement:**

```
(e.g. lib/serverContract.js, or the popup's Vault tab)
```

## What you measured

Paste the actual commands (or console network entries) and their verbatim output:

```
(command + output)
```

## What you expected

```
(quote the README section or server contract the behavior was tested against)
```

## Why it matters

One paragraph: what a user or agent would do wrong because of this.

## Not claimed

What you did NOT test (browsers, server versions, transport variants).

## ✅ Checklist

- [ ] Extension + server versions named above
- [ ] Every observed value came from something you ran, not from memory
- [ ] You searched [existing issues](../../issues) for duplicates
- [ ] You said "no action requested" if this is a situation report, not an ask

---

**Thank you — measured reports are how this project ships.** 🙏