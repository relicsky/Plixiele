# Email support — manual setup steps

The backend code is shipped: `mailgunInbound` Cloud Function in `functions/index.js`
receives Mailgun webhooks, asks Claude for a reply, and sends it back. To go
live, you need to:

1. Create a Mailgun account
2. Add `plixiele.com` as a sending domain (with subdomain `mg.plixiele.com`)
3. Set DNS records at IONOS
4. Create an inbound route that POSTs incoming emails to our Cloud Function
5. Set Firebase Functions secrets
6. Deploy

Total time once your domain DNS is editable: ~30 minutes plus DNS propagation
(often a few hours, max 48).

## 1. Mailgun account

1. Sign up at https://mailgun.com (free "Foundation Trial" plan covers 100/day,
   then $35/mo "Foundation" if you outgrow it — you won't for support volume).
2. Skip the credit card unless they require it for inbound — the free trial
   includes inbound routing.

## 2. Add the sending domain

Mailgun convention is to use a subdomain for sending (keeps DNS clean and
isolates email reputation from the main site).

1. Mailgun dashboard → **Sending → Domains → Add New Domain**.
2. Domain: `mg.plixiele.com`
3. Region: **US** (matches our `us-central1` Cloud Functions region).
4. Click **Add Domain**.

Mailgun will show a list of DNS records you need to add at IONOS.

## 3. DNS records at IONOS

In IONOS control panel: **Domains & SSL → plixiele.com → DNS**.

Add the records Mailgun gave you. Typical set:

| Type  | Name                          | Value                                                 | Notes |
|-------|-------------------------------|-------------------------------------------------------|-------|
| TXT   | `mg.plixiele.com`             | `v=spf1 include:mailgun.org ~all`                     | SPF — authorizes Mailgun to send |
| TXT   | `mailo._domainkey.mg`         | `k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUA…` (long, from Mailgun) | DKIM — message signing |
| MX    | `mg.plixiele.com`             | `mxa.mailgun.org` (priority 10) and `mxb.mailgun.org` (priority 10) | Inbound routing |
| CNAME | `email.mg.plixiele.com`       | `mailgun.org`                                          | Click tracking |

Apply changes. Back in Mailgun, click **Verify DNS**. Some records propagate in
minutes; SPF/DKIM TXT can take an hour or two. Don't proceed until all four
show green.

## 4. Inbound route

This tells Mailgun to POST any email sent to `help@plixiele.com` to our
Cloud Function.

1. Mailgun dashboard → **Receiving → Routes → Create Route**.
2. **Expression Type**: Match Recipient
3. **Recipient**: `help@plixiele.com`
4. **Actions** (in order):
   - `forward("https://plixiele-sign-in.web.app/api/email/inbound")`
   - `stop()`
5. **Description**: `Plixiele AI support`
6. **Priority**: 10
7. Save.

(If you used a domain other than `plixiele.com` because the apex domain
needs its own MX records for non-Mailgun mail, swap the recipient to
`help@mg.plixiele.com` instead. Either way, you can publish whichever address
on the website — Mailgun handles the address you tell it to match.)

## 5. Firebase Functions secrets

Three secrets to set, then redeploy.

```sh
firebase functions:secrets:set MAILGUN_API_KEY
# Paste the "Sending API key" from Mailgun → Settings → API Keys

firebase functions:secrets:set MAILGUN_WEBHOOK_KEY
# Paste the "HTTP webhook signing key" from Mailgun → Settings → API Keys
# (NOT the same as the sending API key — there's a separate one just for
# verifying inbound webhook signatures.)

firebase functions:secrets:set MAILGUN_DOMAIN
# Paste:  mg.plixiele.com
```

## 6. Deploy

```sh
firebase deploy --only functions:mailgunInbound,hosting
```

(Hosting is included so the new `/api/email/inbound` rewrite goes live.)

## 7. Test

Send a test email from any address to `help@plixiele.com`. Within 10–30
seconds you should get a Claude-written reply.

If nothing happens, check:
- `firebase functions:log --only mailgunInbound` — should show the webhook hit
- Mailgun dashboard → **Sending → Logs** and **Receiving → Logs** for delivery
  status
- Did the signature verification fail? `MAILGUN_WEBHOOK_KEY` is the
  webhook-signing key, not the sending API key — easy to mix up.

## Cost / abuse

- Free tier: 100 messages/day. Each support thread is typically 2-4 messages.
  You'll outgrow this if you ever cross ~25 active threads/day.
- The function ignores: emails from `noreply@*` / `mailer-daemon@*`,
  emails with `Auto-Submitted` or `Precedence: bulk` headers, and any reply
  carrying our own `X-Plixiele-Auto-Reply: 1` marker (prevents loops).
- Claude calls cost ~$0.01 per support reply. Currently no per-sender daily
  cap — add one in `mailgunInbound` if abuse becomes an issue (track sender →
  count in Firestore, refuse after N).

## Where the AI's behavior is defined

`SUPPORT_SYSTEM_PROMPT` in `functions/index.js`. Edit + redeploy to change
voice, escalation rules, or what info it asks for.
