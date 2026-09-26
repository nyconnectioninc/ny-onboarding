# NY Connection — Employee Onboarding

A static onboarding form hosted on **GitHub Pages**. Submissions go to a **Google Sheet** through Google Apps Script. Two **Zapier** Zaps handle the rest: one alerts managers when a new hire is waiting, and one sends the welcome email after a manager sets `Welcome` to **YES**.

```
Employee fills form (GitHub Pages)
        │  POST (with onboarding code)
        ▼
Google Apps Script ── validates code ──► appends row to Sheet (Welcome = Pending)
                                                  │
                     Zap "Manager Alert" ─────────┤  email + text to managers
                                                  │
                           Manager changes Welcome → YES
                                                  │
                                                  ▼
       Zap "Welcome Email": filter YES + not yet sent → Outlook welcome email → writes "Email Sent"
```

**Live setup**

| Piece | Where |
|---|---|
| Site | https://nyconnectioninc.github.io/ny-onboarding/ |
| Repo | https://github.com/nyconnectioninc/ny-onboarding |
| Sheet | *NY Connection Onboarding* → **Submissions** tab (jonsanchez0009@gmail.com's Drive) |
| Apps Script | Standalone project *NY Connection Onboarding Backend* (script.google.com) |
| Zaps | *NY Onboarding - Welcome Email* and *NY Onboarding - Manager Alert* |
| Access code | `VZW-ONBOARD` |

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The onboarding page |
| `config.js` | The Apps Script web app URL |
| `google-apps-script/Code.gs` | Backend: validates the code and writes to the Sheet |
| `zapier/welcome-email.html` | HTML body of the welcome email |

---

## Daily workflow

1. A new hire gets the site link plus the code **VZW-ONBOARD**.
2. They submit the form, and a row appears with **Welcome = Pending**.
3. Managers get an **email** (to jon.sanchez@ and cc operations.hub@nyconnectionli.com) and a **text** (to (631) 339-0009) saying who's waiting.
4. A manager sets **Welcome** to **YES**. Within about 15 minutes the welcome email goes out from operations.hub@nyconnectionli.com, and **Email Sent** gets a timestamp.
   Set it to **NO** to decline; no email is sent.

## Changing things

| To change… | Do this |
|---|---|
| Access code | Apps Script → ⚙️ Project Settings → Script Properties → `ACCESS_CODES`. Separate several codes with commas. It takes effect immediately. |
| Welcome email wording | Zapier → *NY Onboarding - Welcome Email* → step 3 (Outlook) → Body. Keep `zapier/welcome-email.html` in sync. |
| Alert recipients or text | Zapier → *NY Onboarding - Manager Alert* → step 2 (Outlook) and step 3 (SMS). |
| The website | Edit the files, commit, then **Push origin** in GitHub Desktop. Pages redeploys in about a minute. |
| `Code.gs` | Paste the new code into Apps Script, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. This keeps the same URL. |

---

## Setup from scratch

### 1. Google Sheet + Apps Script

1. Create a Sheet at [sheets.new](https://sheets.new) named **NY Connection Onboarding**.
2. Open **Extensions → Apps Script**, paste in `google-apps-script/Code.gs`, and save.
3. Select **`setup`** and click **Run**. Approve the permissions prompt. On the "unverified app" warning, click **Advanced → Go to (project)**.
4. A **Submissions** tab now exists with these columns: `Timestamp · First Name · Last Name · Personal Email · Mobile · Code Used · Welcome · Email Sent · Notes`. The **Welcome** column has a Pending / YES / NO dropdown.

> **Quirk: "Page Not Found" or a Run that hangs.** Both come from a Google bug when several Google accounts are signed in to the same browser. The fix we used: create a **standalone** project at [script.google.com](https://script.google.com) → **New project**. `Code.gs` opens the Sheet by `SHEET_ID`, so it doesn't need to be bound to the Sheet. If **Run** never shows the permission prompt, sign out of your other Google accounts, or use a window where only the owning account is signed in.

### 2. Deploy the web app

1. In Apps Script, click **Deploy → New deployment**, then ⚙️ → **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy**. It asks for authorization once more.
3. Copy the `/exec` URL into `config.js`.

> **Quirk: slow responses.** Apps Script usually replies in 2–5 s but can take 20 s or more on a cold start. The form shows "Still working…" after 6 s and times out at 60 s. Resubmitting is safe, because duplicate emails are skipped.

### 3. GitHub Pages

1. Create a **public** repo. Free Pages needs a public repo; that's fine here, since no secrets live in it.
2. Push this folder. The command line on this Mac has no saved GitHub login, so we use **GitHub Desktop**: **File → Add Local Repository → Publish branch / Push origin**.
3. In the repo, go to **Settings → Pages → Deploy from a branch → main / (root) → Save**.

### 4. Zap: *NY Onboarding - Welcome Email*

| Step | Setting |
|---|---|
| 1. Trigger | **Google Sheets → New or Updated Spreadsheet Row** · Submissions · **Trigger column: Welcome** |
| 2. Filter | `Welcome` *(Text) Exactly matches* `YES` **AND** `Email Sent` *Does not exist* |
| 3. Action | **Microsoft Outlook → Send Email** from operations.hub@nyconnectionli.com · To: `Personal Email` · Subject: `Welcome to NY Connection, {First Name}! Your onboarding steps` · Body Format: **HTML** · Body: `zapier/welcome-email.html` with the `[[Zapier: …]]` markers swapped for fields |
| 4. Action | **Google Sheets → Update Spreadsheet Row** · Row: **Custom → `Row ID`** from step 1 · `Email Sent`: `{{zap_meta_human_now}}` |

> **Quirks**
> - **Row field:** in step 4 the Row picker defaults to *Static* and offers only fixed row numbers. Switch it with **⋮ → Custom**, then map **Row ID**. Otherwise every run updates the same row.
> - **Skip step 4's test:** skip Zapier's test for step 4. Testing it stamps `Email Sent` on your sample row, and then the filter blocks your real YES test.
> - **"Possible Zap loop" warning:** safe to ignore. The trigger only watches the Welcome column, and the filter stops any repeat.
> - **Double-send protection:** a quick YES → NO → YES within one polling interval is invisible to Zapier, because it only compares against the last value it saw. A longer NO → YES is caught by the `Email Sent` filter. Either way, no second email goes out.

### 5. Zap: *NY Onboarding - Manager Alert*

| Step | Setting |
|---|---|
| 1. Trigger | **Google Sheets → New Spreadsheet Row** · Submissions |
| 2. Action | **Microsoft Outlook → Send Email** from operations.hub@ · To: jon.sanchez@nyconnectionli.com · CC: operations.hub@nyconnectionli.com · Subject: `Approval needed: new hire {First Name} {Last Name}` · Body Format: Text · Body: name, email, mobile, submitted time, and the Sheet link |
| 3. Action | **SMS by Zapier → Send SMS** to the verified number +1 631-339-0009 · `NY Connection: new hire {First} {Last} is waiting for onboarding approval…` |

> SMS by Zapier only texts numbers verified in your Zapier account, and T-Mobile numbers aren't supported. To add a recipient, verify their number under the SMS by Zapier account first.

> **Tip for editing Zap text fields:** typing `/` opens Zapier's field picker, which gets in the way when pasting HTML. Paste the text instead. You can also type field references directly as `{{<trigger step id>__COL$B}}` (column letter), and Zapier turns them into field tokens.

## Testing locally

```bash
python3 -m http.server 8000
```
Then open http://localhost:8000. `config.js` points at the live Apps Script, so real submissions land in the Sheet.
