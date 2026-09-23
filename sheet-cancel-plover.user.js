// ==UserScript==
// @name         Sheet Cancel Helper (Plover)
// @namespace    http://tampermonkey.net/
// @version      1.11
// @description  Частич./Полная отмена из Google-таблицы выплат
// @author       Plover
// @updateURL    https://github.com/TsukuyomiTim/TableJiraMaker/raw/refs/heads/main/sheet-cancel-plover.user.js
// @downloadURL  https://github.com/TsukuyomiTim/TableJiraMaker/raw/refs/heads/main/sheet-cancel-plover.user.js
// @match        *://docs.google.com/*
// @match        *://docs.google.com/spreadsheets/*
// @match        *://docs.google.com/spreadsheets/d/*
// @match        *://docs.google.com/spreadsheets/u/*/d/*
// @match        https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/894*
// @match        https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/1170*
// @match        https://cc.boadmin.org/*
// @match        https://gm.boadmin.org/*
// @match        https://dy.boadmin.org/*
// @match        https://mr.boadmin.org/*
// @match        https://rs.boadmin.org/*
// @match        https://kn.boadmin.org/*
// @match        https://kt.boadmin.org/*
// @match        https://ak.boadmin.org/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const PROJECTS = ['Cat', 'Gama', 'Daddy', 'Mers', 'R7', 'Kent', 'Kometa', 'Arkada'];
    const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'UZS', 'BYN', 'USDT', 'BTC', 'LTC', 'ETH', 'BRL', 'TRX'];
    const FULL_STATUSES = ['Pending', 'Success'];
    const FORM_PARTIAL = 'https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/894';
    const FORM_FULL = 'https://tasks.deltasystem.tech/servicedesk/customer/portal/22/create/1170';
    const DATA_KEY = 'plover_sheet_cancel_v1';
    const FORM_SOURCE_KEY = 'plover_form_source_v1';

    const PROJECT_VALUES = {
        'Cat': '13907', 'Gama': '13908', 'Daddy': '13909', 'Kent': '13910',
        'R7': '13911', 'Kometa': '13912', 'Mers': '13914', 'Arkada': '14500'
    };
    const CURRENCY_VALUES = {
        'USD': '14101', 'EUR': '14102', 'RUB': '14103', 'BYN': '14104',
        'USDT': '14105', 'BTC': '14106', 'LTC': '14107', 'ETH': '14108',
        'KZT': '14109', 'BRL': '14110', 'UZS': '14912', 'TRX': '17347'
    };
    const PROFILE_HOSTS = {
        'Cat': 'https://cc.boadmin.org/ru/Users/Summary/',
        'Gama': 'https://gm.boadmin.org/ru/Users/Summary/',
        'Daddy': 'https://dy.boadmin.org/ru/Users/Summary/',
        'Mers': 'https://mr.boadmin.org/ru/Users/Summary/',
        'R7': 'https://rs.boadmin.org/ru/Users/Summary/',
        'Kent': 'https://kn.boadmin.org/ru/Users/Summary/',
        'Kometa': 'https://kt.boadmin.org/ru/Users/Summary/',
        'Arkada': 'https://ak.boadmin.org/ru/Users/Summary/'
    };

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function getJq() {
        const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const cand = (uw.AJS && uw.AJS.$) || uw.jQuery || uw.$ || (window.AJS && window.AJS.$) || window.jQuery;
        return (typeof cand === 'function') ? cand : null;
    }

    function cleanPayName(raw) {
        if (!raw) return '';
        return String(raw)
            .replace(/\b(HTTT|Hgate)\b/gi, '')
            .replace(/[_\s]+/g, ' ')
            .replace(/^[\s/_-]+|[\s/_-]+$/g, '')
            .trim();
    }

    function hasHtttOrHgate(name) {
        return /\b(HTTT|Hgate)\b/i.test(String(name || ''));
    }

    function formatDateRu(iso) {
        if (!iso) return '';
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[3] + '.' + m[2] + '.' + m[1];
        const d = String(iso).match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
        return d ? d[1] : iso;
    }

    function stripZeroDecimals(s) {
        if (s == null) return '';
        return String(s).replace(/\s+/g, ' ').trim().replace(/[.,]00$/, '');
    }

    function cleanRequestedAmount(s) {
        if (!s) return '';
        let t = String(s).replace(/\u00a0/g, ' ');
        t = t.replace(/\([^)]*\)/g, ' ');
        t = t.replace(/\b(RUB|USD|EUR|KZT|UZS|BYN|USDT|BTC|LTC|ETH|BRL|TRX)\b/gi, ' ');
        const m = t.match(/[0-9][0-9\s,]*(?:[.,][0-9]+)?/);
        if (!m) return '';
        return stripZeroDecimals(m[0]);
    }

    function profileUrl(project, playerId) {
        if (!project || !playerId || !PROFILE_HOSTS[project]) return null;
        return PROFILE_HOSTS[project] + playerId;
    }

    /* ---------- Google Sheet ---------- */

    function nodeText(n) {
        if (!n) return '';
        return String(n.value || n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getMount() {
        try {
            if (window.top && window.top.document && window.top.document.body) return window.top.document.body;
        } catch (e) {}
        return document.body || document.documentElement;
    }

    function docsRoot() {
        const frames = [...document.querySelectorAll('iframe')];
        for (const f of frames) {
            try {
                const d = f.contentDocument;
                if (d && d.querySelector('#t-name-box, .cell-input, [contenteditable="true"]')) return d;
            } catch (e) {}
        }
        return document;
    }

    function scanTopBar() {
        const root = docsRoot();
        let name = '';
        let formula = '';
        const nodes = root.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]');
        for (const el of nodes) {
            const r = el.getBoundingClientRect();
            if (r.height === 0 || r.top > 190) continue;
            const t = nodeText(el);
            if (/^[A-Z]{1,3}\d{1,5}$/i.test(t)) name = t.toUpperCase();
            if (/^\d{6,14}$/.test(t)) formula = t;
        }
        return { name, formula };
    }

    function sheetText() {
        return (document.body?.innerText || '').replace(/\u00a0/g, ' ');
    }

    function findProjectNearId(id) {
        const t = sheetText();
        const idx = t.indexOf(String(id));
        const before = idx >= 0 ? t.slice(0, idx) : t;
        let best = null, bestPos = -1;
        for (const p of PROJECTS) {
            const pos = before.lastIndexOf(p);
            if (pos > bestPos) {
                bestPos = pos;
                best = p;
            }
        }
        return best;
    }

    function findOrderNearId(id) {
        const t = sheetText();
        const re = new RegExp(String(id) + '\\s+(\\d{6,})');
        const m = t.match(re);
        return m ? m[1] : null;
    }

    function findPsNearId(id) {
        const t = sheetText();
        const re = new RegExp(String(id) + '\\s+\\d{6,}\\s+([^\\n]+pay[-_ ]?out[^\\n]*)', 'i');
        const m = t.match(re);
        return m ? m[1].replace(/\s+/g, ' ').trim() : null;
    }

    function findIdNearOrder(order) {
        const t = sheetText();
        const re = new RegExp('(\\d{7,14})\\s+' + String(order) + '\\b');
        const m = t.match(re);
        return m ? m[1] : null;
    }

    function currentSelection() {
        const bar = scanTopBar();
        const addr = bar.name;
        const val = String(bar.formula || '').replace(/\s/g, '');
        const col = (addr.match(/^([A-Z]+)/) || [])[1] || '';
        const isOrderCol = !col || col === 'C';
        const isIdCol = col === 'B';
        let order = '';
        let playerId = '';
        if (isOrderCol && /^\d{6,14}$/.test(val)) {
            order = val;
            playerId = findIdNearOrder(order) || '';
        } else if (isIdCol && /^\d{7,14}$/.test(val)) {
            playerId = val;
            order = findOrderNearId(playerId) || '';
        } else if (!col && /^\d{6,14}$/.test(val)) {
            order = val;
            playerId = findIdNearOrder(order) || val;
        }
        return {
            addr,
            val,
            playerId,
            order,
            project: playerId ? findProjectNearId(playerId) : (order ? findProjectNearId(order) : null)
        };
    }

    function ensureSheetPanel() {
        const mount = getMount();
        if (!mount) return;
        if (mount.ownerDocument.getElementById('plover-sheet-panel') || document.getElementById('plover-sheet-panel')) return;
        const box = document.createElement('div');
        box.id = 'plover-sheet-panel';
        box.innerHTML = `
            <style>
                #plover-sheet-panel { position: fixed; bottom: 52px; left: 50%; transform: translateX(-50%);
                    z-index: 2147483647; background: #0f172a; color: #e2e8f0; border: 1px solid #38bdf8;
                    border-radius: 12px; padding: 10px 14px; font-family: system-ui, sans-serif;
                    box-shadow: 0 10px 30px rgba(0,0,0,.45); min-width: 460px; }
                #plover-sheet-panel .meta { font-size: 12px; color: #94a3b8; margin-bottom: 8px; text-align: center; }
                #plover-sheet-panel .row { display: flex; gap: 8px; margin-bottom: 8px; }
                #plover-sheet-panel input { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid #334155;
                    background: #1e293b; color: #f1f5f9; font-size: 13px; }
                #plover-sheet-panel .btns { display: flex; gap: 8px; }
                #plover-sheet-panel button { flex: 1; border: none; border-radius: 8px; padding: 9px;
                    color: #fff; cursor: pointer; font-weight: 600; font-size: 12px; }
                .psc-partial { background: #0f766e; }
                .psc-full { background: #7f1d1d; }
            </style>
            <div class="meta" id="psc-meta">Вставь ордер или выдели ячейку в столбце C</div>
            <div class="row">
                <input id="psc-order" placeholder="Ордер, например 331004147">
            </div>
            <div class="btns">
                <button class="psc-partial">Частич. Отмена</button>
                <button class="psc-full">Полная Отмена</button>
            </div>
        `;
        mount.appendChild(box);
        const start = (action) => {
            const typed = (box.querySelector('#psc-order').value || '').replace(/\s/g, '');
            const s = currentSelection();
            const order = typed || s.order || '';
            const playerId = s.playerId || findIdNearOrder(order) || '';
            const project = s.project || (playerId && findProjectNearId(playerId)) || (order && findProjectNearId(order));
            if (!order) return alert('Укажи ордер');
            showSheetModal(action, playerId, order, project);
        };
        box.querySelector('.psc-partial').onclick = () => start('partial');
        box.querySelector('.psc-full').onclick = () => start('fullcancel');
    }

    function activeCellRect() {
        const root = docsRoot();
        const el = root.querySelector('.active-cell-border')
            || root.querySelector('[class*="active-cell-border"]');
        return el ? el.getBoundingClientRect() : null;
    }

    function updateOrderHit(s) {
        let ov = document.getElementById('plover-cell-hit');
        if (!s.order) {
            if (ov) ov.style.display = 'none';
            return;
        }
        if (!ov) {
            ov = document.createElement('button');
            ov.id = 'plover-cell-hit';
            ov.textContent = 'Отмена';
            ov.style.cssText = 'position:fixed;z-index:999998;border:0;border-radius:6px;background:#0f766e;color:#fff;font:11px system-ui;font-weight:700;cursor:pointer;padding:4px 8px;box-shadow:0 4px 12px rgba(0,0,0,.35);';
            ov.onmousedown = ev => ev.stopPropagation();
            ov.onclick = ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const cur = currentSelection();
                showSheetModal('partial', cur.playerId, cur.order, cur.project);
            };
            document.body.appendChild(ov);
        }
        const rect = activeCellRect();
        ov.style.display = 'block';
        if (rect && rect.width) {
            ov.style.left = Math.min(window.innerWidth - 90, rect.right + 6) + 'px';
            ov.style.top = Math.max(50, rect.top) + 'px';
        } else {
            ov.style.left = '50%';
            ov.style.top = '110px';
            ov.style.transform = 'translateX(-50%)';
        }
    }

    function refreshSheetPanel() {
        ensureSheetPanel();
        const s = currentSelection();
        const meta = document.getElementById('psc-meta');
        const input = document.getElementById('psc-order');
        if (s.order && input && document.activeElement !== input) input.value = s.order;
        if (s.order || s.playerId) {
            meta.textContent = (s.order ? 'Ордер ' + s.order : '')
                + (s.playerId ? ' · ID ' + s.playerId : '')
                + (s.project ? ' · ' + s.project : '');
        } else {
            meta.textContent = 'Вставь ордер в поле или выдели столбец C';
        }
        updateOrderHit(s);
    }

    function showSheetModal(action, playerId, order, project) {
        document.getElementById('plover-sheet-modal')?.remove();
        const isPartial = action === 'partial';
        const modal = document.createElement('div');
        modal.id = 'plover-sheet-modal';
        modal.innerHTML = `
            <style>
                #plover-sheet-modal { position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 1000000;
                    display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
                .psm-box { background: #0f172a; border: 1px solid #334155; border-radius: 16px;
                    padding: 22px; width: 400px; color: #e2e8f0; }
                .psm-box h3 { margin: 0 0 16px; text-align: center; }
                .psm-field { margin-bottom: 12px; }
                .psm-field label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 5px; }
                .psm-field input, .psm-field select { width: 100%; box-sizing: border-box; padding: 10px 12px;
                    border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #f1f5f9; }
                .psm-act { display: flex; gap: 10px; margin-top: 16px; }
                .psm-act button { flex: 1; padding: 11px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
                .psm-ok { background: #2563eb; color: #fff; }
                .psm-no { background: #334155; color: #e2e8f0; }
            </style>
            <div class="psm-box">
                <h3>${isPartial ? 'Частич. Отмена' : 'Полная Отмена'}</h3>
                ${isPartial ? `
                <div class="psm-field">
                    <label>Сумма, которую вывела платежка</label>
                    <input type="number" id="psm-amount" step="any" autofocus>
                </div>` : ''}
                <div class="psm-field">
                    <label>Валюта</label>
                    <select id="psm-currency">${CURRENCIES.map(c => '<option value="' + c + '">' + c + '</option>').join('')}</select>
                </div>
                <div class="psm-field">
                    <label>${isPartial ? 'Дата частичной отмены' : 'Дата отмены'}</label>
                    <input type="date" id="psm-date">
                </div>
                ${isPartial ? '' : `
                <div class="psm-field">
                    <label>Withdrawal status to return</label>
                    <select id="psm-status">${FULL_STATUSES.map(s => '<option value="' + s + '">' + s + '</option>').join('')}</select>
                </div>`}
                <div class="psm-act">
                    <button class="psm-no">Отмена</button>
                    <button class="psm-ok">Открыть профиль и форму</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.psm-no').onclick = () => modal.remove();
        modal.querySelector('.psm-ok').onclick = () => {
            const amount = parseFloat(modal.querySelector('#psm-amount')?.value);
            const currency = modal.querySelector('#psm-currency').value;
            const cancelDate = modal.querySelector('#psm-date').value;
            const wdStatus = modal.querySelector('#psm-status')?.value || '';
            if (isPartial && (!amount || amount <= 0)) return alert('Введите сумму');
            if (!cancelDate) return alert('Укажите дату');
            if (!playerId) return alert('Нет ID игрока');
            if (!project) return alert('Не удалось определить проект из таблицы');
            const url = profileUrl(project, playerId);
            if (!url) return alert('Неизвестный проект: ' + project);
            modal.remove();
            GM_setValue(DATA_KEY, JSON.stringify({
                action, playerId, order, project, amount, currency, cancelDate, wdStatus,
                sheetPs: findPsNearId(playerId),
                stage: 'profile',
                timestamp: Date.now()
            }));
            GM_openInTab(url, { active: true });
        };
    }

    function watchSheetClicks() {
        document.getElementById('plover-sheet-hint')?.remove();
        ensureSheetPanel();
        refreshSheetPanel();
        setInterval(refreshSheetPanel, 400);
        document.addEventListener('mouseup', () => setTimeout(refreshSheetPanel, 200), true);
        document.addEventListener('keyup', () => setTimeout(refreshSheetPanel, 200), true);
    }

    /* ---------- Profile scrape ---------- */

    function showStatus(msg) {
        let el = document.getElementById('plover-sheet-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'plover-sheet-status';
            el.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999999;background:#0f172a;color:#e2e8f0;border:1px solid #38bdf8;border-radius:10px;padding:12px 16px;font:13px system-ui;max-width:360px;white-space:pre-wrap;';
            document.body.appendChild(el);
        }
        el.textContent = msg;
    }

    function detectExactVip() {
        const nodes = [...document.querySelectorAll('span, a, div, label, li, td, b, strong')];
        return nodes.some(n => {
            if (n.children.length > 3) return false;
            return /^VIP$/i.test((n.textContent || '').replace(/\s+/g, ' ').trim());
        });
    }

    function headerIndex(table, names) {
        const rows = [...table.querySelectorAll('tr')].slice(0, 8);
        for (const row of rows) {
            const cells = [...row.querySelectorAll('th, td')];
            const texts = cells.map(c => c.textContent.replace(/\s+/g, ' ').trim().toLowerCase());
            const idx = {};
            names.forEach(name => {
                const i = texts.findIndex(t => t === name.toLowerCase() || t.includes(name.toLowerCase()));
                if (i >= 0) idx[name] = i;
            });
            if (Object.keys(idx).length) return { idx, offsetRow: row };
        }
        return { idx: {}, offsetRow: null };
    }

    function withdrawalsRoot() {
        const heads = [...document.querySelectorAll('h1,h2,h3,h4,legend,.panel-heading,.card-header,a,button,span,li')];
        const head = heads.find(n => /^запросы на вывод$/i.test((n.textContent || '').replace(/\s+/g, ' ').trim()))
            || heads.find(n => /запросы на вывод/i.test((n.textContent || '')));
        if (!head) return document;
        return head.closest('.panel, .card, .box, section, .tab-pane, .widget, form, .container') || head.parentElement || document;
    }

    function findOrderRow(order) {
        const want = String(order);
        const roots = [withdrawalsRoot(), document];
        for (const root of roots) {
            const rows = [...root.querySelectorAll('tr')];
            const hit = rows.find(r => {
                const cells = [...r.querySelectorAll('td, th')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
                return cells.some(c => c === want || c === '#' + want);
            });
            if (hit) return hit;
        }
        return null;
    }

    function isLeftMenu(el) {
        if (!el) return false;
        if (el.closest('nav, aside, .sidebar, .main-sidebar, .left-menu, #sidebar, .menu-wrapper')) return true;
        const r = el.getBoundingClientRect();
        return r.left < 260 && r.width < 420 && r.height < 80;
    }

    function inPageByText(re, exact) {
        const nodes = [...document.querySelectorAll('a, button, span, li, td, h2, h3, h4, legend, .panel-heading, [role="tab"], div')];
        return nodes.find(n => {
            if (n.children.length > 6) return false;
            if (isLeftMenu(n)) return false;
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            return exact ? re.test(t) && t.length < 80 : re.test(t);
        }) || null;
    }

    async function openInPageSection(titleRe) {
        const el = inPageByText(titleRe, false);
        if (!el) return false;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        await sleep(200);
        el.click();
        await sleep(900);
        return true;
    }

    async function openAllFolder() {
        const section = inPageByText(/вывод средств/i, false);
        if (section) {
            section.scrollIntoView({ block: 'center', behavior: 'instant' });
            await sleep(200);
            if (section.closest('a, button, [role="button"], .accordion-toggle')) section.click();
            else section.click();
            await sleep(700);
        }
        const root = section?.closest('.panel, .card, .box, section, .widget, fieldset, .tab-pane, form') || document;
        const allBtn = [...root.querySelectorAll('a, button, span, li, td, div')].find(n => {
            if (isLeftMenu(n) || n.children.length > 4) return false;
            return /^все$/i.test((n.textContent || '').replace(/\s+/g, ' ').trim());
        });
        if (allBtn) {
            allBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
            allBtn.click();
            await sleep(1200);
            return true;
        }
        return false;
    }

    async function openWithdrawalsSection() {
        window.scrollTo(0, document.body.scrollHeight * 0.35);
        await sleep(400);
        await openInPageSection(/^запросы на вывод$/i) || await openInPageSection(/запросы на вывод/i);
        await sleep(400);
    }

    function cellByHeader(row, table, headerNames) {
        const { idx } = headerIndex(table, headerNames);
        const cells = [...row.querySelectorAll('td, th')];
        for (const name of headerNames) {
            if (idx[name] != null && cells[idx[name]]) return cells[idx[name]].textContent.replace(/\s+/g, ' ').trim();
        }
        return '';
    }

    function dataFromProfileUrl() {
        const q = new URLSearchParams(location.search);
        if (q.get('plover') !== '1') return null;
        return {
            action: q.get('action') || 'partial',
            playerId: q.get('playerId') || location.pathname.split('/').pop(),
            order: q.get('order') || '',
            project: q.get('project') || '',
            amount: q.get('amount') || '',
            currency: q.get('currency') || 'RUB',
            cancelDate: q.get('cancelDate') || '',
            wdStatus: q.get('wdStatus') || '',
            stage: 'profile',
            timestamp: Date.now()
        };
    }

    async function scrapeSheetProfile() {
        let data = dataFromProfileUrl();
        if (data) GM_setValue(DATA_KEY, JSON.stringify(data));
        if (!data) {
            const raw = GM_getValue(DATA_KEY);
            if (!raw) return;
            try { data = JSON.parse(raw); } catch { return; }
        }
        if (data.stage !== 'profile') return;
        if (Date.now() - data.timestamp > 15 * 60 * 1000) return;

        showStatus('Plover: ищу ордер на странице профиля…');
        await sleep(1200);
        await openWithdrawalsSection();
        showStatus('Plover: ищу ордер ' + (data.order || '') + ' в Запросах на вывод…');

        data.isVip = detectExactVip();

        let payName = '';
        let withdrawDate = '';
        let requestedAmount = '';

        if (data.order) {
            let row = findOrderRow(data.order);
            if (!row) {
                showStatus('Plover: в Запросах на вывод нет ордера, открываю Вывод средств → Все…');
                await openAllFolder();
                row = findOrderRow(data.order);
            }
            const table = row?.closest('table');
            if (row && table) {
                payName = cellByHeader(row, table, ['Платёжная система', 'Платежная система', 'ПС', 'Payment system', 'Payment System']);
                withdrawDate = cellByHeader(row, table, ['Дата', 'Date']);
                requestedAmount = cellByHeader(row, table, ['Сумма', 'Amount']);
            }
            if (!payName && row) {
                const txt = row.innerText.replace(/\s+/g, ' ');
                const m = txt.match(/([A-Za-z0-9][A-Za-z0-9 ._+-]*pay[-_ ]?out[A-Za-z0-9 ._+-]*)/i);
                if (m) payName = m[1].trim();
            }
            if (!withdrawDate && row) {
                const m = row.innerText.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
                if (m) withdrawDate = m[1];
            }
            if (!requestedAmount && row) {
                const m = row.innerText.match(/([0-9][0-9\s,]*(?:[.,][0-9]+)?)\s*(RUB|USD|EUR|KZT|UZS|BYN)?/i);
                if (m) requestedAmount = m[1];
            }
        }

        if (!payName) payName = data.sheetPs || '';
        data.psp = cleanPayName(payName);
        data.rawPayName = payName;
        data.withdrawDate = formatDateRu(withdrawDate) || withdrawDate;
        data.requestedAmount = cleanRequestedAmount(requestedAmount);
        data.token = data.order || '';
        data.pspToken = hasHtttOrHgate(payName) ? '' : (data.order || '');
        data.stage = 'form';
        data.timestamp = Date.now();
        GM_setValue(DATA_KEY, JSON.stringify(data));

        showStatus('Plover: метод ' + (data.psp || '—') + '\nдата ' + (data.withdrawDate || '—') + '\nсумма ' + (data.requestedAmount || '—'));
        await sleep(500);

        GM_setValue(FORM_SOURCE_KEY, 'sheet');
        const form = data.action === 'fullcancel' ? FORM_FULL : FORM_PARTIAL;
        const params = new URLSearchParams();
        const summary = [data.playerId, data.project, data.psp].filter(Boolean).join(' / ').replace(' / ', ' ').replace(/^(\d+\s+\S+)\s\/\s/, '$1 / ');
        const left = [data.playerId, data.project].filter(Boolean).join(' ');
        params.set('summary', [left, data.psp].filter(Boolean).join(' / '));
        params.set('description', data.action === 'fullcancel' ? buildFullDesc(data) : buildPartialDesc(data));
        if (data.playerId) params.set('customfield_12600', data.playerId);
        params.set('source', 'sheet');
        GM_openInTab(form + '?' + params.toString(), { active: true });
    }

    function buildPartialDesc(data) {
        return [
            'Дата частичной отмены: ' + (formatDateRu(data.cancelDate) || data.cancelDate || 'не указана'),
            'Дата вывода: ' + (data.withdrawDate || 'не найдено')
        ].join('\n');
    }

    function buildFullDesc(data) {
        const methodLine = 'Метод: ' + (data.psp || 'не найдено');
        const tokenLine = hasHtttOrHgate(data.rawPayName || data.psp)
            ? 'Токен ПС:'
            : ('Токен с фундиста: ' + (data.token || data.order || 'не найдено'));
        return [
            'Дата создания: ' + (data.withdrawDate || 'не найдено'),
            'Дата отмены: ' + (formatDateRu(data.cancelDate) || data.cancelDate || 'не указана'),
            methodLine,
            tokenLine
        ].join('\n');
    }

    /* ---------- Form fill ---------- */

    function applyNativeSelect(select, value, visibleText) {
        if (!select) return false;
        let opt = [...select.options].find(o => String(o.value) === String(value) || o.text.trim() === visibleText);
        if (!opt && value) {
            opt = document.createElement('option');
            opt.value = String(value);
            opt.textContent = visibleText || String(value);
            select.appendChild(opt);
        }
        if (opt) opt.selected = true;
        select.value = String(value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const $ = getJq();
        if ($) {
            try { $(select).val(String(value)).trigger('change'); } catch (e) {}
        }
        return true;
    }

    function setInputByName(name, value) {
        const el = document.querySelector('[name="' + name + '"], #' + name);
        if (!el || value == null) return false;
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function setInputByLabel(labelText, value) {
        if (value == null || value === '') return false;
        const want = labelText.trim().toLowerCase();
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find(l => l.textContent.trim().toLowerCase().replace(/\*$/, '') === want);
        const group = label ? (label.closest('.field-group') || label.parentElement) : null;
        const input = group?.querySelector('input:not([type="hidden"]), textarea');
        if (!input) return setInputByName(labelText, value);
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function setSelectByLabel(labelText, value) {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find(l => l.textContent.trim().toLowerCase().includes(labelText.toLowerCase()));
        const select = (label?.closest('.field-group') || label?.parentElement)?.querySelector('select');
        if (!select) return false;
        return applyNativeSelect(select, value);
    }

    function setSelectByOptionText(labelText, optionText) {
        if (!optionText) return false;
        const want = labelText.trim().toLowerCase();
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find(l => l.textContent.trim().toLowerCase().replace(/\*$/, '') === want)
            || labels.find(l => l.textContent.trim().toLowerCase().includes(want));
        const select = (label?.closest('.field-group') || label?.parentElement)?.querySelector('select');
        if (!select) return false;
        const opt = [...select.options].find(o => o.text.trim().toLowerCase() === String(optionText).toLowerCase())
            || [...select.options].find(o => o.text.trim().toLowerCase().includes(String(optionText).toLowerCase()));
        if (!opt) return false;
        return applyNativeSelect(select, opt.value, opt.text);
    }

    function setSelectById(fieldId, value, visibleText) {
        const select = document.querySelector('#' + fieldId + ', [name="' + fieldId + '"]');
        if (!select) return false;
        return applyNativeSelect(select, value, visibleText);
    }

    async function forceCurrency(currencyCode) {
        const value = CURRENCY_VALUES[currencyCode];
        const group = [...document.querySelectorAll('.field-group, .field')].find(g => {
            const lab = (g.querySelector('label')?.textContent || '').replace(/\s+/g, ' ').trim();
            return /^currency\*?$/i.test(lab);
        });
        const select = document.querySelector('#customfield_10805, [name="customfield_10805"]')
            || group?.querySelector('select');
        if (!select || !currencyCode) return;
        const opt = [...select.options].find(o => o.text.trim() === currencyCode);
        const val = opt ? opt.value : value;
        if (val) applyNativeSelect(select, val, currencyCode);
        const $ = getJq();
        if ($ && val) {
            try { $(select).val(String(val)).trigger('change'); } catch (e) {}
        }
    }

    function writeDescription(text) {
        const desc = document.querySelector('#description, [name="description"], textarea#description');
        if (desc) {
            desc.value = text;
            desc.dispatchEvent(new Event('input', { bubbles: true }));
            desc.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const iframe = document.querySelector('iframe.tox-edit-area__iframe, iframe[id*="description"]');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
            iframe.contentDocument.body.innerText = text;
        }
    }

    function addForceBtn(text, fn) {
        if (document.getElementById('plover-force-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'plover-force-btn';
        btn.textContent = text;
        btn.style.cssText = 'position:fixed;bottom:25px;right:25px;z-index:999999;background:#2563eb;color:white;border:none;padding:14px 22px;border-radius:10px;font-weight:600;cursor:pointer;';
        btn.onclick = fn;
        document.body.appendChild(btn);
    }

    function clearTicketLink() {
        const ticket = [...document.querySelectorAll('label')].find(l =>
            l.textContent.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\*$/, '') === 'ticket link'
        );
        const ticketBox = ticket ? (ticket.closest('.field-group') || ticket.parentElement) : null;
        const ticketInput = ticketBox?.querySelector('input:not([type="hidden"]), textarea');
        if (ticketInput) {
            ticketInput.value = '';
            ticketInput.dispatchEvent(new Event('input', { bubbles: true }));
            ticketInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const named = document.querySelector('[name="customfield_12606"], #customfield_12606');
        if (named) {
            named.value = '';
            named.dispatchEvent(new Event('input', { bubbles: true }));
            named.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function fillPartialForm(data) {
        const left = [data.playerId, data.project].filter(Boolean).join(' ');
        const summary = [left, data.psp].filter(Boolean).join(' / ');
        setInputByName('summary', summary);
        setInputByLabel('Summary', summary);
        writeDescription(buildPartialDesc(data));

        if (data.project) {
            if (PROJECT_VALUES[data.project]) setSelectByLabel('Project', PROJECT_VALUES[data.project]);
            setSelectByOptionText('Project', data.project);
        }
        setInputByLabel('Player ID', data.playerId);
        setInputByName('customfield_12600', data.playerId);
        setSelectByOptionText('Player VIP', data.isVip ? 'Yes' : 'No');

        if (data.requestedAmount) setInputByLabel('Requested withdrawal amount', data.requestedAmount);
        if (data.amount) setInputByLabel('Actual withdrawal amount', data.amount);

        if (data.currency) {
            setSelectByOptionText('Currency', data.currency);
            if (CURRENCY_VALUES[data.currency]) setSelectById('customfield_10805', CURRENCY_VALUES[data.currency], data.currency);
            forceCurrency(data.currency);
        }

        if (data.token) {
            setInputByLabel('Token', data.token);
            setInputByName('customfield_12603', data.token);
        }
        if (data.pspToken) {
            setInputByLabel('PSP Token', data.pspToken);
        }
        if (data.psp) {
            setInputByLabel('PSP', data.psp);
            setInputByName('customfield_12605', data.psp);
        }
        clearTicketLink();
        console.log('[Plover sheet] partial', data);
    }

    function fillFullForm(data) {
        const left = [data.playerId, data.project].filter(Boolean).join(' ');
        const summary = [left, data.psp].filter(Boolean).join(' / ');
        setInputByName('summary', summary);
        setInputByLabel('Summary', summary);
        writeDescription(buildFullDesc(data));

        if (data.project) {
            if (PROJECT_VALUES[data.project]) setSelectByLabel('Project', PROJECT_VALUES[data.project]);
            setSelectByOptionText('Project', data.project);
        }
        setInputByLabel('Player ID', data.playerId);
        setInputByName('customfield_12600', data.playerId);
        const paymentId = data.token || data.order;
        if (paymentId) {
            setInputByLabel('Payment ID', paymentId);
            setInputByLabel('Payment Id', paymentId);
        }
        if (data.wdStatus) {
            const st = /succes/i.test(data.wdStatus) ? 'Success' : 'Pending';
            setSelectByOptionText('Withdrawal status to return', st);
            setSelectByOptionText('Withdrawal status to return', 'Succes');
            if (st === 'Pending') setSelectByOptionText('Withdrawal status to return', 'Pending');
        }
        console.log('[Plover sheet] full', data);
    }

    function startFormFill() {
        const src = new URLSearchParams(location.search).get('source');
        if (src && src !== 'sheet') return;
        const raw = GM_getValue(DATA_KEY);
        if (!raw) return;
        let data;
        try { data = JSON.parse(raw); } catch { return; }
        if (data.stage !== 'form') return;
        if (Date.now() - data.timestamp > 15 * 60 * 1000) return;
        const fn = data.action === 'fullcancel' ? fillFullForm : fillPartialForm;
        addForceBtn('🔄 Заполнить форму', () => fn(data));
        setTimeout(() => fn(data), 1500);
        setTimeout(() => fn(data), 3000);
        setTimeout(clearTicketLink, 3500);
    }

    if (/docs\.google\.com$/i.test(location.hostname)) {
        const kill = () => {
            document.getElementById('plover-sheet-panel')?.remove();
            document.getElementById('plover-cell-hit')?.remove();
            document.getElementById('plover-sheet-hint')?.remove();
            try { window.top.document.getElementById('plover-sheet-panel')?.remove(); } catch (e) {}
        };
        kill();
        setTimeout(kill, 500);
        setTimeout(kill, 2000);
    } else if (/\.boadmin\.org$/i.test(location.hostname) && /\/Users\/Summary\//i.test(location.pathname)) {
        scrapeSheetProfile();
    } else if (location.href.includes('/create/894') || location.href.includes('/create/1170')) {
        startFormFill();
    }
})();
