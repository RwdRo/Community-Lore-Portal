# Loreworks — GitHub Pages edition

Interactive Alien Worlds lore archive. Published from the main branch using GitHub Actions; the site needs no running Node server or private database.

## Build

Node 24: `npm ci`, `npm run lint`, `npm run build:pages`. Publish only `dist/client`.

## Publishing

Repository Settings → Pages → Source: GitHub Actions. Push to main, or run Publish Loreworks in Actions. The initial address is https://rwdro.github.io/Community-Lore-Portal/ . The domain is not changed by this workflow.

## Reader identity and progress

Readers need no account. Local explorer profiles, characters, bookmarks and expedition progress persist in that browser. Download and restore backups from the profile panel before changing browser/domain. WAX connection verifies an identity signature locally; it does not confer GitHub publishing permission or a shared account. There are no payments or on-chain transactions in this workflow.

## Contributions and editorial approval

Use the portal submission form to prepare a GitHub issue. Long manuscripts are downloaded intact for attachment. The contributor reviews and submits on GitHub; GitHub accounts and repository permissions govern editing and approval. Contributions are public. Editors review issues and publish reviewed source changes through pull requests. No browser-stored role grants publishing access.

## Source preservation

Build exports 49 complete works, 210 entity dossiers, 2100 reading sections and 46 verified PR narratives from checked-in sources. Hashes verify exact full text. Supplementary PR content is not silently promoted to canon; unknown governance is not live voting data. Upstream source changes require a reviewed source update and rebuild. Private runtime accounts/data are never part of the Pages export.

The server-edition source remains for recovery, but is not deployed to Pages. Real wallet-provider interaction on the final HTTPS origin must still be checked with the owner’s wallet.
