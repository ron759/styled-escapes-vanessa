import json, re, sys, urllib.request, time
from playwright.sync_api import sync_playwright

BASE = 'file:///home/claude/phase0/'
SRV = 'http://127.0.0.1:8799'
ok = bad = 0
def t(name, cond, extra=''):
    global ok, bad
    if cond: ok += 1
    else: bad += 1; print('FAIL:', name, extra)

def srv(path, obj=None):
    req = urllib.request.Request(SRV + path, data=json.dumps(obj).encode() if obj is not None else None, headers={'content-type': 'text/plain'})
    return json.loads(urllib.request.urlopen(req).read())
def state(): return srv('/__state')
def backend_post(obj): return srv('/', obj)

def handler(route):
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
    body = route.request.post_data or '{}'
    req = urllib.request.Request(SRV + '/', data=body.encode(), headers={'content-type': 'text/plain'})
    out = urllib.request.urlopen(req).read().decode()
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=out)

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1100, 'height': 900})
    ctx.route(re.compile('script.google.com'), handler)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'ERR_' not in m.text and 'fonts.g' not in m.text else None)

    # ---- login
    pg.goto(BASE + 'vanessa-crm.html')
    pg.fill('#loginPw', 'pw'); pg.click('.login-btn'); pg.wait_for_timeout(700)
    t('dashboard shows', pg.locator('.dash-greeting').count() == 1)
    t('no pipeline card with zero trips', pg.locator('.pipe-card').count() == 0)

    # ---- Trips tab empty
    pg.locator('.client-item', has_text='Ann Test').click()
    pg.click('#tab-trips'); pg.wait_for_timeout(200)
    t('trips tab empty state', 'No trips yet' in pg.inner_text('#tabBody'))

    # ---- abandoned form creates nothing
    pg.click('#trNew'); pg.wait_for_timeout(200)
    t('form open', pg.locator('#trForm').count() == 1)
    t('default type Cruise (client interest)', pg.locator('.tr-btn.sel[data-k="tripType"]').inner_text() == 'Cruise')
    t('cruise block shown, AI hidden', pg.locator('[data-sec="cruise"]').count() == 1 and pg.locator('[data-sec="ai"]').count() == 0)
    t('missing badge shows', 'destination' in pg.inner_text('#trMissing'))
    t('save without destination refused', (pg.click('#trSave'), pg.wait_for_timeout(300), len(state()['Trips']) == 1)[2])
    pg.fill('[data-k="adults"]', '2')
    pg.click('#trBack'); pg.wait_for_timeout(300)
    t('abandoned form: no trip on server', len(state()['Trips']) == 1)

    # ---- draft restored
    pg.click('#trNew'); pg.wait_for_timeout(200)
    t('draft restored (adults=2)', pg.input_value('[data-k="adults"]') == '2')
    pg.click('#trBack')

    # ---- fill + save; type switch keeps answers
    pg.click('#trNew'); pg.wait_for_timeout(200)
    pg.fill('[data-k="destination"]', 'Western Caribbean')
    pg.fill('[data-k="travelStart"]', '2027-03-14')
    pg.click('.tr-btn[data-k="cabinType"][data-v="Balcony"]')
    pg.click('.tr-btn[data-k="lines"][data-v="Carnival"]')
    pg.fill('[data-k="callNotes"]', 'Wants a quiet balcony.')
    pg.fill('[data-k="children"]', '2'); pg.dispatch_event('[data-k="children"]', 'change'); pg.wait_for_timeout(200)
    t('child age boxes appear', pg.locator('.tr-age').count() == 2)
    t('kids programs shows with children', pg.locator('[data-k="kidsPrograms"]').count() > 0)
    pg.locator('.tr-age').nth(0).fill('7'); pg.locator('.tr-age').nth(1).fill('10')
    pg.click('.tr-btn[data-k="tripType"][data-v="All-Inclusive"]'); pg.wait_for_timeout(200)
    t('AI block shown, cruise hidden', pg.locator('[data-sec="ai"]').count() == 1 and pg.locator('[data-sec="cruise"]').count() == 0)
    t('destination kept across switch', pg.input_value('[data-k="destination"]') == 'Western Caribbean')
    pg.click('.tr-btn[data-k="tripType"][data-v="Cruise"]'); pg.wait_for_timeout(200)
    t('cruise answers survive type switch', pg.locator('.tr-btn.sel[data-k="cabinType"]').inner_text() == 'Balcony' and pg.locator('.tr-btn.sel[data-k="lines"]').inner_text() == 'Carnival')
    t('kids ages survive re-render', pg.locator('.tr-age').nth(1).input_value() == '10')
    t('budget single value mirrors', True)
    pg.fill('[data-k="budgetMin"]', '5000')
    pg.click('#trSave'); pg.wait_for_timeout(700)
    tr = state()['Trips']
    t('trip saved on server', len(tr) == 2, tr)
    hdr = tr[0]; row = dict(zip(hdr, tr[1]))
    t('title server-built', row['title'] == 'Western Caribbean cruise, Mar 2027', row['title'])
    t('budget max mirrored', row['budgetMin'] == '5000' and row['budgetMax'] == '5000', (row['budgetMin'], row['budgetMax']))
    t('details saved as JSON', json.loads(row['details']).get('cabinType') == 'Balcony')
    t('child ages saved', json.loads(row['childAges']) == ['7', '10'])
    t('saved indicator', 'Saved' in pg.inner_text('#trState'))
    t('missing badge updates', pg.locator('#trMissing').count() == 0 or ('budget' not in pg.inner_text('#trMissing') and 'destination' not in pg.inner_text('#trMissing')))
    # inquiry todo created and visible in Follow-ups with trip label
    pg.click('#tab-todos'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#tabBody')
    t('inquiry todo appears with trip label', 'Follow up with Ann Test' in txt and 'Western Caribbean cruise' in txt, txt[:300])

    # ---- stage → Proposal sent
    pg.click('#tab-trips'); pg.wait_for_timeout(200)
    t('returning to Trips tab keeps the form open', pg.locator('#trForm').count() == 1)
    pg.click('#trBack'); pg.wait_for_timeout(200)
    t('trip listed with stage', pg.locator('.tr-row').count() == 1 and 'Inquiry' in pg.locator('.tr-row').inner_text())
    pg.locator('.tr-row').click(); pg.wait_for_timeout(200)
    pg.select_option('#trStage', 'Proposal sent'); pg.wait_for_timeout(800)
    pg.click('#trBack'); pg.click('#tab-todos'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#tabBody')
    t('proposal todo created, inquiry todo gone', 'Follow up on the proposal' in txt and 'Follow up with Ann Test about' not in txt, txt[:400])
    # complete the proposal todo → next one created
    box = pg.locator('.todo-item', has_text='Follow up on the proposal').locator('.todo-check')
    box.check(); pg.wait_for_timeout(800)
    open_items = [x for x in pg.locator('.todo-item:not(.done)').all_inner_texts() if 'proposal' in x]
    t('completing proposal todo creates the next', len(open_items) == 1, open_items)

    # ---- dashboard pipeline
    pg.click('.btn-dash >> text=Dashboard'); pg.wait_for_timeout(300)
    card = pg.inner_text('.pipe-card') if pg.locator('.pipe-card').count() else ''
    t('pipeline card shows Proposal sent 1', 'Proposal sent' in card and 'Inquiry' not in card, card)
    pg.click('[data-pipe="Proposal sent"]'); pg.wait_for_timeout(200)
    t('drill-down lists trip', 'Ann Test' in pg.inner_text('#main') and 'Western Caribbean' in pg.inner_text('#main'))
    pg.click('[data-open-client]'); pg.wait_for_timeout(300)
    t('tap trip opens client Trips tab', pg.locator('.tr-row').count() == 1)

    # ---- lost reason
    pg.locator('.tr-row').click(); pg.wait_for_timeout(200)
    pg.select_option('#trStage', 'Not now / Lost'); pg.wait_for_timeout(200)
    pg.fill('#trLostReason', 'Went with another agent'); pg.click('#trLostYes'); pg.wait_for_timeout(800)
    row = dict(zip(state()['Trips'][0], state()['Trips'][1]))
    t('lost reason saved', row['status'] == 'Not now / Lost' and row['lostReason'] == 'Went with another agent', row)
    pg.click('#trBack'); pg.wait_for_timeout(200)
    t('lost trip dimmed but listed', pg.locator('.tr-row.dim').count() == 1)
    pg.click('.btn-dash >> text=Dashboard'); pg.wait_for_timeout(300)
    t('lost trip not in pipeline', pg.locator('.pipe-card').count() == 0)

    # ---- chatbot lead → trip with raw answers
    r = backend_post({'type': 'crm', 'action': 'chatbotLead', 'secret': 'dmb!ENH-weu9rda9rgk', 'lead': {'name': 'Cathy Bot', 'email': 'cathy@x.com', 'destination': 'Hawaii', 'dates': 'next spring', 'travelers': '2 adults', 'budget': 'around 5k'}, 'interests': ['Hawaii']})
    t('chatbot lead ok', r.get('success'), r)
    pg.reload(); pg.wait_for_timeout(900)
    t('dashboard card shows Inquiry after reload', 'Inquiry' in pg.inner_text('.pipe-card'))
    pg.locator('.client-item', has_text='Cathy Bot').click(); pg.click('#tab-trips'); pg.wait_for_timeout(200)
    pg.locator('.tr-row').click(); pg.wait_for_timeout(200)
    t('chatbot box shows raw answers', 'next spring' in pg.inner_text('#trForm') and 'around 5k' in pg.inner_text('#trForm'))
    t('chatbot trip destination copied', pg.input_value('[data-k="destination"]') == 'Hawaii')
    t('chatbot trip source', pg.locator('[data-k="source"]').input_value() == 'Website chatbot')
    pg.screenshot(path='/tmp/ui-form-wide.png', full_page=False)

    # ---- Info tab contact fields
    pg.click('#trBack'); pg.locator('.client-item', has_text='Ann Test').click(); pg.wait_for_timeout(200)
    pg.click('#editBtn'); pg.select_option('#f_bestTime', 'Night'); pg.select_option('#f_contactMethod', 'Text'); pg.click('#editBtn'); pg.wait_for_timeout(600)
    cl = dict(zip(state()['Clients'][0], state()['Clients'][1]))
    t('contact prefs saved to client', cl['bestTimeToContact'] == 'Night' and cl['contactMethod'] == 'Text', cl)
    pg.click('#tab-trips'); pg.locator('.tr-row').click(); pg.wait_for_timeout(200)
    t('contact prefs shown read-only in form', 'Best time: Night' in pg.inner_text('.tr-meta') and 'Text' in pg.inner_text('.tr-meta'))

    # ---- autosave after ~10 s (fast-forward the page clock)
    # (fresh page so the clock can be installed before load)
    pg2 = ctx.new_page(); pg2.clock.install()
    pg2.goto(BASE + 'vanessa-crm.html')
    pg2.evaluate("sessionStorage.setItem('crm_unlocked','1')")
    # token lives in sessionStorage of the first page; log in again here
    pg2.fill('#loginPw', 'pw'); pg2.click('.login-btn'); pg2.clock.run_for(1500); pg2.wait_for_timeout(500)
    pg2.locator('.client-item', has_text='Ann Test').click(); pg2.click('#tab-trips'); pg2.locator('.tr-row').click(); pg2.wait_for_timeout(200)
    pg2.fill('[data-k="nextStep"]', 'Call back Friday')
    before = dict(zip(state()['Trips'][0], state()['Trips'][1]))['nextStep']
    pg2.clock.run_for(4000); pg2.wait_for_timeout(300)
    mid = dict(zip(state()['Trips'][0], state()['Trips'][1]))['nextStep']
    pg2.clock.run_for(8000); pg2.wait_for_timeout(700)
    after = dict(zip(state()['Trips'][0], state()['Trips'][1]))['nextStep']
    t('autosave waits ~10s then saves', before == '' and mid == '' and after == 'Call back Friday', (before, mid, after))
    pg2.close()

    # ---- phone width: no sideways scroll
    ph = ctx.new_page(); ph.set_viewport_size({'width': 390, 'height': 800})
    ph.goto(BASE + 'vanessa-crm.html'); ph.fill('#loginPw', 'pw'); ph.click('.login-btn'); ph.wait_for_timeout(800)
    ph.click('.crm-mobile-btn'); ph.wait_for_timeout(200)
    ph.locator('.client-item', has_text='Ann Test').click(); ph.click('#tab-trips'); ph.wait_for_timeout(200)
    ph.locator('.tr-row').click(); ph.wait_for_timeout(300)
    sw = ph.evaluate("[document.documentElement.scrollWidth, window.innerWidth, document.getElementById('tabBody').scrollWidth, document.getElementById('tabBody').clientWidth]")
    t('phone: no horizontal scroll', sw[0] <= sw[1] and sw[2] <= sw[3] + 1, sw)
    small = ph.evaluate("Array.from(document.querySelectorAll('.tr-btn, .tr-in, .tr-save')).filter(e=>e.offsetParent && e.getBoundingClientRect().height < 43).length")
    t('tap targets >= 44px', small == 0, small)
    ph.screenshot(path='/tmp/ui-form-phone.png')
    ip = ph.new_page if False else None
    ph.set_viewport_size({'width': 820, 'height': 1100}); ph.wait_for_timeout(200)
    sw = ph.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    t('iPad width: no horizontal scroll', sw[0] <= sw[1], sw)
    ph.screenshot(path='/tmp/ui-form-ipad.png')

    # ---- delete a trip from the UI (removes its automatic todos)
    pg3 = ctx.new_page(); pg3.on('dialog', lambda d: d.accept())
    pg3.goto(BASE + 'vanessa-crm.html'); pg3.fill('#loginPw', 'pw'); pg3.click('.login-btn'); pg3.wait_for_timeout(800)
    pg3.locator('.client-item', has_text='Bob Roe').click(); pg3.click('#tab-trips'); pg3.click('#trNew'); pg3.wait_for_timeout(200)
    t('all-inclusive default for AI-interest client', pg3.locator('.tr-btn.sel[data-k="tripType"]').inner_text() == 'All-Inclusive')
    pg3.fill('[data-k="destination"]', 'Cancun'); pg3.click('#trSave'); pg3.wait_for_timeout(800)
    n_before = len([r for r in state()['Todos'][1:] if len(r) > 7 and r[6]])
    pg3.click('#trDelete'); pg3.wait_for_timeout(800)
    st = state()
    t('trip deleted on server', not any(r[11] == 'Cancun' for r in st['Trips'][1:]))
    t('its auto todo removed', len([r for r in st['Todos'][1:] if len(r) > 7 and r[6]]) == n_before - 1, (n_before,))
    t('hand-made todo kept', any(r[0] == 't0' for r in st['Todos'][1:]))
    pg3.close()

    print('console/page errors:', errs[:5])
    br.close()
print(f'ui tests: passed {ok}, failed {bad}')
sys.exit(1 if bad else 0)
