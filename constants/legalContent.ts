export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export const LEGAL_INTRO =
  'Last updated: March 2026. Placeholder copy — replace with your counsel-approved terms.';

export const LEGAL_SECTIONS: LegalSection[] = [
  {
    id: 'terms',
    title: 'Terms of Service',
    paragraphs: [
      'These Terms of Service govern your use of mySplit. By using the app you agree to these terms.',
      'We may update these terms from time to time. Continued use after changes constitutes acceptance.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    paragraphs: [
      'We collect information you provide and data needed to operate splits, payments, and support.',
      'We use industry-standard safeguards. You may request access or deletion subject to applicable law.',
    ],
  },
  {
    id: 'refund',
    title: 'Refund Policy',
    paragraphs: [
      'Refund eligibility depends on the payment method and the service involved. Contact support with your transaction details.',
      'Charge disputes may also be raised with your card issuer where applicable.',
    ],
  },
];

/** Single section for in-app WebView (e.g. onboarding Terms / Privacy links). */
export function buildSingleLegalSectionHtml(sectionId: 'terms' | 'privacy'): string {
  const section = LEGAL_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return buildLegalDocumentHtml();
  const blocks = `<h2 id="${section.id}">${escapeHtml(section.title)}</h2>${section.paragraphs
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('')}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a18; padding: 16px 18px 40px; line-height: 1.5; font-size: 15px; background: #fff; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    p { margin: 0 0 12px; color: #444; }
    .muted { color: #888; font-size: 13px; }
  </style>
</head>
<body>
  <p class="muted">${escapeHtml(LEGAL_INTRO)}</p>
  ${blocks}
</body>
</html>`;
}

export function buildLegalDocumentHtml(): string {
  const nav = LEGAL_SECTIONS.map(
    (s) => `<a href="#${s.id}">${escapeHtml(s.title)}</a>`
  ).join(' · ');
  const blocks = LEGAL_SECTIONS.map(
    (s) =>
      `<h2 id="${s.id}">${escapeHtml(s.title)}</h2>${s.paragraphs
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('')}`
  ).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a18; padding: 16px 18px 40px; line-height: 1.5; font-size: 15px; background: #fff; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    nav { margin-bottom: 24px; font-size: 14px; }
    nav a { color: #534AB7; font-weight: 600; text-decoration: none; margin-right: 8px; }
    h2 { font-size: 18px; margin: 28px 0 10px; scroll-margin-top: 16px; }
    p { margin: 0 0 12px; color: #444; }
    .muted { color: #888; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Legal</h1>
  <p class="muted">${escapeHtml(LEGAL_INTRO)}</p>
  <nav>${nav}</nav>
  ${blocks}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
