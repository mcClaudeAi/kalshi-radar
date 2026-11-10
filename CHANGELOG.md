# What's new

## 1.0.14 (Nov 9, 2026)
- Give-back stop, in Paper settings. Once the day is up by the amount you set (default $25), trading stops for the day if the profit falls to your chosen share of the day's peak. Protects profit already made. Off by default.
- Bank drawdown stop. Stops for the day once the bank is a set % under its all-time high. Off by default.
- Ratchet sizing, a new Your mix sizing choice. The stake steps up only on banked profit while the bank is at a new high, and drops back to base after any loss.
- All three apply to paper, labs and live. Skipped trades say which stop tripped.

## 1.0.13 (Nov 9, 2026)
- Settings now says which box has a problem instead of saving nothing. Typing a range like 3-5 into a number box tells you to put the low end in "at least" and the high end in "at most".

## 1.0.12 (Nov 9, 2026)
- Your mix: coins on the same side now has an upper limit as well as a lower one, so a range like 3 to 5 can be tested. 9 means no upper limit.

## 1.0.11 (Nov 9, 2026)
- Home page redesign. A status strip under the header (paper and live playbooks, daily stop, feed health). Bank and today as the two big numbers, with the other stats in a compact row. Glass cards, a faint grid, mono numerals.
- The next trade check is a countdown ring that fills over the 15 minutes and pulses in the last 30 seconds. Scanner prices flash green or red as they tick.
- The scanner is now a board sorted by leader price, closest to qualifying first, with a gauge of each coin against its target.
- When nothing is open, the live board shows the current window as a timeline: open, trade check, settle, with a moving cursor and who qualifies right now.
- A ticker of the last settled trades runs under the page. On wide screens the hero and scanner sit side by side.

## 1.0.10 (Nov 9, 2026)
- Updates now arrive within the hour instead of once a day. New setups get this automatically. If you turned on automatic updates before today, go to Connections and press Make hourly (a one-line change in GitHub).

## 1.0.9 (Nov 9, 2026)
- Your mix is now a builder: combine any of the filters (coins on the same side, price cap, volatility check) with any sizing (fixed, size follows the bank at a % you pick, or quarter Kelly). For example skip 95¢ and up plus size follows the bank: set coins to 1, cap to 95, sizing to % of the bank. All in Paper settings.

## 1.0.8 (Nov 9, 2026)
- Updates from the dashboard: when a new version is out, a bar shows on every page with Update now. It opens the updater in your GitHub (one Run workflow tap), then this page watches for the new version and offers a reload. Your GitHub repo name is remembered on that device.

## 1.0.7 (Nov 9, 2026)
- New playbook, Your mix: run two filters at once. Set how many coins must lead the same direction (1 to 9) and a price cap (95 skips 95¢ and up, 100 is no cap) in Paper settings, then pick Your mix as the paper or live playbook.
- Trading schedule: in Paper settings, tap any ET hour to switch it off. Trades that would start in that hour are skipped, paper and live. Each hour shows what the plain rule made in it so far.
- Analytics, "When several coins line up": exact counts 1 through 9 instead of 4+, plus a table of win rate and net for N or more coins on the same side, with and without the 95¢ cap.

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
