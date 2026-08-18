export const VENDOR_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'ga4', pattern: /google-analytics\.com\/(g\/collect|mp\/collect)|analytics\.google\.com\/g\/collect/i },
  { name: 'gads', pattern: /googleadservices\.com|googletagmanager\.com\/gtag\/js.*aw|google\.com\/pagead\/conversion/i },
  { name: 'gtm', pattern: /googletagmanager\.com\/(gtm|gtag)\.js/i },
  { name: 'meta', pattern: /facebook\.com\/tr|connect\.facebook\.net/i },
  { name: 'tiktok', pattern: /analytics\.tiktok\.com|business-api\.tiktok\.com/i },
  { name: 'linkedin', pattern: /snap\.licdn\.com|px\.ads\.linkedin\.com/i },
  { name: 'pinterest', pattern: /ct\.pinterest\.com|assets\.pinterest\.com/i },
  { name: 'twitter', pattern: /static\.ads-twitter\.com|analytics\.twitter\.com|t\.co\/i\/adsct/i },
  { name: 'reddit', pattern: /redditstatic\.com\/ads|events\.redditmedia\.com/i },
  { name: 'snapchat', pattern: /sc-static\.net\/scevent|tr\.snapchat\.com/i },
  { name: 'hotjar', pattern: /static\.hotjar\.com|script\.hotjar\.com/i },
  { name: 'clarity', pattern: /clarity\.ms/i },
  { name: 'mixpanel', pattern: /api\.mixpanel\.com|cdn\.mxpnl\.com/i },
  { name: 'amplitude', pattern: /api\.amplitude\.com|cdn\.amplitude\.com/i },
  { name: 'segment', pattern: /cdn\.segment\.com|api\.segment\.io/i },
  { name: 'hubspot', pattern: /js\.hs-scripts\.com|track\.hubspot\.com/i },
  { name: 'klaviyo', pattern: /a\.klaviyo\.com|static\.klaviyo\.com/i },
  { name: 'intercom', pattern: /widget\.intercom\.io|api-iam\.intercom\.io/i },
];

export function detectVendor(url: string): string {
  for (const { name, pattern } of VENDOR_PATTERNS) {
    if (pattern.test(url)) return name;
  }
  return 'unknown';
}

export const VENDOR_LABELS: Record<string, string> = {
  ga4: 'Google Analytics 4',
  gads: 'Google Ads',
  gtm: 'Google Tag Manager',
  meta: 'Meta Pixel',
  tiktok: 'TikTok Pixel',
  linkedin: 'LinkedIn Insight',
  pinterest: 'Pinterest Tag',
  twitter: 'X (Twitter) Pixel',
  reddit: 'Reddit Pixel',
  snapchat: 'Snapchat Pixel',
  hotjar: 'Hotjar',
  clarity: 'Microsoft Clarity',
  mixpanel: 'Mixpanel',
  amplitude: 'Amplitude',
  segment: 'Segment',
  hubspot: 'HubSpot',
  klaviyo: 'Klaviyo',
  intercom: 'Intercom',
  unknown: 'Unknown vendor',
};
