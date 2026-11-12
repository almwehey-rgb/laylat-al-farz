const { randomBytes, randomInt, createHash } = require('node:crypto');
const engine = require('../lib/engine.cjs');
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const hash = token => createHash('sha256').update(token).digest('hex');
const problem = (status, message) => Object.assign(new Error(message), { status });

async function storage(operation, code, revision = null, state = null) {
  const { ROOM_DB_URL, ROOM_DB_KEY, ROOM_DB_SECRET } = process.env;
  if (!ROOM_DB_URL || !ROOM_DB_KEY || !ROOM_DB_SECRET) throw Error('Database configuration missing');
  const response = await fetch(ROOM_DB_URL + '/rest/v1/rpc/laylat_room_storage', {
    method: 'POST',
    headers: { apikey: ROOM_DB_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ secret: ROOM_DB_SECRET, operation, room_code: code, revision, payload: state }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error('Storage returned ' + response.status);
  return response.json();
}

function createHandler(store = storage) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'استخدم طلب POST.' });
    try {
      let input;
      try {
        input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch {
        throw problem(400, 'الطلب غير صالح.');
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem(400, 'الطلب غير صالح.');
      const { op, action } = input;
      if (!['create', 'join', 'get', 'act'].includes(op)) throw problem(400, 'الطلب غير صالح.');
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if ((op === 'create' || op === 'join') && (!name || name.length > 24)) throw problem(400, 'اكتب اسمًا من 1 إلى 24 حرفًا.');
      const token = op === 'create' || op === 'join' ? randomBytes(32).toString('hex') : input.token;
      if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw problem(401, 'ارجع للغرفة باستخدام جلسة دخولك.');
      const id = hash(token);
      if (op === 'create') {
        const judge = { id, name, role: 'judge' };
        const state = { phase: 'lobby', judge, players: [] };
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = Array.from({length: 6}, () => alphabet[randomInt(alphabet.length)]).join('');
          if (await store('create', code, null, state)) return res.status(201).json({ code, token, state: engine.view(state, judge) });
        }
        throw problem(503, 'تعذّر إنشاء الغرفة. جرّب مرة ثانية.');
      }
      const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
      if (code.length !== 6 || [...code].some(c => !alphabet.includes(c))) throw problem(400, 'تأكد من كود الغرفة.');
      for (let attempt = 0; attempt < 5; attempt++) {
        const record = await store('read', code);
        if (!record) throw problem(404, 'الغرفة غير موجودة أو انتهت.');
        const state = record.state;
        let actor;
        if (op === 'join') {
          if (state.phase !== 'lobby') throw problem(409, 'المباراة بدأت.');
          if (state.players.length >= 6) throw problem(409, 'الغرفة ممتلئة.');
          if ([state.judge, ...state.players].some(player => player.name === name)) throw problem(409, 'الاسم مستخدم بالغرفة.');
          actor = { id, name, role: 'player' };
          state.players.push(actor);
        } else {
          actor = [state.judge, ...state.players].find(player => player.id === id);
          if (!actor) throw problem(401, 'جلسة دخولك غير صالحة.');
          if (op === 'get') return res.status(200).json({ code, state: engine.view(state, actor) });
          if (!action || typeof action !== 'object' || Array.isArray(action)) throw problem(400, 'الحركة غير صالحة.');
          try {
            if (action.type === 'start') engine.start(state, actor, action);
            else engine.act(state, actor, action);
          } catch (error) {
            throw problem(422, error.message);
          }
        }
        if (await store('write', code, record.revision, state)) {
          return res.status(200).json({ code, ...(op === 'join' ? { token } : {}), state: engine.view(state, actor) });
        }
        const sameOffer = action && ['accept', 'intervene'].includes(action.type) && typeof action.offer === 'string';
        if (op === 'act' && !sameOffer) throw problem(409, 'تغيّرت حالة الغرفة. حدّث الطاولة وجرّب الحركة مرة ثانية.');
      }
      throw problem(409, 'الغرفة مشغولة. جرّب مرة ثانية.');
    } catch (error) {
      if (!error.status) console.error(error);
      return res.status(error.status || 503).json({ error: error.status ? error.message : 'تعذّر الاتصال بالغرفة. جرّب مرة ثانية.' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
