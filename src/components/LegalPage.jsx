import { useState } from 'react'

const TABS = [
  { key: 'terms',   label: 'Terms of Service' },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'conduct', label: 'Code of Conduct' },
]

const LAST_UPDATED = '2026-05-09'

export default function LegalPage({ initial = 'terms', onClose }) {
  const [tab, setTab] = useState(initial)
  return (
    <div className="legal-page">
      <div className="legal-head">
        <button className="legal-close" onClick={onClose}>← Back</button>
        <div className="legal-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`legal-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="legal-body">
        <p className="legal-meta">Last updated: {LAST_UPDATED}</p>
        {tab === 'terms'   && <Terms />}
        {tab === 'privacy' && <Privacy />}
        {tab === 'conduct' && <Conduct />}
      </div>
    </div>
  )
}

function Terms() {
  return (
    <article>
      <h1>Terms of Service</h1>

      <p>By creating an account on Plixiele ("the Service") you agree to these Terms.
      If you don't agree, don't use the Service.</p>

      <h2>1. The Service</h2>
      <p>Plixiele is a tool that uses third-party AI providers (currently Anthropic Claude
      and Google Gemini) to generate 3D models, scenes, shaders, and code from prompts.
      Output quality is best-effort and never guaranteed.</p>

      <h2>2. Accounts</h2>
      <p>You must be at least 10 years old to use Plixiele. If you are under the age
      of digital consent in your country (in the US, that's 13 under COPPA), a parent
      or legal guardian must consent on your behalf and supervise your use. You're
      responsible for the security of your password and for any activity under your
      account.</p>

      <h2>3. Plans, credits, and billing</h2>
      <ul>
        <li>Generations cost 10 credits; chat replies cost 2 credits.</li>
        <li>Monthly credit allowances reset on the 1st of each month UTC. Unused credits
        do not roll over.</li>
        <li>Paid plans renew automatically each month until canceled. You can cancel
        anytime from the customer portal — your plan remains active until the end of
        the paid period.</li>
        <li>Refunds are at our discretion. We will not refund partial-period credits or
        unused credits unless required by law.</li>
        <li>Prices are in USD and may change with at least 14 days' notice.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>You own the prompts you write and the outputs Plixiele produces from them.
      You grant Plixiele a non-exclusive license to host, display, and (when you
      explicitly publish to the Community gallery) share that content.</p>
      <p>You're responsible for making sure your prompts and uploaded images don't
      infringe anyone else's rights. AI outputs may inadvertently resemble existing
      works — review before publishing.</p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to use Plixiele to generate or upload content that violates our
      <strong> Code of Conduct </strong>, infringes copyright, contains personal data
      of others, or violates applicable law. We may suspend or terminate accounts that
      do.</p>

      <h2>6. Third-party AI providers</h2>
      <p>When you generate content, your prompt (and any uploaded image) is sent to
      Anthropic or Google for processing. Their privacy policies apply to that
      transfer. We do not train models on your content.</p>

      <h2>7. Service availability</h2>
      <p>We aim for high uptime but provide the Service "as is" without warranty.
      We are not liable for downtime, lost work, or indirect damages beyond the
      amount you paid us in the previous 30 days.</p>

      <h2>8. Termination</h2>
      <p>You can delete your account at any time. We can suspend or terminate
      accounts for violations of these Terms or our Code of Conduct, with or
      without notice for serious violations.</p>

      <h2>9. Changes</h2>
      <p>We may update these Terms. If changes are material, we'll notify you by
      email or in-app at least 14 days before they take effect.</p>

      <h2>10. Contact</h2>
      <p>Questions: <a href="mailto:support@plixiele.app">support@plixiele.app</a></p>
    </article>
  )
}

function Privacy() {
  return (
    <article>
      <h1>Privacy Policy</h1>

      <p>This describes what Plixiele collects, why, and how to control it.</p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account data</strong> — email, display name, hashed password
        (handled by Firebase Authentication).</li>
        <li><strong>Your work</strong> — sessions, scenes, community posts, and
        prompts you generate. Stored in Firestore tied to your user ID.</li>
        <li><strong>Billing data</strong> — handled by Stripe. We never see your
        card number; we only see subscription status and price IDs.</li>
        <li><strong>Usage logs</strong> — request timestamps and credit consumption
        for billing accuracy and abuse prevention.</li>
      </ul>

      <h2>2. What we send to AI providers</h2>
      <p>When you generate, your prompt (and any image you upload) is sent to
      Anthropic or Google. Per their stated policies at the time of writing,
      neither uses Plixiele API traffic to train their models. Their privacy
      policies apply to that data transfer:</p>
      <ul>
        <li><a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">Anthropic Privacy Policy</a></li>
        <li><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a></li>
      </ul>

      <h2>3. How we use the data</h2>
      <p>To run the Service: showing your sessions, gating credits, processing
      payments, and detecting abuse. We don't sell personal data.</p>

      <h2>4. Cookies and storage</h2>
      <p>We use first-party browser storage to keep you signed in and remember
      your in-app preferences (renderer choice, sidebar state, etc.). We do not
      use advertising cookies.</p>

      <h2>5. Sharing</h2>
      <p>We share data only with vendors needed to operate the Service:
      Firebase/Google Cloud (hosting + database), Stripe (payments), Anthropic
      and Google AI (model inference). We disclose data when legally compelled.</p>

      <h2>6. Your rights</h2>
      <p>You can export, edit, or delete your account data at any time. Email
      <a href="mailto:privacy@plixiele.app"> privacy@plixiele.app </a> if you
      can't do something through the app and we'll handle it within 30 days.</p>

      <h2>7. Security</h2>
      <p>All traffic is HTTPS. Firestore rules restrict each user's data to
      themselves. AI provider API keys are held server-side, never in the
      browser bundle.</p>

      <h2>8. Children</h2>
      <p>Plixiele is not directed at children under 10. For users between 10 and
      the age of digital consent in their country, parental supervision is
      required. If you believe a child under 10 has created an account, please
      contact us so we can remove it.</p>

      <h2>9. Changes</h2>
      <p>If this policy materially changes we'll notify you in-app or by email.</p>
    </article>
  )
}

function Conduct() {
  return (
    <article>
      <h1>Code of Conduct</h1>

      <p>Plixiele is a creative tool. We want it to feel that way. Here's what we
      expect from everyone who uses it.</p>

      <h2>Be a good neighbor</h2>
      <ul>
        <li>Treat other users — and the AI — with basic respect.</li>
        <li>Don't harass, dox, threaten, or impersonate others.</li>
        <li>Constructive criticism of community posts is welcome; targeted
        cruelty is not.</li>
      </ul>

      <h2>Don't generate or upload</h2>
      <ul>
        <li>Sexual content involving minors. (Zero tolerance — accounts are
        permanently banned and reported.)</li>
        <li>Real, identifiable nude or sexual content of any person without
        their explicit consent.</li>
        <li>Extreme gore or content celebrating real-world violence against
        identifiable people or groups.</li>
        <li>Content that incites violence or hatred against people based on
        protected characteristics.</li>
        <li>Malware, working exploits, or instructions for making weapons
        capable of mass harm.</li>
      </ul>

      <h2>Respect copyright</h2>
      <p>Don't use prompts designed to extract a specific living artist's style
      and pass the output off as theirs. Don't upload copyrighted images you
      don't have rights to.</p>

      <h2>Be honest about AI</h2>
      <p>If you publish a generated model anywhere — community gallery, social
      media, a portfolio — be willing to disclose that AI was involved if asked.</p>

      <h2>Reporting</h2>
      <p>See something that breaks these rules? Email
      <a href="mailto:abuse@plixiele.app"> abuse@plixiele.app </a> with a link
      and we'll investigate within 72 hours. Provide context — false reports
      can themselves be a violation.</p>

      <h2>Consequences</h2>
      <p>Depending on severity: warning → temporary suspension → permanent ban,
      with reasonable notice and a chance to appeal except for the zero-tolerance
      categories above.</p>
    </article>
  )
}
