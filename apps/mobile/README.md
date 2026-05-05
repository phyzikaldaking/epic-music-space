# Epic Music Space Mobile

This workspace packages Epic Music Space as installable iOS and Android apps using Capacitor.

## What this app does

- Uses the production site at <https://epicmusicspace.com> inside a native app shell.
- Gives you App Store and Play Store deployment paths without rebuilding product UI twice.
- Lets you add native plugins (push, haptics, biometrics, deep links, etc.) incrementally.

## Prerequisites

- Node.js 20+
- Xcode (for iOS)
- Android Studio (for Android)
- CocoaPods (`sudo gem install cocoapods`)
- Xcode developer path selected (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`)

## Quick start

From repo root:

1. Install dependencies:

   npm install

2. Sync native projects:

   npm run mobile:sync

3. Generate platform projects (first time only):

   npm run mobile:add:ios
   npm run mobile:add:android

4. Open native IDE projects:

   npm run mobile:open:ios
   npm run mobile:open:android

## Daily workflow

1. Update config/plugins in this workspace.
2. Run `npm run mobile:sync` from repo root.
3. Build and archive from Xcode / Android Studio.

## Notes

- This setup intentionally points to production URL for fastest time-to-market.
- You can switch to bundled local web assets later by removing `server.url` from `capacitor.config.ts` and setting `webDir` to a built output directory.
- If iOS add/sync fails with an `xcode-select` error, install full Xcode from the App Store and run the `xcode-select` command above.
