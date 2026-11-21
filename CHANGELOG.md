# What's new

<!-- Format, read by the Release notes page: "## version (date): title", one summary line, then bullets tagged [new], [improved] or [fixed]. -->

## 1.3.40 (Nov 20, 2026): The hand buy box fits on one phone screen
- [improved] Buying by hand on live is now one screen: when it settles, three small tiles (best ask and the most it pays, what Main pays, what it wins or loses), the chart readings as chips, one list of the accounts with the full and protected amount side by side and their tick boxes, a short warning, and the two hold buttons next to each other.

## 1.3.39 (Nov 20, 2026): Hand buys can be protected or unprotected
- [new] Buying by hand while an account has Protect profit set now gives two hold buttons. "Hold to buy protected" cuts each account's buy to the room above the level it keeps today, and skips an account with no room left. "Hold to buy unprotected" buys at full size as before and can take the day below that level. Each button says under it what every account would buy, and the box lists each account's room, so a fast buy is never the wrong one.
- [new] An account whose protection has not started yet today buys its full size either way, and says so.

## 1.3.38 (Nov 20, 2026): "Protecting" clears when the open trade's window closes
- [fixed] When a coin was skipped because the trade already open that window was using the protected room, the account kept saying "Protecting" with that note for the rest of the day, even after the trade settled and it was trading again. That note now clears when the window closes. "Protecting" stays all day only when today's result is down at the level kept.

## 1.3.37 (Nov 20, 2026): The live tiles up top count every account
- [improved] The Live trading tile (its line, won, lost and open) and Live today now add up Main and every subaccount, not Main alone. Live today's target is the accounts' targets added together, and on the phone it says how many accounts it covers.
- [fixed] On narrow phones the cash in the corner of Live today no longer runs into the label.

## 1.3.36 (Nov 20, 2026): Trade check and later buys tiles fit at every width
- [fixed] On a mid-width screen the Trade check amount ran out of its tile. The two tiles now span the full width of the Today box, and the amount moves under the count whenever the tiles are narrow, on phone and web.

## 1.3.35 (Nov 20, 2026): Tap an account to see its day
- [new] Home, live: tapping an account under Kalshi cash now loads that account's day into the Today box beside it: its result, automatic and by-hand lines, trade check and later buys, what it passed on, and its own profit target. An "All" chip adds every account together, with the targets of the accounts that are on added up. The pick is remembered on this device.
- [improved] Subaccounts now send the same split of today's trades as Main (by hand, later buys, passed).

## 1.3.34 (Nov 20, 2026): Today splits Claude's pick into trade check and later buys
- [new] Home, Today on the live account: between Automatic and By hand, two tiles show today's automatic trades bought at the trade check and the later buys, each with its count, wins and result, and a bar under them showing the share of each.

## 1.3.33 (Nov 20, 2026): Equity by day or week, and "Protecting" instead of "Paused"
- [new] Analytics: the Equity chart has Day, Week and range buttons. Day shows today from midnight Eastern with times along the bottom, Week the last 7 days, and the third follows the page's range as before. The line above the chart gives the result, trades and drawdown for what is shown.
- [fixed] An account holding today's protected profit said "Paused" even while it was trading inside the room it had. It now says "Protecting", and the note says which case it is: a trade already open this window is using the room (other coins wait until it settles, and a win opens room again), or today's result is down at the level you chose to keep (done for the day).

## 1.3.32 (Nov 19, 2026): Edge check and the nightly edge search
- [new] Labs: an "Edge check" card at the top. It compares the running rule's last 7 days with the 7 before, as win rate minus the price paid, from Main's live fills (or paper's trades when live took under 40 that week). It reads Holding, Slipping (one week under) or Two weeks under (the warning to pause).
- [new] Edge search: every night the public repo pulls the newest markets and tries hundreds of versions of Claude's pick (thousands on Sundays, plus other minutes and price bands). Each one is picked on the first 60 of the last 90 days and judged only on the last 30, and it has to beat your rule day by day or add money on its own after a correction for how many were tried. Results show on the Edge check card.
- [new] A found edge sends one alert, and the ones that run at the trade check get a paper line in Labs ("Found edge 1"). They can't be picked as a playbook, so nothing live changes until one is built on purpose.
- [new] Notifications: an "Edge alerts" switch for new edges and edge check warnings, on unless turned off.

## 1.3.31 (Nov 19, 2026): Hide the passed-on trades on the board too
- [improved] The "Passed on" divider under your open trades now has a Hide button. It hides the cards the playbook passed on and shares one switch with the Scanner's "Hide passed", remembered on this device.

## 1.3.30 (Nov 19, 2026): A cushion bar for Claude's pick at the trade check
- [new] Settings: "Trade check: least cushion (moves)", 1 to 3, set per account. Claude's pick only buys at the trade check when a coin is at least this far clear of its target. It defaults to 1, the playbook's own bar, so nothing changes until you raise it.
- [improved] Backtest: "Claude's pick, later watched (your settings)" now uses the trade-check cushion from Paper settings too.
- [fixed] The note after saving settings showed later-buy cushions and switches as dollar amounts.

## 1.3.29 (Nov 19, 2026): Hide the coins the trade check passed on
- [new] Scanner: once the trade check has passed, a "Hide passed" switch hides the coins it passed on or skipped that window. Taken coins and green "buy now" rows stay, and the switch is remembered on this device.

## 1.3.28 (Nov 19, 2026): Claude's pick labs start with their first trade of either kind
- [fixed] A Claude's pick lab started at its first early or later buy, so with a high cushion bar its trade-check buys from the days before were left off. It now starts at its first trade of either kind.

## 1.3.27 (Nov 19, 2026): The Claude's pick labs go back to Nov 2
- [improved] Labs: early buy, later watched, no stragglers and high confidence now start on Nov 2 like Claude's pick, instead of Nov 12. Their early and later buys before the evening of Nov 18 are rebuilt from Kalshi's one-minute history.

## 1.3.26 (Nov 19, 2026): Later watched, scored with your own settings
- [new] Backtest: "Claude's pick, later watched (your settings)" uses the later-buy settings in Paper settings right now (least cushion, margin inside every line, crowd rule). Change them and the row changes with them.
- [improved] Labs: "Claude's pick, later watched" now scores its later buys with your paper settings too, back to Nov 12, so it shows the playbook exactly as you run it. Changing the settings rescores the whole line.
- [fixed] On the web, the playbook line under each account name was cut off. It wraps now.

## 1.3.25 (Nov 19, 2026): Claude's pick, high confidence; read the Backtest chart by pointing at it
- [new] New playbook, "Claude's pick, high confidence", for paper, live and sub accounts. It buys only coins at least 1.75 usual moves clear of their target, at the trade check and from 8 to 4 minutes left (later buys also need room inside every line and are never the straggler of a crowded move). About 7 trades a day in 90 days of quoted prices, 97% won. Live takes its later buys only with "Buy later-watched coins" on.
- [new] Labs: high confidence goes back to Nov 12 like the others, with its later buys before today rebuilt from Kalshi's one-minute history.
- [new] Backtest: a "Claude's pick, high confidence" row.
- [new] Backtest chart: point at it (or tap and drag on a phone) to see every playbook's amount at that moment, best first, with a dot on each line.

## 1.3.24 (Nov 19, 2026): Safer later buys: a margin inside every line
- [new] New setting for Claude's pick, later watched: "Later buys: margin inside every line", set to 0.2 for paper, live and every sub account. A buy after the trade check now has to clear Claude's pick's lines with room to spare: cushion 1.2 or more, worst dip above -1.8, straightness under 0.5. Coins right on a line are skipped and checked again the next minute. Trade-check buys are not affected. Set it to none to go back to the plain test.
- [new] Backtest: "Claude's pick, later watched, safe" shows later watched with this margin and the crowd rule.

## 1.3.23 (Nov 19, 2026): The live trades export shows a later buy's own readings
- [fixed] In the live trades CSV, a buy made after the trade check showed the readings from the trade check instead of the ones it was bought on. It now shows the readings at the moment of the buy, and a new later_buy column marks these rows.

## 1.3.22 (Nov 19, 2026): The three new Claude's pick labs go back to Nov 12
- [improved] Labs: "Claude's pick, early buy", "Claude's pick, later watched" and "Claude's pick, later watched, no stragglers" now start on Nov 12 like the others. Their early and later buys before the evening of Nov 18 are rebuilt from Kalshi's one-minute price history using the same tests; from then on they are the buys the tracker recorded itself at real order book prices.

## 1.3.21 (Nov 19, 2026): Account rows show the full playbook name on a phone
- [fixed] On a phone, a long playbook name under an account was cut off ("Claude's pick, later w…"). The line now wraps so the whole name and trade size show.

## 1.3.20 (Nov 18, 2026): Price room accepts tenths of a cent
- [fixed] Price room was rounded to a whole cent when saved, so 1.5 became 2. It now keeps a tenth of a cent, 0 to 3.

## 1.3.19 (Nov 18, 2026): More is saved with every early and later buy
- [new] With each early and later buy the tracker now also saves the bids on Kalshi, Kalshi's trades in the last minute, Coinbase's last minute in 10-second steps, and the same coin's price on Kraken and Bitstamp. Nothing about what gets bought changes; this is so there is more to learn from once enough of these buys have settled.
- [new] "Export later buys" beside the other exports downloads all of it as one file.

## 1.3.18 (Nov 18, 2026): Later buys skip the stragglers of a crowded move
- [new] New setting, on by default for paper, live and every sub account: "Skip later buys that trail a crowded move". A later buy is passed when the other coins leaning the same way are already far past their targets (over 1.5 usual moves clear on average). In 90 days of quoted prices those buys won 91.7% and lost about 81¢ each; skipping them kept 88% of the later buys and made more in total. It only ever skips a trade.
- [new] Backtest and Labs: "Claude's pick, later watched, no stragglers" sits beside the plain version so the two can be compared.
- [improved] On the scanner, a row that is skipped for this reason no longer shows the green "buy now" and says why.

## 1.3.17 (Nov 18, 2026): "Buy now" goes out when the price leaves the band
- [fixed] A row could keep its green "buy now" (or blue "would buy") after the price had run past what the playbook pays, for example 99¢ against a limit under 95¢. The tag now also checks the current price against the running playbook's price band, so it drops the moment the price is out of range.

## 1.3.16 (Nov 18, 2026): The later-buy cushion setting sits with its switch
- [fixed] In Live settings, "Later buys need a cushion of at least" was further down the page among the rule settings and easy to miss. It is now directly under "Buy later-watched coins". In Paper settings it stays with the other rules.

## 1.3.15 (Nov 18, 2026): "Too close to call" comes first
- [fixed] A card still said "Settling · looks won" on a trade that finished 0.007% from its target and then settled lost. When Coinbase's last-minute average is within 0.1% of the target the card now always says "too close to call". Kalshi's price is only used to overrule a clear Coinbase result, because the price shown can be up to a minute old.

## 1.3.14 (Nov 18, 2026): Labs and Backtest as several accounts buying at once
- [new] Labs: "Accounts buying at once" (1 to 4). Every playbook is priced as that many accounts buying the same coin in the same second, at the average price across all of them, worked out from the order book saved with each trade. Figures stay per account. Your paper book is not changed.
- [new] Backtest: the same control. Each trade's price is raised by what the extra contracts cost, from this tracker's own order book measurements by coin.
- [improved] Later-watched and early buys now keep the ten best offers in the order book, so they can be priced for any number of accounts.

## 1.3.13 (Nov 18, 2026): Corrected figures on the later-buy cushion setting
- [fixed] The help text under "Later buys need a cushion of at least" quoted backtest figures that included the first minute after the trade check, which the playbook does not trade. It now shows the figures for 8 to 4 minutes left, with 1.25 added.

## 1.3.12 (Nov 18, 2026): The settling call listens to Kalshi
- [fixed] A card could say "Settling · looks won" on a trade Kalshi then settled as lost. The guess used only Coinbase's last-minute average; Kalshi settles on its own index across several exchanges. The call now goes with Kalshi's own price when it is decisive ("Kalshi has it lost" or "Kalshi has it won"), and says "too close to call" when Coinbase finished within 0.1% of the target.

## 1.3.11 (Nov 18, 2026): A cushion bar for later buys
- [new] New setting in Paper settings and Live settings: "Later buys need a cushion of at least". It only affects buys made after the trade check by Claude's pick, later watched. At 1 (the default) nothing changes. Raise it to skip the later buys that are only just clear of their target. A coin that passes under your bar is checked again each minute and bought if it clears the bar later in the window.
- [improved] Trade-check buys and the Labs record are not affected by this setting.

## 1.3.10 (Nov 18, 2026): Every coin gets its later check in a busy window
- [fixed] The later check read at most four coins a minute and always the same four, so with more than four coins in range the rest were never looked at. Coins not yet bought go first, and on the paid plan all nine are read each minute.

## 1.3.9 (Nov 18, 2026): Each account's stake on every board card
- [new] The "pays … if it wins, … if not" line on a board card is now a small table: one line for each account that holds the market (paper, Main, each sub account) with its own contracts, price, win and loss, and a total across the live accounts. It fills in as each account's order lands.

## 1.3.8 (Nov 18, 2026): Live later buys are labelled on the board
- [improved] A live position bought after the trade check now says "later watched" on its board card too, as it already did on the scanner.

## 1.3.7 (Nov 18, 2026): Coins skipped on a reading are watched after the trade check too
- [fixed] A coin priced 90¢ or more at the trade check that the playbook skipped on a chart reading was not read again afterwards, so it could never turn green or be bought later. Only a coin the running playbook actually passed at the check is left out now.

## 1.3.6 (Nov 18, 2026): Later-watched buys wait for the next trade check after a switch
- [fixed] After switching to Claude's pick, later watched, a later buy could be taken minutes afterwards in the window already running, though a playbook change is meant to apply from the next trade check. Later buys now start with the first window whose trade check ran on that playbook, on paper and live.
- [fixed] A later-watched card said "At the trade check" over readings taken when it was bought. It now says "When it was bought".

## 1.3.5 (Nov 18, 2026): Paper and live playbook tiles look different
- [improved] The paper tile is blue with a dashed edge and a "Paper · practice money" badge. The live tile is red with a solid edge, a red rail and a "Live · real money" badge, and turns grey with "Live · off" while live is off. The playbook keeps its own colour on the dot only.

## 1.3.4 (Nov 18, 2026): Notices can be dismissed
- [fixed] A pop-up notice could not be closed and covered the buttons under it for several seconds. Tap it, swipe it to either side, or use its x to clear it. The empty space around notices no longer blocks taps.

## 1.3.3 (Nov 18, 2026): Playbook picker sorted by results, one-step setup for later buys
- [improved] The playbook picker lists the running playbook first, then the rest by profit, best first. A playbook with no settled trades yet sits near the top with a "new" tag so it is easy to find.
- [new] Choosing Claude's pick, later watched for live now asks, right after it is saved, whether to turn on the later buys for Main and the sub accounts. Hold to confirm; saying no leaves it trading like Claude's pick at the trade check.

## 1.3.2 (Nov 18, 2026): Claude's pick, later watched can run on paper and live
- [new] "Claude's pick, later watched" can be picked as the paper or live playbook, for Main and for sub accounts. At the trade check it trades exactly like Claude's pick.
- [new] Paper: while it is the paper playbook, coins the trade check passed on are bought the first minute they pass the same test afterwards, from 8 minutes left down to 4.
- [new] Live: a new Live setting, "Buy later-watched coins", off unless you turn it on. With it on, and only while the account's playbook is Claude's pick, later watched, those later buys are made with real money. Size, daily stops, cash floor, window cap and price limits apply as at the trade check, and pausing automatic buying pauses these too.
- [improved] Live and paper rows bought this way are marked "later watched".

## 1.3.1 (Nov 18, 2026): Five playbooks retired from Labs
- [improved] Size follows the bank, Margin vs volatility under 96¢, Margin vs volatility + Learned, Margin vs volatility (AI checked) and Margin vs volatility, no late swing are archived. They no longer show in Labs, the Backtest or the playbook pickers. One that an account is still running stays visible until you switch it.

## 1.3.0 (Nov 18, 2026): Two new Claude's pick playbooks to test: early buy and later watched
- [new] Backtest: "Claude's pick, early buy" buys at minute 3 or 4 of the window when a coin already passes with a wide enough cushion, and otherwise waits for the trade check. A new "Early buy cushion" control lets you compare bars from 1 to 3 moves.
- [new] Backtest: "Claude's pick, later watched" adds the coins the trade check passed on that pass the same test afterwards, from 8 minutes left down to 4.
- [new] Labs: both playbooks now record on paper at the price the order book really gives for $50, so their live record can be held against the backtest. Labs only for now; they cannot be set as the running playbook yet.
- [new] The window bar marks the two early looks (minutes 3 and 4) with lit ticks and a line under the bar.
- [improved] The scanner's chart readings are taken whichever playbook is running.
- [improved] Both new backtests cover Aug 21 on and use quoted prices in whole cents, not fills.

## 1.2.99 (Nov 18, 2026): The window bar stays up while a trade is open
- [improved] The window bar (watching, holding, final minute, with the countdown) now stays at the top of the Live board all the time. It used to disappear as soon as a trade was open.

## 1.2.98 (Nov 18, 2026): Green "buy now" rows after the trade check
- [new] After the trade check, the scanner keeps reading coins the check did not take, each minute until 4 minutes are left. When the running playbook would buy one at its price right now, the row lights up green with a BUY NOW tag so you can buy it by hand. The tracker does not buy these.

## 1.2.97 (Nov 18, 2026): "Would buy" rows stand out on the scanner
- [improved] A row the running playbook would buy now has a bright blue frame that breathes, a lit background and a solid "WOULD BUY" tag, so it cannot be missed among the rows that only qualify on price.
- [improved] A row that is also a strong setup keeps the green treatment and carries the solid "WOULD BUY" tag as well.

## 1.2.96 (Nov 18, 2026): Final-minute view rebuilt so only the price and the average move
- [improved] The target is now a fixed line through the middle for the whole minute, with the winning side tinted green and the losing side red. Before, the view slid in, the price scale kept re-fitting itself and an amber line swung further off as time ran out.
- [new] Every second that has passed is a bar from the target to that second's price: green seconds help, red seconds hurt. The average Kalshi settles on is those bars evened out, drawn as one level line that moves less and less as the minute fills.
- [new] A strip of 60 cells under the chart fills in second by second, so you can count how much of the result is already decided.
- [new] One sentence says what it would take to change the result ("to lose, the last 20s would have to average $24.80 below the target"), how that compares with a usual move for the time left, and a plain verdict: all but locked in, holding, still open, needs a big move or out of reach.
- [improved] A large clock counts the seconds, and the headline says how far the average is on the winning or losing side.

## 1.2.95 (Nov 18, 2026): New window bar on the live board
- [improved] The window bar is rebuilt. It names the three stretches of a window (watching, holding, and the final minute Kalshi averages for the result), marks every minute, and shows one large countdown to whatever comes next: the trade check, then the settle.
- [fixed] For up to a minute after a window ended the bar sat full on the old window, because it took the window from the tracker's last read. It now works the window out from the clock, so it rolls over on the second.
- [fixed] Times on the bar used the device's own clock, which can be seconds off on a phone. When the device is more than 1.5 seconds out, the bar uses the server's time.
- [new] In the final minute the bar turns amber and says the result is the average of that minute, not the last tick.

## 1.2.94 (Nov 18, 2026): "Strong setup" rows light up on the scanner
- [new] A scanner row gets a breathing green frame, a band of light crossing it and a "Strong setup" tag when every reading lines up and you do not hold the coin yet: a cushion of 2 usual moves or more, a price from 85¢ to under 95¢, a win chance at least as high as the price, a path that is not a straight run, and at least three coins in four leaning the same way.
- [improved] The effect stops as soon as you hold the coin in any account or on paper, and when 20 seconds or less are left to buy. It stays still for anyone who has reduced motion switched on.
- [improved] It is a strong reading, not a promise: hover the tag to see the five checks.

## 1.2.93 (Nov 18, 2026): "Last 30 seconds" playbook in Labs
- [new] Labs playbook "Last 30 seconds". Thirty seconds before each close the tracker reads every coin's order book, and paper-buys the leader when $50 of it can be had at 90.5¢ to 94.5¢, a price that pays about $3 to $5. It counts a buy only when the book really held that much at that price.
- [new] Labs only for now: it cannot be picked for paper or live. The point is to see what is truly on offer at that moment before any money follows it.
- [improved] The readings are kept for leaders from 88¢ to 97¢, so the price band can be studied later without waiting again.

## 1.2.92 (Nov 18, 2026): Four readings on every scanner row and in the buy box
- [new] Cushion: how far the coin is past its target, counted in its own usual 10-minute moves. Under 1 means an ordinary swing could flip it; 2 or more is a wide cushion. It is the same measure the playbooks use.
- [new] Win chance: a model's chance the leader wins from here with the time left counted, next to Kalshi's price, marked cheap or dear when the two are more than 3 points apart. A model, not a promise.
- [new] Path: whether the coin got here in a straight run, steadily or choppily over the last 15 minutes. In the backtest the straight runs won least.
- [new] Coins: how many of the window's coins lean the same way, marked "split" when fewer than three in four agree.
- [new] The buy box for a hand buy lists the cushion, the win chance and the coins, and its warning now names what to weigh first: a thin cushion, a price under 85¢, a split window or a straight run.
- [improved] These are worked out on the page from Coinbase's live price, so they show before and after the trade check and on every coin, with no extra load on the tracker.

## 1.2.91 (Nov 18, 2026): Sell by hand from sub accounts when Main does not hold the market
- [fixed] A position held only by sub accounts had no Sell button. The sale price and the button were built on Main's position alone, so when a hand buy filled in the sub accounts and not in Main, there was no way to sell it from the dashboard. The Sell row now shows whenever any account holds the market.
- [improved] The confirm box lists the accounts that hold it, and says whose figures it is showing when Main is not one of them. Holding to confirm is unchanged.

## 1.2.90 (Nov 18, 2026): Today's record split into automatic and by hand
- [improved] The Today box on the live summary shows two lines where it had one mixed count: Automatic (settled, won, lost, result, and the trades the playbook passed on) and By hand (settled, won, lost, result). A loss on a buy made by hand no longer reads as the playbook's loss.

## 1.2.89 (Nov 18, 2026): A live trade's replay shows what it settled at
- [fixed] Under a settled live trade, "Settled at" showed a dash. It now shows the 60-second average Kalshi settled the market on, next to the target, so a close loss can be read at a glance. Trades settled in the last 24 hours are filled in on their own within a few minutes.
- [fixed] The result on that panel read "would have lost" for a real trade. That is paper wording. A live trade now shows its result in dollars.

## 1.2.88 (Nov 18, 2026): Automatic and by-hand buys apart on Trades and Analytics
- [new] The live orders list on Trades has three tabs: All, Automatic and By hand. Each shows its count, wins, losses and result for the day or range picked, and tapping one filters the list. The tabs appear once that day or range has a buy made by hand. Skipped and unfilled orders are the tracker's, so they sit under Automatic.
- [improved] On Live analytics, the three tiles (All live trades, Tracker bought, Bought by hand) now spell out wins, losses, the win rate, dollars won and dollars lost. Tapping a tile still filters every figure and chart on the page to that group.

## 1.2.87 (Nov 18, 2026): Scanner shows which leaders the running playbook would buy
- [new] Before the trade check, the scanner now tells two cases apart. Yellow "would take" with a yellow glow: the leader qualifies on price only. Blue "would buy" with the blue glow: it also passes the playbook that is running right now (live's when live is on, paper's otherwise).
- [new] Hover or tap-hold a yellow tag to read why the playbook would pass, in plain words.
- [improved] The line under the window timeline lists both groups: which coins would be bought now and which qualify on price only.
- [improved] The tracker takes the chart reading for this each minute before the trade check, only for leaders that qualify on price, and not in the last 50 seconds so it never competes with the trade check's own readings. With the plain rule running, every price qualifier is blue.

## 1.2.86 (Nov 18, 2026): Smooth scrolling and sheets, friends' account pictures
- [fixed] Scrolling and opening a sheet felt shaky, on the web most of all. The frosted-glass blur behind every card, the hero's panels, the side menu and the dark layer behind a sheet had to be worked out again on every frame. Those blurs are off. The top bar and the bottom tabs keep theirs. The page looks the same apart from the layer behind an open sheet, which is plain dark now.
- [fixed] Each time the page rebuilt itself it paused, long enough to feel on a phone. Most of that pause was formatting dates and dollar amounts from scratch, thousands of times. The formatting is now reused.
- [new] A friend's dashboard shows the pictures they put on their accounts. Both copies need this version, and the friend must be sharing their live account with you. Until their copy updates you see the default M, 1, 2.

## 1.2.85 (Nov 18, 2026): Sub accounts show their cash as fast as Main after a trade settles
- [fixed] Right after a win, Main's cash updated within seconds while each sub account's cash could sit on the old figure for up to a minute. The quick check that settles a trade seconds after its close read Main's balance again but left the sub accounts for the next minute run. It now reads theirs at the same moment.
- [improved] If Kalshi has not paid a sub account yet when that read happens, it is read again at the next minute run.

## 1.2.84 (Nov 18, 2026): "Try again for a missed fill" covers hand buys
- [fixed] With "Try again for a missed fill" on, a buy made by hand that got no contracts, or fewer than it wanted, was left as it was. The second try only ran for the trade check's own orders. A hand buy now looks at the book again and sends for the rest, up to twice within about two seconds.
- [improved] It never pays more than the price you confirmed, asks for whole contracts only, and does not go again if the offer has dropped more than 3¢ under the quote you saw.
- [improved] The message after a hand buy says when a second try filled the rest, or that it looked again and found nothing at your price. Each sub account follows its own setting.

## 1.2.83 (Nov 17, 2026): Top-up after a money move no longer refused
- [fixed] After money was moved out of a sub account, the account could stop with "could not move $… to the crypto shard: 400 insufficient balance". A move out brings the account's whole balance back from crypto trading first, and the next top-up then asked for all of it. A balance can hold a fraction of a cent and Kalshi reports it rounded, so asking for the full figure was refused. The top-up now leaves 2 cents behind.
- [improved] If Kalshi still says there is not enough, the balances are read fresh and it tries once more, leaving $1. An account shows an error for this only when its crypto side cannot cover the next order.
- [improved] The main account's own top-up leaves the same 2 cents.

## 1.2.82 (Nov 17, 2026): Account pictures, movable Home sections, a clearer Move money
- [new] Give an account its own picture. Open an account's sheet (tap its round badge or the ⋯ on its line) and choose "Add a picture". It is cut to a square and shows on the badge everywhere, on every device signed in to your dashboard. M, 1, 2 stay as the default, and "Use the default" brings them back.
- [new] On the web, the sections of Home can be moved. Press "Arrange" above the page, drag Summary, Accounts, Playbooks, Live board and Scanner to where you want them in either column, then "Done". The layout is remembered in that browser; "Reset layout" puts it back.
- [new] Move money works between any two accounts, including one sub account to another. Pick From and To, type an amount or tap a quick one, and the form shows what each account will hold afterwards before you confirm.
- [improved] A move between two sub accounts goes through the main account in two steps, because Kalshi has no direct move between them. If the second step is refused the money is left on the main account and the message says so.
- [improved] "Move money" is on the Accounts panel and on the main account's sheet too. Holding to confirm is unchanged.

## 1.2.81 (Nov 17, 2026): Accounts panel rebuilt
- [improved] The Accounts panel is one table now. Cash, Today, Won today and All time sit in the same place on every line, with the column names written once on top.
- [improved] Totals for all accounts lead the panel: cash, today's result, trades open now and the all-time result.
- [new] Won today shows the count with a bar, green for wins and red for losses.
- [improved] An account's status (Trading, Paused, Off) sits under its name with its playbook, so a long name no longer pushes it onto a second line.
- [improved] Move money and Settings moved behind the ⋯ button on each line (the same sheet the round badge opens), so the lines are not crowded with buttons. "Manage books" is now "Manage accounts".
- [improved] On a phone each account is a short card with four labelled figures.

## 1.2.80 (Nov 17, 2026): Quicker trade checks, a backtest on your own record, deeper record keeping
- [improved] The trade check reads each coin faster. It no longer asks Kalshi for the market list first (the minute scan already knows the market), and it asks Coinbase for the chart at the same moment as the order book, not after it. Orders go out that much sooner after the 10-minute mark.
- [new] Backtest has a second source, "This tracker's record": every playbook run over the leaders your own tracker recorded, at the prices its own order book reads gave. The published four-month history is still the default.
- [new] Backtest setting "Stop after losses in a day": 1 means one loss and that playbook is done until the next day. Use it with "Most trades a window".
- [new] "Export minute paths" on the Trades page: each settled trade of the last 7 days, one line a minute, with what your side would have sold and bought for and how far the coin was past its target.
- [new] Each trade check saves the ten best offers in the order book, and Room in the book (Analytics) gains a 1,000 contracts column.
- [new] For copies on Cloudflare's paid Workers plan, an optional PAID_PLAN setting (see wrangler.toml). With it, chart readings and price paths for past trades fill in within minutes, and every trade's minute prices are saved as they happen. Leave it out on the free plan; nothing changes there.

## 1.2.79 (Nov 17, 2026): Claude's pick in the Backtest, and seven playbooks archived
- [new] The Backtest page runs Claude's pick and Margin vs volatility, chart checked over the full four months. The history had no chart readings, so they were worked out for every trade from Coinbase's minute prices (9,334 of the 9,743 trades; the rest had gaps in the price history and are left out of these two).
- [improved] Archived, so they no longer show on the Labs page, the Backtest page or the playbook pickers: Kelly sizing, Skip 95¢ and up, 6 or more coins (and its under 95¢ version in the Backtest), Wait for the trend, Beats the market, Beats the market v2, Two moves clear. They are not deleted and keep their history; an account still set to one keeps running it and still shows it.

## 1.2.78 (Nov 17, 2026): W or L on skipped live orders
- [new] On the Trades page, a skipped live order and a no fill show how that market ended: W if the side you would have bought won, L if it lost. It appears once the market settles, for Main and every sub account.
- [improved] A skipped trade's detail says whether it would have won or lost.

## 1.2.77 (Nov 17, 2026): Every skip says why, in plain words
- [fixed] A card on the Live board could sit with no tag for a minute or two after the trade check, showing "winning" on a trade nobody took. The tag is now worked out at the trade check and shows straight away.
- [improved] A playbook skip names the check that said no and what that check is for: the price was over the playbook's limit, the coin was too close to its target, it had been too far on the wrong side, its last 15 minutes ran too straight, too few coins were moving together, and so on, each with the numbers.
- [improved] Live's own skips are spelled out too: a full window, a daily stop or target, a benched coin, an off hour, not enough cash, a price that moved past the order's limit. "Filtered out" is gone.
- [improved] "Not taken" now says which it was: over live's maximum price, under its minimum, or not one of live's coins. A no fill says the top price it would pay and the price right after.
- [improved] The same wording shows in a trade's detail on the Trades page and on the account cards.

## 1.2.76 (Nov 17, 2026): Second try after a sliver fill
- [fixed] When an order fills only a fraction of one contract (0.02 of 54), "Try again for a missed fill" now asks for the whole contracts still wanted. It would have asked for 53.98.
- [fixed] A fill built from two tries shows as 52.02 contracts, not 52.019999999999996.

## 1.2.75 (Nov 17, 2026): Header win count matches the trades
- [fixed] The Mode tile could show a loss on a day with none. It counted a trade as won only if it made money, so a small part fill that settled a winner but made $0.00 after the fee read as lost. It now counts what settled your way, the same as the Trades page.

## 1.2.74 (Nov 17, 2026): Try again for a missed fill
A new live setting for orders that miss because the price ticked over your top price just as they arrived.
- [new] "Try again for a missed fill" in Live settings, off unless you turn it on. A short order is sent again for the contracts still wanted, once straight away and once about 4 seconds later.
- [new] The top price never changes on a second try, so it cannot pay more than the first order was allowed to. It does not go again if the price has fallen more than 1¢ under the price first read.
- [improved] Works on Main and on sub accounts, and a trade's detail says when some of it filled on a second try.

## 1.2.73 (Nov 17, 2026): iPad layout fixed
- [fixed] On an iPad held upright, the Accounts rows stacked their cash, today and all-time figures on top of each other. Two layouts were both applying at that width; the rows now follow the panel's own width.
- [fixed] The header tiles on an iPad are two across like on a phone, so Cash no longer sits on top of "Live today".
- [improved] The five live stats sit in one row on an iPad instead of wrapping unevenly.

## 1.2.72 (Nov 16, 2026): Smooth scrolling on phones
The dash stuttered while scrolling on a phone. Found and fixed the causes.
- [fixed] The whole page was rebuilt every 10 seconds, changed or not, which froze it for a moment and broke a swipe in progress. It now skips a rebuild when nothing changed, and never rebuilds while your finger is down or the page is still gliding.
- [fixed] The light that follows the mouse over cards was also running under a finger, on every movement of a swipe. It is mouse only now.
- [improved] The live charts pause their half-second redraw while the page is moving, and read the theme colours once every few seconds instead of for every chart.
- [improved] Lighter effects on phones: no blur behind the Today card, and the final-minute glow no longer repaints the card's shadow.

## 1.2.71 (Nov 16, 2026): An account only says Paused when it is
- [fixed] An account showed PAUSED whenever its playbook had passed on one coin, even with trades open. Only a day-long stop (loss cap, target, give-back, drawdown, low cash) pauses an account now.
- [improved] A pass on one coin shows as a grey note for that window and clears when the window closes.

## 1.2.70 (Nov 16, 2026): Skip tags name the real reason
- [fixed] A skipped trade always read "1.00 moves clear, needs 1", even when a chart check had turned it down. The tag now says which check failed: too straight a last 15 minutes, too far on the wrong side, a late swing, or too few coins leading the same way.
- [fixed] A moves figure just under its bar (0.996) no longer rounds up to the bar; it keeps a third decimal.

## 1.2.69 (Nov 16, 2026): "Not trading right now" no longer sticks
- [fixed] A reason for passing on one coin (a full window, a benched coin, a price over your limit) stayed up as "Not trading right now" until the next order, so the dash looked frozen. It now clears when that window closes.
- [improved] While it shows, a one-window reason reads as a quiet note ("This window: passed on a coin...") instead of a red warning. Day-long stops still show in red.

## 1.2.68 (Nov 16, 2026): Final minute view
When a trade has under a minute left, its chart zooms in to the 60 seconds that decide it.
- [new] The chart eases in to the final minute: the price second by second, the settle average as it builds, and the target.
- [new] An amber line shows the level the rest of the minute would have to average for the result to change, with your cushion (or how far short you are) and the seconds left.
- [new] The card glows while it is in its final minute, the "60s avg" figure becomes the settle average so far, and the view stays up after the close with how far ahead or behind it settled.
- [improved] The same view shows in the coin box.

## 1.2.67 (Nov 16, 2026): New playbook: Claude's pick
The best setup found in testing, as one playbook you can pick for paper or live.
- [new] Claude's pick buys leaders under 95¢ that are at least one usual move clear of their target, and skips a last 15 minutes that ran in a near-straight line (a stricter bar than chart checked) or a coin that was 2 or more usual moves on the wrong side in the last 30 minutes.
- [new] It shows in Labs beside the others, with its history filled from the trades already recorded.

## 1.2.66 (Nov 16, 2026): Paper home rebuilt to match
- [improved] The paper panel now uses the same layout as the live one: status chips with your playbook, the paper bank as the one big figure, a Today card with the profit target inside it, and a ledger row (Started with, Bank now, This run, Trades) in place of the sentence.

## 1.2.65 (Nov 16, 2026): Live home rebuilt
The live account panel was rebuilt so it reads top to bottom: status, cash, today, all time, stats.
- [improved] One big cash figure for every account, with each account's cash and today's result under it. The floating all-accounts box is gone.
- [improved] Today has its own card with settled, won, lost and passed counts and the profit target inside it.
- [new] A ledger row in place of the sentence: Put in, Worth now, All time, Trades logged, with Money in beside it.
- [improved] Status reads as chips (live on or off, size, accounts trading) and errors get their own line.
- [fixed] The cash figure and Worth no longer blank to a dash for a minute after a change or an update; the last known cash is kept.

## 1.2.64 (Nov 16, 2026): Done closes Money in
- [fixed] Done in the Money in box did nothing; it closes the box now.

## 1.2.63 (Nov 16, 2026): Leave old deposits out
- [new] Each deposit or withdrawal from Kalshi in Money in has a Leave out button, for money from before you started tracking. Left-out entries stay in the list, dimmed, with Count it to bring them back.

## 1.2.62 (Nov 16, 2026): Deposits read from Kalshi
- [new] The tracker reads your deposits and withdrawals from Kalshi every 6 hours, so "Put in" fills itself. Money in has a Check Kalshi now button.
- [improved] When Kalshi shares the list it replaces any you typed in; your own entries stay as a fallback if it can't be read.
- [fixed] A missing space before "Put in".

## 1.2.61 (Nov 16, 2026): Your result against what you put in
The live account can now show where you stand all time, counting your deposits and withdrawals.
- [new] Add deposits on the Live home, under the all-time line. Enter each deposit or withdrawal once and the line reads "Put in $750, worth $802 now, +$52 all time".
- [new] Worth counts the cash in every account plus open trades at what they cost, so a trade in play doesn't read as a loss.

## 1.2.60 (Nov 16, 2026): Early pack starts clean
- [fixed] Early pack's Labs line now starts at 1.2.59. Older trade checks only kept coins at 85¢ or more, so its line was scoring a thin 85¢ to 90¢ slice, not the playbook.

## 1.2.59 (Nov 16, 2026): New playbook in Labs: Early pack
A playbook built from your own winning hand buys, tracked in Labs from today.
- [new] Early pack buys the leader at 60¢ to 90¢ at the trade check, only when at least 3 coins lead the same way, before 9 PM ET, and never HYPE. It runs in Labs only for now, next to the other playbooks.
- [improved] The trade check now keeps every coin led at 60¢ or more, so Labs can score cheaper leaders. Paper and live still use their own price bands.

## 1.2.58 (Nov 16, 2026): Export your live trades
Hand buys now save the chart readings from the moment you buy, and the Live board can export every live trade to a CSV file.
- [new] Export CSV on the live accounts bar downloads every live trade with a fill, Main's and every sub account's, with its result and readings.
- [improved] A hand buy on Main saves the move readings (moves clear, trend line, likely line, wrong side depth, straightness) when the order goes out.
- [improved] Older hand buys get their readings filled in from price history, a few at a time in the quiet minute.

## 1.2.57 (Nov 16, 2026): The chart-reading fill-in moves again
- [fixed] Filling in past trades' chart readings (for no late swing and chart checked) stalled around Nov 15. It ran last in a busy minute, and when the tracker had already used up the calls Cloudflare allows one run, that counted as a failed try on a trade: two of those and the trade was dropped, one per pass. It now runs first in its quiet minutes, running out of calls simply ends the pass, and trades dropped that way get another chance.
- [new] The Labs caption shows the progress: how far back the chart readings are filled and how many older trades are still to go.

## 1.2.56 (Nov 16, 2026): No late swing and chart checked now show in Labs
- [fixed] The two new playbooks drew no line in Labs. The Labs comparison works from its own copy of each trade, and that copy did not carry the new chart readings, so both playbooks treated every trade as having no reading. The readings were being recorded all along, so both lines appear at once with every trade that has them, and keep growing as older trades are filled in.

## 1.2.55 (Nov 16, 2026): New playbook, Margin vs volatility, chart checked
- [new] A Labs playbook that takes Margin vs volatility under 95¢ but skips two chart shapes that tended to snap back in testing: a coin that was 1.7 or more usual moves on the wrong side of its target in the last 30 minutes, and a coin whose last 15 minutes were a near-straight run. Over Sep 8 to Nov 16 it made $0.95 a trade against $0.59 for Margin vs volatility under 95¢, more in total on 30% fewer trades, with the worst day about half as deep.
- [new] Every trade now records both shapes. Trades from the last three weeks are filled in from Coinbase's history over the next hours, so the Labs card builds a history without waiting. "No late swing" stays as it was.

## 1.2.54 (Nov 16, 2026): New playbook, Margin vs volatility, no late swing
- [new] A Labs playbook that takes Margin vs volatility under 95¢ but skips coins whose lead is mostly new: 20 minutes before the trade check they were on the other side of the target by at least half of what they now lead by. Over Sep 6 to Nov 15 those coins made $0.41 a trade against $0.94 for the rest, and leaving them out helped in both halves of that stretch. Over Nov 12 to 16 they won 83% and lost $4.95 a trade.
- [new] Every trade now records how much of its lead is new. Trades from the last three weeks are filled in from Coinbase's history over the next hours, so the Labs card builds a history without waiting.

## 1.2.53 (Nov 16, 2026): Hand buys get their replay under Trades
- [fixed] A trade bought by hand in a market the tracker had not recorded (under 85¢ at the trade check) showed no target and no "How it played out" replay under Trades, because both came from the tracker's own record of that market. Hand buys now keep the market's target, title and settled value themselves, for Main and the subaccounts.
- [improved] Hand buys from the last week that are missing them are filled in from Kalshi over the next few minutes, a few at a time, so their replays appear too.

## 1.2.52 (Nov 15, 2026): Buy either side from the coin box, all on one screen
- [new] The coin box offers Buy YES and Buy NO side by side, each with its price and what it pays if it wins. The leader is on the left.
- [improved] The AI read looks at whichever side has the better chance, so it can say "Would buy NO" when the leader is YES and fading.
- [improved] On phones the box fits the screen: Close is an x in the header, the chart and tiles are shorter, the earlier 15 minutes sit in one line, and the buy and sell area is pinned to the bottom of the box so it stays in view.

## 1.2.51 (Nov 15, 2026): Fewer calls to Kalshi, and no error when it asks to slow down
- [fixed] A book could show "balance check failed: 429 too many requests". Kalshi turns requests away for a moment when too many arrive at once, and two of tonight's additions asked more often: the scanner refresh read the nine markets one by one, and every held card asked for a sell quote every 6 seconds from every open device.
- [improved] The scanner refresh is now one request for all nine markets, at most every 15 seconds. Sell quotes on the cards come every 10 seconds, and the order book behind them is shared for 4 seconds, so several devices watching the same position cost one read.
- [improved] If Kalshi does ask to slow down, a book or the main account keeps its last balance and reads again the next minute, with no error on the row.

## 1.2.50 (Nov 15, 2026): AI read in the coin box, and boxes no longer jump
- [new] The coin box has an AI read above the buy button: "Would buy" or "Would pass", with the reason in one line. It needs a win chance of 90% or more and for that chance to beat Kalshi's price plus the fee. The win chance is the more cautious of two estimates: the board's win chance and the likely line's.
- [new] "What it looked at" opens the checklist: win chance, whether it beats the price, how many usual moves the coin is clear of its target, how many coins lead the same way, and where the trend and likely lines land.
- [fixed] Boxes could jump or flash on screen. A leftover trick for iPhone's keyboard put a transform on the whole page for one frame, which makes every fixed box lay out against the full page for that frame. It is gone.

## 1.2.49 (Nov 15, 2026): Scanner prices do refresh every 10 seconds now
- [fixed] 1.2.48 was meant to refresh Kalshi's prices on the scanner about every 10 seconds while Home is open. A mistake in the check for "is Home open" meant it only happened with a coin box open, so the scanner kept showing prices up to a minute old: a row could say 61¢ while the buy box, reading fresh, said 74¢. Home now gets the fresh prices as intended.
- [improved] When a scanner row's price is 20 seconds old or more, the buy line says so ("price read 40s ago"), so an old price cannot pass for a current one.

## 1.2.48 (Nov 15, 2026): Every coin stays quick to read on phones
- [improved] On phones the coins you do not hold are back on Coinbase's every-trade feed, read three times a second, where 1.2.46 had slowed them to once every 5 seconds. Coins you hold, or whose box is open, still get every trade.
- [new] Kalshi's own prices on the scanner (the YES and NO cents on each coin) were read once a minute. While Home or a coin box is open they are now refreshed about every 10 seconds, and position cards use the same fresher prices.
- [improved] The battery savings that mattered most stay: no drifting background or blur behind cards on phones, charts off screen are not drawn, and nothing runs in the background.

## 1.2.47 (Nov 15, 2026): The card's sell price matches the sell box
- [fixed] A position's card could read "Sells now for about 78¢" while the sell box, opened a second later, said 50¢. The card used the tracker's last reading of the market, up to a minute old; the box reads Kalshi's order book fresh. When a coin crosses its target those can be far apart. The card now gets the same fresh quote as the box every few seconds while it is on screen, so the two agree.
- [improved] Until the first fresh quote arrives, the card says its figure is the tracker's last reading and may be up to a minute old. It also says when only part of the position has buyers, or when nobody is buying.

## 1.2.46 (Nov 15, 2026): Easier on the phone's battery
- [improved] On phones the dashboard no longer keeps the screen redrawing all the time. The background and the hero glow stop drifting, and cards, tiles and chips are plain translucent panels (the top bar and bottom menu keep their frosted look).
- [improved] On phones Coinbase's every-trade feed is now used only for coins with an open position or an open coin box; the other coins update every 5 seconds. The Cockpit still gets every trade.
- [improved] Charts that are scrolled off the screen are not redrawn, and nothing runs while the app is in the background: the price feed closes and reopens when you come back. Desktop is unchanged.

## 1.2.45 (Nov 15, 2026): Pause automatic buying, keep trading by hand
- [new] The Live account tab has a "Pause automatic buying" button. While paused the tracker places no buys at the trade check, for Main and every subaccount, and live stays on so you can still buy and sell by hand on the Live board.
- [new] The header and the Live pill read "Live · by hand only" while it is paused, and each market the tracker left alone is tagged "automatic buying is paused" on the board.
- [improved] Pausing takes one tap. Resuming asks for a hold, since the tracker starts buying with real money again at the next trade check. Positions already open settle as usual.

## 1.2.44 (Nov 15, 2026): Margin vs volatility (AI checked) rebuilt on what tested well
- [improved] The AI checked playbook now takes Margin vs volatility under 95¢ only when the coin is at least 1.5 moves past its target and at least 3 coins are leading the same way. Tested on every market from Sep 6 to Nov 15: 95.4% won and $1.18 a trade against 94.1% and $0.81, with about a fifth of the losses and a worst day about half as deep, on roughly a quarter of the trades and 40% of the total profit.
- [improved] The first version (the trend line and the likely line both agreeing) was dropped as a filter after the same test: the likely line never changed a decision, and the trades the trend line threw away did better than the ones it kept. Both lines stay on the charts and are still recorded on every trade.
- [improved] The playbook's Labs card has its history at once, since both checks use readings every recorded trade already has.

## 1.2.43 (Nov 15, 2026): The bottom menu stays at the bottom on iPhone
- [fixed] On iPhone the bottom menu could end up floating in the middle of the screen. iOS sometimes leaves the app's fixed layer at the height it had with the keyboard up. The dashboard now measures that gap, makes iOS work the layer out again, and until it has, moves the menu down to the true bottom itself. It checks after typing, when you come back to the app, after a touch and every few seconds.

## 1.2.42 (Nov 15, 2026): Analytics splits hand buys from the tracker's own
- [new] Live analytics has three tiles under the header: All live trades, Tracker bought and Bought by hand, each with its result, trade count, win rate and average per trade for the range. Tap one and every figure and chart on the page shows only those trades.
- [improved] The tiles appear once there is at least one hand buy in the range. Hand buys made before today are already marked, so the split covers them too.

## 1.2.41 (Nov 15, 2026): The coin box holds still
- [fixed] On the web the coin box could jump up and down each time its figures refreshed. It was centred on the screen, so any change in its height moved the whole box. It now hangs from the top and the lines that vary in length keep room for two, so a refresh no longer moves it.

## 1.2.40 (Nov 15, 2026): Accounts panel tidied on the web
- [fixed] On the web the account rows ran past the edge of the panel: the arrow sat outside the card and the playbook line wrapped onto four lines. The row now lays itself out from the panel's own width, not the browser's.
- [improved] In a mid-width panel each account is a two-line card: name, cash, today, all time and the sparkline across the top with dividers between the figures, then the playbook and size on the left of a second line with the buttons on the right. The all-accounts totals sit in their own framed box. Phones are unchanged.

## 1.2.39 (Nov 15, 2026): New playbook, Margin vs volatility (AI checked)
- [new] A new playbook in Labs: Margin vs volatility under 95¢, taken only when both chart lines agree at the trade check. The trend line (the 15 minutes before the window plus the window so far, carried to the close) and the likely line (the last 3 minutes' pace, fading) must each finish on the side being bought.
- [new] Every trade now records where those two lines pointed at the trade check. Trades from the last three weeks are filled in from Coinbase's history over the next hours, so the playbook's Labs card builds a history without waiting.
- [improved] Both lines are formulas on Coinbase's minute prices. The name is the one asked for; there is no separate AI model behind it.

## 1.2.38 (Nov 15, 2026): One trend line across both windows
- [improved] The trend line on the coin view and the Live board cards is now a single line: fitted from the start of the previous 15 minutes through the current price, and carried on to the close. Before, one line stopped where this window began and a second started from the last 3 minutes, so the first minutes of a window had no line at all.
- [improved] The tiles follow it: "Trend since 3:15 PM" and "On that trend by the close". The amber likely line still works from the last 3 minutes' pace and is there from the first second of a window.

## 1.2.37 (Nov 15, 2026): Boxes stay on screen and the bottom menu comes back
- [fixed] On iPhone a tall box such as the coin view could open with its top cut off above the screen. Boxes are now sized from the space they actually have, scroll inside themselves, and keep clear of the notch and the home bar.
- [fixed] The bottom menu could stay hidden after the keyboard had been up. It now checks several times after a field loses focus and keeps checking until the menu is back.
- [fixed] Opening the keyboard gave the whole page a layout meant for a row of chips in the subaccount books (two things shared one name), which could shift the page while typing.

## 1.2.36 (Nov 15, 2026): Profit target shows what is made and what is left
- [improved] The profit target panel on the hero now reads, for example, "+$16.17 made · $83.83 left", where it used to show only the amount to go.

## 1.2.35 (Nov 15, 2026): Live board charts get the 15 minutes before, the trend and the likely line
- [new] Every position card on the Live board now charts the same way as the coin view: the previous 15 minutes on the left with its trend line, the straight trend line from the last 3 minutes carried to the close, and the amber likely line with its range.
- [improved] The earlier prices are fetched once a coin a window and shared between the board and the coin view.

## 1.2.34 (Nov 15, 2026): Hand buys settle on Trades
- [fixed] A position bought by hand in a market the tracker had not recorded (under 85¢ at the trade check) stayed "open" on Trades after the market closed. Kalshi had paid it out; the dashboard never closed its own row, so the day's result left it out. Any live position past its close is now looked up directly, for Main and the subaccounts, and positions already stuck are closed on the next pass.

## 1.2.33 (Nov 15, 2026): Hand buys show on the Live board
- [fixed] A market bought by hand that the rule had not taken did not appear on the Live board, so the header could say "1 open" over a board saying "Nothing open". On the Live view the board now lists every open live position, Main's and the subaccounts', with its chart, Sell button and "Add to it".
- [improved] The window line counts hand buys too, as in "0 taken this window · 1 by hand".

## 1.2.32 (Nov 15, 2026): The dashboard tells you when a newer version is ready
- [new] An open dashboard kept running the version it loaded, so a new feature could be missing until you refreshed by hand. It now checks every 2 minutes and when you come back to it, and shows a "New version ready · tap to refresh" pill at the top. It never refreshes by itself, so nothing you are in the middle of is lost.

## 1.2.31 (Nov 15, 2026): A likely line beside the trend line
- [new] The coin view draws a second, amber line: where the coin is likely to be by the close. The straight trend line carries the last 3 minutes' pace all the way; the likely line lets that pace fade, and the shaded band around it is the coin's usual minute-to-minute swing over the time left.
- [new] A "Likely by the close" tile gives that price, its range, and the rough chance the close lands on your side of the target. It is an estimate from the coin's own recent moves, not a prediction to rely on.

## 1.2.30 (Nov 15, 2026): Hand buys and sells pick their accounts
- [new] Buying by hand now asks which accounts: a tick box for Main and each trading subaccount, all ticked to start. Every account buys at the same top price, each at its own size. An account that cannot take it (no cash, loss cap hit, already holds it) is greyed out with the reason.
- [new] When Main already holds a market that a subaccount does not, its card shows "Add to it" to buy the same side in the subaccounts.
- [new] Selling by hand lists every account holding the market, so one sell can close it everywhere or only where you tick.
- [improved] A hand buy for a subaccount always goes with Main (or adds to a market Main already holds), so the Sell button on the card covers it.

## 1.2.29 (Nov 15, 2026): The 15 minutes before, on the same chart
- [improved] The coin view now draws the previous 15 minutes on the left of the live chart, not in a second chart under it: one continuous line across both windows, the earlier stretch dimmer with its own trend line. The target, the win and lose shading and the bought marker stay inside the current window. The summary of the earlier 15 minutes sits in one line under the chart.

## 1.2.28 (Nov 15, 2026): The coin view shows the 15 minutes before
- [new] Tap a coin on the board and the box now has a second chart under the live one: what the coin did in the 15 minutes before this window, with its trend line. The line above it says how far it moved, the trend per minute, and whether it ended above or below where it began.

## 1.2.27 (Nov 15, 2026): Each subaccount can have its own live settings
- [new] Live settings has an account switch: Main and each subaccount book. Pick a book and the same page shows and saves that book's own rules: cash out when the trend turns, stops and profit target, schedule, coins, price band, trades a window, price room, and its size, loss cap and cash floor.
- [new] A book follows the main account until you save a rule change for it. From then on it keeps its own copy and Main's changes no longer reach it. "Follow Main again" on the book's settings drops its copy.
- [improved] A book with its own coins or prices now takes trades Main passes on, and passes ones Main takes. Its account ring uses its own daily profit target. The book's quick settings box links to its full live settings.

## 1.2.26 (Nov 15, 2026): Second look summary and chart
- [new] The Second look section on Labs opens with "If we had taken them": 24H, 7D and All, each with the money, wins and a running-total chart. One line is every coin the second look passed, bought on the leader's side at the last price seen. The other is the side each coin's trend line pointed to at the last look. Paper size, fees in.
- [improved] The tally is kept for good, where the table below only holds the last hour. It starts counting from this update, so 7D and All fill in over the coming days.

## 1.2.25 (Nov 15, 2026): A book passes cleanly when it cannot cover a trade
- [improved] A subaccount book that does not have the cash for its full trade size now passes on that trade with a plain note, such as "cash $44.00 does not cover a $50 trade". Before, the order went to Kalshi, was refused, and the book showed an error. Money already set aside for the book's other orders in the same window is counted.

## 1.2.24 (Nov 15, 2026): Books no longer run out of calls
- [fixed] A book could show "balance check failed: Too many subrequests". Each balance check had grown to three calls to Kalshi per account every minute, which could use up what Cloudflare allows one run. A quiet minute is back to one call per account; the split between the main balance and crypto is read again only when the total changes, after a fill, settle or transfer, or every 10 minutes.
- [improved] If a run does use up its calls, the book keeps its last figures and reads again on the next run, with no error on the row. A balance error also clears as soon as the next read works.

## 1.2.23 (Nov 15, 2026): A book's cash shows right after an update
- [fixed] After each update a subaccount book showed a dash for its cash for a minute or so, and the all-accounts total left it out. A book now keeps its last known balance and shows it until the fresh one arrives.

## 1.2.22 (Nov 15, 2026): All-accounts box on the live hero, ring shows the profit target
- [new] With a subaccount, a floating box beside the live hero's cash figure gives the totals across accounts: all cash, today's result, how much is on crypto and how many accounts are trading. The hero's own figure is labelled Main, so the main account's cash no longer reads as the whole balance. Tap the box to jump to the Accounts panel.
- [improved] The ring on each account badge is now the daily profit target: it fills green as the account's result for the day climbs toward the target and closes into a full circle when the target is hit. A losing day fills red toward that account's daily stop. With no target set it shows the share of trades won.
- [improved] The header tile is back to its normal height; its corner still shows every account's cash added up.

## 1.2.21 (Nov 15, 2026): Account badges, totals across accounts, and a balance fix
- [fixed] With a subaccount funded, the main account could show more "on crypto" than it had in cash, because Kalshi's figure counted the subaccount's money too. The main account now shows, and sizes its top-ups from, its own money only.
- [new] Each account in the Accounts panel has a ring badge: the ring is today's record (green for won, red for lost) and a dot pulses while the account is trading. Tap the badge for the account's sheet: cash, how much is on crypto trading, today, all time, open trades, a larger line of the day, and its actions (Move money, Settings, Turn on or off, See trades).
- [new] With a subaccount, the header's cash is every account's cash added up, with a line for today's result across accounts and how much of the cash is on crypto. The big number and the target bar are still the main account's.
- [fixed] Long playbook names and the lines under each figure in the Accounts panel were cut off on phones. They wrap now.

## 1.2.20 (Nov 15, 2026): Books can fund their own trading balance
- [fixed] A subaccount book showed ERROR and placed no trades because it could not move its cash to its crypto trading balance. Kalshi takes that request in a different form for a numbered subaccount than for the main account, and the book was sending the main account's form.
- [improved] When an account in the Accounts panel is in error or paused, the reason is written on its row. Before, it was only in a hover tip, which a phone cannot show.

## 1.2.19 (Nov 15, 2026): Accounts view for subaccounts
A proper home for subaccount books on the dashboard and in Trades, on web and phone. It only appears once you have a book.
- [new] Accounts panel under the live hero on Home: the main account and every book in one list, each with whether it is trading, its playbook and size, cash (and how much is on crypto), today's result and record, all time, open trades and a small line of the day. Cash and today's result across all accounts are on top.
- [new] Tap an account to open its trades. Books have Move money and Settings right on their row.
- [new] Trades, Live: an account filter (All accounts, Main, each book) with that account's count and result for the day. All accounts merges them by market, keeps the line per account under each trade, and marks a trade only a book took. Picking one account shows only its orders, and a row opens the order's story.
- [new] Live board cards say which books hold that market too, with contracts and price.
- [fixed] The $ sign sat on top of the number in the Move money amount box.

## 1.2.18 (Nov 15, 2026): Live orders refused after funding a subaccount
- [fixed] After money was moved into a subaccount, the main account's orders could all be refused and the dashboard showed "could not move $600.00 to the crypto shard: insufficient balance". The tracker read how much sat on each of the account's two balances from a Kalshi figure that can count the subaccounts' money too, so it kept asking to move more than the main account had and the crypto trading balance stayed empty. It now asks Kalshi for each balance of each account by itself.
- [fixed] Subaccount books could not see their own two balances at all (Kalshi leaves that figure out for a key locked to one subaccount), so a book never moved money to its crypto trading balance and its orders had no cash behind them. Books now read both balances the same way.

## 1.2.17 (Nov 15, 2026): Moving money into a book waits for the cash to land
- [fixed] Moving money into a subaccount book could still be refused after the cash was brought back from the crypto trading balance. It now waits for Kalshi to show the money on the main balance before sending it on, and says so if it has not landed yet.
- [improved] If Kalshi refuses a move into a book, the message includes what Kalshi shows on the main and crypto trading balances.

## 1.2.16 (Nov 15, 2026): See and move your two Kalshi balances
- [new] The Live account page has a "Where your Kalshi cash is" card. It shows the main balance (deposits, withdrawals and moves to subaccount books use it) and the crypto trading balance (what live orders spend), with what each is for.
- [new] Move money between the two from the card: pick an amount, then hold to confirm. It stays inside your own Kalshi account. With live on, the tracker still refills the crypto side before a trade check if it runs low.
- Adding money by card or Apple Pay cannot be done from the dashboard. Kalshi only takes deposits in its own app and site, so the card links there.

## 1.2.15 (Nov 15, 2026): Moving money into a book works when cash is on the crypto side
- [fixed] "Move money" into a subaccount book was refused with "insufficient balance" even with plenty of cash. Kalshi only moves money to a subaccount from the main account's main balance, and live keeps most of the cash on the crypto trading balance. The shortfall is now brought back from there first, then moved. If there is not enough in total, it says how much can move.
- [improved] Kalshi's refusals on transfers show the reason first and the code after it, so "400" no longer reads like an amount.

## 1.2.14 (Nov 15, 2026): Subaccounts follow the main account
For trading the same rules on the main account and its subaccount books.
- [new] When you change the main live account's playbook, size or daily loss cap, the dashboard asks whether to apply it to every subaccount book and lists what would change in each. Hold to apply. "Match main account" on the Books page does the same at any time. Each book keeps its own cash floor and its own on or off switch, and no money moves.
- [new] In Trades, each live trade has a line underneath for every account that looked at that market: how many contracts it filled and at what price, the result, or why it has nothing (skipped, refused, no fill).
- [new] The live dashboard's top line names the accounts that are trading right now and how many books are off.
- The rule settings (coins, price band, schedule, window cap, profit target, price room) were already shared by every book, and each account's orders already go out on their own, so a miss on one account does not hold back another.

## 1.2.13 (Nov 15, 2026): Buy and sell by hand on paper
The scanner's Buy and Sell now work on the Paper view too, with practice money.
- [new] On Home's Paper view each scanner card has a paper Buy at the price now and your paper size. It goes into the paper book past your paper rules and stops, the same way a hand buy on live skips them. Nothing is sent to Kalshi.
- [new] Any open paper position, the rule's or one you bought by hand, has a Sell on paper row on its board or scanner card showing what it sells for now. The paper book then scores that trade at the sale price in place of the settlement.
- [new] The coin chart you get by tapping a scanner row has the same paper Buy or Sell on the Paper view.
- Hand trades show in Trades as bought or sold by hand, and they do not count toward the rule's analytics or the labs.
- [fixed] "Could not move $600.00 to the crypto shard: 400 insufficient balance" on the live card. The top-up worked from balances up to a minute old. It reads them fresh now, and stays quiet when the trading balance already covers the next order.

## 1.2.12 (Nov 15, 2026): Hand trading only on the Live view
- [fixed] The scanner's Buy row also showed on Home's Paper view and placed a live order from there. Buying and selling by hand now show only when Home is switched to Live. On the Paper view the coin chart still opens and says where to find them.
- [new] Live's Today line shows how many markets the live playbook passed on today and how they went, like paper's does, for example "6 passed (5-1)".
- [improved] On a phone the second look list in Labs is stacked rows instead of a wide table, so there is no sideways scrolling and it no longer jumps back to the left.

## 1.2.11 (Nov 14, 2026): Board clock no longer overlaps
- [fixed] Near the end of a window the clock above the live board's timeline ran into the window's times and stuck out past the edge. It now has its own line and stays inside the card.

## 1.2.10 (Nov 14, 2026): Second look shows how every row ended
The second look table in Labs now scores every coin, whatever its price.
- [new] Result at that price: once the window settles, each row shows whether its side won and the money a paper-size buy at the last price seen would have made or lost, fees in. Before this, rows under 85¢ never showed a result.
- [new] Trend line pointed to: at the last look of each window (4 to 5 minutes left) the coin's last five 1-minute prices are fitted with a straight line and carried to the close. The row shows the side that line lands on, that side's price then, the pace, and what buying it would have paid.
- These are what-ifs for the rows it passed on. Rows it bought show the real result.

## 1.2.9 (Nov 14, 2026): Tap a coin for its live chart
Tap or click any coin in the scanner to open its live chart, with a trend line and the Buy or Sell button.
- [new] The chart shows the coin against its target for the whole window, with a dashed trend line fitted to the last 3 minutes and carried on to the close.
- [new] Under the chart: the price now and how far it is from the target, the trend per minute and whether it is moving toward or against the leader, and where the coin lands by the close at that pace.
- [new] If live does not hold the market, the chart has the Buy row. If live holds it, it shows the position and the Sell row. Both use the same check and hold-to-confirm as before.
- [fixed] "Upgrade to Advanced" failed with "400 invalid_content_type". The request is now sent the way Kalshi expects.

## 1.2.8 (Nov 14, 2026): Cleaner header on desktop
The four boxes at the top of the desktop dashboard are now one panel.
- [improved] Mode, today's result, cash and paper sit in one panel split by thin lines, with labels, numbers and footers lined up and room above and below. The Mode cell carries the account's color and its chart for the day.
- [improved] The cash cell shows your live size and daily loss cap, the paper bank shows its all-time result, and win rate shows the trade count, so no cell is half empty.
- [improved] On narrower windows the panel takes its own row under the title so nothing is cut off. Search is an icon until the window is wide.
- The phone layout is unchanged.

## 1.2.7 (Nov 14, 2026): Buy a coin by hand
When your rules pass on a market you still want, like a coin that only took a clear lead after the trade check, you can buy it from the scanner.
- [new] With live on, each card in the scanner shows its leader's price now, your live size and what it pays if it wins, with a Buy button. Nothing shows in a market's last 20 seconds.
- [new] Buy opens a check first: how many contracts, the best ask and the average across all of them, the cost, what it pays if it wins and loses if not, when it settles, and which of your live rules the buy would not have passed (the timing, price band, coins, window cap or profit target). Hold the button to buy.
- [improved] The order never pays more than the best ask plus your price room, shown in the check. Anything not offered at that price is not bought and nothing is spent. Your daily loss cap, daily order limit, cash floor, the $50 size cap and an unlocked device still apply, and a market live already holds cannot be bought twice.
- [improved] Once bought, the scanner card shows the position with its Sell row, and the trade's story in Trades says it was bought by hand. A hand buy settles and counts toward live's numbers like any other live trade. It covers the main account; subaccount books do not copy it.
- [fixed] Gains and losses in the sell row now show in green and red.

## 1.2.6 (Nov 14, 2026): Sell a live position by hand
If a coin you hold live looks like it will not win, you can sell it from the dashboard before it settles.
- [new] Each open live position on the live board shows what it would sell for right now (the best price buyers are paying), the money that would come back, and what that means for the trade, with a Sell button next to it.
- [new] Sell opens a check first: how many contracts, the best price and the average across all of them, the money back, the result on the trade, and what holding would pay if it wins or lose if it does not. Hold the button to sell.
- [improved] The sale never goes below 3¢ under the best price shown. Anything that does not sell at that price stays open and settles as usual, and a part-sold position shows "Sell the rest" and how many were sold.
- [improved] The live trade's story in Trades has the same Sell button while the market is open. Selling needs an unlocked device, and it covers the main account (subaccount books still sell only through cash out).

## 1.2.5 (Nov 14, 2026): Smaller pinned header on phones
- [improved] On phones the pinned tiles at the top are down from four to two, so more of the page shows while scrolling. With live on: Mode and Live today, with your Kalshi cash in the corner of Live today. With live off: Mode and Paper today, with the paper bank in the corner. Paper's numbers are still on Home and Analytics, and the desktop bar keeps all four tiles.

## 1.2.4 (Nov 14, 2026): Your call on spilling past the playbook's limit
- [new] "Room past the playbook's limit" in Live settings, under Money. Hold under it (the default) keeps a live order under the playbook's own price limit, 94.9¢ for the under-95¢ playbooks. Let the room spill past it lets a coin picked under the limit fill up to your price room above it, as before 1.2.3. Your Maximum price always holds either way.

## 1.2.3 (Nov 14, 2026): Live orders never pay past your limits
Steven asked how much slippage a live order allows. It was 1¢ over the price read at the trade check, with no ceiling, so a coin picked at 94.8¢ under an under-95¢ playbook filled at 95.6¢.
- [fixed] A live order's top price now stops at your Maximum price and at the playbook's own price limit (94.9¢ for the under-95¢ playbooks, 95.9¢ for under 96¢, your mix's price cap). It can mean a few more no-fills, never a fill in the range the rule skips.
- [new] Price room in Live settings, under Money: how much over the price read a live order may pay, 0 to 3¢. It starts at 1¢, the same as before. Subaccount books use it too.
- [improved] Opening a live trade says what set its top price (the room, or a limit that held it lower), and the "What live takes" summary names the room.

## 1.2.2 (Nov 14, 2026): Your trades first on the live board
- [improved] The live board on Home now lists the trades you are in first: live buys, then paper's own trades, then a "Passed on" divider with the ones skipped, so there is no scrolling past skips to find your trades. A card moves up as soon as a live order fills.
- [fixed] The part of each price chart that has not happened yet was shaded dark navy in every theme, which looked heavy in the light themes. It follows the theme now.

## 1.2.1 (Nov 14, 2026): Board cards say which account they mean
- [fixed] With live on, a card on the live board could read "Skipped · daily profit target hit" while live was still short of its own target. That tag was paper's. It now reads "Paper skipped" or "Paper took it".
- [new] A second tag on each card says what the live account did with the same market: bought (how many and at what price), skipped and why, no fill (with the ask it missed), or not taken because it was outside live's price band or coins. Cards live bought are no longer dimmed when paper skipped them.

## 1.2.0 (Nov 14, 2026): Themes
Pick how the dashboard looks. The half-circle button at the top (or "Theme" in search) opens the theme picker.
- [new] Nine themes, each previewed in its own colors: Midnight (the original), Graphite, Ember, Ocean, Terminal, Amethyst, High contrast, Daylight and Sand.
- [new] Auto follows your phone or computer: Daylight in light mode, Midnight in dark mode, switching when the device does.
- [improved] Charts, tables, the live view, the logo and the settings pages all follow the theme. The Cockpit stays a dark instrument panel in every theme, and live trading stays red so it is never missed.
- [improved] Every theme was checked for readable text: body text, labels, gains and losses all meet standard contrast levels on their backgrounds.
- [improved] Your choice is saved on each device. A light or dark choice made with the old button carries over.

## 1.1.8 (Nov 14, 2026): Paper and live trades easier to tell apart
- [improved] The paper table in Trades is now "Paper trades" and says they are simulated fills, with the real fills under Live.
- [improved] Paper rows the live account also bought are tagged "also live" instead of "live".
- [new] "Hide trades live also took" on the paper table shows only what paper did on its own. Your choice is remembered on this device.

## 1.1.7 (Nov 14, 2026): Today's run in the Mode tile
- [new] The Mode tile at the top now shows today's running profit for the account you are in (live when live trading is on, paper otherwise): a line that steps with each settled trade, the zero line dotted, a pulsing dot for now, and under it the day's wins, losses, open trades and the next trade check. It refreshes with the header, on the web and on phones.

## 1.1.6 (Nov 14, 2026): Price charts stay straight after coming back to the app
- [fixed] After the phone had been away from the app, an open trade's price chart could double back on itself and draw a flat line across minutes it had no prices for. The line now always runs forward in time, and minutes missing from before the phone slept are fetched again.

## 1.1.5 (Nov 14, 2026): What each account takes, in plain words
- [new] The top of Paper settings and Live settings now says in one paragraph what that account takes right now: which trades the playbook buys, the price band (with the playbook's own price limit folded in, so "under 95¢" shows as 90¢ to 94.9¢), coins, trades a window, off hours, size, the daily stops, protect profit and cash out. It is built from the saved settings, so it changes when you save.

## 1.1.4 (Nov 14, 2026): Live numbers follow live settings only
Steven: changing paper's daily profit target made the live account look active again.
- [fixed] The profit target bar on the live numbers (header, Home Live view, Live account) read paper's target. It reads live's now. Live trading itself already stopped on live's own target, so no live trades were placed because of it.
- [fixed] The target line on the live Daily P&L chart and the sizing note when picking a live playbook also read paper's settings.
- [fixed] When live's minimum price is lower than paper's, live trades below paper's price now settle within seconds of the close, like the rest.
- [improved] Checked every live rule with paper set the opposite way: price band, coins, off hours, most trades a window, profit target, give-back stop, protect profit and cash out all follow Live settings only.

## 1.1.3 (Nov 14, 2026): Shared live accounts show up right away
- [fixed] On a friend's dashboard, the banner kept saying "live account private" from the moment you opened it, even after they shared it. It now follows what their dashboard sends on every refresh.
- [improved] When a friend keeps their live account private, the Live view on Home says so and how they can share it, instead of showing an empty account.

## 1.1.2 (Nov 14, 2026): Cash out on live
- [new] "Cash out when the trend turns" and "Share of the lead kept" are now in Live settings too, separate from paper. When on, a live position whose trend runs against it at the 10-minute mark, with less of its lead left than your setting, is sold at the price buyers are paying then. It gives up to 3¢ below that price if the book moves, never more, and anything that does not sell is held to the close. Subaccount books do the same.
- [improved] It starts off on live, whatever paper uses. Opening a cashed-out live trade in Trades says it was cashed out and at what price.

## 1.1.1 (Nov 14, 2026): Header shows live right away
- [fixed] After turning live on or off, the header kept the old mode (Paper only) for up to two minutes. It changes at once now.

## 1.1.0 (Nov 14, 2026): Paper and live get their own settings
Paper and live no longer share rules. Each has its own settings tab, so you can practice one way on paper and trade another way live.
- [new] Live settings tab: live's size, daily loss cap and cash floor, plus its own coins, price band, most trades a window, off hours, bench, profit target, protect profit, give-back and bank drawdown stops, and Your mix. Saving needs a hold, like turning live on.
- [new] Live settings shows which settings differ from paper, and "Copy paper's rules" sets live to match paper in one step. Live size, loss cap and floor are kept.
- [improved] Settings is now Paper settings, and nothing on it changes what live trades. Live starts with the rules paper had, so nothing changes until you change it.
- [improved] The Live account tab shows live's limits and a Live rules card marking each one that differs from paper. The subaccount books follow the live rules.
- [improved] Live can trade a coin that paper has switched off. Paper leaves those trades out of its book and labs.

## 1.0.99 (Nov 14, 2026): Two safer versions of Margin vs volatility
- [new] Margin vs volatility + Learned: Margin vs volatility under 95¢, and only when the self-learning model agrees too. In the Aug 7 to Nov 9 history it kept about 80% of the profit on about 60% of the trades, made $1.20 a trade instead of $0.93, and its worst day was smaller.
- [new] Margin vs volatility, 1.5 moves: the same, but the coin must be 1.5 normal moves past its target instead of 1. About half the profit, with the worst day and the worst drop each about half as deep and the win rate up from 94.2% to 95.2%.
- [improved] Both are in Labs and the Backtest tab, and either can be picked for paper or live. Five other ideas were tested and left out because they did not hold up on both halves of the history.

## 1.0.98 (Nov 14, 2026): Cash out works on every coin again
- [fixed] Since the price path capture started (1.0.95), it was using up Coinbase's allowance just as the minute-10 trend check needed it, so on most coins the check got no answer and "Cash out when the trend turns" did nothing for them. The capture and the volatility repair now pause from 7 to 3 minutes before each close, and the check waits and tries again if Coinbase is busy.
- [improved] When there is still no trend reading, the minute-10 sale price is kept anyway, so the Min 10 column is filled in.

## 1.0.97 (Nov 14, 2026): Live gets its own dashboard, faster orders
Steven's first live test: real fills are easier to tell apart, every live order can be opened, and orders go out faster.
- [new] Home has a Paper | Live switch. Live shows the Kalshi cash, today and all-time live results, win rate, average trade, how many contracts filled, the price paid against paper, and the last live trades, from real fills only.
- [new] Live orders in Trades open like paper trades: the price the order was based on, its limit, how fast it went out, what it filled at, fees, the result and the replay.
- [new] When an order does not fill, the tracker reads the market again right after and keeps the ask it missed. Trades shows "no fill, ask was 96.0¢" and the limit it tried.
- [new] Every trade keeps what its contracts would have sold for at the 10-minute mark, 5 minutes before the close. It is a Min 10 column in Trades, and each trade says what cashing out then would have booked against how it ended.
- [improved] Live orders in one window go out together instead of one after another, the subaccount books trade at the same time as the main account, and balances are read while the coins are scanned. Each account still checks its own limits (window cap, daily stop, cash floor) one trade at a time, clearest first.
- [improved] Paper trades the live account also bought carry a "live" tag.
- [fixed] Live trades listed the time the order was placed and paper the close time. Both show the close time now.
- [fixed] Long dates no longer push the trade tables off the side of a phone.

## 1.0.96 (Nov 13, 2026): Steadier price path capture
- [fixed] Coinbase sometimes turns away requests when it is busy, and the price path capture gave up on a window after a few of those. It now waits a minute and carries on, and spaces its requests out.

## 1.0.95 (Nov 13, 2026): Replay any trade, second by second
- [fixed] Older trades in Trades could not be opened, so they had no replay. Only the last 60 came with full details. Tapping any older row now loads that trade in full, with its replay.
- [new] The tracker now stores each window's exact price path, one price a second, for every coin it records, a few minutes after the window closes. It comes from Coinbase's trade history and is kept for 30 days. Replays read it first, so a trade from this morning or last week replays at full detail instead of one price a minute. The first run also fills in the last two days, which takes several hours in the background.

## 1.0.94 (Nov 13, 2026): No more straight line after coming back to the app
- [fixed] Coming back to the app after it was in the background left a straight line across the live trade chart for the minutes the phone had paused the price feed. The chart now rebuilds those minutes from Coinbase's trade history when you return, then carries on live. The 60-second average fills back in within a minute.

## 1.0.93 (Nov 13, 2026): Charts that draw right on arrival
- [fixed] Charts were sometimes squashed or stretched when opening the dashboard or coming back to it, because they were drawn while the page was still settling (the scrollbar appearing, the phone restoring the page from the background) and never redrawn. They now redraw whenever the page width changes and when you come back to the tab.
- [fixed] The live trade chart drew a stray tail to the left of the chart, from the minute before the window opened. That minute now starts the line at the open.
- [fixed] The small "Kalshi now" price line next to an open trade showed a lone straight stroke when it had only two or three prices. It now appears once there are enough to show a trend.

## 1.0.92 (Nov 13, 2026): Price boxes take dollars or cents
- [fixed] Minimum price, Maximum price and the Your mix price cap now take a price either way: .945 (dollars, the way Kalshi shows it) or 94.5 (cents) both save as 94.5¢. Typing .945 used to be refused. Tenths of a cent have been kept since 1.0.88; a copy that had not updated yet still rounded to the nearest cent.

## 1.0.91 (Nov 13, 2026): Would each day have hit a profit take or stop loss
- [new] The Daily P&L chart (Analytics and Rule analytics) now shows each day's intraday high and low as a thin range on its bar, draws your profit take and stop loss across the chart, and marks under each date whether the day reached the profit take (green) or fell to the stop loss (red), even when it finished somewhere else. A line above the chart counts them, for example "11 of 21 days reached +$150 · 6 fell to -$120". The levels start from your settings (the live loss cap on Live), and you can type other amounts to see how they would have played out; that only changes the chart, on your device.

## 1.0.90 (Nov 13, 2026): Rule analytics
- [new] Rule analytics, a new tab beside Analytics. Pick any playbook and see every Analytics chart for it, as if it had traded each day the tracker watched: the totals, equity with drawdown, daily P&L with what the losses cost, the calendar, and the breakdowns by hour, coin, side, price and day of week. It uses the same replay as Labs, at the paper size with your stops and window cap, and the 7D, 30D and All ranges. The playbook you picked is remembered on the device.

## 1.0.89 (Nov 13, 2026): Daily P&L, stops and losses in one chart
- [improved] The Daily P&L chart on Analytics now shows three things per day in one place: the day's result (solid bar), where it would have ended with no stops (amber marker, for the daily loss stop, profit target, give-back, bank drawdown and protect profit), and what its wins made on their own (hatched column). Three totals sit above it for the days shown: the result, with no stops and the difference, and wins alone with what the losses cost. Tap a total to hide or show that layer on the chart; it is remembered on the device. On a phone the totals stack as compact rows.

## 1.0.88 (Nov 13, 2026): Minimum and maximum price to a tenth of a cent
Request 10.
- [improved] Minimum price and Maximum price in Paper settings now take a tenth of a cent, so 94.5 means 94.5¢ and up where before it was rounded to 95. Kalshi quotes these markets to a tenth of a cent and about half the leaders in the four-month history sat between two whole cents. On that history the plain rule at a 94.5¢ minimum took 2,698 trades for +$347, between 94¢ (3,410 trades, +$703) and 95¢ (2,346 trades, +$15). Everywhere the dashboard shows the price band it now shows the tenth too, and the Save confirmation names the maximum price in cents instead of dollars.

## 1.0.88 (Nov 13, 2026): What each day made before its losses
- [new] The Daily P&L chart on Analytics draws a hatched bar on each day with a losing trade: where the day would have ended from its winning trades alone. The gap down to the solid bar is what the losses cost. Hover or tap a bar for both figures. A small legend above the chart explains the solid, hatched and dashed (no stops) marks. Works for paper and live.

## 1.0.87 (Nov 13, 2026): Easier to read profit target
- [improved] The profit target under today's profit now sits on its own panel, clear of the bank chart behind it: the target, the % reached, and how much is left to go, or "Reached. No new trades until tomorrow." once it is hit. It runs the full width on a phone.

## 1.0.86 (Nov 13, 2026): Profit target progress bar
- [new] With a daily profit target set, a progress bar sits under today's profit on the paper bank, the live card and the Paper today and Live today tiles: how far today is toward the target, and a clear "Profit target hit, stopped for today" once it gets there. With no target but Protect profit on, it tracks Protect profit's starting point instead.

## 1.0.85 (Nov 13, 2026): Profit vault, and a clear line between paper and live settings
- [new] Profit vault, on the Live account tab. A Kalshi subaccount the tracker never trades from. Profits from the main live account move into it on a schedule you pick (nightly, weekly on a day you choose, or monthly) by a rule you pick: a share of the period's profit, or everything over an amount. A losing period moves nothing, and with "make up losses first" on, its loss comes out of the next profit before anything is swept. A sweep never takes the main account under the amount you say to keep. "If it ran now" shows what the next sweep would move and why, and History lists every sweep, including the ones that moved nothing.
- [new] Send to bank. Kalshi does not let apps withdraw to a bank, so this moves the amount from the vault to your main account, holds it there for 3 days so live trading leaves it alone, and opens Kalshi to finish the withdrawal. Move money moves cash between the vault and trading by hand. The automatic switch and every move are hold-to-confirm. Needs the Advanced API level, the same as live books.
- [improved] Every setting on the Settings tab is tagged Paper and live, Paper only, or Live only, with a short guide at the top. The Live account tab has a new "What live follows" card: what is set there for real money next to the shared rules it takes from Settings, with their current values.

## 1.0.84 (Nov 13, 2026): Faster trade check and lighter page loads
- [improved] The trade check at each mark reads all nine coins at once instead of one after another, so the rule's orders go out sooner after the mark, at prices closer to the ones the rule saw. In a test with a tenth of a second per request it went from 2.6 seconds to 0.4.
- [improved] The page and the 10-second data refresh are only sent again when they have changed. Opening the dashboard again after the first time, and most refreshes in between the tracker's once-a-minute updates, now come back as a short "no change" instead of the whole thing.

## 1.0.83 (Nov 13, 2026): Maximum price, and Kalshi's API level from the Live account tab
Two of Steven's requests.
- [new] Maximum price, in Paper settings beside the minimum. Leaders above it are not taken, so a price band like 90 to 95¢ can be tried on every playbook without changing any of them. It applies wherever the minimum does: the paper book, the labs and the live account. 99 is no maximum, which is where it starts.
- [new] Kalshi API level, on the Live account tab. It shows your account's API level, its request limits and your 30-day volume, with an Upgrade to Advanced button. Advanced is free and permanent, allows more requests a second, and is what Kalshi needs before subaccount books can be made. Kalshi only grants it once at least one of your last 100 orders came through the API, so the live account has to place one trade first; the button says so if Kalshi turns it down.

## 1.0.82 (Nov 12, 2026): What a day would have come to with no stops
- [new] When a stop pauses the paper book (daily loss, daily profit target, give-back, bank drawdown or protect profit), the dashboard now shows where the day would have ended if trading had gone on. Home shows it under Paper today, the Daily P&L chart on Analytics draws it as a dashed outline on each day a stop fired, and each skipped trade in Trades says whether it would have won or lost and by how much. A skipped trade only counts if your playbook, schedule and per-window cap would have taken it, so the figure matches turning the stop off. Paper only; the bank itself still stops where the stop stopped it.

## 1.0.81 (Nov 12, 2026): Smoothed trend in the trade replay
- [new] The trade replay now draws a second, dotted trend over minute 5 to 10 using double exponential smoothing, and the trend card labels it up, down or neutral. The straight line weighs the whole five minutes the same; the smoothed one leans on the latest prices, so it shows a turn late in the stretch. The card says when the two disagree. Cash out still goes by the straight line and the share of the lead kept.

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
