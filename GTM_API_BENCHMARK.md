# Google Tag Manager API integration benchmark

Official sources reviewed:

- https://developers.google.com/tag-platform/tag-manager/api/v2/authorization
- https://developers.google.com/tag-platform/tag-manager/api/v2
- https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.containers.workspaces.tags/create
- https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.containers.workspaces.triggers/create
- https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.containers.workspaces/create_version
- https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.containers.versions/publish

The Tag Manager API requires OAuth 2.0. The implementation needs a web-server flow with a Google client ID/client secret, a callback URI, a short-lived access token, and an encrypted refresh token for offline API calls. Required scopes for the requested workflow are `tagmanager.readonly`, `tagmanager.edit.containers`, `tagmanager.edit.containerversions`, and `tagmanager.publish`.

The API is hierarchical: accounts contain containers, containers contain workspaces, and workspaces contain tags, triggers, variables, and other entities. The safe install flow is to create or select a workspace, create a Custom HTML tag and an All Pages/Initialization trigger in that workspace, create a container version from the workspace, preview or inspect compiler errors, and only publish after an explicit user confirmation. Google documents the workspace `create_version` operation and the container version `publish` operation separately, so the UI should keep import, preview, and publish as separate steps.

Tag resources support a name, type, parameter list, firing trigger IDs, notes, and consent settings. Trigger resources support `pageview`, `domReady`, `windowLoaded`, `init`, `consentInit`, `customEvent`, and other event types. GTM API errors include unauthorized and insufficient-permission cases; the UI should surface those without exposing OAuth tokens.
