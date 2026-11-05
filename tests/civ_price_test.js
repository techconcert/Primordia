// node tests/civ_price_test.js -- Civ buy-out price floor: never zero / NaN / below MIN_PRICE, whatever the city state or trade ring.
const path = require('path');
global.window = global; global.THREE = require('../lib/three.min.js');
global.document = { addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, getContext() { return null; }, addEventListener() {} }; }, body: { appendChild() {} } };
global.addEventListener = () => {}; global.innerWidth = 1280; global.innerHeight = 720;
const L = (f) => require(path.join('..', 'js', f + '.js'));
L('core/util');
try { L('core/render'); } catch (e) { /* headless */ }
require('./_shim_world.js');
try { L('stages/civ_city'); } catch (e) { console.log('load note:', e.message); }
const CS = SP.civCity; let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(CS && CS.buyPrice && CS.MIN_PRICE > 0, 'civCity exposes buyPrice and MIN_PRICE');
const cases = [{ level: 0, turrets: [] }, { level: 5, turrets: [{}, {}] }, { level: undefined, turrets: undefined }, { level: NaN, turrets: [] }, { level: -20, turrets: [] }];
for (const c of cases) for (const tr of [undefined, 0, 50, 100, 400, -50, NaN]) {
  const city = Object.assign({ trade: tr === undefined ? {} : { you: tr } }, c), p = CS.buyPrice(city, 'you');
  ok(isFinite(p) && p >= CS.MIN_PRICE, 'price ' + p + ' for level=' + c.level + ' trade=' + tr);
}
console.log(fails ? 'FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
