import type { ContentPage } from "@/content/types";
import { siteConfig } from "@/lib/public/config";

export const privacyPage: ContentPage = {
  kind: "legal",
  slug: "privacy",
  path: "/privacy",
  title: "Privacy Policy",
  description: `How ${siteConfig.name} collects, uses, retains, and protects data for the open-source AI coding observability product and hosted service.`,
  primaryKeyword: "UseJunction privacy",
  secondaryKeywords: ["AI coding observability privacy", "developer telemetry privacy"],
  updatedAt: "2026-07-20",
  answer: `${siteConfig.name} ("UseJunction," "we," "our," or "us") takes privacy seriously. Your data is yours. We retain data as needed to provide the Service, resolve disputes, and meet legal obligations—but we do not sell your data, and we do not use your private product data or work content to train foundation models. Self-hosted deployments keep telemetry on infrastructure you control. Richer Signals work detail is optional and can be turned off.`,
  sections: [
    {
      heading: "1. What This Policy Covers",
      body: [
        "This Privacy Policy explains how we collect, use, disclose, retain, and protect information when you use our website, software, APIs, and related services (collectively, the Service).",
        "Your use of the Service is also subject to our Terms of Service. If you continue using the Service after this policy is updated, you accept the revised policy.",
        "This policy covers Personal Data and Operational Data we process when you use the Service.",
        "Personal Data: Information that identifies you or your organization, such as name, email, and billing details.",
        "Operational Data: Technical and product-usage data, such as device and agent heartbeats, tool and model identifiers, token counts, latency, status, estimated cost signals, logs, diagnostics, and event telemetry. Optional Signals work context is Operational Data when enabled for your organization.",
      ],
    },
    {
      heading: "2. Your Data Is Yours",
      body: [
        "You retain ownership of the content, telemetry, and materials you submit to or process through the Service (Your Data).",
        "We process Your Data only as needed to provide, secure, maintain, and support the Service, and as otherwise described in this policy.",
        "We do not sell Your Data for third-party advertising or any other purpose.",
        "We do not use Your Data—including private work context, prompts, session detail, or organization telemetry—to train foundation models or other general-purpose AI models.",
        "We may use aggregated or de-identified information that cannot reasonably identify you or your organization to understand product performance and improve reliability.",
      ],
    },
    {
      heading: "3. Data We Collect",
      body: [
        "Depending on how you use the Service, we may collect:",
        "Account data: Name, email, password hash, organization name, account identifiers, and role or membership metadata.",
        "Billing data: Subscription plan, transaction metadata, invoice identifiers, tax region metadata, and Lemon Squeezy customer or subscription identifiers.",
        "Device and network data: IP address, browser, OS, device metadata, and agent enrollment identifiers.",
        "Usage and diagnostics: Feature usage, device and agent heartbeats, tool and model identifiers, token counts, latency, status, estimated cost signals, logs, crash reports, and performance data.",
        "Optional Signals work context: When enabled for your organization, richer work-session metadata you choose to retain. Detail level is configurable and can be turned off.",
        "Support data: Information you provide in support messages, feedback, or contact forms.",
        "Connected service metadata: Integration status and required technical identifiers for tools or services you authorize.",
      ],
    },
    {
      heading: "4. What We Do Not Collect",
      body: [
        "Keystrokes, screenshots, or browser surveillance.",
        "Full network interception of developer traffic.",
        "Hours-in-editor time tracking in the style of classic productivity trackers, unless you explicitly configure optional Signals features that capture related work context.",
      ],
    },
    {
      heading: "5. Sources of Data",
      body: [
        "Directly from you (account signup, support, forms, settings, and organization configuration).",
        "Automatically from your use of the Service and enrolled devices or agents.",
        "From connected third-party services that you authorize.",
        "From billing providers for payment and subscription lifecycle events.",
      ],
    },
    {
      heading: "6. How We Use Data",
      body: [
        "Provide, maintain, and secure the Service.",
        "Authenticate users and prevent fraud or abuse.",
        "Process billing, subscriptions, invoices, and payment-related events.",
        "Show observability insights such as tool and model usage, estimated cost, latency, plan utilization, and device health.",
        "Diagnose bugs and improve reliability and product performance.",
        "Provide support and communicate service updates.",
        "Comply with legal obligations and enforce our Terms.",
        "We do not sell Personal Data or Operational Data for third-party advertising. We do not use your private product or work content to train foundation models.",
      ],
    },
    {
      heading: "7. Self-Hosted Deployments",
      body: [
        "When you self-host UseJunction, telemetry and Operational Data stay on systems you control, subject to your own policies and the UseJunction Community License.",
        "This Privacy Policy primarily describes our hosted website and managed Service. For self-hosted deployments, review your deployment configuration and the source under the UseJunction Community License for exact behavior.",
      ],
    },
    {
      heading: "8. Lemon Squeezy and Payments",
      body: [
        "We use Lemon Squeezy to process payments and subscription billing. Lemon Squeezy acts as Merchant of Record for checkout transactions.",
        "Payment details are processed by Lemon Squeezy and its payment partners. We receive subscription and transaction metadata needed to manage your account and entitlements.",
        "Lemon Squeezy may collect and process taxes based on transaction jurisdiction. Their policies apply to payment processing: https://www.lemonsqueezy.com/privacy and https://www.lemonsqueezy.com/buyer-terms.",
      ],
    },
    {
      heading: "9. How We Share Data",
      body: [
        "We may share data with:",
        "Service providers that host, secure, operate, and support the Service.",
        "Payment processors and billing providers for subscription and transaction workflows.",
        "Integration partners you explicitly connect.",
        "Professional advisors and legal authorities where required by law.",
        "Successors in connection with merger, acquisition, or sale of assets.",
        "We may also share aggregated or de-identified information that cannot reasonably identify an individual or organization.",
        "We do not sell your data.",
      ],
    },
    {
      heading: "10. Cookies and Similar Technologies",
      body: [
        "We use cookies and similar technologies to keep sessions secure, remember settings, and analyze usage.",
        "You can manage cookies in your browser settings. Some features may not function correctly if cookies are blocked.",
      ],
    },
    {
      heading: "11. Security",
      body: [
        "We use reasonable technical and organizational safeguards, including encryption in transit, access controls, and security monitoring. No system can be guaranteed completely secure.",
      ],
    },
    {
      heading: "12. Data Retention",
      body: [
        "We do retain data. We keep Personal Data and Operational Data for as long as needed to provide the Service, maintain observability history for your organization, comply with legal obligations, resolve disputes, and enforce agreements.",
        "Retention periods vary by data type, account status, organization settings, contractual requirements, and legal obligations.",
        "When you delete an account or request deletion, we delete or anonymize data that is no longer required, except where we must retain records for legal, security, billing, or dispute-resolution purposes.",
        "Self-hosted deployments control retention on their own infrastructure.",
      ],
    },
    {
      heading: "13. Your Rights and Choices",
      body: [
        "Depending on your location, you may have rights to access, correct, delete, or export your data.",
        "You may also object to or restrict certain processing, and you may request account deletion. We may need to verify your identity and retain certain records where required by law.",
        "Organization admins can configure optional Signals detail levels and turn richer work context off.",
      ],
    },
    {
      heading: "14. Cross-Border Data Processing",
      body: [
        "We and our providers may process data in the United States and other countries. These locations may have different data protection laws from your country.",
      ],
    },
    {
      heading: "15. Children's Privacy",
      body: [
        "The Service is not directed to children under 18, and we do not knowingly collect personal information from children under 18.",
      ],
    },
    {
      heading: "16. Changes to This Policy",
      body: [
        "We may update this Privacy Policy from time to time. If material changes are made, we will provide notice by posting on the Site, by email, or by another reasonable method.",
      ],
    },
    {
      heading: "17. Contact",
      body: [
        "For privacy questions or requests, contact hello@usejunction.dev.",
      ],
    },
  ],
  faq: [
    {
      question: "Do you sell my data?",
      answer:
        "No. We do not sell Personal Data or Operational Data for advertising or any other purpose.",
    },
    {
      question: "Do you use my data to train AI models?",
      answer:
        "No. We do not use your private product data, work context, or organization telemetry to train foundation models or other general-purpose AI models.",
    },
    {
      question: "Do you retain my data?",
      answer:
        "Yes. We retain data as needed to operate the Service, maintain your organization's observability history, meet legal obligations, and resolve disputes. Retention varies by data type and account status.",
    },
    {
      question: "Who owns my data?",
      answer:
        "You do. You retain ownership of Your Data. We only process it to provide and secure the Service.",
    },
  ],
  relatedPaths: ["/terms", "/"],
};

export const termsPage: ContentPage = {
  kind: "legal",
  slug: "terms",
  path: "/terms",
  title: "Terms of Service",
  description: `Terms for using ${siteConfig.name} open-source software and hosted AI coding observability services.`,
  primaryKeyword: "UseJunction terms",
  secondaryKeywords: ["UseJunction terms of service", "AI coding observability terms"],
  updatedAt: "2026-07-20",
  answer: `These Terms of Service govern your access to and use of the ${siteConfig.name} website, applications, APIs, open-source software, and related services (collectively, the Service). By using the Service, you agree to these Terms. Your data is yours. We retain data as described in our Privacy Policy, but we do not sell your data or use it to train foundation models. If you do not agree to these Terms, you must not use the Service.`,
  sections: [
    {
      heading: "1. What These Terms Cover",
      body: [
        `These Terms apply to your access and use of ${siteConfig.url}, all associated software and documentation, and all features, content, and functionality provided by UseJunction.`,
        "Your use of the Service is also subject to our Privacy Policy.",
      ],
    },
    {
      heading: "2. Eligibility and Accounts",
      body: [
        "You must be at least 18 years old to use the Service.",
        "You are responsible for maintaining accurate account information, safeguarding your credentials, and all activity under your account.",
        "If you suspect unauthorized access, contact us immediately at hello@usejunction.dev.",
      ],
    },
    {
      heading: "3. Open-Source Software and Hosted Service",
      body: [
        "The UseJunction codebase is licensed under the UseJunction Community License (Apache 2.0–based with additional commercial terms). See the LICENSE file in the repository. Self-hosting is at your own operational risk subject to that license.",
        "Paid Team and Enterprise plans, trials, and other hosted features are billed per your checkout or contract and are subject to these Terms and your order or subscription agreement.",
        "Trials convert according to product entitlements unless canceled.",
      ],
    },
    {
      heading: "4. License and Acceptable Use",
      body: [
        "Subject to these Terms and, for self-hosted software, the UseJunction Community License, we grant you a limited, revocable, non-exclusive, non-transferable license to use the Service.",
        "You must not:",
        "Resell, lease, sublicense, or commercially exploit the Service except as expressly permitted by these Terms or the UseJunction Community License.",
        "Reverse engineer, decompile, or attempt to extract source code except where required by law or already permitted by the open-source license for applicable components.",
        "Interfere with Service security, integrity, or performance.",
        "Use bots, scrapers, or automated extraction tools against the hosted Service without permission.",
        "Upload malicious code, attempt unauthorized access, or violate applicable laws.",
        "Use the Service to surveil individuals in ways that violate applicable privacy or employment laws.",
      ],
    },
    {
      heading: "5. Observability Data, Signals, and Automation",
      body: [
        "The Service provides observability insights about AI coding tool usage, estimated cost, latency, plan utilization, device health, and optional Signals work sessions based on your configuration.",
        "Insights, estimates, and derived metrics can be incomplete, delayed, or inaccurate. You are responsible for reviewing outputs before relying on them in business, legal, financial, security, staffing, or operational decisions.",
        "You are solely responsible for supervising automations or integrations you connect, maintaining backups, and handling the consequences of actions initiated through your account.",
      ],
    },
    {
      heading: "6. Your Content and Data Ownership",
      body: [
        "You are responsible for content, data, telemetry, prompts, and materials that you submit to or process through the Service (Your Content).",
        "You retain ownership of Your Content. Your data is yours.",
        "You grant us a worldwide, non-exclusive, royalty-free license to host, store, process, transmit, display, and retain Your Content only as needed to provide, secure, maintain, and support the Service, and as described in our Privacy Policy.",
        "We do not sell Your Content. We do not use Your Content to train foundation models or other general-purpose AI models.",
        "You are responsible for lawful use, accurate account information, and the content of data you choose to retain beyond product defaults.",
      ],
    },
    {
      heading: "7. Security and Backups",
      body: [
        "We implement reasonable safeguards, but no system is fully secure or fault tolerant. You are responsible for your own backup and recovery processes for critical data, especially for self-hosted deployments.",
      ],
    },
    {
      heading: "8. Intellectual Property",
      body: [
        "The Service, including software, branding, design, and associated content, is owned by UseJunction or its licensors and protected by intellectual property laws, subject to the UseJunction Community License for applicable open-source components.",
        "Except for rights expressly granted in these Terms or the applicable open-source license, no rights are granted to you.",
      ],
    },
    {
      heading: "9. Third-Party Services",
      body: [
        "The Service may integrate or link to third-party products and services, including AI coding tools you already use. We do not control third-party services and are not responsible for their availability, content, or policies. Your use of third-party services is governed by their terms.",
      ],
    },
    {
      heading: "10. Billing, Subscriptions, and Fees",
      body: [
        "Paid plans are billed under the pricing and payment terms shown at checkout or in your contract. Unless required by law, fees are non-refundable.",
        "Payments are processed by Lemon Squeezy, which acts as Merchant of Record for checkout transactions. By purchasing, you also agree to Lemon Squeezy buyer terms and privacy terms for payment processing and tax handling.",
        "Subscription plans may renew automatically unless canceled. You authorize Lemon Squeezy and its payment partners to charge your selected payment method for applicable fees and taxes.",
        "Charges may appear on your card statement with a Lemon Squeezy descriptor (for example, LEMSQZY* plus store identifier).",
        "We may change pricing with advance notice. Continued use of a paid plan after the effective date means you accept the updated pricing. Refund and chargeback handling may be processed through Lemon Squeezy, including cases where Lemon Squeezy issues a refund to prevent chargebacks.",
        "Lemon Squeezy buyer terms: https://www.lemonsqueezy.com/buyer-terms",
        "Lemon Squeezy privacy policy: https://www.lemonsqueezy.com/privacy",
      ],
    },
    {
      heading: "10.1 Fair Use Policy (FUP)",
      body: [
        "Paid plans are intended for fair, normal, and lawful use by the account owner or authorized team members. To protect service reliability and security for all users, we may apply usage controls such as rate limits, throttling, or temporary restrictions where usage is excessive or abusive.",
        "Prohibited usage includes, for example, credential sharing outside authorized team access, abusive automation, denial-of-service style traffic, unlawful use, or attempts to circumvent plan limits or security controls.",
        "If your usage materially exceeds fair-use expectations, we may require a plan upgrade, apply technical limits, or suspend access. Where practical, we will provide prior notice and an opportunity to remediate, except where immediate action is needed for legal, security, or abuse-prevention reasons.",
      ],
    },
    {
      heading: "11. Service Availability and Changes",
      body: [
        "We may modify, suspend, or discontinue all or part of the Service at any time, including for maintenance, updates, and operational needs. We are not liable for impacts caused by such changes or interruptions.",
      ],
    },
    {
      heading: "12. Disclaimer of Warranties",
      body: [
        'UseJunction is provided on an "as is" and "as available" basis without warranties of any kind, express or implied, to the fullest extent permitted by law.',
      ],
    },
    {
      heading: "13. Limitation of Liability",
      body: [
        "To the maximum extent permitted by law, UseJunction is not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, goodwill, or data.",
        "To the extent liability cannot be disclaimed, our total liability for all claims related to the Service is limited to the greater of: (a) the amount you paid us in the twelve months before the claim, or (b) USD 100.",
      ],
    },
    {
      heading: "14. Dispute Resolution and Arbitration",
      body: [
        "Please read this section carefully. It affects your legal rights. Any dispute arising from these Terms or the Service will be resolved by binding arbitration on an individual basis, except where prohibited by law or where claims may be brought in eligible small claims court.",
        "You and UseJunction waive any right to a jury trial and waive participation in class or representative actions, unless a waiver is not enforceable under applicable law.",
      ],
    },
    {
      heading: "15. Termination",
      body: [
        "We may suspend or terminate access if these Terms are violated or if required to protect the Service, users, or legal compliance.",
        "You may stop using the Service at any time. Sections that by nature should survive termination will survive, including sections on ownership, disclaimers, liability limits, and dispute resolution.",
      ],
    },
    {
      heading: "16. General Provisions",
      body: [
        "We may update these Terms from time to time. If material changes are made, we will provide notice by posting on the Site, by email, or by another reasonable method. Continued use of the Service after changes take effect means you accept the revised Terms.",
        "These Terms are the full agreement between you and UseJunction regarding the Service and supersede prior agreements on the same subject, except that the UseJunction Community License continues to govern self-hosted open-source software where applicable. If any part is unenforceable, the remaining parts remain in effect.",
        "These Terms are governed by the laws of California, without regard to conflict of laws rules, unless applicable law requires otherwise.",
      ],
    },
    {
      heading: "17. Contact",
      body: [
        "For questions about these Terms, contact hello@usejunction.dev.",
      ],
    },
  ],
  faq: [
    {
      question: "Who owns my data?",
      answer:
        "You do. You retain ownership of Your Content. We only process it as needed to operate the Service.",
    },
    {
      question: "Do you sell or train on my data?",
      answer:
        "No. We do not sell Your Content, and we do not use it to train foundation models.",
    },
    {
      question: "What license covers self-hosting?",
      answer:
        "Self-hosted UseJunction software is governed by the UseJunction Community License in the repository, in addition to these Terms where they apply to the hosted website and related services.",
    },
  ],
  relatedPaths: ["/privacy", "/"],
};

export const LEGAL_PAGES: ContentPage[] = [privacyPage, termsPage];
