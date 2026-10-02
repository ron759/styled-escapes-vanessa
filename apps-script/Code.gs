// ================================================================
// Styled Escapes by Vanessa — GAS Proxy
// Handles: AI follow-up drafts, social content, CRM (Google Sheets)
// ================================================================
//
// SETUP INSTRUCTIONS:
//
// 1. Go to script.google.com → New Project → paste this code
// 2. Click Project Settings (gear icon) → Script Properties
//    → Add property:  ANTHROPIC_API_KEY  =  sk-ant-xxxxxxxx
//    → Add property:  CRM_SHEET_ID       =  (your Google Sheet ID)
//    → Add property:  PROXY_SECRET       =  (a long random string you invent,
//                                            e.g. "se-v2-xK9mP3rQ7wL" — same
//                                            value must be in all HTML files
//                                            as PROXY_SECRET)
//    → Add property:  CRM_PASSWORD       =  (Vanessa's chosen CRM login password)
//    → Add property:  SESSION_KEY        =  (a second long random string, DIFFERENT
//                                            from PROXY_SECRET — signs login tokens)
//    → Add property:  REQUIRE_TOKEN      =  true  (set to "false" to roll back to
//                                            the old behavior instantly)
//    → Add property:  AI_DAILY_LIMIT     =  50  (optional — default is 50 if omitted;
//                                            raise or lower this if needed)
//
// 3. Create a Google Sheet:
//    → Go to sheets.google.com → New blank spreadsheet
//    → Name it "Styled Escapes CRM"
//    → Copy the ID from the URL:
//      https://docs.google.com/spreadsheets/d/  <<THIS PART>>  /edit
//    → Paste that ID into Script Properties as CRM_SHEET_ID
//
// 4. The script will auto-create the sheet headers on first use.
//
// 5. Click Deploy → New Deployment
//    → Type: Web App
//    → Execute as: Me
//    → Who has access: Anyone
//    → Click Deploy → Copy the Web App URL
//
// 6. Paste the Web App URL into all HTML files as YOUR_GAS_WEB_APP_URL
// 7. Paste your PROXY_SECRET value into all HTML files as YOUR_PROXY_SECRET
// ================================================================

const PROPS         = PropertiesService.getScriptProperties();
const ANTHROPIC_KEY = PROPS.getProperty('ANTHROPIC_API_KEY');
const CRM_SHEET_ID  = PROPS.getProperty('CRM_SHEET_ID');
const PROXY_SECRET  = PROPS.getProperty('PROXY_SECRET');
const CRM_PASSWORD  = PROPS.getProperty('CRM_PASSWORD');
const SESSION_KEY   = PROPS.getProperty('SESSION_KEY');
const REQUIRE_TOKEN = PROPS.getProperty('REQUIRE_TOKEN') === 'true';
const TOKEN_TTL_MS  = 12 * 60 * 60 * 1000; // 12 hours

// Sheet tab names
const TAB_CLIENTS        = 'Clients';
const TAB_TODOS          = 'Todos';
const TAB_NOTES          = 'Notes';
const TAB_ITINERARIES    = 'Itineraries';
const TAB_ITINERARY_DAYS = 'ItineraryDays';

// ── CORS headers helper ──────────────────────────────────────────
function corsOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Main entry point ─────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ── Secret validation ────────────────────────────────────────
    // If PROXY_SECRET is set in Script Properties, every request
    // must include a matching 'secret' field or it is rejected.
    if (PROXY_SECRET && data.secret !== PROXY_SECRET) {
      return corsOutput({ success: false, error: 'Unauthorized' });
    }

    // ── Session token check (deny by default) ────────────────────
    // Only the routes in isPublicRoute() work without a login token.
    // REQUIRE_TOKEN=false (Script Property) turns enforcement off.
    if (REQUIRE_TOKEN && !isPublicRoute(data) && !validToken(data.token)) {
      return corsOutput({ success: false, error: 'AUTH', auth: false });
    }

    // Route by type
    if (data.type === 'crmAuth') {
      return handleCrmAuth(data.password);
    } else if (data.type === 'crm') {
      return handleCRM(data);
    } else if (data.type === 'itinerary') {
      return handleItinerary(data);
    } else if (data.type === 'content') {
      const text = generateContent(data.prompt);
      return corsOutput({ success: true, text });
    } else {
      // Default: AI follow-up email draft
      const draft = generateFollowUp(data);
      return corsOutput({ success: true, draft });
    }

  } catch (err) {
    return corsOutput({ success: false, error: err.message });
  }
}

// doGet returns a minimal response — no information about the service
function doGet() {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}



// ================================================================
// Session tokens — stateless, signed with SESSION_KEY
// ================================================================
// token = <expiryMs>.<HMAC-SHA256(expiryMs, SESSION_KEY), web-safe base64>
// Issued by handleCrmAuth on a correct password; sent back by the
// CRM and itinerary builder as data.token. Nothing is stored.
// Changing SESSION_KEY instantly logs everyone out.

function signToken(expMs) {
  const sig = Utilities.computeHmacSha256Signature(String(expMs), SESSION_KEY);
  return Utilities.base64EncodeWebSafe(sig);
}

function makeToken() {
  if (!SESSION_KEY) return null;
  const exp = Date.now() + TOKEN_TTL_MS;
  return exp + '.' + signToken(exp);
}

function validToken(t) {
  if (!SESSION_KEY || typeof t !== 'string') return false;
  const i = t.indexOf('.');
  if (i < 1) return false;
  const exp = t.slice(0, i);
  const sig = t.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const good = signToken(exp);
  if (sig.length !== good.length) return false;
  let diff = 0;                       // constant-time compare
  for (let k = 0; k < good.length; k++) diff |= sig.charCodeAt(k) ^ good.charCodeAt(k);
  return diff === 0;
}

// Routes that work WITHOUT a token (public pages use these).
// Everything not listed here requires a valid token.
function isPublicRoute(d) {
  if (d.type === 'crmAuth') return true;                                  // login itself
  if (d.type === 'crm' && (d.action === 'chatbotLead' || d.action === 'leadCapture')) return true;
  if (d.type === 'itinerary' && d.action === 'getItinerary') return true;  // client share link
  if (!d.type) return true;                                               // chatbot AI follow-up draft
  return false;
}

// ================================================================
// CRM Authentication — server-side password check with lockout
// ================================================================
// Lockout: 5 failed attempts within any window locks the account
// for 15 minutes. Counter resets on successful login.
// State stored in Script Properties:
//   LOGIN_FAIL_COUNT    — integer, number of consecutive failures
//   LOGIN_LOCKOUT_UNTIL — ISO timestamp, empty if not locked
// ================================================================

function handleCrmAuth(password) {
  const MAX_ATTEMPTS    = 5;
  const LOCKOUT_MINUTES = 15;

  const now          = new Date();
  const lockoutUntil = PROPS.getProperty('LOGIN_LOCKOUT_UNTIL');
  const failCount    = parseInt(PROPS.getProperty('LOGIN_FAIL_COUNT') || '0', 10);

  // ── Check if currently locked out ───────────────────────────
  if (lockoutUntil) {
    const lockoutTime = new Date(lockoutUntil);
    if (now < lockoutTime) {
      const minsLeft = Math.ceil((lockoutTime - now) / 60000);
      return corsOutput({
        success:  false,
        locked:   true,
        message:  'Too many failed attempts. Try again in ' + minsLeft + ' minute' + (minsLeft === 1 ? '' : 's') + '.'
      });
    } else {
      // Lockout expired — clear it
      PROPS.deleteProperty('LOGIN_LOCKOUT_UNTIL');
      PROPS.setProperty('LOGIN_FAIL_COUNT', '0');
    }
  }

  // ── Check password ───────────────────────────────────────────
  if (!CRM_PASSWORD) {
    return corsOutput({ success: false, message: 'CRM_PASSWORD not configured in Script Properties.' });
  }

  if (password === CRM_PASSWORD) {
    // Success — reset fail counter
    PROPS.setProperty('LOGIN_FAIL_COUNT', '0');
    PROPS.deleteProperty('LOGIN_LOCKOUT_UNTIL');
    return corsOutput({ success: true, token: makeToken() });
  }

  // ── Wrong password — increment counter ───────────────────────
  const newCount = failCount + 1;
  const remaining = MAX_ATTEMPTS - newCount;

  if (newCount >= MAX_ATTEMPTS) {
    const lockUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
    PROPS.setProperty('LOGIN_LOCKOUT_UNTIL', lockUntil.toISOString());
    PROPS.setProperty('LOGIN_FAIL_COUNT', String(newCount));
    return corsOutput({
      success:  false,
      locked:   true,
      message:  'Too many failed attempts. Account locked for ' + LOCKOUT_MINUTES + ' minutes.'
    });
  }

  PROPS.setProperty('LOGIN_FAIL_COUNT', String(newCount));
  return corsOutput({
    success:   false,
    locked:    false,
    remaining: remaining,
    message:   'Incorrect password. ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.'
  });
}

// ================================================================
// CRM — Google Sheets backend
// ================================================================
// Client row columns (0-indexed):
//   0: id  1: name  2: email  3: phone  4: address
//   5: bday  6: source  7: interests (JSON array)  8: general_notes  9: created
//
// Todos row columns:
//   0: id  1: clientId  2: text  3: due  4: done  5: created
//
// Notes row columns:
//   0: id  1: clientId  2: text  3: date

function handleCRM(data) {
  ensureSheets();

  switch (data.action) {

    case 'getAll':
      return corsOutput({
        success: true,
        clients: getClients(),
        todos:   getTodos(),
        notes:   getNotes()
      });

    case 'addClient': {
      const c = data.client;
      getSheet(TAB_CLIENTS).appendRow([
        c.id, c.name, c.email||'', c.phone||'', c.address||'',
        c.bday||'', c.source||'', JSON.stringify(c.interests||[]),
        c.general_notes||'', c.created || nowStr()
      ]);
      return corsOutput({ success: true });
    }

    case 'updateClient': {
      const c = data.client;
      const sheet = getSheet(TAB_CLIENTS);
      const row = findRow(sheet, c.id);
      if (row < 0) return corsOutput({ success: false, error: 'Client not found' });
      sheet.getRange(row, 1, 1, 10).setValues([[
        c.id, c.name, c.email||'', c.phone||'', c.address||'',
        c.bday||'', c.source||'', JSON.stringify(c.interests||[]),
        c.general_notes||'', c.created||nowStr()
      ]]);
      return corsOutput({ success: true });
    }

    case 'deleteClient': {
      const id = data.id;
      deleteRowById(getSheet(TAB_CLIENTS), id);
      // Also delete all todos and notes for this client
      deleteRowsByClientId(getSheet(TAB_TODOS), id);
      deleteRowsByClientId(getSheet(TAB_NOTES), id);
      return corsOutput({ success: true });
    }

    case 'addTodo': {
      const t = data.todo;
      getSheet(TAB_TODOS).appendRow([
        t.id, t.clientId, t.text, t.due||'',
        t.done ? 'true' : 'false', nowStr()
      ]);
      return corsOutput({ success: true });
    }

    case 'updateTodo': {
      const t = data.todo;
      const sheet = getSheet(TAB_TODOS);
      const row = findRow(sheet, t.id);
      if (row < 0) return corsOutput({ success: false, error: 'Todo not found' });
      sheet.getRange(row, 1, 1, 6).setValues([[
        t.id, t.clientId, t.text, t.due||'',
        t.done ? 'true' : 'false', t.created||nowStr()
      ]]);
      return corsOutput({ success: true });
    }

    case 'deleteTodo': {
      deleteRowById(getSheet(TAB_TODOS), data.id);
      return corsOutput({ success: true });
    }

    case 'addNote': {
      const n = data.note;
      getSheet(TAB_NOTES).appendRow([
        n.id, n.clientId, n.text, n.date||nowStr()
      ]);
      return corsOutput({ success: true });
    }

    case 'deleteNote': {
      deleteRowById(getSheet(TAB_NOTES), data.id);
      return corsOutput({ success: true });
    }

    // ── Public forms (quizzes, landing page): create-or-update ────
    // Replaces the old getAll + addClient + addNote/addTodo sequence,
    // so public pages never read the client list.
    // Accepts { lead:{ firstName,lastName,name,email,phone }, source,
    //   interests:[], generalNotes, note, todo:{ text, dueDays } }
    case 'leadCapture': {
      const L          = data.lead || {};
      const emailLower = String(L.email || '').trim().toLowerCase();
      if (!emailLower || emailLower.length > 200 || emailLower.indexOf('@') < 1) {
        return corsOutput({ success: false, error: 'Valid email required' });
      }
      const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
      const name = clip(L.name || ((L.firstName || '') + ' ' + (L.lastName || '')).trim() || 'Unknown', 120);
      const source    = clip(data.source, 80) || 'Website';
      const interests = (Array.isArray(data.interests) ? data.interests : []).slice(0, 10).map(x => clip(x, 40));
      const ts        = nowStr();

      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const existing = getClients().find(c => (c.email || '').trim().toLowerCase() === emailLower) || null;
        let clientId;

        if (existing) {
          clientId = existing.id;
          const merged = Array.from(new Set([...(existing.interests || []), ...interests]));
          const phone  = existing.phone || clip(L.phone, 40);
          const sheet  = getSheet(TAB_CLIENTS);
          const row    = findRow(sheet, clientId);
          if (row > 0) {
            sheet.getRange(row, 1, 1, 10).setValues([[
              existing.id, existing.name, existing.email || '', phone,
              existing.address || '', existing.bday || '', existing.source || '',
              JSON.stringify(merged), existing.general_notes || '', existing.created || ts
            ]]);
          }
        } else {
          clientId = genId();
          getSheet(TAB_CLIENTS).appendRow([
            clientId, name, clip(L.email, 200), clip(L.phone, 40), '', '', source,
            JSON.stringify(interests), clip(data.generalNotes, 1000), ts
          ]);
        }

        if (data.note) {
          getSheet(TAB_NOTES).appendRow([genId(), clientId, clip(data.note, 2000), ts]);
        }
        if (data.todo && data.todo.text) {
          const due = new Date();
          due.setDate(due.getDate() + (Number(data.todo.dueDays) || 1));
          const dueStr = due.getFullYear() + '-' +
            String(due.getMonth() + 1).padStart(2, '0') + '-' +
            String(due.getDate()).padStart(2, '0');
          getSheet(TAB_TODOS).appendRow([genId(), clientId, clip(data.todo.text, 300), dueStr, 'false', ts]);
        }
        // Deliberately returns no client data.
        return corsOutput({ success: true, isNew: !existing });
      } finally {
        lock.releaseLock();
      }
    }

    // ── Chatbot: create-or-update from a chatbot submission ─────
    // Accepts { action:'chatbotLead', lead: { name, email, phone,
    //   destination, dates, travelers, budget }, followUpText, interests }
    // Handles the duplicate check + write atomically on the server
    // so the chatbot doesn't need two round-trips.
    case 'chatbotLead': {
      const lead        = data.lead        || {};
      const followUpTxt = data.followUpText || '';
      const interests   = data.interests   || [];

      const emailLower = (lead.email || '').trim().toLowerCase();
      const timestamp  = nowStr();

      const tripSummary =
        'Trip Inquiry — submitted via chatbot on ' + timestamp + '\n' +
        '──────────────────────────────\n' +
        'Destination:  ' + (lead.destination || 'Not provided') + '\n' +
        'Travel dates: ' + (lead.dates       || 'Not provided') + '\n' +
        'Travelers:    ' + (lead.travelers   || 'Not provided') + '\n' +
        'Budget:       ' + (lead.budget      || 'Not provided');

      const followUpNote =
        'AI Follow-Up Draft — ' + timestamp + '\n' +
        '──────────────────────────────\n' +
        (followUpTxt || 'Not generated');

      // Check for existing client by email
      let existingClient = null;
      if (emailLower) {
        const all = getClients();
        existingClient = all.find(c => (c.email || '').trim().toLowerCase() === emailLower) || null;
      }

      let clientId;

      if (existingClient) {
        // ── UPDATE: merge interests, fill missing phone ──────────
        clientId = existingClient.id;

        const merged = Array.from(new Set([...(existingClient.interests || []), ...interests]));
        existingClient.interests = merged;
        if (lead.phone && !existingClient.phone) existingClient.phone = lead.phone;

        const sheet = getSheet(TAB_CLIENTS);
        const row   = findRow(sheet, clientId);
        if (row > 0) {
          sheet.getRange(row, 1, 1, 10).setValues([[
            existingClient.id,
            existingClient.name,
            existingClient.email   || '',
            existingClient.phone   || '',
            existingClient.address || '',
            existingClient.bday    || '',
            existingClient.source  || '',
            JSON.stringify(existingClient.interests),
            existingClient.general_notes || '',
            existingClient.created       || timestamp
          ]]);
        }

      } else {
        // ── CREATE: new client record ────────────────────────────
        clientId = genId();
        getSheet(TAB_CLIENTS).appendRow([
          clientId,
          lead.name    || 'Unknown',
          lead.email   || '',
          lead.phone   || '',
          '',                          // address
          '',                          // bday
          'Chatbot',                   // source
          JSON.stringify(interests),
          '',                          // general_notes
          timestamp                    // created
        ]);
      }

      // ── Write trip summary note ──────────────────────────────
      getSheet(TAB_NOTES).appendRow([genId(), clientId, tripSummary, timestamp]);

      // ── Write follow-up draft note ───────────────────────────
      if (followUpTxt) {
        getSheet(TAB_NOTES).appendRow([genId(), clientId, followUpNote, timestamp]);
      }

      // ── Create follow-up todo due tomorrow ───────────────────
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.getFullYear() + '-' +
        String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' +
        String(tomorrow.getDate()).padStart(2, '0');
      const todoText = 'Follow up with ' + (lead.name || 'new lead') +
        ' — chatbot inquiry re: ' + (lead.destination || 'trip');
      getSheet(TAB_TODOS).appendRow([
        genId(), clientId, todoText, tomorrowStr, 'false', timestamp
      ]);

      return corsOutput({ success: true, clientId, isNew: !existingClient });
    }

    default:
      return corsOutput({ success: false, error: 'Unknown CRM action: ' + data.action });
  }
}


// ── Sheet helpers ────────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.openById(CRM_SHEET_ID);
  return ss.getSheetByName(name);
}

function ensureSheets() {
  const ss = SpreadsheetApp.openById(CRM_SHEET_ID);

  const clientHeaders = ['id','name','email','phone','address','bday','source','interests','general_notes','created'];
  const todoHeaders   = ['id','clientId','text','due','done','created'];
  const noteHeaders   = ['id','clientId','text','date'];

  const itineraryHeaders = [
    'id','clientId','title','destination','tripType','startDate','endDate',
    'travelers','flightOut','flightReturn','accommodation','confirmationNumbers',
    'importantNumbers','vanessaNotes','status','created','updated'
  ];
  const itineraryDayHeaders = [
    'id','itineraryId','dayNumber','date','title','description','meals','notes'
  ];

  ensureTab(ss, TAB_CLIENTS,        clientHeaders);
  ensureTab(ss, TAB_TODOS,          todoHeaders);
  ensureTab(ss, TAB_NOTES,          noteHeaders);
  ensureTab(ss, TAB_ITINERARIES,    itineraryHeaders);
  ensureTab(ss, TAB_ITINERARY_DAYS, itineraryDayHeaders);
}

function ensureTab(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    // Style header row
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1A4A5C')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  }
}

function findRow(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1; // 1-indexed
  }
  return -1;
}

function deleteRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  // iterate backwards to safely delete
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function deleteRowsByClientId(sheet, clientId) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(clientId)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function getClients() {
  const sheet = getSheet(TAB_CLIENTS);
  const rows  = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue; // skip empty rows
    result.push({
      id:            String(r[0]),
      name:          String(r[1]),
      email:         String(r[2]),
      phone:         String(r[3]),
      address:       String(r[4]),
      bday:          toDateStr(r[5]),
      source:        String(r[6]),
      interests:     safeParseJSON(r[7], []),
      general_notes: String(r[8]),
      created:       String(r[9])
    });
  }
  return result;
}

function getTodos() {
  const sheet = getSheet(TAB_TODOS);
  const rows  = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    result.push({
      id:       String(r[0]),
      clientId: String(r[1]),
      text:     String(r[2]),
      due:      toDateStr(r[3]),
      done:     String(r[4]) === 'true',
      created:  String(r[5])
    });
  }
  return result;
}

function getNotes() {
  const sheet = getSheet(TAB_NOTES);
  const rows  = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    result.push({
      id:       String(r[0]),
      clientId: String(r[1]),
      text:     String(r[2]),
      date:     String(r[3])
    });
  }
  return result;
}

function safeParseJSON(val, fallback) {
  try { return JSON.parse(val); } catch(e) { return fallback; }
}

// Sheets auto-converts date-like strings to JS Date objects via getValues().
// This normalises whatever comes back into a plain YYYY-MM-DD string.
function toDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already YYYY-MM-DD
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return s;
}

function nowStr() {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}


// ================================================================
// Itineraries — Google Sheets backend
// ================================================================
// Itineraries tab columns (0-indexed):
//   0:id  1:clientId  2:title  3:destination  4:tripType
//   5:startDate  6:endDate  7:travelers  8:flightOut  9:flightReturn
//   10:accommodation  11:confirmationNumbers  12:importantNumbers
//
// ItineraryDays tab columns (0-indexed):
//   0:id  1:itineraryId  2:dayNumber  3:date  4:title
//   5:description  6:meals  7:notes
// ================================================================

function handleItinerary(data) {
  ensureSheets();

  switch (data.action) {

    // ── Save (create or update) ─────────────────────────────────
    case 'saveItinerary': {
      const it      = data.itinerary;
      const days    = data.days || [];
      const isNew   = !it.id;
      const itId    = isNew ? genId() : it.id;
      const ts      = nowStr();
      const sheet   = getSheet(TAB_ITINERARIES);

      const row = [
        itId,
        it.clientId        || '',
        it.title           || '',
        it.destination     || '',
        it.tripType        || '',
        it.startDate       || '',
        it.endDate         || '',
        it.travelers       || '',
        it.flightOut       || '',
        it.flightReturn    || '',
        it.accommodation   || '',
        it.confirmationNumbers || '',
        it.importantNumbers    || '',
        it.vanessaNotes        || '',
        it.status          || 'active',
        isNew ? ts : (it.created || ts),
        ts
      ];

      if (isNew) {
        sheet.appendRow(row);
      } else {
        const existingRow = findRow(sheet, itId);
        if (existingRow < 0) return corsOutput({ success: false, error: 'Itinerary not found' });
        sheet.getRange(existingRow, 1, 1, 17).setValues([row]);
      }

      // ── Replace all days for this itinerary ──────────────────
      const daySheet = getSheet(TAB_ITINERARY_DAYS);
      deleteRowsByItineraryId(daySheet, itId);
      days.forEach(function(d, i) {
        daySheet.appendRow([
          d.id || genId(),
          itId,
          d.dayNumber || (i + 1),
          d.date      || '',
          d.title     || '',
          d.description || '',
          d.meals     || '',
          d.notes     || ''
        ]);
      });

      return corsOutput({ success: true, itineraryId: itId, isNew: isNew });
    }

    // ── Get one itinerary + its days ────────────────────────────
    case 'getItinerary': {
      const itId = data.itineraryId;
      if (!itId) return corsOutput({ success: false, error: 'itineraryId required' });

      const sheet    = getSheet(TAB_ITINERARIES);
      const rows     = sheet.getDataRange().getValues();
      let itRow      = null;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(itId)) { itRow = rows[i]; break; }
      }
      if (!itRow) return corsOutput({ success: false, error: 'Itinerary not found' });

      const itinerary = {
        id:                   String(itRow[0]),
        clientId:             String(itRow[1]),
        title:                String(itRow[2]),
        destination:          String(itRow[3]),
        tripType:             String(itRow[4]),
        startDate:            toDateStr(itRow[5]),
        endDate:              toDateStr(itRow[6]),
        travelers:            String(itRow[7]),
        flightOut:            String(itRow[8]),
        flightReturn:         String(itRow[9]),
        accommodation:        String(itRow[10]),
        confirmationNumbers:  String(itRow[11]),
        importantNumbers:     String(itRow[12]),
        vanessaNotes:         String(itRow[13]),
        status:               String(itRow[14]),
        created:              String(itRow[15]),
        updated:              String(itRow[16])
      };

      // Fetch days, sorted by dayNumber
      const daySheet = getSheet(TAB_ITINERARY_DAYS);
      const dayRows  = daySheet.getDataRange().getValues();
      const days     = [];
      for (let i = 1; i < dayRows.length; i++) {
        const dr = dayRows[i];
        if (!dr[0]) continue;
        if (String(dr[1]) === String(itId)) {
          days.push({
            id:          String(dr[0]),
            itineraryId: String(dr[1]),
            dayNumber:   Number(dr[2]),
            date:        toDateStr(dr[3]),
            title:       String(dr[4]),
            description: String(dr[5]),
            meals:       String(dr[6]),
            notes:       String(dr[7])
          });
        }
      }
      days.sort(function(a, b) { return a.dayNumber - b.dayNumber; });

      // Also fetch client name for the viewer
      let clientName = '';
      const clientSheet = getSheet(TAB_CLIENTS);
      const clientRows  = clientSheet.getDataRange().getValues();
      for (let i = 1; i < clientRows.length; i++) {
        if (String(clientRows[i][0]) === String(itinerary.clientId)) {
          clientName = String(clientRows[i][1]);
          break;
        }
      }

      return corsOutput({ success: true, itinerary: itinerary, days: days, clientName: clientName });
    }

    // ── Get all itinerary headers for a client ──────────────────
    case 'getClientItineraries': {
      const clientId = data.clientId;
      if (!clientId) return corsOutput({ success: false, error: 'clientId required' });

      const sheet = getSheet(TAB_ITINERARIES);
      const rows  = sheet.getDataRange().getValues();
      const result = [];

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        if (String(r[1]) === String(clientId)) {
          result.push({
            id:          String(r[0]),
            title:       String(r[2]),
            destination: String(r[3]),
            tripType:    String(r[4]),
            startDate:   toDateStr(r[5]),
            endDate:     toDateStr(r[6]),
            status:      String(r[14]),
            created:     String(r[15]),
            updated:     String(r[16])
          });
        }
      }
      // Newest first
      result.sort(function(a, b) { return b.created > a.created ? 1 : -1; });

      return corsOutput({ success: true, itineraries: result });
    }

    default:
      return corsOutput({ success: false, error: 'Unknown itinerary action: ' + data.action });
  }
}

// ── Delete all day rows for a given itineraryId ──────────────────
function deleteRowsByItineraryId(sheet, itineraryId) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(itineraryId)) {
      sheet.deleteRow(i + 1);
    }
  }
}


// ================================================================
// AI — Follow-up email
// ================================================================
function generateFollowUp(data) {
  const prompt = `You are drafting a warm, personalized follow-up email for Vanessa Jacobs, a travel consultant at Styled Escapes by Vanessa (Dream Vacations). A potential client just submitted a trip inquiry. Draft a short, friendly email from Vanessa to the client.

Client details:
- Name: ${data.name || 'there'}
- Destination / Trip type: ${data.destination || 'not specified'}
- Travel dates: ${data.dates || 'not specified'}
- Travelers: ${data.travelers || 'not specified'}
- Budget: ${data.budget || 'not specified'}
- Email: ${data.email || 'not provided'}
- Phone: ${data.phone || 'not provided'}

Guidelines:
- Warm, conversational tone — not corporate
- Address them by first name if available
- Reference 1-2 specific details from their inquiry to show you read it
- Briefly mention what Vanessa will prepare for them
- Include a soft call to action (schedule a quick call or reply with questions)
- Sign off as Vanessa Jacobs, Styled Escapes by Vanessa
- Keep it under 150 words
- Do NOT include a subject line, just the email body
- Plain text, no markdown`;

  return callAnthropic(prompt);
}


// ================================================================
// AI — Social media content
// ================================================================
function generateContent(prompt) {
  return callAnthropic(prompt);
}


// ── Shared Anthropic call ────────────────────────────────────────
// Daily rate limit: MAX_AI_CALLS_PER_DAY calls allowed per calendar day.
// Tracked in Script Properties:
//   AI_CALL_DATE  — today's date string (YYYY-MM-DD), resets counter when it changes
//   AI_CALL_COUNT — number of AI calls made today
// Override the limit by setting an AI_DAILY_LIMIT Script Property (optional).

const MAX_AI_CALLS_PER_DAY = 50;

function callAnthropic(prompt) {
  // ── Rate limit check ─────────────────────────────────────────
  const limit    = parseInt(PROPS.getProperty('AI_DAILY_LIMIT') || String(MAX_AI_CALLS_PER_DAY), 10);
  const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lastDate = PROPS.getProperty('AI_CALL_DATE')  || '';
  const count    = lastDate === today
    ? parseInt(PROPS.getProperty('AI_CALL_COUNT') || '0', 10)
    : 0; // new day — reset

  if (count >= limit) {
    throw new Error(
      'Daily AI call limit reached (' + limit + '/day). ' +
      'Resets at midnight. Contact Ron if this is unexpected.'
    );
  }

  // Increment counter (reset date if new day)
  PROPS.setProperty('AI_CALL_DATE',  today);
  PROPS.setProperty('AI_CALL_COUNT', String(count + 1));

  // ── Anthropic API call ───────────────────────────────────────
  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  const json = JSON.parse(response.getContentText());

  if (json.error) throw new Error(json.error.message);
  return json.content.find(b => b.type === 'text').text;
}
