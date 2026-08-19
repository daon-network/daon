---
layout: default
title: "DAON Community"
description: "How to follow, use, and contribute to DAON"
---

# DAON Community

DAON is an early-stage open source project. This page used to describe a Discord
server, a newsletter, four community-built tools, recurring events and a
conference — none of which existed. It has been rewritten to list only things
that are real, because a project about proving what is true should not make
claims it cannot support.

---

## Where the project actually is

**[github.com/daon-network](https://github.com/daon-network)** — the code, the
issues, the pull requests. This is the only place DAON is currently developed and
discussed.

- **Report a bug or ask a question:** open an issue
- **Contribute:** pull requests are welcome; see the repository README for how to
  build and test
- **Read the design:** the `docs/design/` directory carries the specifications,
  including the wire format and the threat model

There is no Discord server, no newsletter, no Twitter/X account, no YouTube
channel, and no subreddit. If you find something claiming to be an official DAON
community, it is not one.

> **Note on `discord.gg/daon`.** This site previously linked there. That invite
> belongs to an unrelated gaming community that happens to share the name. It was
> never ours, and linking to it was a mistake.

---

## Contributing

The project needs the ordinary things an early project needs:

- **Code** — SDKs, integrations, and the Rust provenance crates
- **Documentation** — especially anywhere the docs are wrong or overstate what
  works today
- **Testing** — against real content, on real platforms, at real sizes
- **Review** — the cryptographic design in `docs/design/` benefits from more eyes
  than it has had

Issues and pull requests both work. There is no CLA.

---

## What works today, and what does not

Being accurate about this matters more than looking finished:

| | |
| --- | --- |
| Text registration with licence terms | Works |
| Verification of registered text | Works |
| WordPress plugin | Works |
| Language SDKs | Work |
| **Image and binary registration** | **Not implemented.** Text only |
| Broker system | Partial |

If a page on this site promises something not in that table, the page is wrong
and an issue about it is genuinely useful.

---

## Licence

DAON is released under the Liberation License. See
[the licence page](/legal/liberation-license/) for what it permits and what it
restricts.
