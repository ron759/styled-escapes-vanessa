const { createBackend } = require('./gs-harness');
let ok = 0, bad = 0;
const t = (n, c, extra) => { if (c) ok++; else { bad++; console.log('FAIL:', n, extra !== undefined ? JSON.stringify(extra) : ''); } };

const b = createBackend({ now: '2026-10-02T15:00:00Z' });
b.seedLegacy([['c1','Ann Test','ann@x.com','555','','','Facebook','["Cruise"]','','Oct 1, 2026']],
             [['t1','c1','Old todo','2026-10-05','false','Oct 1, 2026']]);
const P = o => b.post(Object.assign({ token: b.login(), type: 'crm' }, o));

// ---- Phase 1: schema upgrade + backward compatibility
let all = P({ action: 'getAll' });
t('getAll ok', all.success, all);
t('schema: Trips tab created', !!b.tabs.Trips && b.tabs.Trips.rows[0].length === 46);
t('schema: Clients headers extended', b.tabs.Clients.rows[0][10] === 'bestTimeToContact' && b.tabs.Clients.rows[0][11] === 'contactMethod');
t('schema: Todos headers extended', b.tabs.Todos.rows[0][6] === 'tripId' && b.tabs.Todos.rows[0][7] === 'autoKey');
t('getAll returns trips array', Array.isArray(all.trips) && all.trips.length === 0);
t('legacy client blank contact fields', all.clients[0].bestTimeToContact === '' && all.clients[0].contactMethod === '');
t('legacy todo has tripId/autoKey blank', all.todos[0].tripId === '' && all.todos[0].autoKey === '');
t('ensureSchema idempotent', P({ action: 'ensureSchema' }).message === 'Schema already up to date');

// old page behaviour (no new fields)
t('old addClient works', P({ action: 'addClient', client: { id: 'c2', name: 'Bob', email: 'b@x.com' } }).success);
t('old updateTodo works + keeps blanks', P({ action: 'updateTodo', todo: { id: 't1', clientId: 'c1', text: 'Old todo', due: '2026-10-05', done: true } }).success);
// new contact fields survive an update from an old page
P({ action: 'updateClient', client: { id: 'c1', name: 'Ann Test', email: 'ann@x.com', source: 'Facebook', bestTimeToContact: 'Morning', contactMethod: 'Text', interests: ['Cruise'] } });
P({ action: 'updateClient', client: { id: 'c1', name: 'Ann Test', email: 'ann@x.com', source: 'Facebook', phone: '999', interests: ['Cruise'] } }); // old page, no new fields
all = P({ action: 'getAll' });
const ann = all.clients.find(c => c.id === 'c1');
t('contact fields preserved by old-page update', ann.bestTimeToContact === 'Morning' && ann.contactMethod === 'Text' && ann.phone === '999', ann);

// ---- addTrip validation
t('addTrip needs destination', P({ action: 'addTrip', trip: { clientId: 'c1' } }).success === false);
t('addTrip needs client', P({ action: 'addTrip', trip: { clientId: 'nope', destination: 'X' } }).success === false);
t('abandoned form creates nothing', P({ action: 'getAll' }).trips.length === 0);

// ---- addTrip: Inquiry todo + title + defaults
let r = P({ action: 'addTrip', trip: { clientId: 'c1', destination: 'Western Caribbean', tripType: 'Cruise', travelStart: '2027-03-14', adults: '2', details: { lines: 'Royal Caribbean' }, id: 'x'.repeat(5), createdAt: 'hack', title: 'hack', chatbotRaw: 'hack' } });
t('addTrip ok', r.success, r);
const trip1 = r.trip;
t('title auto', trip1.title === 'Western Caribbean cruise, Mar 2027', trip1.title);
t('server owns timestamps/createdVia', trip1.createdVia === 'vanessa' && trip1.createdAt !== 'hack' && /^2026-10-02T/.test(trip1.createdAt) && trip1.chatbotRaw === null);
t('status default Inquiry', trip1.status === 'Inquiry');
t('source prefilled from client', trip1.source === 'Facebook');
t('inquiry todo created next day', r.todoChanges.created.length === 1 && r.todoChanges.created[0].due === '2026-10-03' && r.todoChanges.created[0].autoKey === 'inquiry-followup' && r.todoChanges.created[0].tripId === trip1.id, r.todoChanges);
t('details stored', trip1.details.lines === 'Royal Caribbean');
t('retry same id is idempotent (no dup trip)', (() => { const r2 = P({ action: 'addTrip', trip: { id: trip1.id, clientId: 'c1', destination: 'Western Caribbean' } }); return r2.success && P({ action: 'getAll' }).trips.length === 1; })());

// ---- updateTrip merge semantics
r = P({ action: 'updateTrip', trip: { id: trip1.id, adults: '3', details: { cabinType: 'Balcony' } } });
t('update merges fields', r.success && r.trip.adults === '3' && r.trip.destination === 'Western Caribbean' && r.trip.details.lines === 'Royal Caribbean' && r.trip.details.cabinType === 'Balcony', r.trip);
t('update cannot clear destination', P({ action: 'updateTrip', trip: { id: trip1.id, destination: '' } }).success === false);
t('bad status ignored', P({ action: 'updateTrip', trip: { id: trip1.id, status: 'Banana' } }).trip.status === 'Inquiry');
t('bad date ignored', P({ action: 'updateTrip', trip: { id: trip1.id, depositDate: 'tomorrow' } }).trip.depositDate === '');

// ---- stage automations
b.setNow('2026-10-04T15:00:00Z');
r = P({ action: 'updateTrip', trip: { id: trip1.id, status: 'Gathering info' } }); if (!r.success) console.log('ERR', r);
t('leaving Inquiry removes inquiry todo', r.todoChanges.removedIds.length === 1, r.todoChanges);
t('statusChangedAt moved', r.trip.statusChangedAt.startsWith('2026-10-04'));

r = P({ action: 'updateTrip', trip: { id: trip1.id, status: 'Proposal sent' } });
t('Proposal sent → todo +5d', r.todoChanges.created.length === 1 && r.todoChanges.created[0].due === '2026-10-09' && r.todoChanges.created[0].autoKey === 'proposal-followup', r.todoChanges);
const propTodo = r.todoChanges.created[0];
r = P({ action: 'updateTrip', trip: { id: trip1.id, callNotes: 'x' } });
t('plain save creates no duplicate todos', r.todoChanges.created.length === 0 && r.todoChanges.removedIds.length === 0);

// completing proposal todo creates the next, bumps activity
b.setNow('2026-10-09T15:00:00Z');
r = P({ action: 'updateTodo', todo: { id: propTodo.id, clientId: 'c1', text: propTodo.text, due: propTodo.due, done: true, tripId: propTodo.tripId, autoKey: propTodo.autoKey } });
t('completing proposal todo → next in 5d', r.success && r.todoChanges.created.length === 1 && r.todoChanges.created[0].due === '2026-10-14', r);
t('completion bumps lastActivityAt', r.trip && r.trip.lastActivityAt.startsWith('2026-10-09'), r.trip && r.trip.lastActivityAt);
// completing again while open exists doesn't double
const nextId = r.todoChanges.created[0].id;
r = P({ action: 'updateTodo', todo: { id: propTodo.id, clientId: 'c1', text: propTodo.text, due: propTodo.due, done: true } });
t('re-saving a done todo does not create more', !r.todoChanges);

// leaving Proposal sent removes open proposal todo; Booked → myCC +3d
r = P({ action: 'updateTrip', trip: { id: trip1.id, status: 'Booked' } });
t('Booked: proposal todo removed', r.todoChanges.removedIds.includes(nextId), r.todoChanges);
t('Booked: myCC todo +3d', r.todoChanges.created.some(x => x.autoKey === 'booked-mycc' && x.due === '2026-10-12'), r.todoChanges);

// payment dates
r = P({ action: 'updateTrip', trip: { id: trip1.id, depositDate: '2026-10-20', finalPaymentDate: '2026-10-11' } });
const dep = r.todoChanges.created.find(x => x.autoKey === 'deposit-due');
const fin = r.todoChanges.created.find(x => x.autoKey === 'final-due');
t('deposit todo 5 days before', dep && dep.due === '2026-10-15', r.todoChanges);
t('final within 5 days → due today', fin && fin.due === '2026-10-09', fin);
r = P({ action: 'updateTrip', trip: { id: trip1.id, depositDate: '2026-10-30' } });
t('changed deposit date moves todo', r.todoChanges.updated.length === 1 && r.todoChanges.updated[0].due === '2026-10-25' && r.todoChanges.created.length === 0, r.todoChanges);
r = P({ action: 'updateTrip', trip: { id: trip1.id, depositDate: '' } });
t('cleared deposit date deletes todo', r.todoChanges.removedIds.includes(dep.id), r.todoChanges);

// hand-made todos untouched
P({ action: 'addTodo', todo: { id: 'hand1', clientId: 'c1', text: 'Hand made', due: '2026-10-10', done: false, tripId: trip1.id } });
r = P({ action: 'updateTrip', trip: { id: trip1.id, status: 'Not now / Lost', lostReason: 'Went elsewhere' } });
all = P({ action: 'getAll' });
t('Lost removes open auto todos', all.todos.filter(x => x.tripId === trip1.id && x.autoKey && !x.done).length === 0);
t('hand-made todo survives', all.todos.some(x => x.id === 'hand1'));
t('lostReason saved', all.trips[0].lostReason === 'Went elsewhere');
r = P({ action: 'updateTrip', trip: { id: trip1.id, status: 'Inquiry' } });
t('lostReason cleared when reopened', r.trip.lostReason === '');

// completed → review +7
b.setNow('2026-10-10T15:00:00Z');
r = P({ action: 'updateTrip', trip: { id: trip1.id, status: 'Completed' } });
t('Completed → review +7d', r.todoChanges.created.some(x => x.autoKey === 'review-request' && x.due === '2026-10-17'), r.todoChanges);

// delete trip removes auto todos only
r = P({ action: 'deleteTrip', id: trip1.id });
all = P({ action: 'getAll' });
t('deleteTrip ok & removes auto todos', r.success && all.trips.length === 0 && !all.todos.some(x => x.autoKey && x.tripId === trip1.id));
t('deleteTrip keeps hand-made todo', all.todos.some(x => x.id === 'hand1'));

// delete client removes trips
r = P({ action: 'addTrip', trip: { clientId: 'c2', destination: 'Cancun', tripType: 'All-Inclusive' } });
t('all-inclusive title', r.trip.title === 'Cancun all-inclusive', r.trip.title);
P({ action: 'deleteClient', id: 'c2' });
t('deleteClient removes trips', P({ action: 'getAll' }).trips.length === 0);

// ---- chatbot handoff
b.setNow('2026-10-11T15:00:00Z');
const lead = { name: 'Cathy Bot', email: 'Cathy@x.com', phone: '555-1', destination: 'Hawaii', dates: 'next spring', travelers: '2 adults', budget: 'around 5k' };
let cb = b.post({ type: 'crm', action: 'chatbotLead', lead, followUpText: 'Hi Cathy', interests: ['Hawaii'] });
t('chatbotLead ok (public, no token)', cb.success && cb.isNew && cb.tripId, cb);
all = P({ action: 'getAll' });
let ct = all.trips.find(x => x.id === cb.tripId);
t('chatbot trip created', ct && ct.createdVia === 'chatbot' && ct.source === 'Website chatbot' && ct.destination === 'Hawaii' && ct.status === 'Inquiry', ct);
t('chatbotRaw keeps free text', ct.chatbotRaw.length === 1 && ct.chatbotRaw[0].budget === 'around 5k' && ct.chatbotRaw[0].dates === 'next spring');
t('structured fields left empty', ct.adults === '' && ct.travelStart === '' && ct.budgetMin === '');
const ctodos = all.todos.filter(x => x.tripId === cb.tripId);
t('one inquiry todo tied to trip, due tomorrow', ctodos.length === 1 && ctodos[0].autoKey === 'inquiry-followup' && ctodos[0].due === '2026-10-12' && /chatbot inquiry re: Hawaii/.test(ctodos[0].text), ctodos);
t('client notes still written', all.notes.some(n => /Trip Inquiry/.test(n.text)) && all.notes.some(n => /AI Follow-Up/.test(n.text)));
// repeat within 24h → joins trip
b.setNow('2026-10-11T20:00:00Z');
const cb2 = b.post({ type: 'crm', action: 'chatbotLead', lead: Object.assign({}, lead, { destination: 'Maui' }), interests: ['Hawaii'] });
all = P({ action: 'getAll' });
t('repeat within 24h: same client, same trip', cb2.clientId === cb.clientId && cb2.tripId === cb.tripId && all.trips.filter(x => x.clientId === cb.clientId).length === 1, cb2);
t('repeat appends second answers', all.trips.find(x => x.id === cb.tripId).chatbotRaw.length === 2);
t('repeat: still one open inquiry todo', all.todos.filter(x => x.tripId === cb.tripId && !x.done).length === 1);
// repeat after 24h → new trip, same client
b.setNow('2026-10-13T20:00:00Z');
const cb3 = b.post({ type: 'crm', action: 'chatbotLead', lead, interests: [] });
all = P({ action: 'getAll' });
t('repeat after window: new trip, one client', cb3.tripId !== cb.tripId && all.trips.filter(x => x.clientId === cb.clientId).length === 2 && all.clients.filter(c => c.email.toLowerCase() === 'cathy@x.com').length === 1);

// ---- auth + locking
t('trip routes need token', b.post({ type: 'crm', action: 'addTrip', trip: { clientId: 'c1', destination: 'X' } }).error === 'AUTH');
t('locks released after writes', b.ctx.__locks === 0, b.ctx.__locks);

// ---- time zone: late evening Central is still "today" in Central
b.setNow('2026-10-14T03:30:00Z'); // = Oct 13, 10:30pm CDT
r = P({ action: 'addTrip', trip: { clientId: 'c1', destination: 'Late night' } });
t('due date uses Central time', r.todoChanges.created[0].due === '2026-10-14', r.todoChanges.created[0].due);

// ---- itinerary <-> trip link
const I = o => b.post(Object.assign({ token: b.login(), type: 'itinerary' }, o));
const tripA = P({ action: 'addTrip', trip: { clientId: 'c1', destination: 'Link A', adults: '2', children: '1' } }).trip;
P({ action: 'addClient', client: { id: 'c3', name: 'Cara', email: 'c@x.com' } });
const tripB = P({ action: 'addTrip', trip: { clientId: 'c3', destination: 'Other client trip' } }).trip;
t('schema: Itineraries has tripId header', b.tabs.Itineraries.rows[0][17] === 'tripId', b.tabs.Itineraries.rows[0]);
let it = I({ action: 'saveItinerary', itinerary: { clientId: 'c1', title: 'Plan A', tripId: tripA.id }, days: [] });
t('save itinerary with trip link', it.success && it.tripId === tripA.id, it);
const itId = it.itineraryId;
t('getItinerary returns tripId', I({ action: 'getItinerary', itineraryId: itId }).itinerary.tripId === tripA.id);
t('client list returns tripId', I({ action: 'getClientItineraries', clientId: 'c1' }).itineraries.find(x => x.id === itId).tripId === tripA.id);
// another client's trip can't be linked
it = I({ action: 'saveItinerary', itinerary: { clientId: 'c1', title: 'Bad link', tripId: tripB.id }, days: [] });
t("cannot link another client's trip", it.success && it.tripId === '', it);
t('unknown trip id is dropped', I({ action: 'saveItinerary', itinerary: { clientId: 'c1', title: 'x', tripId: 'nope' }, days: [] }).tripId === '');
// old builder page (no tripId field) keeps the saved link
it = I({ action: 'saveItinerary', itinerary: { id: itId, clientId: 'c1', title: 'Plan A v2' }, days: [] });
t('update without tripId keeps link', it.success && it.tripId === tripA.id, it);
// explicit empty unlinks
it = I({ action: 'saveItinerary', itinerary: { id: itId, clientId: 'c1', title: 'Plan A v3', tripId: '' }, days: [] });
t('empty tripId unlinks', it.success && it.tripId === '', it);
I({ action: 'saveItinerary', itinerary: { id: itId, clientId: 'c1', title: 'Plan A v4', tripId: tripA.id }, days: [] });
// picker data
const cTrips = I({ action: 'getClientTrips', clientId: 'c1' });
t('getClientTrips only this client', cTrips.success && cTrips.trips.some(x => x.id === tripA.id) && !cTrips.trips.some(x => x.id === tripB.id), cTrips);
t('getClientTrips needs token', b.post({ type: 'itinerary', action: 'getClientTrips', clientId: 'c1' }).error === 'AUTH');
// deleting the trip keeps the itinerary but unlinks it
P({ action: 'deleteTrip', id: tripA.id });
const after = I({ action: 'getItinerary', itineraryId: itId });
t('trip delete keeps itinerary, clears link', after.success && after.itinerary.tripId === '' && after.itinerary.title === 'Plan A v4', after);
// legacy itinerary row (17 columns) still reads
b.tabs.Itineraries.rows.push(['legacy1','c1','Old plan','Rome','','','','','','','','','','','active','Oct 1, 2026','Oct 1, 2026']);
const lg = I({ action: 'getItinerary', itineraryId: 'legacy1' });
t('legacy 17-col itinerary reads with blank tripId', lg.success && lg.itinerary.tripId === '', lg);

console.log(`trips tests: passed ${ok}, failed ${bad}`);
process.exit(bad ? 1 : 0);
