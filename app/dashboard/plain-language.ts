export function vendorDisplayName(vendor: unknown): string {
  const names: Record<string, string> = {
    ga4: 'Google Analytics 4',
    gads: 'Google Ads',
    meta: 'Meta Pixel',
    tiktok: 'TikTok Pixel',
    linkedin: 'LinkedIn Insight Tag',
    bing: 'Bing UET',
    snapchat: 'Snapchat Pixel',
    gtm: 'Google Tag Manager',
    browser: 'Browser',
    ga4fix: 'GAfix monitor',
  };
  return names[String(vendor || '').toLowerCase()] || String(vendor || 'tracking tool');
}

export function eventTypeDisplay(value: unknown): string {
  const type = String(value || '').toLowerCase();
  if (type === 'standard') return 'Standard event';
  if (type === 'custom') return 'Custom event';
  if (type === 'internal') return 'Setup event';
  if (type === 'unknown') return 'Name not found';
  return value ? String(value) : 'Not available';
}

export function eventDisplayName(value: unknown): string {
  const name = String(value || '').trim();
  if (!name || name === '(unnamed)') return 'Event name not found';
  const internal: Record<string, string> = {
    'gtm.js': 'GTM started',
    'gtm.dom': 'Page became ready',
    'gtm.load': 'Page finished loading',
    script_injected: 'Tracking script loaded',
    userPrefUpdate: 'Privacy choice updated',
    'Termly.consentSaveDone': 'Privacy choice saved',
  };
  return internal[name] || name;
}

export function plainAlertMessage(alert: any): string {
  const vendor = vendorDisplayName(alert?.vendor);
  const event = eventDisplayName(alert?.event_name);
  const code = String(alert?.code || '').toLowerCase();
  if (code === 'gads_missing_parameters') return `${vendor} needs more information for ${event}.`;
  if (code === 'missing_purchase_currency') return 'A purchase was recorded without its currency.';
  if (code === 'missing_purchase_transaction_id') return 'A purchase was recorded without an order reference.';
  if (code === 'ga4_consent_denied') return `${vendor} received ${event} while analytics storage was not allowed.`;
  if (code === 'custom_event_detected') return `A new custom event called “${event}” was found.`;
  if (code === 'duplicate_purchase') return 'The same purchase may have been sent more than once.';
  if (code === 'duplicate_page_view') return 'The same page view may have been sent more than once.';
  if (code === 'gtm_multiple_tags_or_triggers') return `${event} may be sent by more than one Google Tag Manager tag.`;
  if (code === 'gtm_and_direct_implementation') return `${event} may be sent by both Google Tag Manager and website code.`;
  if (code === 'tag_http_failure') return `${vendor} returned an error for ${event}.`;
  if (code === 'tag_transport_failure') return `GAfix could not confirm that ${vendor} received ${event}.`;
  if (code === 'duplicate_event') return `${event} may have been sent more than once.`;
  return String(alert?.message || `${vendor} needs attention.`)
    .replace(/\(http_0\)/gi, '(the browser could not confirm a response)')
    .replace(/failed to deliver/gi, 'could not be confirmed as received')
    .replace(/missing conversion_id, conversion_label/gi, 'is missing the conversion details Google Ads needs');
}

export function plainAlertCause(alert: any): string {
  const code = String(alert?.code || '').toLowerCase();
  if (code === 'tag_transport_failure' || code === 'tag_http_failure') return 'The browser saw a problem while sending this tracking information. This could be a network, privacy setting, consent rule, security policy, or vendor-connection issue. It is not automatically an ad blocker.';
  if (code === 'gads_missing_parameters') return 'Google Ads received or exposed this event, but the request did not contain the conversion details needed to identify it correctly.';
  if (code === 'missing_purchase_currency') return 'GAfix found a purchase, but the currency was not included. Without it, revenue can be reported incorrectly.';
  if (code === 'missing_purchase_transaction_id') return 'GAfix found a purchase, but there was no stable order reference. This makes it harder to prevent the same purchase being counted twice.';
  if (code.includes('duplicate') || code.includes('gtm_multiple') || code.includes('gtm_and_direct')) return 'GAfix found matching evidence close together in the same visitor session. This is a warning to investigate, not proof that two separate visitors performed the same action.';
  if (code === 'ga4_consent_denied') return 'The visitor’s privacy settings did not allow analytics storage when this event was sent. This is a privacy state, not proof that the event failed.';
  if (code === 'custom_event_detected') return 'This is a named event outside the standard event list. Custom events are supported; the name and setup should simply be checked.';
  return String(alert?.root_cause || 'GAfix found evidence that deserves a quick review.');
}

export function plainFixSteps(alert: any): string[] {
  const code = String(alert?.code || '').toLowerCase();
  if (code === 'tag_transport_failure' || code === 'tag_http_failure') return ['Open the browser Network panel and check the affected request.', 'Check the website’s privacy consent, security policy, and ad-blocker settings.', 'Check the Google Tag Manager preview to confirm the correct tag fired.'];
  if (code === 'gads_missing_parameters') return ['Open the Google Ads tag in Google Tag Manager.', 'Check that the conversion ID and conversion label or send_to value are filled in.', 'Test the request again and confirm the details appear in the browser Network panel.'];
  if (code === 'missing_purchase_currency') return ['Add the currency to every purchase event.', 'Use a three-letter currency code such as USD, EUR, or INR.', 'Test one purchase in Google Tag Manager Preview before publishing.'];
  if (code === 'missing_purchase_transaction_id') return ['Send one stable order reference with every purchase.', 'Use the same reference if the purchase is retried.', 'Check that the event is not sent by both website code and Google Tag Manager.'];
  if (code.includes('duplicate') || code.includes('gtm_multiple') || code.includes('gtm_and_direct')) return ['Open Google Tag Manager Preview and look at this event.', 'Check whether more than one tag fires for the same event.', 'Also check for direct website code or an SDK sending the same event.'];
  if (Array.isArray(alert?.fix_steps) && alert.fix_steps.length) return alert.fix_steps.map(String);
  return ['Open the detailed evidence and check the event setup.', 'Test the event again after making the change.', 'Publish only after the result looks correct.'];
}

export function plainStatus(value: unknown): string {
  const status = String(value || '').toLowerCase();
  if (status === 'delivered') return 'Working';
  if (status === 'failed') return 'Needs attention';
  if (status === 'pending' || status === 'retrying') return 'Trying again';
  if (status === 'healthy') return 'Looks good';
  if (status === 'unmatched') return 'Setup not confirmed';
  if (status === 'ambiguous') return 'Several possible matches';
  return value ? String(value) : 'Not available';
}
