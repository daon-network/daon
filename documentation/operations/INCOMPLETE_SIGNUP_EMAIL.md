# Reaching someone whose signup didn't finish

**Status:** drafted, not sent. Sending is a human decision.

## The rule this follows

One message, about a thing they started, that they can act on or ignore. Not a
sequence. Not a reminder. Not a second one if they don't reply.

**Never say what you observed.** The line between a useful email and a creepy one
is almost entirely this. "You spent four minutes on the setup screen" is
surveillance. "Your setup didn't finish" is a fact about their account, which
they already know and can verify.

**Have a reason that isn't "please come back."** If nothing changed, there is
nothing to say and the honest move is silence. Here something did change: the
setup window was five minutes and is now thirty, because five was too short. That
is a real update. It also means the email is an apology with a fix attached
rather than a request for their attention.

## Draft

> **Subject:** Your DAON setup didn't finish — that was our fault
>
> You started setting up a DAON account and didn't get past the two-factor step.
>
> That step asks you to install an authenticator app, and it only gave you five
> minutes to do it. That was too short. It's thirty now.
>
> If you'd like to pick it up: **[Finish setting up →]**
>
> It goes faster if you have an authenticator app ready first — Aegis, Ente
> Auth, 1Password, Bitwarden, Google Authenticator, any of them. Two-factor is
> required on every DAON account, because the account holds ownership records
> for your work and we'd rather not make those easy to steal.
>
> If you'd rather not, that's genuinely fine: **[delete my account and data]**.
>
> Either way this is the only message of this kind you'll get.
>
> — DAON

## Why it is worded that way

| Choice | Reason |
| --- | --- |
| "that was our fault" in the subject | It was. Leading with it means they know within one line that this isn't a nudge. |
| No date, no timings, no "we noticed" | Nothing that reveals what the logs hold. |
| The fix is stated before the ask | They learn something true whether or not they click. |
| App names listed | The thing that blocked them was not knowing what they needed. Naming options removes the research step. |
| Why 2FA is mandatory, in one clause | Answers the obvious objection without arguing. |
| Delete link as prominent as the resume link | If the answer is no, make no easy. An escape hatch that is hard to find is a dark pattern. |
| "the only message of this kind" | A promise, and it should be kept. |

## What not to do

- No follow-up if they don't respond
- No "we noticed you haven't..." phrasing anywhere
- No discount, urgency, or scarcity framing — there is nothing to sell
- Do not send to anyone who did not start a signup themselves

## Who qualifies right now

One person. Query:

```sql
SELECT u.id, u.email
FROM users u
JOIN temp_sessions ts ON ts.user_id = u.id
WHERE ts.completed_at IS NULL
  AND u.totp_enabled = false
  AND ts.flow_type = '2fa_setup';
```

If this ever returns more than a handful, the answer is not to send more email —
it is that signup is broken and needs fixing first.
