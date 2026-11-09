# Kalshi Radar

A dashboard and paper/live trading tracker for Kalshi's 15-minute crypto markets. It runs entirely in your own Cloudflare account,
so nothing has to stay running on your computer.

**The rule:** at 10 minutes left in each 15-minute crypto market (BTC, ETH, SOL, XRP, DOGE, HYPE, BNB, ZEC, NEAR), take the side
priced 90¢ or more and hold it to settlement. Paper trading runs from the start. Live trading is off until you connect a Kalshi key
and turn it on yourself.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mcClaudeAi/kalshi-radar)

## What you need

- A free **Cloudflare** account
- A free **GitHub** account (the deploy button copies the code into it, and Cloudflare redeploys from there)
- A **Kalshi** account, plus an API key if you want live trading or to see your Kalshi cash

Cloudflare's free plan is enough.

## Set up (about 5 minutes)

1. Click **Deploy to Cloudflare** above and sign in to Cloudflare and GitHub when asked. On the "Set up your application" screen:
   - **Create private Git repository:** tick it (this is your own copy of the code)
   - **Project name:** anything you like, such as `kalshi-radar`. It becomes part of your dashboard's address. If it says the name
     already exists, add something to it (`kalshi-radar-2`).
   - **Build command:** leave empty. **Deploy command:** leave as it is.
   - Click **Deploy** and wait a minute or two.
2. When it finishes, open the link it gives you (it ends in `.workers.dev`). Do this straight away: the first person to open a new
   dashboard sets its passcode.
3. The setup screen walks you through three steps:
   - **Passcode.** It signs you in on each phone or computer you use. There is no username.
   - **Paper account.** Starting bank, size per trade and daily stop. All of these can be changed later under Settings.
   - **Kalshi key** (optional). You can skip this and add it later on the **Connections** page.

That's it. Paper trades start at the next 10-minutes-left mark (:05, :20, :35 or :50 past the hour, Eastern time).

## Turn on automatic updates (one time)

Cloudflare's copy of the code leaves out the updater, so add it once: in your dashboard open **Connections**, click **Turn on**
next to Automatic updates, type your repo's name (shown in your GitHub, like `your-name/kalshi-radar`) and press **Commit changes**
on the GitHub page that opens. After that your dashboard installs new versions on its own once a day. Your trades, settings and
key are never touched by an update. To stop updates later, disable the "Update from Kalshi Radar" workflow in your repo's Actions tab.

## Connecting Kalshi

1. On kalshi.com, open your account settings, find the API keys section and create a key. Kalshi shows a **Key ID** and downloads
   a **private key file** once.
2. In the dashboard, go to **Connections**, paste the Key ID and choose the key file (or paste its contents).
3. Click **Test and save**. The key is checked against Kalshi (by reading your balance) before it is saved.

The key is stored encrypted inside your Cloudflare account and is never shown again. The page only shows the last four characters
of the Key ID and your Kalshi cash. **Remove key** deletes it and turns live trading off. Deleting the key on Kalshi also cuts it off.

## Live trading

Turn it on from **Live account**. It is hold-to-confirm and uses real money. Limits you control there:

- size per trade ($5 to $25)
- daily loss cap: no new trades for the rest of the day after this
- cash floor: no orders while your Kalshi cash is below this

Open live positions always ride to settlement unless you press **Sell all open**.

## Pages

- **Home:** paper bank, today, next trade check, live board and scanner
- **Cockpit:** one coin at a time, with speed and window-clock gauges
- **Analytics:** paper or live, with equity, drawdown, daily results and breakdowns
- **Trades:** every settled trade, by day
- **Labs:** variations of the rule running side by side on paper. Any lab can become the paper or live playbook.
- **Live account:** live controls and the go-live checklist
- **Settings:** paper settings and which coins to trade
- **Connections:** Kalshi key, passcode and signed-in devices

## Forgot the passcode

In Cloudflare, open **Workers & Pages**, then your worker, then **Settings**, then **Variables and Secrets**. Add a secret named
`RESET_PASSCODE` with a long random value (12 characters or more). Type that value on the sign-in screen and the setup screen comes
back. Your trades, settings and Kalshi key are kept. Delete the secret afterwards.

## Optional: your own encryption key

Add a secret named `ENC_KEY` (any long random value) and the saved Kalshi key is encrypted with it instead of a key generated inside
the app. If you add or change it later, connect the Kalshi key again.

## Please read

This is a tool, not advice. Paper results don't guarantee live results, and a bad 15-minute window can lose several trades at
once. The rule's edge is thin: it wins most trades, but each loss costs about as much as ten to fifteen wins. Use your own account
and only money you can afford to lose.
