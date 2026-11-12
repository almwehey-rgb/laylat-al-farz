'use strict';

const byId = id => document.getElementById(id);
const number = new Intl.NumberFormat('ar-KW', { numberingSystem: 'latn' });
const digits = value => number.format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const key = 'laylat-room-v1';
const symbols = {
  double: '×2', shield: '◇', protect: '◇', immunity: '◈', block: '⊘', cancel: '⊘',
  reverse: '↶', swap: '⇄', exchange: '⇄', joker: '♛', extraDraw: '+2', extraMove: '+1',
  burn100: '✹', burn200: '✹', burn300: '✹',
};

let session = null;
let state = null;
let chosen = null;
let cardChoices = [];
let selectedCard = null;
let stateSignature = '';
let choices = [];
let locked = false;
let pollTimer;

function storageRead(store) {
  try {
    const candidate = JSON.parse(store.getItem(key));
    return typeof candidate?.code === 'string' && typeof candidate?.token === 'string' ? candidate : null;
  } catch {
    return null;
  }
}
function persist(store, value) {
  try {
    if (value) store.setItem(key, JSON.stringify(value));
    else store.removeItem(key);
  } catch {
    // The in-memory seat remains usable when browser storage is disabled.
  }
}
function status(message = '', tone = '') {
  const connection = byId('connection');
  connection.textContent = message;
  connection.className = 'connection ' + tone;
  connection.hidden = !message;
}
function busy(value) {
  locked = value;
  document.body.setAttribute('aria-busy', String(value));
}
async function request(op, input) {
  const response = await fetch('/api/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ op, ...input }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    const error = new Error(payload.error || 'تعذّر الاتصال بالغرفة.');
    error.status = response.status;
    throw error;
  }
  return payload;
}
function showEntry() {
  clearTimeout(pollTimer);
  session = null;
  state = null;
  stateSignature = '';
  chosen = null;
  cardChoices = [];
  selectedCard = null;
  if (byId('action-dialog').open) byId('action-dialog').close();
  persist(sessionStorage, null);
  byId('room').hidden = true;
  byId('home').hidden = true;
  byId('welcome').hidden = false;
  byId('room').replaceChildren();
  const saved = storageRead(localStorage);
  const resume = byId('resume');
  resume.hidden = !saved;
  if (saved) {
    resume.innerHTML = '<button type="button" class="utility">ارجع لغرفتك <bdi>' + escape(saved.code) + '</bdi></button>';
    resume.firstElementChild.onclick = () => reconnect(saved);
  }
}
function enter(credentials, payload) {
  session = credentials;
  persist(sessionStorage, credentials);
  persist(localStorage, credentials);
  byId('welcome').hidden = true;
  byId('home').hidden = false;
  byId('room').hidden = false;
  applyState(payload);
  const url = new URL(location.href);
  if (url.searchParams.has('room')) {
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }
  schedulePoll();
}
async function reconnect(credentials) {
  if (locked) return;
  busy(true);
  status('جاري استعادة مقعدك…');
  try {
    const payload = await request('get', credentials);
    enter(credentials, payload);
    status('تمت استعادة مقعدك.', 'ok');
  } catch (error) {
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      if (storageRead(localStorage)?.token === credentials.token) persist(localStorage, null);
      showEntry();
    }
    status(error.status ? error.message : 'تعذّر الاتصال. جرّب استعادة المقعد مرة ثانية.', 'error');
  } finally {
    busy(false);
  }
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (session) pollTimer = setTimeout(poll, document.hidden ? 6000 : 1800);
}
async function poll() {
  const credentials = session;
  if (!credentials) return;
  if (locked) return schedulePoll();
  const signature = stateSignature;
  try {
    const payload = await request('get', credentials);
    if (session !== credentials || locked || signature !== stateSignature) return;
    if (byId('connection').classList.contains('error') && byId('connection').dataset.network) {
      status('تم الاتصال بالغرفة.', 'ok');
      delete byId('connection').dataset.network;
    }
    applyState(payload);
  } catch (error) {
    if (session !== credentials) return;
    status(error.status ? error.message : 'انقطع الاتصال. جاري المحاولة…', 'error');
    byId('connection').dataset.network = '1';
  } finally {
    schedulePoll();
  }
}
function applyState(payload) {
  const signature = JSON.stringify(payload.state);
  if (signature === stateSignature) return;
  state = payload.state;
  stateSignature = signature;
  render();
}
function cardText(card) {
  return card.value == null ? card.name : digits(card.value) + ' صوت';
}
function seat(player) {
  const active = player.id === state.turn;
  const status = [
    player.id === state.me ? 'أنت' : '',
    player.out ? 'خارج الدورة' : '',
    player.muted ? 'المايك مقطوع' : '',
    player.immunity ? 'حصانة ' + digits(player.immunity) : '',
    player.rest ? 'موقوف عن دوره' : '',
  ].filter(Boolean).join(' · ');
  return '<article class="seat' + (active ? ' active' : '') + '"><strong>' + escape(player.name) +
    '</strong><small>' + digits(player.handCount ?? 0) + ' كروت' + (status ? ' · ' + escape(status) : '') + '</small>' +
    (active ? '<span class="turn">' + (player.id === state.me ? 'دورك' : 'عليه الدور') + '</span>' : '') + '</article>';
}
function regionMarkup(region) {
  const votes = region.votes ?? [];
  const score = votes.reduce((sum, vote) => sum + vote, 0) * (region.double ? 2 : 1);
  const extras = [region.double ? '×2' : '', region.protected ? 'محمية' : ''].filter(Boolean).join(' · ');
  return '<article class="region' + (region.locked ? ' locked' : '') + '"><span>' + escape(region.name) +
    '</span><b>' + digits(score) + '</b>' +
    (votes.length ? '<small class="vote-values" dir="ltr">' + votes.map(digits).join(' · ') + '</small>' : '') +
    '<small>' + (region.locked ? '🔒 مقفلة' : '<bdi>' + votes.length + '/4</bdi>') +
    (extras ? ' · ' + extras : '') + '</small></article>';
}
function regionGroup(player) {
  return '<section class="region-section"><h3>' + (player.id === state.me ? 'مناطقك' : 'مناطق ' + escape(player.name)) +
    '</h3><div class="regions">' + ((player.regions ?? []).map(regionMarkup).join('') || '<p class="muted-copy">لا توجد مناطق</p>') +
    '</div></section>';
}
function choiceButton(choice) {
  return '<button type="button" class="primary" data-choice="' + choices.indexOf(choice) + '">' + escape(choice.label) + '</button>';
}
function cardMarkup(card) {
  const vote = card.value != null;
  const playable = choices.some(choice => choice.card === card.id);
  const symbol = vote ? digits(card.value) : (symbols[card.key] ?? '◆');
  return '<button type="button" class="card' + (vote ? ' vote' : '') + (playable ? '' : ' unavailable') +
    (selectedCard === String(card.id) ? ' selected' : '') + '" data-hand="' + escape(card.id) +
    '" aria-haspopup="dialog"><small>' + (vote ? 'أصوات' : 'بطاقة أمر') + '</small><b>' + symbol +
    '</b><strong>' + escape(vote ? 'أصوات' : card.name) + '</strong></button>';
}
function updateTurnTime() {
  const timer = byId('turn-time');
  if (!timer || !state?.turnAt) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - state.turnAt) / 1000));
  timer.hidden = Boolean(state.pending || state.paused || state.phase !== 'playing');
  if (!timer.hidden) timer.textContent = elapsed < 60 ? 'وقت الدور ' + digits(elapsed) + ' ثانية' : 'مرّت 60 ثانية على بداية الدور';
}
function ledgerEntries(entries) {
  if (!entries?.length) return '';
  return '<details id="ledger-entries"><summary>تفاصيل القيد</summary><ol class="results">' +
    entries.slice().reverse().map(entry => '<li><span>' + escape(entry.name) + ' · ' + escape(entry.kind) +
      '<small>الدورة ' + digits(entry.cycle) + '</small></span><strong>' + digits(entry.points) + '</strong></li>').join('') +
    '</ol></details>';
}
function scoreSection(title, rows, highlight) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const best = Math.max(...rows.map(row => row.score));
  return '<section class="results-section"><h3>' + escape(title) + '</h3><ol class="results">' +
    rows.map(row => {
      const first = highlight && row.score === best;
      return '<li' + (first ? ' class="first"' : '') + '><span>' + escape(row.name) +
        (first ? ' <span class="turn">المركز الأول</span>' : '') + '</span><strong>' + digits(row.score) + '</strong></li>';
    }).join('') + '</ol></section>';
}
function render() {
  const room = byId('room');
  const expanded = new Set([...room.querySelectorAll('details[open]')].map(item => item.id));
  choices = state.choices ?? [];
  const players = state.players ?? [];
  const isJudge = state.judge?.id === state.me;
  const me = players.find(player => player.id === state.me);
  const hand = state.hand ?? [];
  const active = players.find(player => player.id === state.turn);
  const otherChoices = choices.filter(choice => !hand.some(card => card.id === choice.card));
  const phaseLabels = {
    lobby: 'بانتظار المرشحين',
    playing: 'الدورة ' + digits(state.cycle ?? 1) + ' من ' + digits(state.cycles ?? 1),
    intermission: 'تم فرز الدورة',
    finished: 'انتهت المباراة',
  };
  const pending = state.pending?.label;
  const event = state.paused ? 'أوقف الحكم اللعب مؤقتًا.' :
    pending || state.notice || (active ? (active.id === state.me ? 'دورك الآن.' : 'دور ' + active.name) : '');
  const seating = players.map(seat).join('');
  const lobby = state.phase === 'lobby';
  const resultSections = (state.results ?? []).slice().reverse()
    .map(result => scoreSection('الدورة ' + digits(result.cycle), result.rows, false)).join('');
  const ledger = scoreSection(state.phase === 'finished' ? 'النتيجة النهائية' : 'القيد التراكمي', state.ledger, state.phase === 'finished');
  const reveal = state.inspection;
  const discard = state.discard ?? [];
  room.innerHTML = '<section class="table" aria-label="طاولة الانتخابات"><div class="room-meta">' +
    '<span class="status-chip">الغرفة</span><strong class="code-chip" dir="ltr">' + escape(session.code) + '</strong>' +
    '<span class="status-chip">' + (isJudge ? 'أنت الحكم' : 'الحكم ' + escape(state.judge?.name)) + '</span>' +
    '<button type="button" class="utility" data-invite>نسخ الدعوة</button>' +
    '<button type="button" class="utility" data-invite-qr>رمز QR</button></div>' +
    '<div class="room-meta"><strong>' + escape(phaseLabels[state.phase]) + '</strong>' +
    (lobby ? '<span class="bank">' + digits(players.length) + ' من 6 مرشحين</span>' :
      '<span class="bank">البنك ' + digits(state.deckCount ?? 0) + '</span><span class="moves">الحركات ' + digits(state.moves ?? 0) + '</span><span id="turn-time" class="status-chip"></span>') +
    '</div>' + (seating ? '<div class="seats">' + seating + '</div>' : '<p class="muted-copy">شارك الدعوة مع المرشحين.</p>') +
    (event ? '<p class="event' + (!pending && /تم|أُقر/.test(event) ? ' success' : '') + '" role="status">' + escape(event) + '</p>' : '') +
    (me && (!lobby || me.regions?.length) ? regionGroup(me) : '') +
    (!lobby && players.some(player => player.id !== me?.id) ?
      '<details id="other-regions"><summary>' + (me ? 'مناطق المرشحين الآخرين' : 'مناطق المرشحين') + '</summary>' +
      players.filter(player => player.id !== me?.id).map(regionGroup).join('') + '</details>' : '') +
    '</section>' +
    (otherChoices.length ? '<section class="hand-panel"><div class="section-title"><h2>' +
      (isJudge ? 'لوحة الحكم' : pending ? 'الرد على الحركة' : 'إجراءات الدور') +
      '</h2></div><div class="controls choice-list">' + otherChoices.map(choice => choiceButton(choice)).join('') + '</div></section>' : '') +
    (me && !lobby && state.phase !== 'finished' ? '<section class="hand-panel"><div class="section-title"><h2>كروتك</h2><span class="moves">' +
      digits(hand.length) + '</span></div>' + (hand.length ? '<div class="hand">' + hand.map(cardMarkup).join('') + '</div>' :
      '<p class="muted-copy">ما عندك كروت في اليد.</p>') + '</section>' : '') +
    (reveal ? '<section class="hand-panel revealed"><h3>يد ' + escape(reveal.name) + '</h3><div class="discards">' +
      reveal.hand.map(card => '<span>' + escape(cardText(card)) + '</span>').join('') + '</div></section>' : '') +
    (ledger || resultSections ? '<section class="hand-panel">' + ledger + resultSections + ledgerEntries(state.entries) + '</section>' : '') +
    (discard.length ? '<section class="hand-panel"><details id="discard"><summary>الساحة المكشوفة · ' + digits(discard.length) +
      '</summary><div class="discards">' + discard.slice().reverse().map(card => '<span>' + escape(cardText(card)) + '</span>').join('') +
      '</div></details></section>' : '');
  for (const id of expanded) {
    const detail = byId(id);
    if (detail) detail.open = true;
  }
  updateTurnTime();
  const stillAvailable = previous => choices.some(choice => JSON.stringify(choice) === JSON.stringify(previous));
  if ((chosen && !stillAvailable(chosen)) || cardChoices.some(choice => !stillAvailable(choice))) byId('action-dialog').close();
}
function openChoice(choice) {
  const modal = byId('action-dialog');
  chosen = choice;
  byId('action-title').textContent = choice.label;
  byId('action-error').hidden = true;
  const fields = (choice.fields ?? []).map((field, fieldIndex) => {
    if (field.multiple) {
      return '<fieldset class="field-options"><legend>' + escape(field.label) + '</legend>' +
        field.options.map((option, index) => '<label><input type="checkbox" name="' + fieldIndex + '" value="' + index + '">' +
          escape(option.label) + '</label>').join('') + '</fieldset>';
    }
    return '<label>' + escape(field.label) + '<select name="' + fieldIndex + '" required>' +
      (field.options.length === 1 ? '' : '<option value="">اختر</option>') +
      field.options.map((option, index) => '<option value="' + index + '">' + escape(option.label) + '</option>').join('') +
      '</select></label>';
  }).join('');
  byId('action-fields').innerHTML = (choice.description ? '<p class="muted-copy">' + escape(choice.description) + '</p>' : '') + fields;
  byId('apply-action').hidden = false;
  byId('cancel-action').textContent = 'إلغاء';
  if (!modal.open) modal.showModal();
}
function showCard(cardId) {
  const card = state.hand.find(card => String(card.id) === cardId);
  if (!card) return;
  selectedCard = cardId;
  for (const button of byId('room').querySelectorAll('[data-hand]')) button.classList.toggle('selected', button.dataset.hand === selectedCard);
  const available = choices.filter(choice => String(choice.card) === cardId);
  if (available.length === 1) return openChoice(available[0]);
  chosen = null;
  byId('action-title').textContent = card.name;
  byId('action-error').hidden = true;
  byId('apply-action').hidden = true;
  cardChoices = available;
  byId('action-fields').innerHTML = (card.description ? '<p class="muted-copy">' + escape(card.description) + '</p>' : '') +
    (available.length ? '<div class="controls">' + available.map((choice, index) =>
      '<button type="button" class="primary" data-card-choice="' + index + '">' + escape(choice.label) + '</button>').join('') +
      '</div>' : '<p class="muted-copy">ما تقدر تلعب هالكرت الحين.</p>');
  byId('cancel-action').textContent = 'رجوع';
  byId('action-dialog').showModal();
}
function invitationUrl() {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', session.code);
  return url.href;
}
async function invite() {
  try {
    await navigator.clipboard.writeText(invitationUrl());
    status('تم نسخ رابط الدعوة.', 'ok');
  } catch {
    status('كود الغرفة ' + session.code + ' · أرسله للمرشحين.');
  }
}
async function showInvitationQr() {
  const url = invitationUrl();
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'invite-qr-title');
  dialog.innerHTML = '<h2 id="invite-qr-title">دعوة الغرفة</h2>' +
    '<div style="display:grid;justify-items:center;gap:10px;padding:14px 16px">' +
    '<p id="invite-qr-message" class="muted-copy" role="status">جاري تجهيز الرمز…</p>' +
    '<canvas role="img" aria-label="رمز QR للانضمام إلى الغرفة" style="width:min(100%,240px);height:auto;image-rendering:pixelated" hidden></canvas>' +
    '<strong class="code-chip" dir="ltr"></strong>' +
    '<div class="controls"><button type="button" class="primary" data-copy-link>نسخ رابط الدعوة</button>' +
    '<button type="button" class="utility" data-close-qr>إغلاق</button></div></div>';
  const message = dialog.querySelector('#invite-qr-message');
  const canvas = dialog.querySelector('canvas');
  const copy = dialog.querySelector('[data-copy-link]');
  dialog.querySelector('strong').textContent = session.code;
  dialog.querySelector('[data-close-qr]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'تم نسخ الرابط';
    } catch {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = 'رابط الدعوة';
      copy.replaceWith(link);
    }
  };
  document.body.append(dialog);
  dialog.showModal();
  try {
    const { qrcodegen } = await import('./qr-code.js');
    const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
    const quietZone = 4;
    const moduleSize = 6;
    canvas.width = canvas.height = (qr.size + 2 * quietZone) * moduleSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) context.fillRect((x + quietZone) * moduleSize, (y + quietZone) * moduleSize, moduleSize, moduleSize);
      }
    }
    canvas.hidden = false;
    message.textContent = 'امسح الرمز بكاميرا الجوال للانضمام كمرشح.';
  } catch {
    message.textContent = 'تعذّر عرض الرمز. تقدر تنسخ رابط الدعوة أو تشارك كود الغرفة.';
  }
}
function roomClick(event) {
  if (locked) return;
  const choice = event.target.closest('[data-choice]');
  const cardChoice = event.target.closest('[data-card-choice]');
  const card = event.target.closest('[data-hand]');
  if (choice && choices[Number(choice.dataset.choice)]) openChoice(choices[Number(choice.dataset.choice)]);
  else if (cardChoice && cardChoices[Number(cardChoice.dataset.cardChoice)]) {
    const selection = cardChoices[Number(cardChoice.dataset.cardChoice)];
    cardChoices = [];
    openChoice(selection);
  }
  else if (card && !card.disabled) showCard(card.dataset.hand);
  else if (event.target.closest('[data-invite]')) invite();
  else if (event.target.closest('[data-invite-qr]')) showInvitationQr();
}

byId('entry').addEventListener('submit', async event => {
  event.preventDefault();
  if (locked) return;
  const fields = new FormData(event.target);
  const name = fields.get('name').trim();
  const code = fields.get('code').trim().toUpperCase();
  const op = event.submitter?.value ?? 'join';
  if (!name || (op === 'join' && !code)) {
    status('اكتب اسمك وكود الغرفة.', 'error');
    return;
  }
  busy(true);
  status('جاري الاتصال…');
  try {
    const payload = await request(op, { name, ...(op === 'join' ? { code } : {}) });
    enter({ code: payload.code, token: payload.token }, payload);
    status('تم الاتصال بالغرفة.', 'ok');
  } catch (error) {
    status(error.status ? error.message : 'تعذّر الاتصال. جرّب مرة ثانية.', 'error');
  } finally {
    busy(false);
  }
});
byId('action-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (locked || !chosen || !session) return;
  const modal = byId('action-dialog');
  const formData = new FormData(event.target);
  const { label, description, fields = [], ...action } = chosen;
  fields.forEach((field, index) => {
    const formKey = String(index);
    action[field.name] = field.multiple ?
      formData.getAll(formKey).map(value => field.options[Number(value)].value) :
      field.options[Number(formData.get(formKey))].value;
  });
  busy(true);
  byId('apply-action').disabled = true;
  try {
    const payload = await request('act', { ...session, action });
    modal.close();
    status();
    applyState(payload);
  } catch (error) {
    const feedback = byId('action-error');
    feedback.hidden = false;
    feedback.textContent = error.status ? error.message : 'تعذّر تأكيد الحركة. جرّب مرة ثانية.';
  } finally {
    busy(false);
    byId('apply-action').disabled = false;
    schedulePoll();
  }
});
byId('action-dialog').addEventListener('close', () => {
  chosen = null;
  cardChoices = [];
  selectedCard = null;
  for (const button of byId('room').querySelectorAll('.card.selected')) button.classList.remove('selected');
});
byId('cancel-action').onclick = () => byId('action-dialog').close();
byId('room').onclick = roomClick;
byId('action-fields').onclick = roomClick;
byId('home').onclick = () => { if (!locked) { status(); showEntry(); } };

const invitation = new URL(location.href).searchParams.get('room');
setInterval(updateTurnTime, 1000);
if (invitation) byId('room-code').value = invitation.toUpperCase().slice(0, 10);
const activeSeat = storageRead(sessionStorage) || storageRead(localStorage);
if (activeSeat && (!invitation || activeSeat.code === invitation.toUpperCase())) reconnect(activeSeat);
else showEntry();
