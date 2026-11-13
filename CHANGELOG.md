# What's new

<!-- Format, read by the Release notes page: "## version (date): title", one summary line, then bullets tagged [new], [improved] or [fixed]. -->

## 1.0.80 (Nov 12, 2026): Fix for filling in missed trade checks
- [fixed] The fill-in added in 1.0.79 asked Kalshi for the missed markets the wrong way and got nothing back, so it passed over windows without adding anything. It now gets them, runs its two-day look-back again, and does the longest outage first.

## 1.0.79 (Nov 12, 2026): Missed trade checks are filled back in
If the tracker is ever off for a while, the trade checks it missed are rebuilt afterwards.
- [new] When the tracker has been off for more than 20 minutes, it rebuilds the trade checks it missed from Kalshi's minute-by-minute price history, one window a minute, then settles them like any other. Each one uses the quoted price at the 10-minutes-left mark. The first run also looks back two days, so the hours lost to the outage on Nov 12 are filled in on their own. Rebuilt checks have no order-book depth, so they are left out of Room in the book.

## 1.0.78 (Nov 12, 2026): Fix for the dashboard going down after a few days
The dashboard stopped loading once its trade log was about five days long. This is the fix.
- [fixed] The dashboard went down with nothing loading and no new trades tracked. Cloudflare's free plan allows a set amount of database reading a day, and the tracker was re-reading its whole trade log every minute, so the allowance ran out once the log grew. It now packs older records together and reads a small fraction of what it did. Nothing was lost: the log is intact and tracking picks up on its own. The allowance resets at 7 PM Eastern each day, so a dashboard that is down now comes back by itself then.

## 1.0.77 (Nov 12, 2026): Share of the lead kept read off the right minute
The share of the lead kept was taken from the minute 5 price instead of minute 10, so cash out never sold.
- [fixed] Share of the lead kept. Coinbase sends the minute prices newest first and the tracker read the last one as the minute 10 price when it was really minute 5. When the trend ran against the bet, minute 5 was the best price of the stretch, so every such trade showed 100% kept, in a trade's How it played out and in Labs, and cash out held everything. Reported on NO bets; YES bets had it too. Now the prices are put in order first.
- [fixed] Shares saved before this are worked out again from the minute prices, a few trades a minute, newest first. Trades that were trending against their bet with less of the lead left than your setting are cashed out again, so the paper bank, Labs and the cash out panel will move for a while after updating.

## 1.0.76 (Nov 12, 2026): A cap on trades per window, a 96¢ playbook, and room in the book
Three things from four months of research into what the rule earns and where it loses.
- [new] Most trades a window, in Paper settings. Caps how many coins one 15-minute window may buy, clearest first, on the paper book, the labs, the live account and the live books. Coins that line up on one side lose together; in the four-month history three a window made the worst day about a third smaller on Margin vs volatility under 96¢, for about 12% less profit. It starts at 9, which is no cap, so nothing changes until you set it.
- [new] Playbook: Margin vs volatility, under 96¢. The same check as the under 95¢ playbook with the price cap one cent higher. In the history the 95¢ trades still paid after fees once the coin was clear of its target, and only 96¢ and up lost. It is in Labs and Backtest, and can be made the active playbook like any other.
- [new] Room in the book, on Analytics. For each coin: how many contracts usually rest at the quoted price when the rule looks, and how many cents more an order of 100, 250 or 500 contracts would have paid. Use it before raising a live size. The 250 and 500 columns fill in from today.
- [improved] Backtest has a Most trades a window box, so the cap can be tried on every playbook before it is set.

## 1.0.75 (Nov 11, 2026): Photos in chat, and the lead kept on every trade
Send photos to friends, land on the newest message, and see the share of the lead kept in a trade's replay.
- [new] Photos in chat. Tap the picture button next to the message box, pick a photo, add a caption if you like and send. Tap a photo to see it full screen. Photos are shrunk before sending, which also removes the camera's location details, and are kept only on your two dashboards. Both sides need this version.
- [new] A trade's How it played out now shows the share of the lead kept at minute 10, with the three prices behind it (the high or low from minute 5 to 10, the minute 10 price and the target), and says whether your cash out setting would sell or hold it. Requested by a user.
- [fixed] Opening a conversation always lands on the newest message. Coming back to one you had scrolled up in used to reopen at the top.

## 1.0.74 (Nov 11, 2026): Earlier trades re-scored under the new cash out rule
Trades from before 1.0.73 now get their share of the lead kept worked out too.
- [fixed] After 1.0.73, cash outs from earlier trend checks disappeared and those trades showed as held, because the older checks had no share of the lead saved. The dashboard now works that share out from the minute prices for those windows, a few trades a minute, and re-scores them: a trade that was trending against its bet with less of its lead left than your setting is cashed out again, the rest stay held. Expect the paper bank to move for a few minutes after updating while it catches up.

## 1.0.73 (Nov 11, 2026): Cash out by share of the lead kept
Cash out now asks how much of the lead is left, and the backtest numbers for it are corrected.
- [improved] Cash out when the trend turns uses a new test, at Steven's request: when the trend runs against the bet, sell only if less than a set share of the lead is left at minute 10. The share is (price at minute 10 minus target) divided by (high from minute 5 to 10 minus target), mirrored for a NO. The setting is Share of the lead kept (%) under Stops, default 50. It replaces Cash out only past (%).
- [improved] Labs and Backtest use the same test. The Labs panel splits trades trending against the bet into those that kept their lead (held) and those that didn't (sold).
- [fixed] The backtest's minute-10 prices were misread for older months (Kalshi's older history uses a different price scale), so the cash out and Wait for the trend results in 1.0.68 were wrong. Corrected, over four months at $50 a trade: the plain rule held makes +$4,092; cashing out under 50% of the lead kept makes +$310; under 5% kept, +$3,201; Wait for the trend loses about $6,200. Holding to the close still wins.

## 1.0.72 (Nov 11, 2026): Home tiles fixed on the web
Text that was cut off now shows in full, and a dead link works.
- [fixed] The notes under the Home figures (Drawdown and the rest) wrap onto a second line instead of being cut off with "…".
- [fixed] "See Live account" under Ready for live now opens the Live account page. It was plain text before.
- [fixed] On Analytics, larger dollar amounts no longer get clipped in narrower browser windows; the figure shrinks to fit its box.

## 1.0.71 (Nov 11, 2026): Motion, glow and a floating dock
A visual upgrade across the dashboard. Nothing about trading changes.
- [new] Numbers roll to their new value when they change: the bank, today's result, cash and book totals.
- [new] Pages rise into place when you change tabs and charts wipe in from the left. A shimmer shows while the first data loads.
- [new] On a phone the bottom bar is a floating glass dock, with a pill that slides to the tab you are on.
- [new] When a trade you took settles, a chip drops in with the coin, the result and the amount, and today's figure pulses green or red. Works for paper, live and subaccount books.
- [new] A soft light follows your cursor or finger across cards, the Home hero has a slow moving glow, and the countdown ring has a halo that speeds up near the trade check.
- [improved] All of it turns off automatically if your device is set to reduce motion.

## 1.0.70 (Nov 11, 2026): Clearer skip reasons
Trade cards say plainly why a playbook skipped a coin.
- [fixed] A coin skipped for its price under an under-95¢ playbook now says so ("paid 95.1¢, needs under 95¢"). It used to show its moves-clear reading, which had passed, so the skip looked like a volatility call.
- [improved] "Passed by" now reads "Skipped by", since "passed" could mean either.

## 1.0.69 (Nov 11, 2026): Live books on Kalshi subaccounts
Run as many separate live bankrolls as you like, each on its own Kalshi subaccount.
- [new] Subaccount books, on the Live account page. Add a book and the dashboard uses your main Kalshi key to create a subaccount and a key locked to it. The locked key can only trade that subaccount and can't move money; it is stored encrypted in your dashboard and never shown. Already have a subaccount? Link it with a locked key instead.
- [new] Each book has its own playbook, $ per trade, daily loss cap, cash floor and live switch, and its own trades, today and all-time totals. Turning a book on, selling its positions and moving money are all hold-to-confirm.
- [new] Move money between the main account and any book. Transfers stay inside your Kalshi account. Moving a book's money out brings back what sits on the crypto side too, once nothing is open.
- [improved] The live size limit is now $50 a trade (was $25), for the main live book and every subaccount book.
- [improved] Paper stops that already govern live trading (profit target, give-back, protect profit, benched coins, off hours) apply to every book too.
- Subaccounts are a Kalshi API feature for Direct accounts on the Advanced API tier or above.

## 1.0.68 (Nov 11, 2026): Cash out and Wait for the trend in Backtest
Both trend ideas can now be tested on four months of history.
- [new] Backtest has a Trend turns against the bet choice: Hold to the close, or Cash out at minute 10, with the Cash out only past (%) line next to it. With cash out on, every playbook sells the trades whose trend ran against them past that line, at what they would have sold for at minute 10, fee included.
- [new] Wait for the trend is a row in Backtest, run on every coin's price at 5 minutes left over the same four months.
- [improved] What the history shows (figures corrected in 1.0.73): over four months, cashing out past 0.15% turns the plain rule's +$4,092 into a small loss, and Wait for the trend loses about $6,200. The trend line does pick out the risky trades, but Kalshi's price at minute 10 already reflects it, so selling or waiting costs more than it saves. Labs keeps tracking both live.

## 1.0.67 (Nov 11, 2026): Bottom bar stays at the bottom
A fix for the iPhone home-screen app.
- [fixed] The bottom bar could be left floating in the middle of the screen after typing, or get dragged up by scrolling past the end of a page. It now goes back into place when the keyboard closes and hides while the keyboard is up, and the page no longer bounces past its ends.

## 1.0.66 (Nov 11, 2026): Chat as a full conversation window
The chat looks and works like a phone's messages app, and tapping a message notification opens it.
- [new] On a phone, opening a friend takes the whole screen: their name at the top, the conversation in the middle, the message box at the bottom, following the keyboard. Back returns to your friends list.
- [improved] Messages group by sender, with a time shown only when minutes have passed. Delivered or Read sits under your last message. Links are tappable. A message that didn't go through is marked with Try again.
- [fixed] Tapping a message notification now opens that conversation. It used to open whatever page was showing.
- [fixed] A new message arriving no longer closes the keyboard or clears what you were typing, and long messages no longer overlap the next one.

## 1.0.65 (Nov 11, 2026): Friends and chat fixes for phones
Friends and chat fits a phone screen, and a refresh keeps you on it.
- [fixed] If the friends list fails to load, Friends and chat now says why and offers Try again. It used to sit on Loading.
- [fixed] Pulling down to refresh on Friends and chat stays on Friends and chat. It used to jump to Home.
- [fixed] Scrolling up through older messages no longer sets off pull to refresh.
- [improved] On a phone the conversation fills the screen down to the bottom bar, so the message box is always visible. Sharing switches fold into one line above the messages (tap it to change them), and long names shorten instead of running into the buttons.

## 1.0.64 (Nov 11, 2026): Test buying on the trend line
A new Labs playbook waits for the trend before buying.
- [new] Wait for the trend, in Labs. The trend line runs from minute 5 to minute 10, after the usual buy, so it can't decide that buy. This tests buying later instead: at 5 minutes left, every coin's price is read from Kalshi's order book next to its trend line, and the playbook buys the leader when it costs from your minimum price up to 98¢ and the trend runs with the bet or is flat. It shows how that compares with the rule over the same windows.
- [new] Every coin is priced at minute 10 whether or not anything was bought at the mark, so the test covers coins the rule passed on too. Labs only for now: it can't be picked for paper or live until it has a record.

## 1.0.63 (Nov 11, 2026): Friends, chat and shared dashboards
Connect with a friend who runs their own copy, chat on the dashboard and look at each other's dashboards.
- [new] Friends and chat, in a new Shared dashboards section of the menu. Make an invite code and send it to a friend, or paste theirs. Once connected you can message each other right on the dashboard, with push notifications for new messages on devices that have notifications on.
- [new] Shared dashboards. Each friend sharing with you gets their own row in the menu. Tap it to see their dashboard, read only: Home, Trades, Labs, Analytics and more, with a bar at the top saying whose it is and a button back to yours. Nothing can be changed from there.
- [new] You choose what each friend sees: your dashboard on or off, and separately whether your live account (Kalshi cash and the live switch) is included. It starts shared with the live account private. Kalshi keys and sign-in never leave your dashboard.
- [improved] Cash out when the trend turns now only sells when the trend runs against the bet by more than 0.15% (up 0.15% on a NO, down 0.15% on a YES), at Steven's request. A gentler slope against the bet is held. The number is a setting under Stops, and Labs replays every past trade at whatever it is set to.
- [improved] The Labs cash-out panel splits trades running against the bet into those under the line (held) and those past it (sold).

## 1.0.62 (Nov 11, 2026): See cash-out on every playbook before turning it on
A Hold or Cash out switch on Labs replays every playbook both ways.
- [new] Labs has a Hold / Cash out switch at the top. On Cash out, every playbook's line, net, win rate and drop are replayed as if each trade whose trend turned against it had been sold at the 10-minute mark. Compare the two before turning on the paper setting. Your paper book is never changed by the switch.

## 1.0.61 (Nov 11, 2026): Cash out when the trend turns
Test selling a trade at the 10-minute mark when the trend runs against it.
- [new] Setting under Stops: Cash out when the trend turns. At the 10-minute mark of every window, the tracker fits the trend line from minute 5 to minute 10. With the bet or flat, the trade is held. Against the bet, the position is sold right then at the price Kalshi's buyers are paying, fee included. It applies to every playbook. Paper only for now; live keeps holding.
- [new] A Cash out when the trend turns panel on Labs measures the idea on every rule trade, whether the setting is on or not: how often trades with the trend, flat and against it won, and what selling the against ones did compared with holding them.
- [improved] Trade details say which way the trend ran at minute 10 and whether the trade was held or cashed out. Cashed trades are marked in Trades.
- [improved] The trade replay keeps the 5-to-10 minute trend line and drops the dotted line to the close, at Steven's request.

## 1.0.60 (Nov 11, 2026): A paper run starts its first day at zero
Lowering the daily stop no longer wipes out the day a run began.
- [fixed] The daily stops counted the whole ET day, including trades from before a paper run started. A run begun in the afternoon after a losing morning could be stopped the moment it started, and because saving settings re-books the whole log, lowering the daily loss stop could empty that day after the fact. The run's first day now starts from zero.

## 1.0.59 (Nov 11, 2026): Trend in the trade replay
See which way the coin was heading between minute 5 and minute 10, and what came next.
- [new] Every trade replay shows the trend from minute 5 to minute 10: a shaded band, a line fitted to the coin's price in green when it ran with your bet, red when it ran against it, and a dotted line carrying that pace on to the close. The replay reveals it as it plays. (Request 3.)
- [new] A trend card under the replay: whether the move ran with or against the bet, its size, its pace per minute and how steady it was. Once the trade settles it says whether the last five minutes kept to the trend or turned, and how the bet ended.

## 1.0.58 (Nov 11, 2026): Paper runs you can see past and undo
Analytics follows your paper run, with the full history one tap away.
- [new] On Analytics, a This run / All trades switch for the paper account, shown while a run is going. This run is the default, so the daily P&L starts when you reset the paper bank; All trades shows the days before it too.
- [new] A new paper run can be undone: Settings, Paper run, Undo, puts the run back where it started before.
- [new] Start a new paper run from an earlier moment, not only from now: pick the date and time in the same dialog.

## 1.0.55 (Nov 11, 2026): Stops judged as the window opens
A backtest and paper-book fix that makes tight daily stops honest.
- [fixed] All of a window's coins are bought at the same moment, before any of them settles, but the paper book, Labs and the Backtest applied the day's result coin by coin. A daily stop could skip the third coin because the first two had already lost, which the real tracker can never know. Every stop (daily loss, profit target, give-back, bank drawdown, profit protection) now reads the day as it stood when the window opened. Tight stops look noticeably worse than before; the default $250 stop barely changes.

## 1.0.54 (Nov 10, 2026): Protect today's profit
One bad window can no longer take a good day back under the line you set.
- [new] Setting: Protect profit from ($) and Keep (% of the day's high), under Stops. Once the day's high reaches the amount, each window may only stake today's profit less the share of the high you keep. With 0% a window can take the day back to even, never below. The window's coins share that budget, clearest first; a coin that does not fit in full is bought smaller, and one that cannot fit a contract is skipped. Applies to the paper book, Labs and live. Off by default.
- [new] The same two boxes on the Backtest page. At $50 a trade with a $200 target and protection from $100, every playbook finished green on more days; Margin vs volatility and v2 also made more, the plain rule made much less. Try your numbers there before turning it on.
- [improved] Within a window, the clearest coins (furthest past their targets) are now considered first, in paper and live.
- [improved] Trade details say when a trade was skipped or bought smaller to protect the day's profit.

## 1.0.53 (Nov 10, 2026): Push notifications
Your phone is told when positions open and when they settle.
- [new] Push notifications from the home-screen app, set up under Settings, Notifications. One message when a window's positions open (coins, prices, amount committed, when it settles, the playbook) and one when the window settles (how many won and lost, the net, each coin's result, today's total and the bank). One message per 15-minute window, never one per coin.
- [new] Six switches per device: paper and live, each for positions opened, wins and losses. They save as you tap them, and each device keeps its own, so a phone and a laptop can listen for different things. Send a test from the same card.
- [improved] Messages are encrypted end to end between your dashboard and your device, sent straight to Apple's, Google's or Mozilla's push service with no third party in between. On iPhone and iPad, add the dashboard to your Home Screen first; notifications only work from there.

## 1.0.52 (Nov 10, 2026): Playbook colors you can tell apart
Every playbook has its own clearly different color.
- [improved] With fifteen playbooks, several shared near-identical pinks and greens on the Labs chart. Each now has its own hue, the same one on Labs and on the Backtest page, and the set is darkened in the light theme so the yellow and the pale colors stay visible.
- [improved] The Labs chart has room for the longer playbook names at the line ends.

## 1.0.51 (Nov 10, 2026): Exact fill prices
Fill prices show one decimal everywhere.
- [improved] Fill prices were rounded to whole cents, so a 94.6¢ fill and a 95.2¢ one both read 95¢. They now show one decimal on Trades, Home, the live board, the scanner, trade details and the Learning page, so you can tell which side of a 95¢ cap a trade fell on. Kalshi's own quotes stay in whole cents.

## 1.0.50 (Nov 10, 2026): Margin vs volatility, under 95¢
The backtest's best blend of profit and steadiness, as one playbook.
- [new] Playbook: Margin vs volatility, under 95¢. Margin vs volatility plus a 95¢ price cap, selectable in Labs with one tap. Before, you had to build it in Your mix. In the four-month backtest it kept nearly all of Margin vs volatility's profit with a smaller worst drop and no losing month.

## 1.0.49 (Nov 10, 2026): Two moves clear
The steadiest playbook the history supports.
- [new] Playbook: Two moves clear. It only buys when the coin is at least two normal 10-minute moves past its target on both volatility measures, twice the bar Margin vs volatility uses. In the four-month history that meant about 7 trades a day, a 98% win rate and about 9 days in 10 finishing green, for roughly a fifth of Margin vs volatility's profit. It was picked on the first two months and held up on the last two. It still has losing days; no rule in the history avoided them. It is in Labs and on the Backtest page.

## 1.0.48 (Nov 10, 2026): Backtest: did the day reach your target?
See which days got to a profit target, when, and what happened after.
- [new] A fourth view on the Backtest period table, Reached target. Set an amount (it starts at $200). By day it shows whether each playbook's running profit got there and at what time, or the day's high point if it did not. By week and month it counts the days that did. The foot shows how many days reached it, how many reached it and then finished under, and the best high point of any day. Set the daily profit target at the top to the same amount to see what stopping there would have done. The table export includes it.

## 1.0.47 (Nov 10, 2026): Backtest export, and it stops jumping
Save the backtest as a spreadsheet, and read the day table without it resetting.
- [fixed] The Backtest and Release notes pages redrew every few seconds with the live data, which threw the day table back to the top while you were reading it. They now stay put once loaded.
- [new] Two exports on the Backtest page. Export this table saves the month, week or day table for every playbook (net, worst drop, trades, won, days stopped). Export every trade saves each trade in the window with its readings and what each playbook made on it. Both open in Excel or Sheets and use the dollars per trade and stops you have set.

## 1.0.46 (Nov 10, 2026): Backtest drawdown by day, week and month
See how deep each playbook fell inside every period, and where the daily stop cut a day short.
- [new] The Backtest period table has three views: Net profit, Worst drop and Win rate. Worst drop is the deepest fall from a high point inside each day, week or month, per playbook, with the deepest and the typical one at the foot.
- [improved] A marker shows every day (or week, or month) where the daily loss stop ended trading early. The stop was always part of the backtest; now you can see where it bit. Hover a cell for trades, wins, net and worst drop together.

## 1.0.45 (Nov 10, 2026): Backtest by month, week and day
Break the backtest down by period and drill in, playbook by playbook.
- [new] The Backtest page has a period table: switch between Month, Week and Day, with every playbook side by side. Tap a month to open it by week, and a week to open it by day. Each row marks the best playbook, and the foot of the table shows the total, how many periods lost money and the worst one. Hover a cell for the trade count.

## 1.0.44 (Nov 10, 2026): Backtest page
Every playbook run over the full history, side by side.
- [new] Backtest page. Runs every playbook over the same history: each time the plain rule would have traded since these markets opened on Jul 9, 2026 (about 9,700 trades), with real order-book prices, real results, fees, and the Coinbase reading rebuilt for each trade check. Set the dollars per trade, the daily loss stop and the daily profit target and every playbook re-runs at once. Pick the whole history, the last 30, 60 or 90 days, or a single month. Shows profit over time, a results table (trades, win rate, net, per trade, worst drop, worst day, days stopped) and a month-by-month grid.
- [fixed] The second look was not running: it waited on a flag kept in memory that does not survive between minutes. It now goes by the clock, and the Labs page lists its verdict for each coin over the last few windows.

## 1.0.43 (Nov 10, 2026): Second look
A playbook that keeps watching after the 10-minute mark.
- [new] Playbook: Margin vs volatility + second look. Every coin used to get one look, at 10 minutes left, and one that qualified a minute or three later was never considered. This playbook is Margin vs volatility at the mark, plus a check every minute after it until 4 minutes are left: it buys a coin it does not already hold the first time the leader is priced 91¢ to 95¢ and is at least one normal 10-minute move past its target. One entry per market. It runs in Labs for everyone and in your paper book if you choose it. Live still trades at the mark only.
- [improved] Second-look trades are marked in Trades and on the live board, with how many minutes were left when they were bought.
- [fixed] In the home-screen app the header sits a little lower, clear of the clock, and the Settings save bar (with Unlock this device) is no longer half hidden behind the tab bar.

## 1.0.42 (Nov 10, 2026): Volatility readings from a source that answers
The "no volatility reading" and out-of-date readings are traced to Coinbase rate limits and fixed.
- [fixed] Coinbase's exchange service was refusing the tracker's requests (rate limit) or answering from a copy several minutes old. That is what caused "no volatility reading" and readings like 0.000% from the target. Readings now come from Coinbase's Advanced Trade service, which answers and is current. If it is busy, the price is taken from two other Coinbase services in turn, and a reading that still could not get a current price is marked and rebuilt afterwards.
- [improved] The recheck of past readings shares price history between neighboring trades, so it needs about one request per 19 readings and no longer trips the rate limit. It backs off when Coinbase asks it to.

## 1.0.41 (Nov 10, 2026): Pull to refresh
Reload the home-screen app without closing it.
- [new] Pull to refresh. In the app opened from your home screen, pull down from the top of any page and let go to reload it. Before, the only way to reload was to swipe the app away and open it again.

## 1.0.40 (Nov 10, 2026): Past volatility readings rechecked
Readings taken from an out-of-date Coinbase price are rebuilt from its history, and every playbook re-judges those trades.
- [fixed] Coinbase's price list was coming back about 3 minutes behind, so past volatility readings were measured from an old price. The tracker now rechecks every earlier reading against Coinbase's price history, a few each minute, newest and most suspicious first. A reading that was off is replaced, and the volatility playbooks, Beats the market and Learned re-judge that trade, in Labs and in your paper bank. Trades that had no reading at all get one.
- [improved] Older trades gain the 10-minute measure during the recheck, so Margin vs volatility v2 and Learned have a record going back as far as the readings do.
- [improved] The Labs chart caption shows how many readings were corrected and how many are left, and a corrected trade says so in its details.
- [fixed] Live readings stay fresh: the request that returns the current price is kept, and if Coinbase is behind anyway the reading is marked and rechecked instead of dropped.

## 1.0.39 (Nov 10, 2026): No more stale volatility readings
The volatility check now refuses a Coinbase price that is behind, and shows the price it used.
- [fixed] A trade could read exactly 0.000% from its target when Coinbase's candle list came back several minutes behind, so the volatility playbooks and Learned passed on a trade that was well clear. The check now asks for an uncached copy, uses the live ticker when the newest candle is over 2 minutes old, and takes no reading at all if both fail.
- [improved] Trade details show the Coinbase price the volatility check used and how old it was.

## 1.0.38 (Nov 10, 2026): New playbooks show on the Labs chart
A playbook that has judged trades but not taken one yet no longer goes missing.
- [fixed] The Labs chart left out any playbook with fewer than two taken trades, so a new one (Margin vs volatility v2, Beats the market v2, Learned) looked like it was not logging. It now draws from its first judged trade, flat at $0 until it takes one.

## 1.0.37 (Nov 10, 2026): A Labs chart you can read
Every line starts at $0 from the same moment, so the gap between two lines is the real difference.
- [improved] Labs chart redrawn. It now shows profit since one shared start instead of each line's own balance from its own start date, which had the rule sitting hundreds of dollars from playbooks that began later. Lines step at each settled trade, the grid uses round numbers, and each line ends in its name and total. The plain rule is dashed and your paper playbook is the heavy line.
- [new] Range buttons on the Labs chart: Same start, 24h, 7 days and All. Your choice is remembered on that device.

## 1.0.36 (Nov 10, 2026): Release notes page
Every update in one place, with search and filters.
- [new] Release notes page in the sidebar: every release with a title and what changed, tagged new, improved or fixed. Filter by tag, search the notes, jump by date, and see at a glance how much of the work was new features against fixes. Your installed version is marked, and What's new now opens this page instead of GitHub.

## 1.0.35 (Nov 10, 2026): One-tap updates
Update now starts the update itself from any device, and new versions can install on their own.
- [new] One-tap updates. On Connections, save a GitHub token limited to your copy of the repo (Actions: Read and write, nothing else; steps are on the page). After that Update now starts the update itself from any device, with no trip to GitHub, and new versions install on their own within about 30 minutes. The token is stored encrypted in your own Cloudflare account and is never shown again. Without a token, updates work as before.

## 1.0.34 (Nov 10, 2026): Self-learning
A model that refits every morning, a Learning page to watch it, and a Learned playbook in Labs.
- [new] Self-learning. A small model now refits every morning on every settled trade, starting from four months of history (about 7,900 trades with Coinbase readings). It begins from Kalshi's own price and learns only where that price has been wrong. Each trade's win chance is fixed at the trade check, before the result exists, so its record is only ever on trades it had not seen.
- [new] New Learning page: what the model has learned in plain words, whether its calls matched what happened, Learned against the plain rule month by month, and today's calls.
- [new] New playbook in Labs, Learned: buys only when the model's win chance beats the price plus the fee plus 1¢. It never switches itself on. Trade details show the model's reading.

## 1.0.33 (Nov 10, 2026): Margin vs volatility v2
The volatility check measures the 10-minute move directly, so it stops skipping trades that kept winning.
- [new] New playbook, Margin vs volatility v2: the same 1-move bar, but the typical 10-minute move is measured directly from the last 5 hours of 10-minute price changes on Coinbase instead of scaled up from 1-minute moves, which overstated it and skipped trades that kept winning. Trade details and live cards show the new reading.

## 1.0.32 (Nov 10, 2026): Daily profit target
Set an amount and trading stops for the day once you are up that much.
- [new] Daily profit target (request R-2): in Settings under Stops, set an amount and trading stops for the day once today is up that much. Off by default. Applies to paper, labs and live.

## 1.0.31 (Nov 10, 2026): Beats the market v2 and a Labs filter bar
A stricter win chance playbook, and the Labs chart legend now shows or hides each line.
- [new] New playbook, Beats the market v2: like Beats the market, but it uses the larger of the last hour's and the last 15 minutes' volatility, so a swing that just started counts, and it takes half of any slide back toward the target in the last 5 minutes off the margin. Trade details and live cards show its reading.
- [improved] Labs: the chart legend is now a filter bar. Tap to show or hide a line, double-click or press and hold to show only that one against the rule, and All or None. Your choice is remembered on that device.

## 1.0.30 (Nov 10, 2026): Live win chance lines up with the tracker
Live cards use the tracker's own volatility measure and show what the trade looked like at the trade check.
- [fixed] Live win chance now uses the same volatility measure the tracker decides on (an hour of 1-minute Coinbase prices), without the extra safety margin, so it no longer reads well under Kalshi on every card.
- [improved] Each live card shows what the trade looked like at the trade check: moves past the target and the win chance then, against the price paid.

## 1.0.29 (Nov 10, 2026): Beats the market
A playbook that only buys when our win chance beats Kalshi's price, plus a win chance fix.
- [new] New playbook, Beats the market: turns the volatility reading into a win chance and only buys when that beats Kalshi's price plus the fee and a cent. Trade details and live board badges show our win chance against what was needed.
- [fixed] Fix: the Win chance shown on open trades read about 3 points high in the middle of its range.

## 1.0.28 (Nov 10, 2026): Live board badges fit on phones
Badges wrap inside the card instead of running off the edge.
- [fixed] Live board badges wrap inside the card on phones instead of running off the edge.

## 1.0.27 (Nov 10, 2026): In your book or passed
Every open trade on the live board says whether your playbook took it, and why.
- [new] Live board: each open trade says whether it is in your book (green) or was passed by your playbook (amber, dashed card), and why, including the volatility check's numbers.

## 1.0.26 (Nov 10, 2026): Passed trades on Home
Today's line shows what your playbook passed on and how those went.
- [improved] Home's Today line shows what your playbook passed on and how those would have gone, like "2 trades, 2 won, 4 passed (3-1)".

## 1.0.25 (Nov 10, 2026): Volatility check in trade details
Each trade shows how far past the target it was and why a playbook took or skipped it.
- [improved] Each trade's detail now shows its volatility check: how far past the target the coin was, what a normal 10-minute move was at the time, and how many moves clear that is (the check needs 1). So a trade skipped by the volatility playbooks says why.

## 1.0.24 (Nov 10, 2026): Unlock button is back in Settings
A locked device shows Unlock this device again.
- [fixed] Settings on a locked device shows an Unlock this device button again (the redesign had hidden it), and says it is locked. Phones that open the dashboard from the home screen keep their own sign-in, separate from Safari, so they need unlocking once too.

## 1.0.23 (Nov 9, 2026): Header clears the phone's status bar
Opened from the home screen, the header no longer slides under the clock.
- [fixed] Opened from the home screen, the header no longer slides under the phone's clock and battery.

## 1.0.22 (Nov 9, 2026): A proper home-screen icon
Add the dashboard to your home screen and it opens full screen like an app.
- [new] A proper home-screen icon. Add the dashboard to your phone's home screen (Share, then Add to Home Screen on iPhone) and it gets the radar mark and opens full screen like an app, instead of a letter in a box.

## 1.0.21 (Nov 9, 2026): Light theme, every page
Text, charts and buttons all meet a 4.5:1 contrast in light mode.
- [improved] Light theme pass over every page: chart tooltips, secondary text, accent colours and primary buttons all meet a 4.5:1 contrast now. The sign-in and setup screens keep their dark look in both themes.

## 1.0.20 (Nov 9, 2026): Light theme fixes
Analytics tiles, the Cockpit and the Go live button are readable in light mode.
- [fixed] Light theme fixes: the Analytics stat tiles were unreadable, the Cockpit is now always its own dark instrument panel with light text, and the Go live button has proper contrast.

## 1.0.19 (Nov 9, 2026): Bank drawdown stop can recover
The stop's line resets the day after it trips, so the bank can trade its way back.
- [fixed] Bank drawdown stop fix: it measured against the all-time high, so a bank that fell under the line could never trade its way back. The day after it trips, the line now resets to the bank as it stands.

## 1.0.18 (Nov 9, 2026): Requests page
Ask for something the dashboard can't do yet, and track it.
- [new] Requests page. Ask for something the dashboard can't do yet. You get a number to track it, requests are read every day, and the ones that get built ship in the next release. The page also shows what others have asked for and where each one stands.

## 1.0.17 (Nov 9, 2026): Paper runs
Start a fresh paper bank without losing your history.
- [new] Paper runs. Settings has a Start a new paper run button: the bank goes back to the starting bank from that moment and only new trades count toward the bank, win rate, chart and today. Earlier trades stay in Trades and Analytics as the previous run. Count everything again undoes it.

## 1.0.16 (Nov 9, 2026): Settings redesigned
Section cards, a side navigation and a save bar that shows unsaved changes.
- [improved] Settings redesigned: section cards with a side navigation, each setting on one row with its control beside it, How it works panels that stay open, and a save bar that shows when you have unsaved changes with a Discard button. The page no longer refreshes under you while you are editing.

## 1.0.15 (Nov 9, 2026): Settings explained
Every setting has a How it works with a worked example.
- [improved] Settings are grouped (the basics, stops, Your mix, schedule) and every setting has a How it works you can open, with a worked example of what it does.

## 1.0.14 (Nov 9, 2026): Three ways to protect a good day
Give-back stop, bank drawdown stop and ratchet sizing.
- [new] Give-back stop, in Paper settings. Once the day is up by the amount you set (default $25), trading stops for the day if the profit falls to your chosen share of the day's peak. Protects profit already made. Off by default.
- [new] Bank drawdown stop. Stops for the day once the bank is a set % under its all-time high. Off by default.
- [new] Ratchet sizing, a new Your mix sizing choice. The stake steps up only on banked profit while the bank is at a new high, and drops back to base after any loss.
- [improved] All three apply to paper, labs and live. Skipped trades say which stop tripped.

## 1.0.13 (Nov 9, 2026): Settings says what is wrong
A bad value names its box instead of saving nothing.
- [fixed] Settings now says which box has a problem instead of saving nothing. Typing a range like 3-5 into a number box tells you to put the low end in "at least" and the high end in "at most".

## 1.0.12 (Nov 9, 2026): Your mix takes a range of coins
Coins on the same side has an upper limit as well as a lower one.
- [improved] Your mix: coins on the same side now has an upper limit as well as a lower one, so a range like 3 to 5 can be tested. 9 means no upper limit.

## 1.0.11 (Nov 9, 2026): Home page redesign
A status strip, a countdown ring, a scanner board and a live window timeline.
- [improved] Home page redesign. A status strip under the header (paper and live playbooks, daily stop, feed health). Bank and today as the two big numbers, with the other stats in a compact row. Glass cards, a faint grid, mono numerals.
- [new] The next trade check is a countdown ring that fills over the 15 minutes and pulses in the last 30 seconds. Scanner prices flash green or red as they tick.
- [improved] The scanner is now a board sorted by leader price, closest to qualifying first, with a gauge of each coin against its target.
- [new] When nothing is open, the live board shows the current window as a timeline: open, trade check, settle, with a moving cursor and who qualifies right now.
- [new] A ticker of the last settled trades runs under the page. On wide screens the hero and scanner sit side by side.

## 1.0.10 (Nov 9, 2026): Hourly updates
Updates arrive within the hour instead of once a day.
- [improved] Updates now arrive within the hour instead of once a day. New setups get this automatically. If you turned on automatic updates before today, go to Connections and press Make hourly (a one-line change in GitHub).

## 1.0.9 (Nov 9, 2026): Your mix is a builder
Combine any of the filters with any sizing.
- [improved] Your mix is now a builder: combine any of the filters (coins on the same side, price cap, volatility check) with any sizing (fixed, size follows the bank at a % you pick, or quarter Kelly). For example skip 95¢ and up plus size follows the bank: set coins to 1, cap to 95, sizing to % of the bank. All in Paper settings.

## 1.0.8 (Nov 9, 2026): Update from the dashboard
A bar on every page says when a new version is out.
- [new] Updates from the dashboard: when a new version is out, a bar shows on every page with Update now. It opens the updater in your GitHub (one Run workflow tap), then this page watches for the new version and offers a reload. Your GitHub repo name is remembered on that device.

## 1.0.7 (Nov 9, 2026): Your mix, a trading schedule and exact coin counts
Run two filters at once, switch off hours you don't want, and see every same-side count.
- [new] New playbook, Your mix: run two filters at once. Set how many coins must lead the same direction (1 to 9) and a price cap (95 skips 95¢ and up, 100 is no cap) in Paper settings, then pick Your mix as the paper or live playbook.
- [new] Trading schedule: in Paper settings, tap any ET hour to switch it off. Trades that would start in that hour are skipped, paper and live. Each hour shows what the plain rule made in it so far.
- [improved] Analytics, "When several coins line up": exact counts 1 through 9 instead of 4+, plus a table of win rate and net for N or more coins on the same side, with and without the 95¢ cap.

## 1.0.6 (Nov 9, 2026): Win chance shows on phones again
It no longer leaves a dash right after the phone wakes.
- [fixed] Win chance on open trades shows again on phones. Right after the phone wakes, the window only has minute-by-minute prices until the full history loads, and that used to leave a dash. It now works from whatever prices are there and sizes moves correctly for the gaps between them.

## 1.0.5 (Nov 9, 2026): Live charts no longer get stuck on phones
A Coinbase request that never answered can't block the price history any more.
- [fixed] Live board charts no longer get stuck showing only the last minute or two on phones. A Coinbase request that never answered (phone asleep or switching networks) used to block the price history for the rest of the window; now it gives up after 7 seconds, retries, and refreshes when you come back to the page.

## 1.0.4 (Nov 8, 2026): Kelly sizing and a better search
A new sizing lab, and search finds coins, pages and actions.
- [new] New lab, Kelly sizing: sizes each bet by the Kelly criterion from the win rate already seen at that price (a quarter of Kelly, split across the coins in the window, $5 to 5% of the bank) and skips prices with no proven edge. Usable as the paper or live playbook; live stays within $5 to $25.
- [improved] Search finds coins (opens them in the Cockpit), pages and actions like changing a playbook. No more wallet search.

## 1.0.3 (Nov 8, 2026): Phone and wide-screen layout
Text wraps on phones, Home reads better, and mid-size monitors fit without crowding.
- [fixed] Phones: text wraps instead of getting cut off, the top stats sit in a 2x2 grid, Labs stack instead of scrolling sideways, and the Cockpit coin picker wraps into rows.
- [improved] Home on phones: the bank chart sits further back so the balance and stats are easier to read.
- [improved] Wide monitors between laptop and ultrawide: Home stat tiles and scanner fit without crowding.

## 1.0.2 (Nov 8, 2026): One-click automatic updates
Connections has a Turn on button for the updater.
- [new] Connections has a one-click Turn on button for automatic updates (Cloudflare's deploy leaves the updater out).

## 1.0.1 (Nov 8, 2026): Wide screens, trade replay and win chance
The whole screen gets used, trades can be replayed, and open trades show a win chance.
- [improved] Wide monitors use the whole screen: Home splits into two columns, Analytics puts equity, daily results and the calendar side by side.
- [new] Trade replay: play button, speed choice (15, 30 or 60 seconds for the whole window) and a slider to scrub.
- [new] Win chance on open trades and in the Cockpit, next to Kalshi's own price.
- [new] Go live button in the top bar and a clear Paper only / Live mode tile.
- [fixed] Phones: no double-tap zoom, no accidental text highlighting, full price lines on iPhone.
- [improved] Commas in header amounts; deploy settings explained in the README.

## 1.0.0 (Nov 8, 2026): First release
Paper and live trading for Kalshi's 15-minute crypto markets, in your own Cloudflare account.
- [new] First release. Paper and live trading for Kalshi's 15-minute crypto markets, running in your own Cloudflare account.
- [new] Setup screen, passcode sign-in, Connections page for your Kalshi key (tested, encrypted, write-only).
- [new] Home, Cockpit, Analytics (paper and live), Trades with replay, Labs and playbooks, Live account, Settings.
- [new] Win chance on open trades, daily automatic updates from the stable release.
