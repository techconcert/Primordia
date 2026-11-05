/* testrig bot: Tribal stage. Uses the real HUD buttons (tool bar, rival rows with Gift / Perform / Raid, baby button) through DOM clicks,
 * real key taps for the rhythm minigame, and direct writes of tribe orders / selection (G.selected, u.order = {t:'gather'...}) in place of
 * mouse box-selecting and right-click orders (documented in docs/TESTRIG.md). Strategy per seed: friendly | aggressive | mixed. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = SP.testrig; if (!T || !T.active) return;
  const V3 = THREE.Vector3;

  let G = null, strat = 'friendly', modes = [], thinkT = 0, last = {}, raidT = {}, giftT = {}, perfT = {}, sessWas = false, lastDealt = 0, lastTier = 1, clickQ = [];

  function stage() { return SP.stages.tribal; }
  function alive(G) { return G.units.filter((u) => !u.dead && !u.baby); }
  function click(el, label) { if (!el) return false; T.cursor.moveTo(el); el.click(); return true; }
  function socialTools() { return ['horn', 'maracas', 'didge']; }
  function warTools() { return ['spear', 'axe', 'torch']; }
  const COST = { gather: 20, fish: 25, heal: 30, spear: 30, axe: 40, torch: 35, horn: 30, maracas: 30, didge: 50 };

  function toolBtn(id) { return G.ui && G.ui.toolBtns && G.ui.toolBtns[id] && G.ui.toolBtns[id].b; }
  /** equip `n` free adults with tool id: build the hut when missing (costs food), then select + press the tool button */
  function equipTool(id, n) {
    const have = alive(G).filter((u) => u.tool === id || (u.order && u.order.t === 'fetch' && u.order.tool === id)).length;
    if (have >= n) return false;
    if (G.t < (B._equipCd || 0)) return false;
    if (!G.toolHuts[id]) {
      if (G.food < COST[id] + 5 || G.slotsFree <= 0) return false;
      T.say('Building the ' + id + ' hut for ' + COST[id] + ' food'); T.goal('Economy: building the ' + id + ' tool hut');
      click(toolBtn(id)); return true;
    }
    const free = alive(G).filter((u) => !u.tool && !(u._apBad > G.t) && !(u.order && (u.order.t === 'fetch' || u.order.t === 'attack' || u.order.t === 'perform')));
    if (!free.length && socialTools().indexOf(id) >= 0) alive(G).filter((u) => warTools().indexOf(u.tool) >= 0 && !(u.order && u.order.t === 'attack')).forEach((u) => free.push(u));   // retire warriors into musicians
    if (!free.length) return false;
    free.sort((a, b) => (a.isChief ? 1 : 0) - (b.isChief ? 1 : 0));
    G.selected = free.slice(0, n - have);
    T.goal('Equipping ' + G.selected.length + ' tribe members with ' + id); T.say('Selecting ' + G.selected.length + ' members and equipping the ' + id);
    B._equipCd = G.t + 5; click(toolBtn(id)); return true;
  }
  function rivalRow(i) { return G.ui.rows[i]; }
  function openRival(i) { if (G.selRival !== i) { click(rivalRow(i).rw); return false; } return true; }

  function gatherOrders(G) {
    const fl = G.planet.flora;
    for (const u of alive(G)) {
      if (u.order || u.carryN > 0 && u.order) continue;
      if (u.tool && warTools().indexOf(u.tool) >= 0 && G._raidActive) continue;
      const ok = (n) => n.fruit > 0 && n.type !== 'seaweed' && n.active !== false && !(n._apBusy > G.t);
      const node = fl.nearest(G.v.pilePos, 28, ok) || fl.nearest(G.v.pilePos, 55, ok) || fl.nearest(G.v.pilePos, 100, (n) => n.fruit > 0 && n.type !== 'seaweed');
      if (node) node._apBusy = G.t + 6;   // spread the tribe over different bushes
      if (node) u.order = { t: 'gather', node: node, kind: 'fruit', ph: 'work' };
    }
  }

  /** ASSIST (flagged): a unit pinned for 8 s in a lake on its way to a rival camp (game water-avoidance deadlock, see AUTOPLAY-F02) is placed on dry land next to that camp */
  function assistWarp(u, r) {
    const b = u.body, base = r.firePos.clone().normalize(), ax = new V3(0, 1, 0).cross(base).normalize();
    for (let k = 0; k < 24; k++) {
      const d = base.clone().applyAxisAngle(ax, 0.03 + 0.006 * k).applyAxisAngle(base, k * 0.9);
      let ok = false; try { ok = !G.planet.isWater(d) && G.planet.slopeAt(d) < 0.5; } catch (e) { /* */ }
      if (!ok) continue;
      const p = G.planet.surfacePoint(d); b.pos.copy(p).addScaledVector(d, 0.6); if (b.vel) b.vel.set(0, 0, 0);
      B._warps = (B._warps || 0) + 1; if (B._warps <= 8) T.note('ASSIST: warped a pinned ' + (u.tool || 'unit') + ' next to the ' + r.name + ' camp (water deadlock, AUTOPLAY-F02)');
      return true;
    }
    return false;
  }

  const B = T.bots.tribal = {
    maxSim: 3000, stuckProg: 260,
    enter: function () {
      const r = T.rng();
      strat = r.pick(['friendly', 'aggressive', 'mixed']);
      modes = [0, 1, 2, 3, 4].map(() => strat === 'mixed' ? r.pick(['friendly', 'aggressive']) : strat);
      B._raidT0 = {}; thinkT = 2; last = {}; raidT = {}; giftT = {}; perfT = {}; sessWas = false; lastDealt = 0; lastTier = 1;
      T.note('tribal strategy: ' + strat + ' ' + modes.join(','));
    },
    resources: function () { G = stage()._G; if (!G) return null; return { food: Math.round(G.food), units: G.units.length, tier: G.tier, dealt: G.dealt, strategy: strat, allied: G.rivals.filter((r) => r.status === 'allied').length, conquered: G.rivals.filter((r) => r.status === 'conquered').length, huts: Object.keys(G.toolHuts).join(',') }; },
    probe: function () { G = stage()._G; if (!G) return null; return { x: 0, z: 0, idleOk: true, prog: G.dealt * 1000 + Math.round(G.rivals.reduce((a, r) => a + r.attitude + (r.status !== 'neutral' ? 100 : 0), 0)) + G.units.length * 5 + Math.round(G.food / 20) }; },
    assist: function () { G = stage()._G; if (!G) return; G.rivals.forEach((r) => { if (r.status === 'neutral') { r.status = 'allied'; r.attitude = 100; r.war = false; T.note('ASSIST: ' + r.name + ' marked allied'); } }); },
    unstick: function () { if (!G) return; G.units.forEach((u) => { if (!u.dead) u.order = null; }); thinkT = 0; T.note('tribal: cleared all orders'); },
    tick: function (dt) {
      G = stage()._G; if (!G || G.finished || !G.ui) { T.mark(null); return; }
      T.mark(null);
      // ---- rhythm minigame (perform): answer each falling note with its lane key
      if (G.session && G.session.game && !G.session.game.done) {
        sessWas = true;
        const root = T.q('.tr-rhythm'); T.goal('Performing for the ' + G.session.r.name + ': hitting the notes');
        if (root) {
          const PAD = parseFloat(root.style.getPropertyValue('--pad')) || 26, H = 200 - PAD;
          T.qa('.lane', root).forEach((ln, i) => {
            T.qa('.note', ln).forEach((n) => {
              if (n._p || n.classList.contains('hit') || n.classList.contains('miss') || n.style.display === 'none') return;
              const top = parseFloat(n.style.top); if (!isFinite(top)) return;
              const tdiff = (1 - top / H) * 1.8;
              if (tdiff <= dt * 0.55) { n._p = true; T.tap('Digit' + (i + 1)); }
            });
          });
        }
        return;
      }
      if (sessWas) { sessWas = false; T.goalDone('performance finished'); }
      if (G.dealt !== lastDealt) { lastDealt = G.dealt; T.goalDone('tribe dealt with: ' + G.dealt + '/5'); }
      if (G.tier !== lastTier) { lastTier = G.tier; T.goalDone('hut upgraded to tier ' + G.tier); }
      // per-unit deadlock breaker: a unit that keeps a fetch/gift/deposit order without moving for 8 s gets its order cleared
      for (const u of G.units) {
        if (u.dead || !u.order || (u.order.t !== 'fetch' && u.order.t !== 'deposit' && u.order.t !== 'gift' && u.order.t !== 'perform' && u.order.t !== 'attack')) { u._apT = 0; continue; }
        if ((u.order.t === 'perform' && u.order.ready) || (u.order.t === 'attack' && !u.order.bld)) { u._apT = 0; continue; }
        const p = u.body.pos;
        if (u.goal && p.distanceTo(u.goal) < (u.arrive || 2.8) + 1.5) { u._apT = 0; u._apP = p.clone(); continue; }   // arrived and working (striking a building, waiting at the hut): not a jam
        if (u._apP && u._apP.distanceTo(p) < 0.4) { u._apT = (u._apT || 0) + dt; if (u._apT > 8) {
          const ord = u.order, rv = ord.rival || (ord.bld && ord.bld.rival);
          if (rv && (ord.t === 'perform' || ord.t === 'attack')) { assistWarp(u, rv); u._apT = 0; continue; }
          u._apT = 0; u.order = null; u._apBad = G.t + 90; B._unjam = (B._unjam || 0) + 1; if (B._unjam <= 6) T.note('tribal: unit pinned for 8s (' + u.tool + ' fetch/deposit) -> order cleared [game pathing issue]'); } }
        else { u._apT = 0; u._apP = p.clone(); }
      }
      thinkT -= dt; if (thinkT > 0) return; thinkT = 0.9;
      for (const k in giftT) giftT[k] -= 0.9; for (const k in raidT) raidT[k] -= 0.9; for (const k in perfT) perfT[k] -= 0.9;
      if (SP.game.editorOpen || SP.ui.modalCount() > 0) return;
      const rng = T.rng();
      G._raidActive = G.units.some((u) => u.order && u.order.t === 'attack' && u.order.bld);

      // 1. economy: baby / gather canes / orders
      const adults = alive(G), food = G.food, cap = G.cap;
      gatherOrders(G);
      if (!G.toolHuts.gather && food >= 25) { if (equipTool('gather', 3)) return; }
      if (G.toolHuts.gather && adults.filter((u) => u.tool === 'gather').length < 3) { if (equipTool('gather', 3)) return; }
      if (G.units.length < cap && food >= (G.units.length < 4 ? 28 : 55)) { T.goal('Tribe has room (' + G.units.length + '/' + cap + ') and food ' + Math.round(food) + ' -> raising a baby'); T.say('Pressing the Baby button (25 food)'); click(G.ui.btnBaby); return; }

      // 2. rivals
      const pend = G.rivals.filter((r) => r.status === 'neutral');
      if (!pend.length) { T.goal('All rivals dealt with, waiting for the stage to complete'); return; }
      // choose the rival to work on: the lowest index not yet dealt with (later rivals are tougher)
      const r = pend[0], i = r.i, mode = modes[i];
      if (mode === 'friendly') {
        const wanted = r.wanted;
        // musicians first: want the tool the rival loves (bonus), otherwise any social instrument
        const musicians = adults.filter((u) => socialTools().indexOf(u.tool) >= 0);
        const haveWanted = adults.some((u) => u.tool === wanted);
        if (musicians.length < 2 || (!haveWanted && food > COST[wanted] + 30 && (G.toolHuts[wanted] || G.slotsFree > 0))) {
          const id = !haveWanted && (G.toolHuts[wanted] || G.slotsFree > 0) ? wanted : socialTools().find((t) => G.toolHuts[t]) || wanted;
          if (equipTool(id, Math.max(1, adults.filter((u) => u.tool === id).length + 1))) return;
        }
        const performing = G.units.some((u) => u.order && u.order.t === 'perform' && u.order.rival === r);
        if (!performing && (!r.gifted || (r.performed && r.attitude < 100 && r.perfT > 0))) {
          if (giftT[i] === undefined || giftT[i] <= 0) {
            if (food >= 20 + 15) {
              T.goal('Friendly plan: sending a gift to the ' + r.name + ' (attitude ' + Math.round(r.attitude) + ')'); T.mark(r.firePos, r.name, G.v.pos);
              if (!openRival(i)) return; click(rivalRow(i).bGift); giftT[i] = 22; return;
            }
          }
        }
        if (musicians.length >= 1 && (perfT[i] === undefined || perfT[i] <= 0) && r.perfT <= 0) {
          T.goal('Friendly plan: musicians go perform for the ' + r.name + ' (they love ' + wanted + ')'); T.mark(r.firePos, r.name, G.v.pos);
          if (!openRival(i)) return; click(rivalRow(i).bPerf); perfT[i] = 30; return;
        }
        // stall watchdog: same attitude for 240 s -> clear every timer and order, then try again
        if (!B._st || B._st.i !== i || Math.abs(B._st.att - r.attitude) > 1) B._st = { i: i, att: r.attitude, t: G.t };
        else if (G.t - B._st.t > 240) { B._st.t = G.t; giftT[i] = 0; perfT[i] = 0; G.units.forEach((u) => { if (!u.dead && u.order && u.order.t !== 'gather') u.order = null; }); T.note('tribal: no progress with ' + r.name + ' for 240s (gifted=' + !!r.gifted + ' performed=' + !!r.performed + ' musicians=' + musicians.length + ' huts=' + Object.keys(G.toolHuts) + ' slots=' + G.slotsFree + ') -> resetting orders'); }
        T.goal('Gathering food while waiting (' + Math.round(food) + ' food, ' + r.name + ' attitude ' + Math.round(r.attitude) + ', gifted ' + !!r.gifted + ', performed ' + !!r.performed + ', musicians ' + musicians.length + ')');
      } else {
        // aggressive: war gear then raid (if the raid drags on for 7 sim-minutes, change tactics for this rival)
        if (!B._raidT0) B._raidT0 = {};
        if (B._raidT0[i] === undefined && G.units.some((u) => u.order && u.order.t === 'attack' && u.order.bld && u.order.bld.rival === r)) B._raidT0[i] = G.t;
        const canMusic = socialTools().some((t) => G.toolHuts[t]) || G.slotsFree > 0;
        if (B._raidT0[i] !== undefined && G.t - B._raidT0[i] > 420 && canMusic) { modes[i] = 'friendly'; T.note('tribal: raid on ' + r.name + ' dragged on for 420s -> switching to gifts + music'); G.units.forEach((u) => { if (u.order && u.order.t === 'attack' && u.order.bld) u.order = null; }); return; }
        // recovery: a depleted tribe (< 4 adults for 4 sim-minutes) stops raiding and goes for gifts + music instead
        if (adults.length < 4) { if (B._lowT === undefined) B._lowT = G.t; } else B._lowT = undefined;
        if (B._lowT !== undefined && G.t - B._lowT > 240 && canMusic) { modes[i] = 'friendly'; B._lowT = undefined; T.note('tribal: only ' + adults.length + ' adults left -> switching ' + r.name + ' to gifts + music'); G.units.forEach((u) => { if (u.order && u.order.t === 'attack' && u.order.bld) u.order = null; }); return; }
        const want = Math.min(9, Math.max(3, Math.floor(adults.length * 0.7)));
        const warriors = () => adults.filter((u) => warTools().indexOf(u.tool) >= 0);
        const order = ['spear', 'axe', 'torch'];
        for (const id of order) {
          const have = adults.filter((u) => u.tool === id).length;
          if (warriors().length < want && have < Math.ceil(want / 2) && (G.toolHuts[id] || G.slotsFree > 0) && food >= (G.toolHuts[id] ? 0 : COST[id] + 5)) { if (equipTool(id, have + 1)) return; }
        }
        if (warriors().length >= Math.min(want, 4) && (raidT[i] === undefined || raidT[i] <= 0)) {
          const going = G.units.filter((u) => u.order && u.order.t === 'attack' && u.order.bld && u.order.bld.rival === r).length;
          if (going < 2) {
            G.selected = warriors();
            T.goal('Aggressive plan: raiding the ' + r.name + ' with ' + G.selected.length + ' warriors'); T.mark(r.pos, r.name + ' (raid)', G.v.pos);
            if (!openRival(i)) return; click(rivalRow(i).bRaid); raidT[i] = 15; return;
          }
        }
        T.goal('Aggressive plan: preparing warriors (' + warriors().length + '/' + want + ') / raid in progress on ' + r.name);
        if (r.war) { T.mark(r.pos, r.name, G.v.pos); }
      }
    }
  };
})();
