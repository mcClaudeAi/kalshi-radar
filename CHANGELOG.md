# What's new

## 1.0.35 (Nov 10, 2026)
- One-tap updates. On Connections, save a GitHub token limited to your copy of the repo (Actions: Read and write, nothing else; steps are on the page). After that Update now starts the update itself from any device, with no trip to GitHub, and new versions install on their own within about 30 minutes. The token is stored encrypted in your own Cloudflare account and is never shown again. Without a token, updates work as before.

## 1.0.34 (Nov 10, 2026)
- Self-learning. A small model now refits every morning on every settled trade, starting from four months of history (about 7,900 trades with Coinbase readings). It begins from Kalshi's own price and learns only where that price has been wrong. Each trade's win chance is fixed at the trade check, before the result exists, so its record is only ever on trades it had not seen.
- New Learning page: what the model has learned in plain words, whether its calls matched what happened, Learned against the plain rule month by month, and today's calls.
- New playbook in Labs, Learned: buys only when the model's win chance beats the price plus the fee plus 1¢. It never switches itself on. Trade details show the model's reading.

## 1.0.33 (Nov 10, 2026)
- New playbook, Margin vs volatility v2: the same 1-move bar, but the typical 10-minute move is measured directly from the last 5 hours of 10-minute price changes on Coinbase instead of scaled up from 1-minute moves, which overstated it and skipped trades that kept winning. Trade details and live cards show the new reading.

## 1.0.32 (Nov 10, 2026)
- Daily profit target (request R-2): in Settings under Stops, set an amount and trading stops for the day once today is up that much. Off by default. Applies to paper, labs and live.

## 1.0.31 (Nov 10, 2026)
- New playbook, Beats the market v2: like Beats the market, but it uses the larger of the last hour's and the last 15 minutes' volatility, so a swing that just started counts, and it takes half of any slide back toward the target in the last 5 minutes off the margin. Trade details and live cards show its reading.
- Labs: the chart legend is now a filter bar. Tap to show or hide a line, double-click or press and hold to show only that one against the rule, and All or None. Your choice is remembered on that device.

## 1.0.30 (Nov 10, 2026)
- Live win chance now uses the same volatility measure the tracker decides on (an hour of 1-minute Coinbase prices), without the extra safety margin, so it no longer reads well under Kalshi on every card.
- Each live card shows what the trade looked like at the trade check: moves past the target and the win chance then, against the price paid.

## 1.0.29 (Nov 10, 2026)
- New playbook, Beats the market: turns the volatility reading into a win chance and only buys when that beats Kalshi's price plus the fee and a cent. Trade details and live board badges show our win chance against what was needed.
- Fix: the Win chance shown on open trades read about 3 points high in the middle of its range.

## 1.0.28 (Nov 10, 2026)
- Live board badges wrap inside the card on phones instead of running off the edge.

## 1.0.27 (Nov 10, 2026)
- Live board: each open trade says whether it is in your book (green) or was passed by your playbook (amber, dashed card), and why, including the volatility check's numbers.

## 1.0.26 (Nov 10, 2026)
- Home's Today line shows what your playbook passed on and how those would have gone, like "2 trades, 2 won, 4 passed (3-1)".

## 1.0.25 (Nov 10, 2026)
- Each trade's detail now shows its volatility check: how far past the target the coin was, what a normal 10-minute move was at the time, and how many moves clear that is (the check needs 1). So a trade skipped by the volatility playbooks says why.

## 1.0.24 (Nov 10, 2026)
- Settings on a locked device shows an Unlock this device button again (the redesign had hidden it), and says it is locked. Phones that open the dashboard from the home screen keep their own sign-in, separate from Safari, so they need unlocking once too.

## 1.0.23 (Nov 9, 2026)
- Opened from the home screen, the header no longer slides under the phone's clock and battery.

## 1.0.22 (Nov 9, 2026)
- A proper home-screen icon. Add the dashboard to your phone's home screen (Share, then Add to Home Screen on iPhone) and it gets the radar mark and opens full screen like an app, instead of a letter in a box.

## 1.0.21 (Nov 9, 2026)
- Light theme pass over every page: chart tooltips, secondary text, accent colours and primary buttons all meet a 4.5:1 contrast now. The sign-in and setup screens keep their dark look in both themes.

## 1.0.20 (Nov 9, 2026)
- Light theme fixes: the Analytics stat tiles were unreadable, the Cockpit is now always its own dark instrument panel with light text, and the Go live button has proper contrast.

## 1.0.19 (Nov 9, 2026)
- Bank drawdown stop fix: it measured against the all-time high, so a bank that fell under the line could never trade its way back. The day after it trips, the line now resets to the bank as it stands.

## 1.0.18 (Nov 9, 2026)
- Requests page. Ask for something the dashboard can't do yet. You get a number to track it, requests are read every day, and the ones that get built ship in the next release. The page also shows what others have asked for and where each one stands.

## 1.0.17 (Nov 9, 2026)
- Paper runs. Settings has a Start a new paper run button: the bank goes back to the starting bank from that moment and only new trades count toward the bank, win rate, chart and today. Earlier trades stay in Trades and Analytics as the previous run. Count everything again undoes it.

## 1.0.16 (Nov 9, 2026)
- Settings redesigned: section cards with a side navigation, each setting on one row with its control beside it, How it works panels that stay open, and a save bar that shows when you have unsaved changes with a Discard button. The page no longer refreshes under you while you are editing.

## 1.0.15 (Nov 9, 2026)
- Settings are grouped (the basics, stops, Your mix, schedule) and every setting has a How it works you can open, with a worked example of what it does.

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
