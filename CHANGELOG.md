# What's new

## 1.0.6 (Nov 9, 2026)
- Win chance on open trades shows again on phones. Right after the phone wakes, the window only has minute-by-minute prices until the full history loads, and that used to leave a dash. It now works from whatever prices are there and sizes moves correctly for the gaps between them.

## 1.0.5 (Nov 9, 2026)
- Live board charts no longer get stuck showing only the last minute or two on phones. A Coinbase request that never answered (phone asleep or switching networks) used to block the price history for the rest of the window; now it gives up after 7 seconds, retries, and refreshes when you come back to the page.

## 1.0.4 (Nov 8, 2026)
- New lab, Kelly sizing: sizes each bet by the Kelly criterion from the win rate already seen at that price (a quarter of Kelly, split across the coins in the window, $5 to 5% of the bank) and skips prices with no proven edge. Usable as the paper or live playbook; live stays within $5 to $25.
- Search finds coins (opens them in the Cockpit), pages and actions like changing a playbook. No more wallet search.

## 1.0.3 (Nov 8, 2026)
- Phones: text wraps instead of getting cut off, the top stats sit in a 2x2 grid, Labs stack instead of scrolling sideways, and the Cockpit coin picker wraps into rows.
- Home on phones: the bank chart sits further back so the balance and stats are easier to read.
- Wide monitors between laptop and ultrawide: Home stat tiles and scanner fit without crowding.

## 1.0.2 (Nov 8, 2026)
- Connections has a one-click Turn on button for automatic updates (Cloudflare's deploy leaves the updater out).

## 1.0.1 (Nov 8, 2026)
- Wide monitors use the whole screen: Home splits into two columns, Analytics puts equity, daily results and the calendar side by side.
- Trade replay: play button, speed choice (15, 30 or 60 seconds for the whole window) and a slider to scrub.
- Win chance on open trades and in the Cockpit, next to Kalshi's own price.
- Go live button in the top bar and a clear Paper only / Live mode tile.
- Phones: no double-tap zoom, no accidental text highlighting, full price lines on iPhone.
- Commas in header amounts; deploy settings explained in the README.

## 1.0.0 (Nov 8, 2026)
- First release. Paper and live trading for Kalshi's 15-minute crypto markets, running in your own Cloudflare account.
- Setup screen, passcode sign-in, Connections page for your Kalshi key (tested, encrypted, write-only).
- Home, Cockpit, Analytics (paper and live), Trades with replay, Labs and playbooks, Live account, Settings.
- Win chance on open trades, daily automatic updates from the stable release.
