# SSH hardening

**Status:** applied 21 August 2026 · **Host:** `api.daon.network` (Hetzner)

## What changed

Password authentication is off. Keys only.

`/etc/ssh/sshd_config.d/10-daon-hardening.conf`:

```
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitEmptyPasswords no
PermitRootLogin prohibit-password
MaxAuthTries 3
```

A drop-in rather than an edit to `sshd_config`, so a package upgrade that
replaces the main file does not silently restore password auth. The main file
already carries `Include /etc/ssh/sshd_config.d/*.conf`.

## Why

Password auth was enabled and under continuous attack:

| | |
| --- | --- |
| Total failed attempts | 23,231 |
| Failed in the preceding 24h | 1,586 |
| Of those, targeting `root` | 1,027 |
| Addresses banned by fail2ban | 3,339 |

fail2ban was keeping up, but it was mopping a flood that did not need to reach
the door. Nobody logs in with a password: both accounts with a shell — `root`
and `deploy-bot` — use ED25519 keys, so this removed an attack surface without
removing anyone's access.

`PermitRootLogin` was `without-password`, which already prohibited passwords;
`prohibit-password` is the same setting under a name that does not read like it
permits something. `sshd -T` still prints `without-password` — they are synonyms.

## What was verified before and after

1. Both shell accounts hold an ED25519 key in `authorized_keys`
2. The live session was authenticated by `publickey`, per the journal
3. `sshd -t` validated the config **before** the daemon was touched
4. `systemctl reload ssh`, not `restart` — existing sessions unaffected
5. A **new** connection authenticated with a key afterwards
6. A password-only attempt was refused: `Permission denied (publickey)`
7. CI deploys with `ssh -i ~/.ssh/deploy_key`, so the pipeline is key-based

Step 5 is the one that matters. Reloading leaves your current session working
whether or not you have locked yourself out, so the change is not proven until a
fresh connection succeeds.

## Firewall

`ufw` is active and correct: default deny incoming, allow outgoing, with only
22/tcp, 80 and 443 open (v4 and v6).

## fail2ban

Active, one jail (`sshd`), reading the systemd journal. Expect the ban rate to
fall now — bots that cannot offer a password fail at `publickey` instead of
generating the auth failures the jail matches on. That is a reduction in noise,
not in protection: the attempts can no longer succeed by guessing.

## If you are locked out

Hetzner's console gives root access without SSH. Remove or edit
`/etc/ssh/sshd_config.d/10-daon-hardening.conf`, run `sshd -t`, then
`systemctl reload ssh`.
