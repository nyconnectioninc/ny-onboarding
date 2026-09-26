/**
 * NY Connection — Employee Onboarding backend
 *
 * Paste this into the Apps Script editor of your Google Sheet
 * (Extensions → Apps Script), run setup() once, then deploy as a Web App.
 * Full steps are in the repo README.
 */

// ID of the Google Sheet (from its URL). Leave '' if this script is bound to the Sheet
// via Extensions → Apps Script.
const SHEET_ID = '1E4tPQ57LXT_DM98861MAsA7d_YU7jC0OCYWd1yulkwc';
const SHEET_NAME = 'Submissions';
const HEADERS = [
  'Timestamp',
  'First Name',
  'Last Name',
  'Personal Email',
  'Mobile',
  'Code Used',
  'Welcome',     // Pending → change to YES to trigger the Zapier welcome email
  'Email Sent',  // Zapier writes a timestamp here after sending, so it never double-sends
  'Notes',
];
const WELCOME_OPTIONS = ['Pending', 'YES', 'NO'];
const DEFAULT_CODES = 'VZW-ONBOARD';

// ---- Onboarding intake (replaces the Google Form, no Google sign-in needed) ----
// Rows go to a "Web Intake" tab in the existing "ONBOARDING (Responses)" spreadsheet.
const INTAKE_SHEET_ID = '1rXHHP2pwSvaMndk7vpXZ2XEQtHZC0JnEsAH1FKaX0WI';
const INTAKE_TAB = 'Web Intake';
// Private Drive folder (jonsanchez0009) where uploaded ID documents are saved.
const INTAKE_FOLDER_ID = '1JcVW0-RP1pgLCef9wbxOfdqKs9WEBUvP';
const INTAKE_HEADERS = [
  'Timestamp',
  'First & Last Name',
  'Middle Name',
  'Address',
  'City',
  'State',
  'Zipcode',
  'Date Of Birth',
  'Preferred Name For Name Badge',
  'T-Shirt/Sweatshirt Size',
  'Start Date',
  'Social Security #',
  'Email Address',
  'Phone Number',
  'Phone Carrier',
  'Available Start Date',
  'ID Document #1 (DIFFERENT FROM ID 2)',
  'ID Document 2 (NEEDS TO BE DIFFERENT THAN ID 1)',
  'Hiring Manager',
  'Work Location',
  'Code Used',
  'Documents Folder',
];
// The welcome email's intake link carries a private key (?k=...). Only submissions with a valid key are
// accepted, so new hires don't need to type the onboarding code again. The key lives ONLY in
// Project Settings -> Script Properties -> INTAKE_KEYS (never in this public repo). To rotate it, change
// that property and the ?k= value in the Zapier welcome email.
const INTAKE_MAX_FILE_BYTES = 15 * 1024 * 1024;
const INTAKE_FILE_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif',
  'image/webp': 'webp', 'application/pdf': 'pdf',
};

/**
 * Run once from the editor. Creates the Submissions tab, headers,
 * the Welcome dropdown, and stores the valid onboarding code(s).
 */
function setup() {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold')
    .setBackground('#111111')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  const welcomeCol = HEADERS.indexOf('Welcome') + 1;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(WELCOME_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, welcomeCol, sheet.getMaxRows() - 1, 1).setDataValidation(rule);

  // Color-code the Welcome column
  const welcomeRange = sheet.getRange(2, welcomeCol, sheet.getMaxRows() - 1, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('YES')
      .setBackground('#dcfce7').setFontColor('#166534').setRanges([welcomeRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('NO')
      .setBackground('#fee2e2').setFontColor('#991b1b').setRanges([welcomeRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Pending')
      .setBackground('#fef9c3').setFontColor('#854d0e').setRanges([welcomeRange]).build(),
  ]);

  sheet.setColumnWidths(1, HEADERS.length, 160);
  sheet.setColumnWidth(HEADERS.indexOf('Personal Email') + 1, 240);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ACCESS_CODES')) props.setProperty('ACCESS_CODES', DEFAULT_CODES);

  Logger.log('Setup complete. Valid codes: ' + props.getProperty('ACCESS_CODES'));
}

/**
 * Change the valid code(s) any time: edit the value below and run this function,
 * or edit Project Settings → Script Properties → ACCESS_CODES directly.
 * Multiple codes are comma-separated, e.g. "VZW-ONBOARD, VZW-FALL26".
 */
function setAccessCodes() {
  PropertiesService.getScriptProperties().setProperty('ACCESS_CODES', 'VZW-ONBOARD');
}

function doGet() {
  return json_({ ok: true, service: 'onboarding' });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request', message: 'Invalid request.' });
  }

  // Honeypot — pretend success so bots don't retry
  if (data.company) return json_({ ok: true });

  // Intake form: authorized by the private key in the welcome email link, not the onboarding code.
  if (data.action === 'intake') {
    const keys = (PropertiesService.getScriptProperties().getProperty('INTAKE_KEYS') || '')
      .split(',').map(k => k.trim()).filter(Boolean);
    if (!keys.includes(String(data.intakeKey || '').trim())) return json_({ ok: false, error: 'invalid_link' });
    return handleIntake_(data, 'Welcome email link');
  }

  // 1. Validate the onboarding code (server-side, so it can't be bypassed)
  const code = String(data.code || '').trim().toUpperCase();
  const validCodes = (PropertiesService.getScriptProperties().getProperty('ACCESS_CODES') || DEFAULT_CODES)
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (!validCodes.includes(code)) {
    return json_({ ok: false, error: 'invalid_code' });
  }


  // 2. Validate fields
  const firstName = clean_(data.firstName, 60);
  const lastName = clean_(data.lastName, 60);
  const email = clean_(data.email, 120).toLowerCase();
  const digits = String(data.mobile || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

  if (!firstName) return fieldError_('firstName', 'Enter your first name.');
  if (!lastName) return fieldError_('lastName', 'Enter your last name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fieldError_('email', 'Enter a valid email address.');
  if (digits.length !== 10) return fieldError_('mobile', 'Enter a 10-digit mobile number.');
  if (data.consent !== true) return fieldError_('consent', 'Please confirm before continuing.');

  const mobile = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);

  // 3. Write the row (locked so simultaneous submissions don't collide)
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = spreadsheet_().getSheetByName(SHEET_NAME);
    if (!sheet) return json_({ ok: false, error: 'not_setup', message: 'Onboarding is not set up yet. Please contact your manager.' });

    // Skip duplicates by email
    const emailCol = HEADERS.indexOf('Personal Email') + 1;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existing = sheet.getRange(2, emailCol, lastRow - 1, 1).getValues().flat()
        .map(v => String(v).toLowerCase());
      if (existing.includes(email)) return json_({ ok: true, duplicate: true });
    }

    sheet.appendRow([
      new Date(),
      safe_(firstName),
      safe_(lastName),
      safe_(email),
      mobile,
      code,
      'Pending',
      '',
      '',
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: 'Something went wrong. Please try again in a minute.' });
  } finally {
    lock.releaseLock();
  }
}

// ---- Onboarding intake ----

/**
 * Run once from the editor after adding the intake code. It creates the "Web Intake"
 * tab and prompts Google to authorize Drive access (needed to save ID uploads).
 */
function setupIntake() {
  intakeSheet_();
  DriveApp.getFolderById(INTAKE_FOLDER_ID).getName();
  Logger.log('Intake ready: tab "' + INTAKE_TAB + '" and ID folder are accessible.');
}

function handleIntake_(d, code) {
  const f = {
    name: clean_(d.fullName, 100),
    middle: clean_(d.middleName, 60),
    address: clean_(d.address, 150),
    city: clean_(d.city, 60),
    state: clean_(d.state, 30),
    zip: clean_(d.zip, 10),
    dob: clean_(d.dob, 10),
    badge: clean_(d.badgeName, 60),
    shirt: clean_(d.shirtSize, 30),
    start: clean_(d.startDate, 10),
    ssn: String(d.ssn || '').replace(/\D/g, ''),
    email: clean_(d.email, 120).toLowerCase(),
    phone: String(d.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''),
    carrier: clean_(d.carrier, 30),
    available: clean_(d.availableDate, 10),
    manager: clean_(d.hiringManager, 80),
    location: clean_(d.workLocation, 80),
  };

  const required = [['fullName', f.name, 'Enter your first and last name.'], ['address', f.address, 'Enter your address.'],
    ['city', f.city, 'Enter your city.'], ['state', f.state, 'Choose your state.'], ['dob', f.dob, 'Enter your date of birth.'],
    ['badgeName', f.badge, 'Enter your preferred name for your badge.'], ['startDate', f.start, 'Enter your start date.'],
    ['carrier', f.carrier, 'Choose your phone carrier.'], ['availableDate', f.available, 'Enter your available start date.']];
  for (const [field, value, msg] of required) if (!value) return fieldError_(field, msg);
  if (!/^\d{5}(-\d{4})?$/.test(f.zip)) return fieldError_('zip', 'Enter a 5-digit zip code.');
  if (f.ssn.length !== 9) return fieldError_('ssn', 'Enter your 9-digit Social Security number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return fieldError_('email', 'Enter a valid email address.');
  if (f.phone.length !== 10) return fieldError_('phone', 'Enter a 10-digit phone number.');
  if (d.consent !== true) return fieldError_('consent', 'Please confirm before submitting.');

  const files = Array.isArray(d.files) ? d.files : [];
  const id1 = files.find(x => x && x.field === 'id1');
  const id2 = files.find(x => x && x.field === 'id2');
  if (!id1) return fieldError_('id1', 'Upload your first ID document.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const parts = f.name.split(' ');
    const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    // One subfolder per person, e.g. "Sanchez, Jon", inside the private ID folder (reused if it already exists).
    const folder = personFolder_(last, first);
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
    const base = (last + '_' + first).replace(/[^A-Za-z0-9_-]+/g, '') || 'NewHire';

    const saveFile = (upload, label) => {
      if (!upload) return '';
      const ext = INTAKE_FILE_TYPES[upload.type];
      if (!ext) throw new Error('bad_type:' + label);
      const bytes = Utilities.base64Decode(String(upload.data || ''));
      if (!bytes.length || bytes.length > INTAKE_MAX_FILE_BYTES) throw new Error('bad_size:' + label);
      const blob = Utilities.newBlob(bytes, upload.type, base + '_' + label + '_' + stamp + '.' + ext);
      return folder.createFile(blob).getUrl();
    };

    let url1, url2;
    try {
      url1 = saveFile(id1, 'ID1');
      url2 = saveFile(id2, 'ID2');
    } catch (err) {
      if (!/^bad_(type|size):/.test(String(err.message))) throw err;
      const which = String(err.message).endsWith('ID2') ? 'id2' : 'id1';
      const msg = String(err.message).startsWith('bad_type')
        ? 'Upload a photo (JPG, PNG, HEIC) or a PDF.'
        : 'That file is too large. Please upload a file under 15 MB.';
      return fieldError_(which, msg);
    }

    const ssn = f.ssn.slice(0, 3) + '-' + f.ssn.slice(3, 5) + '-' + f.ssn.slice(5);
    const phone = '(' + f.phone.slice(0, 3) + ') ' + f.phone.slice(3, 6) + '-' + f.phone.slice(6);
    intakeSheet_().appendRow([
      new Date(), safe_(f.name), safe_(f.middle), safe_(f.address), safe_(f.city), safe_(f.state), "'" + f.zip,
      usDate_(f.dob), safe_(f.badge), safe_(f.shirt), usDate_(f.start), "'" + ssn, safe_(f.email), phone,
      safe_(f.carrier), usDate_(f.available), url1, url2, safe_(f.manager), safe_(f.location), code,
      folder.getUrl(),
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: 'Something went wrong saving your information. Please try again in a minute.' });
  } finally {
    lock.releaseLock();
  }
}

function intakeSheet_() {
  const ss = SpreadsheetApp.openById(INTAKE_SHEET_ID);
  let sheet = ss.getSheetByName(INTAKE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(INTAKE_TAB);
    sheet.getRange(1, 1, 1, INTAKE_HEADERS.length).setValues([INTAKE_HEADERS])
      .setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  // Add any header columns introduced after the tab was first created (e.g. "Documents Folder").
  const width = INTAKE_HEADERS.length;
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (current.some((h, i) => h !== INTAKE_HEADERS[i])) {
    sheet.getRange(1, 1, 1, width).setValues([INTAKE_HEADERS])
      .setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
  }
  return sheet;
}

function personFolder_(last, first) {
  const root = DriveApp.getFolderById(INTAKE_FOLDER_ID);
  const clean = (v) => String(v || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  const name = [clean(last), clean(first)].filter(Boolean).join(', ') || 'New Hire';
  const existing = root.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : root.createFolder(name);
}

// "2026-10-06" (from the browser date picker) -> "10/6/2026"
function usDate_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? Number(m[2]) + '/' + Number(m[3]) + '/' + m[1] : safe_(iso || '');
}

// ---- helpers ----

function spreadsheet_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fieldError_(field, message) {
  return json_({ ok: false, error: 'invalid_field', field: field, message: message });
}

function clean_(v, max) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Prevent spreadsheet formula injection (values starting with = + - @)
function safe_(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
