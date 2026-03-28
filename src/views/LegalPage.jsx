export default function LegalPage({ page }) {
  if (page === "terms") return <TermsOfService />;
  if (page === "privacy") return <PrivacyPolicy />;
  return null;
}

function TermsOfService() {
  return (
    <main className="legal-page">
      <article className="surface-card legal-content">
        <header className="legal-header">
          <h1>Terms of Service</h1>
          <p className="legal-effective">Effective date: March 24, 2026</p>
        </header>

        <section className="legal-section">
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using Consensus Market ("the Platform"), operated by Measurable Data Token Limited
            ("Company," "we," "us"), you agree to be bound by these Terms of Service. If you do not
            agree to these terms, do not use the Platform.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Platform Description</h2>
          <p>
            Consensus Market is a prediction market platform that allows eligible participants to
            express views on publicly disclosed company key performance indicators (KPIs) relative to
            sell-side analyst consensus estimates. Participants use either demonstration credits or, where
            permitted, approved digital assets to take positions on whether reported KPI figures will
            exceed or fall short of consensus estimates.
          </p>
          <p>
            The Platform is not a securities exchange, derivatives platform, or regulated financial
            market. Positions on the Platform represent participation in a parimutuel pool and do not
            constitute securities, futures contracts, swaps, or any other regulated financial instrument.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Eligibility and Access</h2>
          <p>You represent and warrant that:</p>
          <ul>
            <li>You are at least 18 years of age or the age of majority in your jurisdiction;</li>
            <li>You are not located in, or a resident of, the United States, the People's Republic of China,
              or any jurisdiction where participation in prediction markets is prohibited by applicable law;</li>
            <li>You are not a sanctioned person or entity under OFAC, EU, UN, or other applicable sanctions
              regimes;</li>
            <li>Your participation does not violate any law or regulation applicable to you;</li>
            <li>You have completed any required identity verification or eligibility screening.</li>
          </ul>
          <p>
            We reserve the right to restrict, suspend, or terminate access at any time, with or without
            notice, if we believe you have violated these terms or applicable law.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Demonstration Mode</h2>
          <p>
            The Platform may operate in demonstration mode using non-redeemable credits with no monetary
            value. Demonstration credits cannot be purchased, sold, transferred, or redeemed for cash or
            any digital asset. Demonstration mode activity does not create any financial obligation.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Digital Asset Mode</h2>
          <p>
            Where available in your jurisdiction, the Platform may allow deposits and positions
            denominated in approved digital assets (e.g., USDT, USDC). By depositing digital assets,
            you acknowledge and accept the following:
          </p>
          <ul>
            <li>Positions are settled on a parimutuel basis. You may lose your entire deposited amount.</li>
            <li>Digital asset transactions on the blockchain are irreversible. We cannot reverse or recover
              misdirected transfers.</li>
            <li>You are solely responsible for the security of your wallet and private keys.</li>
            <li>Protocol fees, as disclosed at market creation, may be deducted from winning payouts.</li>
            <li>The Company does not provide custody services. Your deposited assets are held in a smart
              contract on the applicable blockchain network.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Market Resolution</h2>
          <p>
            Markets are resolved based on officially reported KPI figures from the relevant company's
            public filings, press releases, or investor relations materials. Resolution values are
            attested by authorized signers using cryptographic attestations and verified on-chain by the
            oracle contract.
          </p>
          <p>
            The Company makes reasonable efforts to resolve markets accurately and promptly but does not
            guarantee the timeliness or accuracy of resolution data. In exceptional circumstances
            (ambiguous reporting, restatements, data source unavailability), the Company may cancel a
            market and return all staked amounts to participants.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Market Cancellation</h2>
          <p>
            The Company reserves the right to cancel any market before settlement for reasons including
            but not limited to: company reporting delays, data integrity concerns, smart contract
            vulnerabilities, regulatory developments, or force majeure events. In the event of
            cancellation, all staked amounts are returned to participants.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Risk Disclosure</h2>
          <p><strong>Prediction markets carry substantial risk of loss.</strong></p>
          <ul>
            <li><strong>Total loss risk:</strong> You may lose your entire position. There is no guarantee
              of any return.</li>
            <li><strong>Smart contract risk:</strong> The Platform relies on smart contracts that, despite
              auditing, may contain vulnerabilities or behave unexpectedly.</li>
            <li><strong>Blockchain risk:</strong> Network congestion, forks, or protocol changes on the
              underlying blockchain may affect transaction execution or settlement.</li>
            <li><strong>Oracle risk:</strong> Resolution depends on off-chain data attested by authorized
              signers. Errors in attestation or data source inaccuracies could affect outcomes.</li>
            <li><strong>Regulatory risk:</strong> Changes in applicable law or regulation may require
              modification, restriction, or cessation of Platform operations in certain jurisdictions.</li>
            <li><strong>Liquidity risk:</strong> Markets may have limited participation, resulting in
              concentrated positions or unfavorable payout ratios.</li>
          </ul>
          <p>
            Do not participate with funds you cannot afford to lose. The Platform is not suitable for
            speculation with borrowed funds or essential savings.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Platform from a restricted jurisdiction or circumvent geographic restrictions;</li>
            <li>Create multiple accounts or use automated systems to manipulate market outcomes;</li>
            <li>Exploit smart contract vulnerabilities, front-run oracle resolutions, or engage in market
              manipulation;</li>
            <li>Use the Platform to launder proceeds of crime or finance prohibited activities;</li>
            <li>Interfere with the Platform's operation, security, or availability;</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of proprietary
              components.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>10. Intellectual Property</h2>
          <p>
            The Platform's design, branding, consensus data presentation, and proprietary data
            integrations are the intellectual property of the Company. Smart contracts are deployed
            on public blockchains and their bytecode is publicly verifiable. This does not grant any
            license to copy, modify, or deploy derivative contracts.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, the Company, its officers, directors,
            employees, and affiliates shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages, or any loss of profits, data, or digital assets,
            arising from your use of the Platform.
          </p>
          <p>
            The Company's total aggregate liability for any claim arising from these terms or your use
            of the Platform shall not exceed the amount of fees actually paid by you to the Company in
            the twelve months preceding the claim.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless the Company and its affiliates from any claims,
            damages, losses, or expenses (including reasonable legal fees) arising from your use of
            the Platform, your violation of these terms, or your violation of any applicable law.
          </p>
        </section>

        <section className="legal-section">
          <h2>13. Modifications</h2>
          <p>
            We may modify these terms at any time by posting the revised terms on the Platform. Your
            continued use after the effective date of any modification constitutes acceptance of the
            revised terms. Material changes will be communicated via the Platform interface.
          </p>
        </section>

        <section className="legal-section">
          <h2>14. Governing Law and Dispute Resolution</h2>
          <p>
            These terms are governed by the laws of the British Virgin Islands.
            Any dispute arising from these terms or your use of the Platform shall be resolved by
            binding arbitration administered by the BVI International Arbitration Centre (BVI IAC)
            under its then-current rules. The seat of arbitration shall be the British Virgin Islands. The language of
            arbitration shall be English.
          </p>
        </section>

        <section className="legal-section">
          <h2>15. Severability</h2>
          <p>
            If any provision of these terms is found to be unenforceable, the remaining provisions
            shall continue in full force and effect.
          </p>
        </section>

        <section className="legal-section">
          <h2>16. Contact</h2>
          <p>
            For questions about these terms, contact us at{" "}
            <a href="mailto:legal@consensusmarket.com">legal@consensusmarket.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}

function PrivacyPolicy() {
  return (
    <main className="legal-page">
      <article className="surface-card legal-content">
        <header className="legal-header">
          <h1>Privacy Policy</h1>
          <p className="legal-effective">Effective date: March 24, 2026</p>
        </header>

        <section className="legal-section">
          <h2>1. Introduction</h2>
          <p>
            Measurable Data Token Limited ("Company," "we," "us") operates Consensus Market. This policy
            describes how we collect, use, and protect information when you use the Platform.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Information We Collect</h2>

          <h3>2.1 Information you provide</h3>
          <ul>
            <li><strong>Waitlist registration:</strong> Email address and stated interest in real-money
              participation.</li>
            <li><strong>Account profile:</strong> Display name or alias, if you choose to set one.</li>
            <li><strong>Identity verification:</strong> Where required by applicable law or our eligibility
              requirements, we may collect identity documents, proof of address, or other KYC
              information through a third-party verification provider.</li>
          </ul>

          <h3>2.2 Information collected automatically</h3>
          <ul>
            <li><strong>Wallet address:</strong> Your Ethereum wallet address when you connect to the
              Platform. We do not have access to your private keys.</li>
            <li><strong>On-chain activity:</strong> Your positions, deposits, withdrawals, and claims are
              recorded on the public blockchain and are inherently public.</li>
            <li><strong>Usage data:</strong> Pages visited, features used, session duration, referral
              source. Collected via privacy-respecting analytics (no cross-site tracking).</li>
            <li><strong>Device information:</strong> Browser type, operating system, screen resolution,
              and IP address (used for geographic eligibility verification and abuse prevention).</li>
          </ul>

          <h3>2.3 Information we do not collect</h3>
          <ul>
            <li>We do not collect passwords (the Platform uses wallet-based authentication).</li>
            <li>We do not collect financial account information (bank accounts, credit cards).</li>
            <li>We do not use cookies for advertising or cross-site tracking.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. How We Use Information</h2>
          <ul>
            <li><strong>Platform operation:</strong> To provide, maintain, and improve the Platform.</li>
            <li><strong>Eligibility verification:</strong> To verify your identity and jurisdiction
              eligibility, where required.</li>
            <li><strong>Geographic restrictions:</strong> To enforce jurisdictional access controls using
              IP-based geolocation.</li>
            <li><strong>Communications:</strong> To send you service-related notices, waitlist updates,
              and market alerts you have opted into.</li>
            <li><strong>Security and abuse prevention:</strong> To detect and prevent fraud, manipulation,
              and unauthorized access.</li>
            <li><strong>Legal compliance:</strong> To comply with applicable laws, regulations, and legal
              processes.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Information Sharing</h2>
          <p>We do not sell your personal information. We may share information with:</p>
          <ul>
            <li><strong>Service providers:</strong> Third-party providers that assist with KYC
              verification, analytics, hosting, and infrastructure, subject to contractual
              confidentiality obligations.</li>
            <li><strong>Legal requirements:</strong> Law enforcement, regulators, or courts when required
              by applicable law, regulation, legal process, or governmental request.</li>
            <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale
              of assets, with notice to affected users.</li>
          </ul>
          <p>
            On-chain data (wallet addresses, positions, transactions) is inherently public on the
            blockchain and is not subject to deletion or access controls by the Company.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Data Retention</h2>
          <ul>
            <li><strong>Waitlist data:</strong> Retained until you unsubscribe or request deletion.</li>
            <li><strong>Account data:</strong> Retained for the duration of your account activity plus
              the period required by applicable law (typically 5-7 years for financial records).</li>
            <li><strong>Usage analytics:</strong> Aggregated and anonymized data may be retained
              indefinitely. Individual session data is retained for up to 12 months.</li>
            <li><strong>On-chain data:</strong> Blockchain records are permanent and immutable. The
              Company cannot delete on-chain data.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Data Security</h2>
          <p>
            We implement industry-standard security measures including encrypted connections (TLS),
            access controls, and secure infrastructure. Smart contracts have undergone security review.
            However, no system is perfectly secure, and we cannot guarantee absolute security of your
            information.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you;</li>
            <li>Request correction of inaccurate information;</li>
            <li>Request deletion of your personal information (subject to legal retention requirements);</li>
            <li>Object to or restrict certain processing of your information;</li>
            <li>Receive your information in a portable format;</li>
            <li>Withdraw consent where processing is based on consent.</li>
          </ul>
          <p>
            To exercise these rights, contact{" "}
            <a href="mailto:privacy@consensusmarket.com">privacy@consensusmarket.com</a>.
            We will respond within 30 days.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. International Transfers</h2>
          <p>
            Your information may be processed in jurisdictions outside your country of residence,
            including the British Virgin Islands. We ensure appropriate safeguards are in place for international
            transfers in compliance with applicable data protection laws.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Children's Privacy</h2>
          <p>
            The Platform is not intended for use by persons under 18 years of age. We do not
            knowingly collect personal information from children. If we become aware that we have
            collected information from a child, we will take steps to delete it.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this policy periodically. The revised policy will be posted on the Platform
            with an updated effective date. Your continued use constitutes acceptance of the revised
            policy.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Contact</h2>
          <p>
            For privacy inquiries, contact{" "}
            <a href="mailto:privacy@consensusmarket.com">privacy@consensusmarket.com</a>.
          </p>
          <p>
            Measurable Data Token Limited<br />
            British Virgin Islands
          </p>
        </section>
      </article>
    </main>
  );
}
