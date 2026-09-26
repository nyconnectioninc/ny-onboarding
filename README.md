# NY Connection — Employee Onboarding

A static onboarding form hosted on **GitHub Pages**. Submissions go to a **Google Sheet** (via Google Apps Script), and **Zapier** sends the welcome email once a manager sets `Welcome` to **YES**.

```
Employee fills form (GitHub Pages)
        │  POST (with onboarding code)
        ▼
Google Apps Script ── validates code ──► appends row to Sheet (Welcome = Pending)
                                                  │
                           Manager changes Welcome → YES
                                                  │
                                                  ▼
               Zapier: filter YES + not yet sent → Gmail welcome email → writes "Email Sent"
```

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The onboarding page |
| `config.js` | Where you paste the Apps Script URL |
| `google-apps-script/Code.gs` | Backend: validates the code and writes to the Sheet |
| `zapier/welcome-email.html` | HTML email body for Zapier |

---

## 1. Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) and name it **NY Connection Onboarding**.
2. Open **Extensions → Apps Script**.
3. Delete the starter code and paste in everything from `google-apps-script/Code.gs`. Save.
4. In the function dropdown, select **`setup`** and click **Run**. Approve the permissions prompt. Google shows an "unverified app" warning because this is your own script: click **Advanced**, then **Go to (project)**.
5. Back in the Sheet, a **Submissions** tab now exists with these columns:
   `Timestamp · First Name · Last Name · Personal Email · Mobile · Code Used · Welcome · Email Sent · Notes`
   The **Welcome** column has a Pending / YES / NO dropdown.

> **"Page Not Found" when opening Apps Script?** That's a Google bug when several Google accounts are signed in. Create a standalone project at [script.google.com](https://script.google.com) → **New project** instead. `Code.gs` finds the Sheet through `SHEET_ID` (the long ID in the Sheet's URL), so it works the same way. If **Run** hangs without asking for permission, sign out of your other Google accounts or use an Incognito window.

**Changing the code:** in Apps Script, open **Project Settings (⚙️) → Script Properties** and edit `ACCESS_CODES`. You can list several codes separated by commas, e.g. `VZW-ONBOARD, VZW-FALL26`. The change takes effect immediately; you don't need to redeploy.

## 2. Deploy the Apps Script as a Web App

1. In Apps Script, click **Deploy → New deployment**. Click ⚙️ and choose **Web app**.
2. Set **Execute as:** *Me* and **Who has access:** *Anyone*.
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
4. Paste it into `config.js`:
   ```js
   scriptUrl: "https://script.google.com/macros/s/AKfy.../exec",
   ```

> If you edit `Code.gs` later, go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. This keeps the same URL.

## 3. Publish on GitHub Pages

1. Create a new repository at [github.com/new](https://github.com/new), e.g. `ny-onboarding`. Don't add a README.
2. From this folder, run:
   ```bash
   git remote add origin https://github.com/<your-username>/ny-onboarding.git
   git push -u origin main
   ```
3. In the repo, open **Settings → Pages**. Under **Source**, choose *Deploy from a branch*, then **main** / **(root)**, and click **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/ny-onboarding/`.

> GitHub Pages on a free account requires a **public** repo. That's fine here: no secrets live in this repo. The code is checked server-side in Apps Script, and the Sheet stays private to you.

## 4. Build the Zap

Create a new Zap at [zapier.com](https://zapier.com/app/zaps):

**Trigger: Google Sheets → *New or Updated Spreadsheet Row***
- Spreadsheet: *NY Connection Onboarding* · Worksheet: *Submissions*
- **Trigger Column:** `Welcome`. The Zap then fires only when the Welcome cell changes.

**Action 1: Filter by Zapier (*Only continue if…*)**
- `Welcome` → *(Text) Exactly matches* → `YES`
- **AND** `Email Sent` → *Does not exist*

  This stops the Zap from sending twice if someone toggles YES → NO → YES.

**Action 2: Gmail → *Send Email*** (or Microsoft Outlook, or Email by Zapier)
- To: `Personal Email`
- Subject: `Welcome to NY Connection, {First Name}! Your onboarding steps`
- Body Type: **HTML**
- Body: paste `zapier/welcome-email.html`. Then replace each `[[Zapier: …]]` marker with the matching field from the trigger, and fill in every ✏️ EDIT item.

**Action 3: Google Sheets → *Update Spreadsheet Row***
- Row: use the **Row ID** from the trigger step
- `Email Sent`: `{{zap_meta_human_now}}` (insert the "Zap Meta: Human Now" timestamp)

Turn the Zap on. Test it by submitting the form, then changing that row's **Welcome** to **YES**. Zapier checks for changes every 1–15 minutes, depending on your plan.

## Daily workflow

1. A new hire gets the site link plus the code **VZW-ONBOARD**.
2. They submit the form, and a row appears with **Welcome = Pending**.
3. A manager reviews it and sets **Welcome** to **YES**. The welcome email goes out, and **Email Sent** gets a timestamp.
   Set it to **NO** to reject; no email is sent.

## Testing locally

```bash
python3 -m http.server 8000
```
Then open http://localhost:8000.
