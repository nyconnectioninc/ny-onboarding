/**
 * NY Connection — Employee Onboarding backend
 *
 * Paste this into the Apps Script editor of your Google Sheet
 * (Extensions → Apps Script), run setup() once, then deploy as a Web App.
 * Full steps are in the repo README.
 */

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

/**
 * Run once from the editor. Creates the Submissions tab, headers,
 * the Welcome dropdown, and stores the valid onboarding code(s).
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
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

// ---- helpers ----

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
