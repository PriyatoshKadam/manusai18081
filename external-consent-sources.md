# External consent sources

- Google Consent Mode overview: https://developers.google.com/tag-platform/security/concepts/consent-mode
  - `gcs` transmits `ad_storage` and `analytics_storage` consent states.
  - Format is `G1<ad_storage_bit><analytics_storage_bit>` for the two storage signals; `1` means granted and `0` means denied.
  - `G111` therefore means both ad_storage and analytics_storage granted; `G100` means both denied.
  - The `gcd` parameter carries more detailed Consent Mode v2 consent-type information, including ad_user_data and ad_personalization.
  - Advanced consent mode can send cookieless measurements while storage is denied; this is not the same as a transport failure or ad blocking.
  - Official page last updated 2026-07-30 UTC.

- Google Tag Manager consent reference: https://support.google.com/tagmanager/answer/13802165?hl=en
  - Confirms the storage consent meanings and cookieless-ping behavior when analytics_storage is denied.
  - Confirms ad_user_data and ad_personalization are separate Consent Mode v2 types from the two-bit gcs storage mask.
