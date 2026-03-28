import { withSecurityHeaders } from "../lib/helpers.js";

export function handleTermsRequest() {
  return withSecurityHeaders(Response.json({
    title: "Terms of Service",
    effectiveDate: "2026-03-24",
    sections: [
      { heading: "Acceptance", body: "By accessing ConsensusMarket.com you agree to these terms. If you do not agree, do not use the service." },
      { heading: "Eligibility", body: "You must be at least 18 years old and not a resident of a restricted jurisdiction (including the United States, China, and other listed countries). You are responsible for compliance with local laws." },
      { heading: "Service Description", body: "ConsensusMarket provides a prediction market for publicly disclosed company KPI outcomes. Positions are denominated in USDT (Tether) on Ethereum mainnet. Demo mode uses non-redeemable credits with no monetary value." },
      { heading: "No Investment Advice", body: "Nothing on this platform constitutes investment, financial, legal, or tax advice. Prediction markets carry risk of total loss. Only stake amounts you can afford to lose entirely." },
      { heading: "KPI Resolution", body: "Market outcomes are determined by signed oracle attestations referencing official issuer disclosures. Once resolved, outcomes are final and non-appealable." },
      { heading: "Protocol Fees", body: "A protocol fee (currently 1%) is applied to net winnings at claim time. The fee rate may be adjusted by the platform operator with notice." },
      { heading: "Account Access", body: "Access requires wallet connection and eligibility approval. The operator may revoke access at any time for any reason." },
      { heading: "Limitation of Liability", body: "The platform is provided as-is. ConsensusMarket and its operators are not liable for losses arising from smart contract bugs, oracle errors, blockchain congestion, or market cancellations." },
      { heading: "Governing Law", body: "These terms are governed by the laws of the Cayman Islands. Disputes shall be resolved by binding arbitration." },
      { heading: "Modifications", body: "We may update these terms at any time. Continued use constitutes acceptance of the updated terms." },
    ],
  }, { headers: { "Cache-Control": "public, max-age=3600" } }));
}

export function handlePrivacyRequest() {
  return withSecurityHeaders(Response.json({
    title: "Privacy Policy",
    effectiveDate: "2026-03-24",
    sections: [
      { heading: "Data Collection", body: "We collect wallet addresses, transaction data on public blockchains, and optional email addresses provided through the waitlist. We do not collect names, physical addresses, or government IDs." },
      { heading: "Blockchain Data", body: "All prediction market positions and settlements are recorded on the Ethereum blockchain and are publicly visible. This data cannot be deleted." },
      { heading: "Cookies & Analytics", body: "We use Google Analytics to understand site usage. We use localStorage for account preferences. No third-party advertising trackers are used." },
      { heading: "Geo-Location", body: "We use Cloudflare's country-level IP detection to enforce jurisdictional restrictions. We do not store or log your IP address." },
      { heading: "Data Sharing", body: "We do not sell personal data. Blockchain transaction data is inherently public. We may share aggregated, anonymized usage data." },
      { heading: "Data Retention", body: "Email addresses from the waitlist are retained until you request deletion. Blockchain data is permanent and cannot be removed." },
      { heading: "Contact", body: "For privacy inquiries, contact: privacy@consensusmarket.com" },
    ],
  }, { headers: { "Cache-Control": "public, max-age=3600" } }));
}

export function handleGeoRequest(request) {
  const country = request.cf?.country || "XX";
  const RESTRICTED_COUNTRIES = [
    "US", "CN", "HK", "SG", "KR", "GB", "FR", "DE", "IT", "AU", "BE", "TW",
  ];
  const restricted = RESTRICTED_COUNTRIES.includes(country);
  return withSecurityHeaders(Response.json(
    { country, restricted, mode: restricted ? "demo" : "live" },
    { headers: { "Cache-Control": "no-store" } }
  ));
}
