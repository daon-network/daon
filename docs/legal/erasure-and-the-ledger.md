---
layout: default
title: "Erasure and the Ledger"
description: "What deleting your DAON account removes, what it cannot remove, and why an append-only ledger is compatible with the right to erasure."
permalink: /legal/erasure-and-the-ledger/
---
# Erasure and the Ledger

**What deleting your account actually does, stated precisely.**

DAON is operated from Germany and claims GDPR compliance, so Art. 17 — the right to erasure —
applies. An append-only blockchain looks like it cannot honour that right. This page explains why it
can, and is specific about the one thing it does not reach.

---

## The short version

**Nothing that identifies you is on the blockchain, and never was.** Everything personal lives in a
Postgres database, and deleting your account removes it. The ledger holds a hash, a licence name and
DAON's own wallet address — no email, no name, no account, no IP.

That is not a workaround. It is a consequence of a design choice made for other reasons, and it
happens to make erasure straightforward.

---

## What is actually written to the chain

One message, `MsgRegisterContent`, with five fields:

| Field | Value | Personal data? |
| --- | --- | --- |
| `creator` | **DAON's own wallet address** — the same for every registration | No |
| `contentHash` | `sha256:…` of your content | No — see below |
| `license` | e.g. `liberation_v1` | No |
| `fingerprint` | empty for registrations made through the website and API | No |
| `platform` | `api` | No |

The `creator` field is the one people expect to be a problem, and it is not: it is not you. Every
registration is signed by DAON's own key. Your ownership of a registration is a row in a database,
never a signature on the chain. That has real downsides recorded elsewhere in this repo — it means
the chain does not prove *who* registered something — but for erasure it means there is nothing on
the ledger to erase.

**Titles and descriptions are not written to the chain.** They exist only in the registry database.

### Why a content hash is not personal data

A SHA-256 hash is one-way. It cannot be turned back into the content, and it identifies nobody on its
own — to learn anything from it you must already hold the file it was computed from. If you hold the
file, you already have everything the hash could tell you.

This is the same reasoning that treats a salted password digest differently from a password. We state
it here rather than assume it, because it is the load-bearing claim on this page.

---

## What deleting your account removes

Immediately and permanently, from the registry database:

- Your **email address** and the user record itself
- All **sessions and refresh tokens** — you are signed out everywhere
- All **trusted devices**
- Any **pending magic links**, OAuth sessions and email-change requests
- Your **2FA secret** and backup codes
- The **IP addresses** recorded against your activity history and API usage

The last one is worth naming separately. An IP address is personal data in its own right, and simply
unlinking it from your account would not be erasure — so those columns are emptied, not just
detached.

---

## What survives, and why

### Your registrations

They remain, no longer linked to any account. The hash, the date, the licence, the title and the
description stay in the registry.

This is deliberate. A registration is a dated statement that a work existed on a given day. The
corresponding record is on an append-only ledger and cannot be withdrawn by anyone in any case, so
deleting the database row would not remove it from the world — it would only stop DAON being able to
explain a hash that is still publicly on the chain. The registry would be left unable to answer a
question the ledger still poses.

It also protects you. If you ever need to show that you registered something in April, that proof
should not evaporate because you closed your account in September.

### The one thing to check before you delete

**Titles and descriptions are kept as you wrote them**, on a row that no longer has an owner. They
stay in DAON's registry database — not on the blockchain — but they are not removed and, once the
account is gone, there is no longer an account that can edit them.

If a title or description contains your name, your location, or anything else you would not want to
persist, **edit it before you delete your account.** The deletion screen says this too.

### An anonymous record that a deletion happened

One dated row remains saying that an account was deleted, with no user, no IP and no detail. It
exists so the erasure can be shown to have run. It cannot be traced back to you.

---

## What DAON cannot do, in plain terms

**Nobody can remove a record from the blockchain — including us.** That is what append-only means,
and it is the property the registration is valuable for. If it could be withdrawn on request, it
could be withdrawn under pressure, and it would prove nothing.

What is on there about you, specifically, is: nothing. A hash of a file you hold, a licence name, and
our wallet address.

---

## How to exercise the right

**Settings → Danger Zone → Delete my account.** Self-service, no email to a human, no waiting period.
You type a confirmation phrase, and an authentication code as well if you have 2FA switched on.

Two-factor authentication is *not* required to delete an account. Erasure is a right, not a security
feature, and gating it behind a setting you may never have enabled would be gating the right itself.
Where 2FA exists it raises the bar; it is never the bar.

### API

```
DELETE /api/v1/auth/account
Authorization: Bearer <access token>

{ "confirm": "DELETE MY ACCOUNT", "code": "123456" }
```

`code` is required only if the account has 2FA enabled. The response reports how many registrations
were orphaned and how many rows were scrubbed, because after this call you cannot sign in and check.

---

## Related

- [Legal framework]({{ '/legal/' | relative_url }})
- Design: registry and provenance are separate systems, linked by content — `docs/design/decisions.md`
