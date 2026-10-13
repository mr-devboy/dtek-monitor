# Changelog

## [3.0.0](https://github.com/pashamed/dtek-monitor/compare/v2.1.0...v3.0.0) (2026-10-06)


### ⚠ BREAKING CHANGES

* the PAT secret is no longer used. Remove it from the repository secrets and revoke the token.
* bot state moved from the artifacts/ folder in main to the artifacts branch. The branch is created on the first run with an outage, which sends a new message. Bot commits "chore: update artifacts" no longer land in main.
* when the outage time or reason changes during the day, the bot sends a new message (with a notification) as a reply to the previous one instead of editing a single message per day.

### Features

* extend silent night mode to 22:00-08:00 ([217d839](https://github.com/pashamed/dtek-monitor/commit/217d83989dbf88eb13b947d81a27e3852196fb76))
* replace timestamps emoji and show dates before times ([7efae33](https://github.com/pashamed/dtek-monitor/commit/7efae33aca9e6f9c97826e4a310700bc329183be))
* reply with a new message when the outage changes ([2313fb4](https://github.com/pashamed/dtek-monitor/commit/2313fb4d1a9ece8b34dcd5a0389a283001479904))
* retry getting info and sending notification ([4d7bea4](https://github.com/pashamed/dtek-monitor/commit/4d7bea48180738196f762208819d86fba77ee1ec))
* send silent notifications at night ([2770661](https://github.com/pashamed/dtek-monitor/commit/277066156bdb2eab0a4369d784b575678a4f36e8))
* store bot state in a separate artifacts branch ([69a8b35](https://github.com/pashamed/dtek-monitor/commit/69a8b3594aba6eee308e6d06dec6a500c445ab57))


### Bug Fixes

* check Telegram API response before saving the last message ([806865d](https://github.com/pashamed/dtek-monitor/commit/806865d7607f1406c817f013ddcf7fdaf8195fe3))
* correct the missing bot token error message ([1edcd7a](https://github.com/pashamed/dtek-monitor/commit/1edcd7aeb6be6fad1897e132588579ae1a17396d))
* exit with non-zero code on failure ([5bdc6cc](https://github.com/pashamed/dtek-monitor/commit/5bdc6ccd47bef37a221c145a73601ec1b7397465))
* ignore "message is not modified" error ([be34814](https://github.com/pashamed/dtek-monitor/commit/be34814f4b1e37e0270f002c191953c05c971cd4))
* remove extra blank line from the message ([6191077](https://github.com/pashamed/dtek-monitor/commit/619107737fdf2e189e7f671ea02cf8bcdf2b75b1))
* show a clear error when the house is not found ([fb8d5fa](https://github.com/pashamed/dtek-monitor/commit/fb8d5fab55f1642ee6dbb92b212998a0db68f763))


### Documentation

* update README for the new behavior and switch to informal address ([4bb25e8](https://github.com/pashamed/dtek-monitor/commit/4bb25e8a859e0f62e931dad6127da9adfda14518))


### Continuous Integration

* add release-please ([9c63c32](https://github.com/pashamed/dtek-monitor/commit/9c63c32b646a126b56ece9b8548e2d688416348c))
* keep scheduled workflow enabled via GitHub API ([ee37efe](https://github.com/pashamed/dtek-monitor/commit/ee37efe006de6884470ec4dace2f14b3bfa2566b))
* replace PAT with GITHUB_TOKEN ([d1f0a86](https://github.com/pashamed/dtek-monitor/commit/d1f0a864971b97a829f2a69939dec976b8d26232))

## [2.1.0](https://github.com/mr-devboy/dtek-monitor/compare/v2.0.0...v2.1.0) (2026-10-05)


### Features

* extend silent night mode to 22:00-08:00 ([217d839](https://github.com/mr-devboy/dtek-monitor/commit/217d83989dbf88eb13b947d81a27e3852196fb76))

## [2.0.0](https://github.com/mr-devboy/dtek-monitor/compare/v1.2.3...v2.0.0) (2026-10-05)


### ⚠ BREAKING CHANGES

* the PAT secret is no longer used. Remove it from the repository secrets and revoke the token.
* bot state moved from the artifacts/ folder in main to the artifacts branch. The branch is created on the first run with an outage, which sends a new message. Bot commits "chore: update artifacts" no longer land in main.
* when the outage time or reason changes during the day, the bot sends a new message (with a notification) as a reply to the previous one instead of editing a single message per day.

### Features

* replace timestamps emoji and show dates before times ([7efae33](https://github.com/mr-devboy/dtek-monitor/commit/7efae33aca9e6f9c97826e4a310700bc329183be))
* reply with a new message when the outage changes ([2313fb4](https://github.com/mr-devboy/dtek-monitor/commit/2313fb4d1a9ece8b34dcd5a0389a283001479904))
* retry getting info and sending notification ([4d7bea4](https://github.com/mr-devboy/dtek-monitor/commit/4d7bea48180738196f762208819d86fba77ee1ec))
* send silent notifications at night ([2770661](https://github.com/mr-devboy/dtek-monitor/commit/277066156bdb2eab0a4369d784b575678a4f36e8))
* store bot state in a separate artifacts branch ([69a8b35](https://github.com/mr-devboy/dtek-monitor/commit/69a8b3594aba6eee308e6d06dec6a500c445ab57))


### Bug Fixes

* check Telegram API response before saving the last message ([806865d](https://github.com/mr-devboy/dtek-monitor/commit/806865d7607f1406c817f013ddcf7fdaf8195fe3))
* correct the missing bot token error message ([1edcd7a](https://github.com/mr-devboy/dtek-monitor/commit/1edcd7aeb6be6fad1897e132588579ae1a17396d))
* exit with non-zero code on failure ([5bdc6cc](https://github.com/mr-devboy/dtek-monitor/commit/5bdc6ccd47bef37a221c145a73601ec1b7397465))
* ignore "message is not modified" error ([be34814](https://github.com/mr-devboy/dtek-monitor/commit/be34814f4b1e37e0270f002c191953c05c971cd4))
* remove extra blank line from the message ([6191077](https://github.com/mr-devboy/dtek-monitor/commit/619107737fdf2e189e7f671ea02cf8bcdf2b75b1))
* show a clear error when the house is not found ([fb8d5fa](https://github.com/mr-devboy/dtek-monitor/commit/fb8d5fab55f1642ee6dbb92b212998a0db68f763))


### Documentation

* update README for the new behavior and switch to informal address ([4bb25e8](https://github.com/mr-devboy/dtek-monitor/commit/4bb25e8a859e0f62e931dad6127da9adfda14518))


### Continuous Integration

* add release-please ([9c63c32](https://github.com/mr-devboy/dtek-monitor/commit/9c63c32b646a126b56ece9b8548e2d688416348c))
* keep scheduled workflow enabled via GitHub API ([ee37efe](https://github.com/mr-devboy/dtek-monitor/commit/ee37efe006de6884470ec4dace2f14b3bfa2566b))
* replace PAT with GITHUB_TOKEN ([d1f0a86](https://github.com/mr-devboy/dtek-monitor/commit/d1f0a864971b97a829f2a69939dec976b8d26232))
