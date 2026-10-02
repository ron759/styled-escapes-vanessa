// ================================================================
// Styled Escapes CRM — Trips (intake form, list, pipeline card)
// Loaded by vanessa-crm.html before its main script. Uses the CRM's
// globals (clients, allTodos, getClient, gasPost, esc, showToast …)
// only when functions run, never at load time.
// ================================================================

var allTrips = [];

// ── Option lists ─────────────────────────────────────────────────
var TRIP_STAGES = ['Inquiry','Gathering info','Quoting','Proposal sent','Booked','Deposit paid','Final payment due','Traveling','Completed','Not now / Lost'];
var STAGE_LOST = 'Not now / Lost';
var OPEN_STAGES = ['Inquiry','Gathering info','Quoting','Proposal sent','Booked','Deposit paid','Final payment due'];
var TRIP_TYPES = ['Cruise','All-Inclusive','Other'];

var YES_NO = ['Yes','No'];
var YES_NO_MAYBE = ['Yes','No','Maybe'];

var DEST_SUGGEST = {
  'Cruise': ['Western Caribbean','Eastern Caribbean','Southern Caribbean','Bahamas','Alaska','Mexican Riviera','Hawaii','Mediterranean','Northern Europe','Canada / New England','Transatlantic','Other'],
  'All-Inclusive': ['Cancun','Riviera Maya','Punta Cana','Puerto Vallarta','Los Cabos','Jamaica','Bahamas','Aruba','Costa Rica','Other']
};
var LENGTH_SUGGEST = {
  'Cruise': ['3–4 nights','5–6 nights','7 nights','8–10 nights','11+ nights'],
  'All-Inclusive': ['Long weekend','4–5 nights','7 nights','8+ nights']
};

// Field specs: k = key, s = 'd' when stored inside details, t = type
// t: text | number | date | area | btn (single choice) | chips (multi) | select | list (text + suggestions)
var F = {
  trip: [
    { k:'occasion', l:'Occasion', t:'select', o:['None','Honeymoon','Anniversary','Birthday','Babymoon','Family reunion','Girls trip','Retirement','Graduation','Other'] },
    { k:'occasionDate', l:'Occasion date', t:'date' },
    { k:'source', l:'How they found Vanessa', t:'select', o:'SOURCES' }
  ],
  who: [
    { k:'adults', l:'Adults', t:'number' },
    { k:'children', l:'Children', t:'number' },
    { k:'childAges', l:'Children\u2019s ages', t:'ages', w:'full', show:function(f){ return Number(f.children) > 0; } },
    { k:'travelerNames', l:'Traveler names (first and last, one per line)', t:'area', w:'full' },
    { k:'accessibility', l:'Accessibility needs?', t:'btn', o:YES_NO },
    { k:'accessibilityNotes', l:'Accessibility notes', t:'area', w:'full', show:function(f){ return f.accessibility === 'Yes'; } }
  ],
  when: [
    { k:'travelStart', l:'Travel start', t:'date' },
    { k:'travelEnd', l:'Travel end', t:'date' },
    { k:'dateFlex', l:'How flexible are the dates?', t:'btn', o:['Fixed','A few days','By month','Wide open'], w:'full' },
    { k:'dateFlexNotes', l:'Flexibility notes', t:'text', w:'full' },
    { k:'tripLength', l:'Trip length', t:'list', o:'LENGTH' },
    { k:'bookingTimeline', l:'When do they want to book?', t:'btn', o:['Ready now','Within a month','1–3 months','3–6 months','Just exploring'], w:'full' }
  ],
  money: [
    { k:'budgetMin', l:'Budget (low, or the one amount)', t:'number' },
    { k:'budgetMax', l:'Budget (high)', t:'number' },
    { k:'budgetBasis', l:'Budget is', t:'btn', o:['Total','Per person','Per room'], w:'full' },
    { k:'budgetFirmness', l:'How firm is it?', t:'btn', o:['Firm','Some flexibility','Not sure'], w:'full' },
    { k:'departFrom', l:'Departing from', t:'text' },
    { k:'passports', l:'Passports', t:'btn', o:['All have them','Some need one','Not sure'], w:'full' },
    { k:'insurance', l:'Travel insurance', t:'btn', o:['Wants a quote','Has their own','Not interested'], w:'full' },
    { k:'rentalCar', l:'Rental car', t:'btn', o:['Needed','Not needed'], w:'full' }
  ],
  prefs: [
    { k:'mustHaves', l:'Must-haves', t:'area', w:'full' },
    { k:'dealbreakers', l:'Dealbreakers', t:'area', w:'full' },
    { k:'pastTrips', l:'Past trips they loved (or didn’t)', t:'area', w:'full' },
    { k:'dietary', l:'Dietary needs / allergies to plan around', t:'text', w:'full' }
  ],
  cruise: [
    { s:'d', k:'experience', l:'Cruise experience', t:'btn', o:['First cruise','Has cruised','Very experienced'], w:'full' },
    { s:'d', k:'lines', l:'Cruise lines they like', t:'chips', o:['Royal Caribbean','Carnival','Norwegian','Princess','Celebrity','Holland America','Disney','Virgin Voyages','MSC','Viking','No preference'], w:'full' },
    { s:'d', k:'shipStyle', l:'Ship style', t:'chips', o:['Mega-ship','Mid-size','Small / boutique','Adults-only','Family-focused'], w:'full' },
    { s:'d', k:'departurePort', l:'Departure port', t:'text' },
    { s:'d', k:'driveOrFly', l:'Drive or fly to the port?', t:'btn', o:['Drive','Fly','Either'] },
    { s:'d', k:'hotelStay', l:'Hotel before/after', t:'btn', o:['Night before','Night after','Both','Neither'], w:'full' },
    { s:'d', k:'cabinType', l:'Cabin type', t:'btn', o:['Interior','Oceanview','Balcony','Suite'], w:'full' },
    { s:'d', k:'cabinCount', l:'Number of cabins', t:'number' },
    { s:'d', k:'cabinSharing', l:'Who shares which cabin', t:'text' },
    { s:'d', k:'bedPreference', l:'Bed preference', t:'btn', o:['Queen','King','Two twins','No preference'], w:'full' },
    { s:'d', k:'diningStyle', l:'Dining style', t:'btn', o:['Main dining room','Specialty','Casual / buffet','Mix'], w:'full' },
    { s:'d', k:'specialtyDining', l:'Specialty dining', t:'btn', o:YES_NO_MAYBE },
    { s:'d', k:'drinkPackage', l:'Drink package', t:'btn', o:YES_NO_MAYBE },
    { s:'d', k:'wifi', l:'Wi-Fi', t:'btn', o:YES_NO_MAYBE },
    { s:'d', k:'kidsPrograms', l:'Kids’ programs', t:'btn', o:YES_NO, show:function(f){ return Number(f.children) > 0; } },
    { s:'d', k:'excursionStyle', l:'Excursion style', t:'chips', o:['Relaxed / beach','Active / adventure','Culture / sightseeing','Ship days only','Mix'], w:'full' },
    { s:'d', k:'portsWanted', l:'Ports or places they want to see', t:'text', w:'full' },
    { s:'d', k:'motionSickness', l:'Motion sickness', t:'btn', o:['No','A little','Yes'] },
    { s:'d', k:'sailingWithGroup', l:'Sailing with another group?', t:'btn', o:YES_NO },
    { s:'d', k:'loyaltyNumber', l:'Loyalty number(s)', t:'text', w:'full' },
    { s:'d', k:'specialRequests', l:'Special requests', t:'area', w:'full' }
  ],
  ai: [
    { s:'d', k:'audience', l:'Who is going', t:'btn', o:['Couple','Family','Friends','Multi-generational','Solo'], w:'full' },
    { s:'d', k:'vibe', l:'Vibe', t:'chips', o:['Relaxing','Lively / party','Romantic','Adventure','Family fun','Luxury'], w:'full' },
    { s:'d', k:'pastResorts', l:'Resorts they’ve stayed at', t:'text', w:'full' },
    { s:'d', k:'roomStyle', l:'Room style', t:'btn', o:['Standard','Swim-out','Overwater / bungalow','Suite'], w:'full' },
    { s:'d', k:'beachImportance', l:'Beach importance', t:'btn', o:['Must be on the beach','Nice to have','Doesn’t matter'], w:'full' },
    { s:'d', k:'roomCount', l:'Number of rooms', t:'number' },
    { s:'d', k:'roomSharing', l:'Who shares which room', t:'text' },
    { s:'d', k:'bedPreference', l:'Bed preference', t:'btn', o:['Queen','King','Two doubles','No preference'], w:'full' },
    { s:'d', k:'diningStyle', l:'Dining style', t:'btn', o:['Buffet','À la carte','Mix'], w:'full' },
    { s:'d', k:'activities', l:'Activities', t:'chips', o:['Spa','Golf','Snorkeling / diving','Water sports','Nightlife','Tours / excursions','Kids club','Adults-only area'], w:'full' },
    { s:'d', k:'premiumDrinks', l:'Premium drinks', t:'btn', o:YES_NO_MAYBE },
    { s:'d', k:'flightPreference', l:'Flights', t:'btn', o:['Nonstop only','Connection OK','Not sure'], w:'full' },
    { s:'d', k:'transferTolerance', l:'Airport transfer time', t:'btn', o:['Short only','Up to an hour','Doesn’t matter'], w:'full' },
    { s:'d', k:'celebration', l:'Celebrating something?', t:'btn', o:YES_NO },
    { s:'d', k:'celebrationNotes', l:'What are they celebrating?', t:'text', w:'full', show:function(f, d){ return d.celebration === 'Yes'; } },
    { s:'d', k:'loyaltyNumber', l:'Loyalty number(s)', t:'text', w:'full' }
  ],
  call: [
    { k:'callNotes', l:'Notes from the call (tap the mic on your keyboard to dictate)', t:'area', w:'full', tall:true },
    { k:'nextStep', l:'Next step', t:'text' },
    { k:'nextStepDate', l:'Next step date', t:'date' }
  ],
  pay: [
    { k:'depositDate', l:'Deposit due date', t:'date' },
    { k:'finalPaymentDate', l:'Final payment due date', t:'date' }
  ]
};

// Changing these re-draws the form (other fields only update the value)
var STRUCTURAL = { tripType:1, accessibility:1, celebration:1 };

// ── Form state ───────────────────────────────────────────────────
var TR = {
  form: null,        // working copy shown in the form
  isNew: false,      // not on the server yet
  dirtyF: {},        // top-level fields changed since last save
  dirtyD: {},        // details keys changed since last save
  timer: null, draftTimer: null,
  saving: false, again: false,
  state: ''          // '', 'dirty', 'saving', 'saved', 'error'
};

function tripsForClient(cid) {
  return allTrips.filter(function(t) { return t.clientId === cid; })
    .sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
}
function getTrip(id) { return allTrips.find(function(t) { return t.id === id; }) || null; }
function tripDaysInStage(t) {
  var ms = Date.parse(t.statusChangedAt || t.createdAt);
  if (isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}
function tripDates(t) {
  if (t.travelStart && t.travelEnd) return fmtDate(t.travelStart) + ' – ' + fmtDate(t.travelEnd);
  if (t.travelStart) return fmtDate(t.travelStart);
  return '';
}
function trDevMode() { return !GAS_URL || GAS_URL === 'YOUR_GAS_WEB_APP_URL'; }

// ── Trips tab (list) ─────────────────────────────────────────────
function renderTripsTab() {
  var b = document.getElementById('tabBody');
  var c = getClient(selectedId);
  if (!b || !c) return;
  if (TR.form && TR.form.clientId === c.id) { renderTripForm(); return; }
  TR.form = null;
  var list = tripsForClient(c.id);
  b.innerHTML =
    '<div class="tr-list-head">' +
      '<div class="tr-muted">Trips this client is planning</div>' +
      '<button type="button" class="btn-action primary tr-new" id="trNew">+ New Trip</button>' +
    '</div>' +
    (list.length ? list.map(tripRowHtml).join('') :
      '<div class="empty-tab"><p>No trips yet.<br>Tap <strong>+ New Trip</strong> to take the details during a call.</p></div>');
  document.getElementById('trNew').onclick = function() { openTripForm(null); };
  Array.prototype.forEach.call(b.querySelectorAll('[data-trip]'), function(el) {
    el.onclick = function() { openTripForm(el.getAttribute('data-trip')); };
  });
}

function stageChip(s) {
  var cls = s === STAGE_LOST ? 'lost' : s === 'Completed' || s === 'Traveling' ? 'done' : s === 'Booked' || s === 'Deposit paid' || s === 'Final payment due' ? 'booked' : 'open';
  return '<span class="tr-chip ' + cls + '">' + esc(s) + '</span>';
}

function tripRowHtml(t) {
  var d = tripDaysInStage(t);
  return '<div class="tr-row' + (t.status === STAGE_LOST ? ' dim' : '') + '" data-trip="' + esc(t.id) + '" tabindex="0">' +
    '<div class="tr-row-main">' +
      '<div class="tr-row-title">' + esc(t.title || t.destination || 'Trip') + '</div>' +
      '<div class="tr-row-sub">' + esc([t.destination, tripDates(t)].filter(Boolean).join(' · ')) + '</div>' +
    '</div>' +
    '<div class="tr-row-side">' + stageChip(t.status) + '<div class="tr-muted">' + (d === 0 ? 'today' : d + 'd in stage') + '</div></div>' +
  '</div>';
}

// ── Draft (kept on this device as she types) ─────────────────────
function draftKey(form) { return 'crm_trip_draft_' + form.id; }
function saveDraftNow(form, isNew, dF, dD) {
  form = form || TR.form;
  if (!form) return;
  if (form === TR.form && arguments.length < 2) { isNew = TR.isNew; dF = TR.dirtyF; dD = TR.dirtyD; }
  try {
    localStorage.setItem(draftKey(form), JSON.stringify({ form: form, isNew: isNew, dirtyF: dF, dirtyD: dD, at: Date.now() }));
    // remember the unsaved new-trip draft id per client so re-opening "+ New Trip" restores it
    if (isNew) localStorage.setItem('crm_trip_newdraft_' + form.clientId, form.id);
  } catch (e) {}
}
function clearDraft(form) {
  try {
    localStorage.removeItem(draftKey(form));
    if (localStorage.getItem('crm_trip_newdraft_' + form.clientId) === form.id) localStorage.removeItem('crm_trip_newdraft_' + form.clientId);
  } catch (e) {}
}
function readDraft(id) {
  try { return JSON.parse(localStorage.getItem('crm_trip_draft_' + id) || 'null'); } catch (e) { return null; }
}

// ── Open the form ────────────────────────────────────────────────
function openTripForm(tripId) {
  var c = getClient(selectedId);
  if (!c) return;
  var restored = false;
  if (tripId) {
    var t = getTrip(tripId);
    if (!t) return;
    var dr = readDraft(tripId);
    if (dr && dr.form && Object.keys(dr.dirtyF || {}).length + Object.keys(dr.dirtyD || {}).length > 0) {
      TR.form = dr.form; TR.isNew = false; TR.dirtyF = dr.dirtyF || {}; TR.dirtyD = dr.dirtyD || {};
      restored = true;
    } else {
      TR.form = JSON.parse(JSON.stringify(t)); TR.isNew = false; TR.dirtyF = {}; TR.dirtyD = {};
    }
    if (!TR.form.details) TR.form.details = {};
  } else {
    var nid = null;
    try { nid = localStorage.getItem('crm_trip_newdraft_' + c.id); } catch (e) {}
    var nd = nid ? readDraft(nid) : null;
    if (nd && nd.form && nd.isNew) {
      TR.form = nd.form; TR.isNew = true; TR.dirtyF = nd.dirtyF || {}; TR.dirtyD = nd.dirtyD || {};
      restored = true;
    } else {
      var interests = c.interests || [];
      var type = (interests.indexOf('All-Inclusive Resort') >= 0 && interests.indexOf('Cruise') < 0) ? 'All-Inclusive' : 'Cruise';
      TR.form = { id: genId(), clientId: c.id, status: 'Inquiry', tripType: type, source: c.source || '', details: {}, childAges: [] };
      TR.isNew = true; TR.dirtyF = { tripType: true, status: true, source: true }; TR.dirtyD = {};
    }
  }
  TR.state = Object.keys(TR.dirtyF).length + Object.keys(TR.dirtyD).length > 0 && !TR.isNew ? 'dirty' : '';
  renderTripForm();
  if (restored) showToast('Restored your unsaved draft');
}

function closeTripForm() {
  flushTripSave();
  TR.form = null;
  renderTripsTab();
}

// ── Render the form ──────────────────────────────────────────────
function opts(spec) {
  if (spec.o === 'SOURCES') return SOURCES;
  return spec.o || [];
}

function getVal(spec) {
  var f = TR.form;
  if (spec.s === 'd') return (f.details || {})[spec.k];
  return f[spec.k];
}

function fieldHtml(spec) {
  var f = TR.form, d = f.details || {};
  if (spec.show && !spec.show(f, d)) return '';
  var v = getVal(spec);
  var cls = 'tr-field' + (spec.w === 'full' ? ' full' : '');
  var sAttr = spec.s === 'd' ? ' data-s="d"' : '';
  var key = ' data-k="' + spec.k + '"' + sAttr;
  var h = '<div class="' + cls + '"><label class="tr-label">' + esc(spec.l) + '</label>';
  if (spec.t === 'ages') {
    var n = Math.min(Number(f.children) || 0, 12), ages = Array.isArray(f.childAges) ? f.childAges : [];
    h += '<div class="tr-ages">';
    for (var i = 0; i < n; i++) {
      h += '<input class="tr-in tr-age" type="number" inputmode="numeric" min="0" max="17" aria-label="Child ' + (i + 1) + ' age" data-ci="' + i + '" value="' + esc(ages[i] === undefined ? '' : ages[i]) + '">';
    }
    h += '</div>';
  } else if (spec.t === 'text') {
    h += '<input class="tr-in" type="text"' + key + ' value="' + esc(v || '') + '">';
  } else if (spec.t === 'number') {
    h += '<input class="tr-in" type="number" inputmode="decimal" min="0"' + key + ' value="' + esc(v === undefined ? '' : v) + '">';
  } else if (spec.t === 'date') {
    h += '<input class="tr-in" type="date"' + key + ' value="' + esc(v || '') + '">';
  } else if (spec.t === 'area') {
    h += '<textarea class="tr-in tr-area' + (spec.tall ? ' tall' : '') + '"' + key + '>' + esc(v || '') + '</textarea>';
  } else if (spec.t === 'select') {
    var cur = v || '';
    var list = opts(spec).slice();
    if (cur && list.indexOf(cur) < 0) list.unshift(cur);
    h += '<select class="tr-in"' + key + '><option value="">Select…</option>' +
      list.map(function(o) { return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
  } else if (spec.t === 'list') {
    var sug = spec.o === 'LENGTH' ? (LENGTH_SUGGEST[f.tripType] || []) : (DEST_SUGGEST[f.tripType] || []);
    h += '<input class="tr-in" type="text" list="dl_' + spec.k + '"' + key + ' value="' + esc(v || '') + '">' +
      '<datalist id="dl_' + spec.k + '">' + sug.map(function(o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>';
  } else if (spec.t === 'btn') {
    h += '<div class="tr-btnrow">' + opts(spec).map(function(o) {
      return '<button type="button" class="tr-btn' + (v === o ? ' sel' : '') + '"' + key + ' data-v="' + esc(o) + '">' + esc(o) + '</button>';
    }).join('') + '</div>';
  } else if (spec.t === 'chips') {
    var arr = Array.isArray(v) ? v : [];
    h += '<div class="tr-btnrow">' + opts(spec).map(function(o) {
      return '<button type="button" class="tr-btn multi' + (arr.indexOf(o) >= 0 ? ' sel' : '') + '"' + key + ' data-v="' + esc(o) + '" data-multi="1">' + esc(o) + '</button>';
    }).join('') + '</div>';
  }
  return h + '</div>';
}

function grid(specs) {
  var h = specs.map(fieldHtml).join('');
  return '<div class="tr-grid">' + h + '</div>';
}

function section(id, title, inner, open) {
  return '<details class="tr-sec" data-sec="' + id + '"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary><div class="tr-sec-body">' + inner + '</div></details>';
}

function missingDetails(f) {
  var miss = [];
  if (!String(f.destination || '').trim()) miss.push('destination');
  if (!f.travelStart && !f.dateFlex) miss.push('travel window');
  if (!f.adults) miss.push('adults');
  if (!f.budgetMin && !f.budgetMax) miss.push('budget');
  return miss;
}

function chatbotBoxHtml(f) {
  var raw = f.chatbotRaw;
  if (!Array.isArray(raw) || !raw.length) return '';
  var inner = raw.map(function(r) {
    var when = r.at ? new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return '<div class="tr-bot"><div class="tr-muted">' + esc(when) + '</div>' +
      '<div><strong>Where:</strong> ' + esc(r.destination || '—') + '</div>' +
      '<div><strong>When:</strong> ' + esc(r.dates || '—') + '</div>' +
      '<div><strong>Who:</strong> ' + esc(r.travelers || '—') + '</div>' +
      '<div><strong>Budget:</strong> ' + esc(r.budget || '—') + '</div></div>';
  }).join('');
  return section('bot', 'From the chatbot (their own words)', inner, true);
}

function renderTripForm() {
  var b = document.getElementById('tabBody');
  var c = getClient(selectedId);
  var f = TR.form;
  if (!b || !c || !f) return;
  var scrollEl = b;
  var top = scrollEl.scrollTop;
  var openSecs = {};
  Array.prototype.forEach.call(b.querySelectorAll('details.tr-sec'), function(d) { openSecs[d.getAttribute('data-sec')] = d.open; });

  var d = f.details || {};
  var isCruise = f.tripType === 'Cruise', isAI = f.tripType === 'All-Inclusive';
  var miss = missingDetails(f);
  var contactBits = [];
  if (c.bestTimeToContact) contactBits.push('Best time: ' + c.bestTimeToContact);
  if (c.contactMethod) contactBits.push('Prefers: ' + c.contactMethod);

  var typeBtns = '<div class="tr-btnrow">' + TRIP_TYPES.map(function(t) {
    return '<button type="button" class="tr-btn' + (f.tripType === t ? ' sel' : '') + '" data-k="tripType" data-v="' + esc(t) + '">' + esc(t) + '</button>';
  }).join('') + '</div>';

  var tripSec =
    '<div class="tr-field full"><label class="tr-label">Trip type</label>' + typeBtns + '</div>' +
    '<div class="tr-grid">' +
      fieldHtml({ k:'destination', l: isCruise ? 'Where to? (cruise region)' : isAI ? 'Where to? (resort destination)' : 'Where to?', t:'list', w:'full' }) +
    '</div>' + grid(F.trip);

  var typeSec = isCruise ? section('cruise', 'Cruise details', grid(F.cruise), openSecs.cruise !== false)
              : isAI     ? section('ai', 'All-inclusive details', grid(F.ai), openSecs.ai !== false) : '';

  var stageOpts = TRIP_STAGES.map(function(s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  var stateTxt = TR.state === 'saving' ? 'Saving…' : TR.state === 'saved' ? 'Saved ✓' : TR.state === 'error' ? 'Not saved — draft kept' : TR.state === 'dirty' ? 'Unsaved changes' : (TR.isNew ? 'Not saved yet' : 'Saved ✓');

  b.innerHTML =
    '<div class="tr-form" id="trForm">' +
      '<div class="tr-sticky">' +
        '<button type="button" class="tr-back" id="trBack">← Trips</button>' +
        '<div class="tr-sticky-title">' + esc(c.name) + (f.title ? ' · ' + esc(f.title) : '') + '</div>' +
        '<select class="tr-in tr-stage" id="trStage" aria-label="Stage">' + stageOpts + '</select>' +
        '<span class="tr-state ' + esc(TR.state) + '" id="trState">' + esc(stateTxt) + '</span>' +
        '<button type="button" class="btn-action primary tr-save" id="trSave">Save</button>' +
      '</div>' +
      '<div class="tr-meta">' +
        (contactBits.length ? '<span>' + esc(contactBits.join('  ·  ')) + '</span>' : '<span class="tr-muted">No contact preferences saved</span>') +
        ' <a href="#" id="trEditContact">edit</a>' +
        (miss.length ? '<span class="tr-missing" id="trMissing">Missing key details: ' + esc(miss.join(', ')) + '</span>' : '') +
      '</div>' +
      chatbotBoxHtml(f) +
      section('trip', 'Trip', tripSec, openSecs.trip !== false) +
      section('who', 'Who is traveling', grid(F.who), openSecs.who !== false) +
      section('when', 'When', grid(F.when), openSecs.when !== false) +
      section('money', 'Budget and logistics', grid(F.money), openSecs.money !== false) +
      section('prefs', 'Preferences', grid(F.prefs), openSecs.prefs !== false) +
      typeSec +
      section('call', 'Call notes and next step', grid(F.call), openSecs.call !== false) +
      section('pay', 'Payments (fill in later)', grid(F.pay), openSecs.pay === true) +
      (!TR.isNew ? '<div class="tr-danger"><button type="button" class="btn-action danger" id="trDelete">Delete this trip</button></div>' : '') +
    '</div>';
  scrollEl.scrollTop = top;
  wireTripForm();
}

// ── Wiring (one set of listeners per render) ─────────────────────
function wireTripForm() {
  var root = document.getElementById('trForm');
  if (!root) return;
  document.getElementById('trBack').onclick = closeTripForm;
  document.getElementById('trSave').onclick = function() { saveTripNow(true); };
  document.getElementById('trEditContact').onclick = function(e) {
    e.preventDefault();
    flushTripSave();
    switchTab('info');
    if (!editMode) toggleEdit();
  };
  var del = document.getElementById('trDelete');
  if (del) del.onclick = deleteCurrentTrip;
  document.getElementById('trStage').onchange = function() { onStageChange(this.value); };

  root.addEventListener('input', onFieldInput);
  root.addEventListener('change', onFieldChange);
  root.addEventListener('click', onFieldClick);
}

function setField(k, isDetail, val) {
  var f = TR.form;
  if (isDetail) { f.details = f.details || {}; f.details[k] = val; TR.dirtyD[k] = true; }
  else { f[k] = val; TR.dirtyF[k] = true; }
  markDirty();
}

function onFieldInput(e) {
  var el = e.target;
  if (el.hasAttribute('data-ci')) {
    var f = TR.form; f.childAges = Array.isArray(f.childAges) ? f.childAges.slice() : [];
    f.childAges[Number(el.getAttribute('data-ci'))] = el.value;
    TR.dirtyF.childAges = true; markDirty(); return;
  }
  var k = el.getAttribute('data-k');
  if (!k || el.tagName === 'SELECT' || el.type === 'button') return;
  setField(k, el.getAttribute('data-s') === 'd', el.value);
  if (k === 'destination' || k === 'travelStart' || k === 'dateFlex' || k === 'adults' || k === 'budgetMin' || k === 'budgetMax') updateMissingBadge();
}

function onFieldChange(e) {
  var el = e.target;
  var k = el.getAttribute('data-k');
  if (!k) return;
  if (el.tagName === 'SELECT') setField(k, el.getAttribute('data-s') === 'd', el.value);
  if (k === 'children') { setTimeout(renderTripForm, 0); }  // after the blur finishes
  if (k === 'destination' && TR.isNew && String(TR.form.destination || '').trim()) scheduleSave(1500); // first save soon after destination
}

function onFieldClick(e) {
  var el = e.target.closest ? e.target.closest('.tr-btn') : null;
  if (!el || !el.hasAttribute('data-k')) return;
  var k = el.getAttribute('data-k'), v = el.getAttribute('data-v');
  var isD = el.getAttribute('data-s') === 'd';
  var f = TR.form;
  if (el.getAttribute('data-multi')) {
    var cur = (isD ? (f.details || {})[k] : f[k]);
    var arr = Array.isArray(cur) ? cur.slice() : [];
    var ix = arr.indexOf(v);
    if (ix >= 0) arr.splice(ix, 1); else arr.push(v);
    setField(k, isD, arr);
    el.classList.toggle('sel');
    return;
  }
  var curv = isD ? (f.details || {})[k] : f[k];
  var nv = (curv === v && k !== 'tripType') ? '' : v;
  setField(k, isD, nv);
  if (STRUCTURAL[k]) { renderTripForm(); return; }
  // update the highlighted button in place
  Array.prototype.forEach.call(el.parentNode.querySelectorAll('.tr-btn'), function(b2) {
    b2.classList.toggle('sel', b2.getAttribute('data-v') === nv);
  });
}

function updateMissingBadge() {
  var miss = missingDetails(TR.form);
  var meta = document.querySelector('.tr-meta');
  if (!meta) return;
  var badge = document.getElementById('trMissing');
  if (!miss.length) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.id = 'trMissing'; badge.className = 'tr-missing'; meta.appendChild(badge); }
  badge.textContent = 'Missing key details: ' + miss.join(', ');
}

function markDirty() {
  TR.state = 'dirty';
  var s = document.getElementById('trState');
  if (s) { s.textContent = 'Unsaved changes'; s.className = 'tr-state dirty'; }
  clearTimeout(TR.draftTimer);
  TR.draftTimer = setTimeout(function() { saveDraftNow(); }, 250);
  // after the first server save, changes go up ~10 seconds after she stops typing
  if (!TR.isNew && String(TR.form.destination || '').trim()) scheduleSave(10000);
  else if (TR.isNew && String(TR.form.destination || '').trim()) scheduleSave(10000);
}

function scheduleSave(ms) {
  clearTimeout(TR.timer);
  TR.timer = setTimeout(function() { saveTripNow(false); }, ms);
}
function flushTripSave() {
  clearTimeout(TR.timer);
  clearTimeout(TR.draftTimer);
  saveDraftNow();
  if (TR.form && (TR.state === 'dirty' || TR.isNew) && String(TR.form.destination || '').trim()) saveTripNow(false);
}

function setState(s) {
  TR.state = s;
  var el = document.getElementById('trState');
  if (!el) return;
  el.className = 'tr-state ' + s;
  el.textContent = s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved ✓' : s === 'error' ? 'Not saved — draft kept' : s === 'dirty' ? 'Unsaved changes' : '';
}

// ── Stage change ─────────────────────────────────────────────────
function onStageChange(val) {
  var f = TR.form;
  if (val === f.status) return;
  if (val === STAGE_LOST) {
    askLostReason(function(reason) {
      f.status = val; TR.dirtyF.status = true;
      f.lostReason = reason || ''; TR.dirtyF.lostReason = true;
      markDirty();
      if (String(f.destination || '').trim()) saveTripNow(false); else renderTripForm();
    }, function() { document.getElementById('trStage').value = f.status; });
    return;
  }
  f.status = val; TR.dirtyF.status = true;
  markDirty();
  if (String(f.destination || '').trim()) saveTripNow(false);
  else showToast('Stage will save once there is a destination');
}

function askLostReason(onOk, onCancel) {
  var bg = document.createElement('div');
  bg.className = 'modal-overlay';
  bg.innerHTML = '<div class="modal"><h3>Move to Not now / Lost</h3>' +
    '<div class="modal-field"><label>Reason (optional)</label><input class="field-input" id="trLostReason" type="text" placeholder="e.g. chose another agent, postponed"></div>' +
    '<div class="modal-btns"><button class="btn-action" id="trLostNo">Cancel</button><button class="btn-action primary" id="trLostYes">Move it</button></div></div>';
  document.body.appendChild(bg);
  var inp = bg.querySelector('#trLostReason');
  setTimeout(function() { inp.focus(); }, 30);
  bg.querySelector('#trLostNo').onclick = function() { bg.remove(); if (onCancel) onCancel(); };
  bg.querySelector('#trLostYes').onclick = function() { var v = inp.value.trim(); bg.remove(); onOk(v); };
}

// ── Saving ───────────────────────────────────────────────────────
function normalizeBudget() {
  var f = TR.form;
  var lo = String(f.budgetMin || '').trim(), hi = String(f.budgetMax || '').trim();
  if (lo && !hi) { f.budgetMax = lo; TR.dirtyF.budgetMax = true; }
  else if (hi && !lo) { f.budgetMin = hi; TR.dirtyF.budgetMin = true; }
}

function buildPayload() {
  var f = TR.form, p = { id: f.id };
  if (TR.isNew) {
    p.clientId = f.clientId;
    Object.keys(f).forEach(function(k) {
      if (['id','clientId','title','createdVia','createdAt','updatedAt','statusChangedAt','lastActivityAt','chatbotRaw','details'].indexOf(k) >= 0) return;
      if (f[k] !== '' && f[k] !== undefined && !(Array.isArray(f[k]) && !f[k].length)) p[k] = f[k];
    });
    if (f.details && Object.keys(f.details).length) p.details = f.details;
    return p;
  }
  Object.keys(TR.dirtyF).forEach(function(k) { p[k] = f[k]; });
  var dk = Object.keys(TR.dirtyD);
  if (dk.length) { p.details = {}; dk.forEach(function(k) { p.details[k] = (f.details || {})[k]; }); }
  return p;
}

function saveTripNow(userClicked) {
  clearTimeout(TR.timer);
  var f = TR.form;
  if (!f) return Promise.resolve();
  if (!String(f.destination || '').trim()) {
    if (userClicked) showToast('Add a destination first — that’s the only thing required', 'error');
    return Promise.resolve();
  }
  if (TR.saving) { TR.again = true; return Promise.resolve(); }
  if (!TR.isNew && !Object.keys(TR.dirtyF).length && !Object.keys(TR.dirtyD).length) {
    if (userClicked) setState('saved');
    return Promise.resolve();
  }
  normalizeBudget();
  var payload = buildPayload();
  var dF = TR.dirtyF, dD = TR.dirtyD;      // this form's own dirty maps
  var sentF = Object.keys(dF), sentD = Object.keys(dD);
  var wasNew = TR.isNew;
  TR.saving = true; setState('saving');
  var form = f;
  return tripApi(wasNew ? 'addTrip' : 'updateTrip', payload).then(function(res) {
    TR.saving = false;
    if (!res || !res.success) {
      setState('error');
      showToast((res && res.error === 'AUTH') ? 'Please sign in again — your draft is kept' : 'Trip not saved — your draft is kept on this device', 'error');
      return;
    }
    // Only clear what we actually sent; anything typed meanwhile stays dirty
    sentF.forEach(function(k) { if (JSON.stringify(payload[k]) === JSON.stringify(form[k])) delete dF[k]; });
    sentD.forEach(function(k) { if (payload.details && JSON.stringify(payload.details[k]) === JSON.stringify((form.details || {})[k])) delete dD[k]; });
    if (TR.form === form) {
      ['title','createdVia','createdAt','updatedAt','statusChangedAt','lastActivityAt','chatbotRaw'].forEach(function(k) { form[k] = res.trip[k]; });
      form.lostReason = res.trip.lostReason;
      TR.isNew = false;
    }
    upsertTrip(res.trip);
    applyTodoChanges(res.todoChanges);
    var still = Object.keys(dF).length + Object.keys(dD).length;
    if (!still) clearDraft(form); else saveDraftNow(form, false, dF, dD);
    if (TR.form === form) {
      setState(still ? 'dirty' : 'saved');
      var t = document.querySelector('.tr-sticky-title');
      var c = getClient(selectedId);
      if (t && c) t.textContent = c.name + (form.title ? ' · ' + form.title : '');
      if (wasNew && !document.getElementById('trDelete')) renderTripForm();
    }
    renderSidebar();
    if (TR.again) { TR.again = false; saveTripNow(false); }
  }).catch(function() {
    TR.saving = false;
    setState('error');
    showToast('Trip not saved — your draft is kept on this device', 'error');
  });
}

function upsertTrip(t) {
  var i = allTrips.findIndex(function(x) { return x.id === t.id; });
  if (i >= 0) allTrips[i] = t; else allTrips.push(t);
  if (trDevMode()) saveDevLocal();
}

function applyTodoChanges(ch) {
  if (!ch) return;
  (ch.removedIds || []).forEach(function(id) {
    allTodos = allTodos.filter(function(t) { return t.id !== id; });
  });
  (ch.updated || []).forEach(function(u) {
    var t = allTodos.find(function(x) { return x.id === u.id; });
    if (t) Object.assign(t, u);
  });
  (ch.created || []).forEach(function(n) {
    if (!allTodos.find(function(x) { return x.id === n.id; })) allTodos.push(n);
  });
  buildClientObjects();
}

// Response from updateTodo may carry a trip + todo changes
function applyTripResponse(res) {
  if (!res || !res.success) return;
  if (res.trip) upsertTrip(res.trip);
  applyTodoChanges(res.todoChanges);
}

// Server call (or a local stand-in when the CRM runs without a backend)
function tripApi(action, payload) {
  if (!trDevMode()) return gasPost({ type: 'crm', action: action, trip: payload });
  var now = new Date().toISOString();
  var existing = getTrip(payload.id);
  var t = existing ? JSON.parse(JSON.stringify(existing)) : { createdVia: 'vanessa', createdAt: now, details: {}, status: 'Inquiry', statusChangedAt: now };
  Object.keys(payload).forEach(function(k) {
    if (k === 'details') t.details = Object.assign({}, t.details, payload.details);
    else t[k] = payload[k];
  });
  t.updatedAt = now; t.lastActivityAt = now;
  t.title = t.destination + (t.travelStart ? ', ' + t.travelStart.slice(0, 7) : '');
  return Promise.resolve({ success: true, trip: t, todoChanges: null });
}

function deleteCurrentTrip() {
  var f = TR.form;
  if (!f || TR.isNew) return;
  if (!confirm('Delete this trip? Its automatic follow-ups will be removed too.')) return;
  var id = f.id;
  tripApi_delete(id).then(function(res) {
    if (res && res.success === false) { showToast('Could not delete the trip', 'error'); return; }
    allTrips = allTrips.filter(function(t) { return t.id !== id; });
    applyTodoChanges(res && res.todoChanges);
    clearDraft(f);
    TR.form = null;
    if (trDevMode()) saveDevLocal();
    renderSidebar();
    renderTripsTab();
  });
}
function tripApi_delete(id) {
  if (trDevMode()) return Promise.resolve({ success: true });
  return gasPost({ type: 'crm', action: 'deleteTrip', id: id });
}

// ── Dashboard: Trips in Progress ─────────────────────────────────
var PIPE_LINES = [
  { key: 'Inquiry',        label: 'Inquiry',                 test: function(t) { return t.status === 'Inquiry'; } },
  { key: 'Gathering info', label: 'Gathering info',          test: function(t) { return t.status === 'Gathering info'; } },
  { key: 'Quoting',        label: 'Quoting',                 test: function(t) { return t.status === 'Quoting'; } },
  { key: 'Proposal sent',  label: 'Proposal sent',           test: function(t) { return t.status === 'Proposal sent'; } },
  { key: 'Booked',         label: 'Booked / Deposit paid',   test: function(t) { return t.status === 'Booked' || t.status === 'Deposit paid'; } },
  { key: 'Final',          label: 'Final payment due',       test: function(t) { return t.status === 'Final payment due'; } },
  { key: 'Stale',          label: 'No activity in 7+ days',  stale: true, test: function(t) {
      if (OPEN_STAGES.indexOf(t.status) < 0) return false;
      var ms = Date.parse(t.lastActivityAt || t.updatedAt || t.createdAt);
      return !isNaN(ms) && (Date.now() - ms) > 7 * 86400000;
    } }
];

function pipelineTrips(key) {
  var line = PIPE_LINES.find(function(l) { return l.key === key; });
  return line ? allTrips.filter(line.test) : [];
}

function pipelineCardHtml() {
  var rows = PIPE_LINES.map(function(l) { return { l: l, n: allTrips.filter(l.test).length }; }).filter(function(r) { return r.n > 0; });
  if (!rows.length) return '';
  return '<div class="pipe-card"><div class="pipe-title">Trips in Progress</div>' +
    rows.map(function(r) {
      return '<button type="button" class="pipe-line' + (r.l.stale ? ' stale' : '') + '" data-pipe="' + r.l.key + '">' +
        '<span>' + esc(r.l.label) + '</span><span class="pipe-n">' + r.n + '</span></button>';
    }).join('') + '</div>';
}

function wirePipelineCard() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-pipe]'), function(el) {
    el.onclick = function() { showPipelineList(el.getAttribute('data-pipe')); };
  });
}

function showPipelineList(key) {
  var line = PIPE_LINES.find(function(l) { return l.key === key; });
  var trips = pipelineTrips(key);
  var main = document.getElementById('main');
  selectedId = null; renderSidebar();
  main.innerHTML = '<div class="dashboard-view"><button type="button" class="tr-back" id="pipeBack">← Dashboard</button>' +
    '<div class="dash-greeting" style="font-size:26px">' + esc(line ? line.label : 'Trips') + '</div>' +
    '<div class="dash-subhead">' + trips.length + ' trip' + (trips.length === 1 ? '' : 's') + '</div>' +
    (trips.length ? trips.map(function(t) {
      var c = getClient(t.clientId);
      var d = tripDaysInStage(t);
      return '<div class="due-item" data-open-client="' + esc(t.clientId) + '">' +
        '<div class="due-avatar">' + esc(initials(c ? c.name : '?')) + '</div>' +
        '<div class="due-content"><div class="due-client-name">' + esc(c ? c.name : 'Unknown client') + '</div>' +
        '<div class="due-task-text">' + esc([t.destination, tripDates(t)].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="tr-row-side">' + stageChip(t.status) + '<div class="tr-muted">' + (d === 0 ? 'today' : d + 'd in stage') + '</div></div></div>';
    }).join('') : '<div class="empty-dash"><p>Nothing here right now.</p></div>') + '</div>';
  document.getElementById('pipeBack').onclick = showDashboard;
  Array.prototype.forEach.call(main.querySelectorAll('[data-open-client]'), function(el) {
    el.onclick = function() { openClientTrips(el.getAttribute('data-open-client')); };
  });
}

function openClientTrips(clientId) {
  TR.form = null;
  selectClient(clientId);
  switchTab('trips');
}

// Small label shown on follow-ups that belong to a trip
function todoTripLabel(t) {
  if (!t || !t.tripId) return '';
  var trip = getTrip(t.tripId);
  if (!trip) return '';
  return '<span class="todo-trip" data-trip-link="' + esc(trip.id) + '">🧳 ' + esc(trip.title || trip.destination) + '</span>';
}

// ── Styles ───────────────────────────────────────────────────────
(function() {
  var css = [
  '.tr-muted{font-size:12px;color:var(--ink-muted)}',
  '.tr-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0 14px}',
  '.tr-new{min-height:44px;padding:0 18px}',
  '.tr-row{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--white);border:1px solid var(--sand-3);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:10px;cursor:pointer;min-height:56px}',
  '.tr-row:hover{border-color:var(--ocean)}',
  '.tr-row.dim{opacity:.55}',
  '.tr-row-title{font-size:15px;font-weight:500;color:var(--ocean)}',
  '.tr-row-sub{font-size:12px;color:var(--ink-muted);margin-top:2px}',
  '.tr-row-side{text-align:right;flex-shrink:0;display:flex;flex-direction:column;gap:4px;align-items:flex-end}',
  '.tr-chip{font-size:11px;font-weight:500;padding:3px 10px;border-radius:20px;white-space:nowrap}',
  '.tr-chip.open{background:var(--ocean-l);color:var(--ocean)}',
  '.tr-chip.booked{background:var(--green-l);color:var(--green)}',
  '.tr-chip.done{background:var(--sand-2);color:var(--ink-mid)}',
  '.tr-chip.lost{background:var(--coral-l);color:var(--coral)}',
  '.tr-form{max-width:860px;margin:0 auto}',
  '.tr-sticky{position:sticky;top:-20px;z-index:5;background:var(--sand);display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 0;margin:-20px 0 10px;border-bottom:1px solid var(--sand-3)}',
  '.tr-sticky-title{flex:1;min-width:90px;font-family:"Cormorant Garamond",Georgia,serif;font-size:19px;color:var(--ocean);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.tr-back{background:none;border:0;color:var(--ocean);font-size:14px;min-height:44px;padding:0 6px;cursor:pointer;font-family:inherit}',
  '.tr-in.tr-stage{width:auto;min-width:130px;flex-shrink:0}',
  '.tr-state{font-size:12px;color:var(--ink-muted);min-width:96px;text-align:right}',
  '.tr-state.dirty{color:var(--gold)} .tr-state.error{color:var(--coral)} .tr-state.saved{color:var(--green)}',
  '.tr-save{min-height:44px;padding:0 22px;flex-shrink:0}',
  '.tr-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--ink-mid);margin-bottom:12px}',
  '.tr-meta a{color:var(--ocean)}',
  '.tr-missing{background:var(--gold-l);color:#8a5a14;border:1px solid #e8cf9f;border-radius:20px;padding:3px 12px;font-size:12px}',
  '.tr-sec{background:var(--white);border:1px solid var(--sand-3);border-radius:var(--radius-sm);margin-bottom:12px}',
  '.tr-sec>summary{cursor:pointer;list-style:none;padding:14px 16px;min-height:48px;font-family:"Cormorant Garamond",Georgia,serif;font-size:19px;color:var(--ocean);display:flex;align-items:center}',
  '.tr-sec>summary::-webkit-details-marker{display:none}',
  '.tr-sec>summary::after{content:"+";margin-left:auto;color:var(--ink-muted);font-family:"DM Sans",sans-serif}',
  '.tr-sec[open]>summary::after{content:"–"}',
  '.tr-sec-body{padding:0 16px 16px}',
  '.tr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}',
  '.tr-field{display:flex;flex-direction:column;gap:6px;margin-bottom:6px;min-width:0}',
  '.tr-field.full{grid-column:1/-1}',
  '.tr-label{font-size:12px;color:var(--ink-muted);letter-spacing:.02em}',
  '.tr-in{font-family:"DM Sans",sans-serif;font-size:16px;min-height:44px;padding:8px 12px;border:1.5px solid var(--sand-3);border-radius:var(--radius-sm);background:var(--sand);color:var(--ink);width:100%;outline:none}',
  '.tr-in:focus{border-color:var(--ocean);background:var(--white)}',
  '.tr-area{min-height:88px;resize:vertical;line-height:1.5}',
  '.tr-area.tall{min-height:180px}',
  '.tr-btnrow{display:flex;flex-wrap:wrap;gap:8px}',
  '.tr-btn{font-family:"DM Sans",sans-serif;font-size:14px;min-height:44px;padding:0 16px;border-radius:22px;border:1.5px solid var(--sand-3);background:var(--white);color:var(--ink-mid);cursor:pointer}',
  '.tr-btn.sel{background:var(--ocean);border-color:var(--ocean);color:#fff}',
  '.tr-ages{display:flex;flex-wrap:wrap;gap:8px}',
  '.tr-age{width:84px}',
  '.tr-bot{background:var(--gold-l);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px;font-size:13px;line-height:1.6}',
  '.tr-danger{margin:18px 0 40px}',
  '.pipe-card{background:var(--white);border:1px solid var(--sand-3);border-radius:var(--radius);padding:16px 18px;margin-bottom:26px}',
  '.pipe-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:20px;color:var(--ocean);margin-bottom:8px}',
  '.pipe-line{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;padding:0 4px;background:none;border:0;border-top:1px solid var(--sand-2);font-family:"DM Sans",sans-serif;font-size:14px;color:var(--ink);cursor:pointer;text-align:left}',
  '.pipe-line:first-of-type{border-top:0}',
  '.pipe-line:hover{color:var(--ocean)}',
  '.pipe-line.stale{color:var(--coral)}',
  '.pipe-n{font-weight:500;font-size:16px}',
  '.todo-trip{display:inline-block;margin-top:3px;font-size:11px;color:var(--ocean);background:var(--ocean-l);border-radius:12px;padding:2px 9px;cursor:pointer}',
  '.crm-mobile-btn{display:none}',
  '@media (max-width:760px){',
  ' .app{grid-template-columns:1fr}',
  ' .sidebar{display:none}',
  ' body.side-open .sidebar{display:flex;position:fixed;inset:52px 0 0 0;z-index:50}',
  ' body.side-open .main{display:none}',
  ' .crm-mobile-btn{display:inline-block}',
  ' .topbar-sub,.topbar-stat,.btn-export{display:none}',
  ' .topbar-brand{padding:0 10px;gap:6px;flex-wrap:nowrap}',
  ' .topbar-logo{display:none}',
  ' .tab-body{padding:14px 12px}',
  ' .client-header{padding:12px 12px 0}',
  ' .tabs-row{overflow-x:auto}',
  ' .tr-grid{grid-template-columns:1fr}',
  ' .tr-sticky{top:-14px}',
  ' .tr-state{min-width:0}',
  ' .stats-row{grid-template-columns:1fr}',
  ' .dashboard-view{padding:16px 12px}',
  '}'
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
})();
