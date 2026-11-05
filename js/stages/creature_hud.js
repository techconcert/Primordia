/* SP.crHud -- HUD for the Creature stage (DESIGN §6): health, hunger, DNA, brain bar, ability bar, target panel,
 * pack portraits, minimap, day clock, event pill, context hint, evolve button. Pure DOM (SP.ui helpers + injected CSS). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const el = (t, c, h) => SP.ui.el(t, c, h);

  const CSS = `
.cr-tl{max-width:min(300px,52vw)} .cr-tl .bar{min-width:0;width:100%}
.cr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cr-mode{display:inline-flex;align-items:center;gap:6px;padding:3px 12px;background:var(--panel);border:3px solid var(--ink);border-radius:999px;box-shadow:0 3px 0 var(--ink);font-size:14px;font-weight:700;cursor:pointer;pointer-events:auto}
.cr-mode.social{background:#be185d} .cr-mode.combat{background:#9f1239} .cr-mode:hover{filter:brightness(1.12)}
.cr-brain{padding:6px 10px 8px;display:flex;flex-direction:column;gap:3px;width:100%}
.cr-brain-h{display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#e9d5ff;letter-spacing:.04em;text-transform:uppercase}
.cr-brain-segs{display:flex;gap:4px}
.cr-seg{position:relative;flex:1;height:16px;background:#1e293b;border:3px solid var(--ink);border-radius:8px;overflow:hidden}
.cr-seg i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(180deg,#e9d5ff,#a855f7 60%);transition:width .3s cubic-bezier(.2,.9,.3,1.2)}
.cr-seg.full i{background:linear-gradient(180deg,#fef9c3,#facc15 60%)}
.cr-brain.ready .cr-seg{animation:crGlow .8s ease-in-out infinite alternate}
@keyframes crGlow{to{border-color:#facc15;box-shadow:0 0 10px #facc15}}
.cr-clock{display:flex;align-items:center;gap:8px;padding:3px 12px;font-size:16px;font-weight:700}
.cr-clock b{font-variant-numeric:tabular-nums;color:#fde68a}
.cr-event{max-width:230px;padding:6px 12px;font-size:14px;font-weight:700;text-align:center;display:none;border-color:#f97316}
.cr-event.on{display:block;animation:popIn .35s cubic-bezier(.2,1.5,.4,1)} .cr-event .t{color:#fdba74;font-variant-numeric:tabular-nums}
.cr-target{position:absolute;top:var(--gutter);left:50%;transform:translateX(-50%);padding:6px 12px 8px;min-width:250px;max-width:min(380px,56vw);display:none;flex-direction:column;gap:4px;pointer-events:auto}
.cr-target.on{display:flex;animation:popIn .25s cubic-bezier(.2,1.5,.4,1)}
.cr-t-name{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:800}
.cr-t-dot{width:16px;height:16px;border-radius:50%;border:3px solid var(--ink);flex:none}
.cr-chip{font-size:11px;padding:1px 8px;border:2px solid var(--ink);border-radius:999px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:#475569}
.cr-chip.allied,.cr-chip.kin{background:#16a34a}.cr-chip.hostile{background:#e11d48}.cr-chip.neutral{background:#b45309}.cr-chip.extinct{background:#334155}.cr-chip.temp{background:#334155}
.cr-t-bars{display:flex;flex-direction:column;gap:3px}
.cr-t-bars .bar{min-width:0} .cr-t-bars .bar-track{height:13px;border-width:2.5px} .cr-t-bars .bar-text{font-size:9px}
.cr-t-btns{display:flex;gap:6px;margin-top:2px}
.cr-pack{display:flex;gap:8px;align-items:flex-end}
.cr-pm{position:relative;width:48px;height:48px;border-radius:50%;border:3.5px solid var(--ink);box-shadow:0 4px 0 var(--ink);display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;pointer-events:auto}
.cr-pm:hover{filter:brightness(1.15)} .cr-pm .hp{position:absolute;left:4px;right:4px;bottom:-9px;height:7px;background:#1e293b;border:2px solid var(--ink);border-radius:5px;overflow:hidden}
.cr-pm .hp i{display:block;height:100%;background:#4ade80}
.cr-pm.empty{background:rgba(18,24,38,.55);border-style:dashed;border-color:#64748b;box-shadow:none;font-size:16px;color:#94a3b8;cursor:default}
.cr-bc{gap:10px}
.cr-abil{display:flex;gap:16px;align-items:flex-end}
.cr-grp{position:relative;transition:opacity .2s,transform .2s}
.cr-grp.dim{opacity:.55;transform:scale(.92)}
.cr-grp-l{position:absolute;left:0;right:0;bottom:-17px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.08em;color:#cbd5e1;text-transform:uppercase;text-shadow:-1px -1px 0 var(--ink),1px 1px 0 var(--ink),1px -1px 0 var(--ink),-1px 1px 0 var(--ink)}
.cr-grp .ability.locked{filter:grayscale(1) brightness(.6)} .cr-grp .ability.locked .ability-icon{opacity:.6}
.cr-hint{padding:5px 16px;font-size:16px;font-weight:700;display:none;pointer-events:none}
.cr-hint.on{display:block;animation:popIn .2s ease}
.cr-evolve{display:none}.cr-evolve.on{display:inline-flex;animation:crPulse .9s ease-in-out infinite alternate}
@keyframes crPulse{to{transform:scale(1.07)}}
.cr-over{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.cr-vignette{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 120px 30px rgba(225,29,72,0);transition:box-shadow .25s}
.cr-vignette.hit{box-shadow:inset 0 0 120px 30px rgba(225,29,72,.55);transition:none}
.cr-dead{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(80,5,20,.55);pointer-events:none}
.cr-dead.on{display:flex;animation:fadeIn .4s}
.cr-dead .big{font-size:clamp(34px,8vw,70px);font-weight:800;color:#fda4af}
.cr-bubble{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
.cr-bubble .row{display:flex;gap:6px;padding:6px 10px;background:#fff;border:3.5px solid var(--ink);border-radius:20px;box-shadow:0 4px 0 var(--ink)}
.cr-bubble .tail{width:0;height:0;border:9px solid transparent;border-top-color:var(--ink);margin-top:-6px;position:relative}
.cr-bubble.pink .row{background:#fbcfe8}
.cr-slot{position:relative;width:42px;height:42px;border-radius:50%;background:#f1f5f9;border:3px solid var(--ink);display:flex;align-items:center;justify-content:center;font-size:24px;opacity:.45;transition:transform .15s}
.cr-slot.now{opacity:1;transform:scale(1.25);background:#fde047;animation:crBounce .35s ease infinite alternate}
.cr-slot.done{opacity:1;background:#bbf7d0}.cr-slot.miss{opacity:1;background:#fecaca}
.cr-slot.q{background:#e2e8f0}
.cr-slot .res{position:absolute;right:-8px;top:-10px;font-size:18px}
@keyframes crBounce{to{transform:scale(1.4) translateY(-4px)}}
.cr-beat{position:relative;width:min(460px,86vw);height:62px;overflow:hidden;display:none;pointer-events:none;padding:0}
.cr-beat.on{display:block;animation:popIn .25s}
.cr-beat .lane{position:absolute;left:12px;right:12px;top:30px;height:6px;background:#334155;border-radius:3px}
.cr-beat .hit{position:absolute;left:62px;top:9px;width:44px;height:44px;border:4px solid #fde047;border-radius:50%;box-shadow:0 0 12px #fde047;margin-left:0}
.cr-beat .hit.flash{animation:crFlash .25s}
@keyframes crFlash{50%{transform:scale(1.35);background:rgba(253,224,71,.5)}}
.cr-note{position:absolute;top:11px;width:40px;height:40px;margin-left:-20px;border-radius:50%;background:#f9a8d4;border:3px solid var(--ink);display:flex;align-items:center;justify-content:center;font-size:22px}
.cr-note.hit{background:#86efac}.cr-note.miss{background:#fca5a5;opacity:.6}
.cr-beat .msg{position:absolute;right:16px;top:3px;font-size:13px;font-weight:800;color:#fbcfe8;letter-spacing:.06em;text-transform:uppercase;text-shadow:-1px -1px 0 var(--ink),1px 1px 0 var(--ink)}
.cr-say{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-size:clamp(26px,5vw,46px);font-weight:800;color:#fff;pointer-events:none;animation:crSay 1s cubic-bezier(.2,1.4,.4,1) forwards;white-space:nowrap}
@keyframes crSay{0%{opacity:0;transform:translate(-50%,-30%) scale(.4)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-90%) scale(1)}}
.cr-heart{position:absolute;font-size:26px;pointer-events:none;animation:crHeart 1.4s ease-out forwards;transform:translate(-50%,-50%)}
@keyframes crHeart{0%{opacity:0;transform:translate(-50%,-30%) scale(.4)}15%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),-260%) scale(1.2)}}
@media (max-width:720px){.cr-target{min-width:200px;top:auto;bottom:150px}.cr-tl{max-width:55vw}.cr-abil{gap:6px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 2*var(--gutter) - 4px)}.cr-grp{display:flex;gap:5px}.cr-grp-l{display:none}.cr-pm{width:40px;height:40px;font-size:20px}.cr-abil .ability{width:42px;height:42px;border-radius:11px}.cr-abil .ability-icon{font-size:20px}.cr-bc{max-width:100vw}#corner{inset:auto var(--gutter) 46% auto;flex-direction:column}}
`;

  function create(S) {
    const ui = SP.ui;
    const style = el('style'); style.id = 'cr-style'; style.textContent = CSS; document.head.appendChild(style);
    const hudRoot = ui.hud();
    const H = { dom: {}, last: {} };
    const add = (node) => { hudRoot.appendChild(node); return node; };

    // ---- top-left stats
    const tl = add(el('div', 'hud-corner hud-tl cr-tl'));
    H.hp = ui.bar({ icon: '❤️', color: 'rose', label: 'Health', max: 100, value: 100 });
    H.hunger = ui.bar({ icon: '🍖', color: 'orange', label: 'Hunger', max: 100, value: 100 });
    H.dna = ui.counter({ icon: '🧬', color: 'purple' });
    const row = el('div', 'cr-row'); row.appendChild(H.dna.el);
    H.mode = el('div', 'cr-mode combat', '<span>⚔️</span><b>Combat</b> <kbd class="kbd">F</kbd>');
    H.mode.title = 'Toggle social / combat mode'; H.mode.addEventListener('click', () => { SP.audio && SP.audio.sfx('click'); S.toggleMode(); });
    row.appendChild(H.mode);
    const brain = el('div', 'panel cr-brain');
    H.brainLabel = el('div', 'cr-brain-h', '<span>🧠 Brain <b id="cr-bl">1</b></span><span id="cr-bx">0 / 500</span>');
    const segs = el('div', 'cr-brain-segs'); H.segs = [];
    for (let i = 0; i < 5; i++) { const s = el('div', 'cr-seg', '<i></i>'); segs.appendChild(s); H.segs.push(s); }
    brain.appendChild(H.brainLabel); brain.appendChild(segs); H.brain = brain;
    tl.appendChild(H.hp.el); tl.appendChild(H.hunger.el); tl.appendChild(row); tl.appendChild(brain);

    // ---- top-right minimap, clock, event pill
    const tr = add(el('div', 'hud-corner hud-tr'));
    H.mini = ui.minimap({ size: 156 });
    tr.appendChild(H.mini.el);
    H.clock = el('div', 'panel cr-clock', '<span class="ic">☀️</span><b>12:00</b>'); tr.appendChild(H.clock);
    H.event = el('div', 'panel cr-event', ''); tr.appendChild(H.event);

    // ---- target panel
    const tp = add(el('div', 'panel cr-target'));
    tp.innerHTML = '<div class="cr-t-name"><span class="cr-t-dot"></span><span class="nm"></span><span class="chips"></span></div><div class="cr-t-bars"></div><div class="cr-t-btns"></div>';
    H.tp = tp; H.tpName = tp.querySelector('.nm'); H.tpDot = tp.querySelector('.cr-t-dot'); H.tpChips = tp.querySelector('.chips');
    H.tpHp = ui.bar({ icon: '', color: 'rose', max: 100, value: 100 }); H.tpInt = ui.bar({ icon: '💗', color: 'pink', max: 100, value: 0 });
    tp.querySelector('.cr-t-bars').appendChild(H.tpHp.el); tp.querySelector('.cr-t-bars').appendChild(H.tpInt.el);
    const btns = tp.querySelector('.cr-t-btns');
    H.btnSocial = ui.button('Socialize', { icon: '🎵', color: 'rose', small: true, key: 'F', onClick: () => S.setMode('social') });
    H.btnCombat = ui.button('Fight', { icon: '⚔️', color: 'amber', small: true, onClick: () => S.setMode('combat') });
    H.btnJoin = ui.button('Join pack', { icon: '🐾', color: 'green', small: true, key: 'G', onClick: () => S.recruitTarget() });
    btns.appendChild(H.btnSocial); btns.appendChild(H.btnJoin);

    // ---- bottom left pack
    const bl = add(el('div', 'hud-corner hud-bl'));
    H.pack = el('div', 'cr-pack'); bl.appendChild(H.pack);

    // ---- bottom centre: beat bar, hint, abilities, evolve
    const bc = add(el('div', 'hud-corner hud-bc cr-bc'));
    H.evolve = ui.button('Evolve to Tribal Stage!', { icon: '🌟', color: 'amber', onClick: () => S.evolve() });
    H.evolve.classList.add('btn-lg', 'cr-evolve');
    H.hint = el('div', 'panel cr-hint', '');
    H.beat = el('div', 'panel cr-beat', '<div class="lane"></div><div class="hit"></div><div class="msg"></div><div class="notes"></div>');
    bc.appendChild(H.evolve); bc.appendChild(H.hint); bc.appendChild(H.beat);
    const AB = SP.crHud.ABILITIES, lv = S.abilityLevels();
    const mk = (ids) => ids.map((id) => ({ id, icon: AB[id].icon, key: AB[id].key, level: lv[id], cooldown: AB[id].cd, name: AB[id].name + ' - ' + AB[id].desc, onClick: () => S.useAbility(id) }));
    H.barC = ui.abilityBar(mk(['bite', 'charge', 'strike', 'spit']));
    H.barS = ui.abilityBar(mk(['sing', 'dance', 'charm', 'pose']));
    const arch = S.archetype;
    H.barQ = ui.abilityBar([{ id: 'arch', icon: arch.icon, key: 'Q', level: 0, cooldown: arch.cd, name: arch.name + ' - ' + arch.desc, onClick: () => S.useArchetype() }]);
    H.grpC = el('div', 'cr-grp'); H.grpC.appendChild(H.barC.el); H.grpC.appendChild(el('div', 'cr-grp-l', 'Combat'));
    H.grpS = el('div', 'cr-grp dim'); H.grpS.appendChild(H.barS.el); H.grpS.appendChild(el('div', 'cr-grp-l', 'Social'));
    H.grpQ = el('div', 'cr-grp'); H.grpQ.appendChild(H.barQ.el); H.grpQ.appendChild(el('div', 'cr-grp-l', arch.name));
    const ab = el('div', 'cr-abil'); ab.appendChild(H.grpC); ab.appendChild(H.grpS); ab.appendChild(H.grpQ);
    ab.style.pointerEvents = 'none'; bc.appendChild(ab);
    H.setLocked = function (levels, baseline) {
      for (const id in H.slots) {
        const lock = (levels[id] || 0) <= 0;
        H.slots[id].classList.toggle('locked', lock);
      }
    };
    H.slots = {};
    [H.barC, H.barS].forEach((b) => { const kids = b.el.children; });
    // map ability id -> element (by order)
    ['bite', 'charge', 'strike', 'spit'].forEach((id, i) => { H.slots[id] = H.barC.el.children[i]; });
    ['sing', 'dance', 'charm', 'pose'].forEach((id, i) => { H.slots[id] = H.barS.el.children[i]; });

    // ---- full-screen overlay (bubbles, vignette, death)
    const over = add(el('div', 'cr-over nopoint'));
    H.over = over;
    H.vig = el('div', 'cr-vignette'); over.appendChild(H.vig);
    H.dead = el('div', 'cr-dead', '<div class="big stroke">You were defeated</div><div class="stroke-sm" style="font-size:22px">Hatching again at your nest...</div>');
    over.appendChild(H.dead);

    // ================================================================ updates
    const setIf = (k, v, fn) => { if (H.last[k] !== v) { H.last[k] = v; fn(v); } };

    H.refreshAbilities = function () {
      const lv = S.abilityLevels();
      H.barC.setLevels({ bite: lv.bite, charge: lv.charge, strike: lv.strike, spit: lv.spit });
      H.barS.setLevels({ sing: lv.sing, dance: lv.dance, charm: lv.charm, pose: lv.pose });
      H.setLocked(lv);
    };
    H.refreshAbilities();

    H.update = function (dt) {
      setIf('hp', Math.round(S.hp) + '/' + Math.round(S.maxHp), () => H.hp.set(S.hp, S.maxHp));
      setIf('hu', Math.round(S.hunger), () => H.hunger.set(S.hunger, 100));
      setIf('dna', Math.floor(S.C.dna), (v) => H.dna.set(v));
      setIf('brain', Math.floor(S.brainXp) + ':' + S.brainLevel, () => {
        H.brainLabel.querySelector('#cr-bl').textContent = S.brainLevel;
        H.brainLabel.querySelector('#cr-bx').textContent = Math.min(500, Math.floor(S.brainXp)) + ' / 500';
        for (let i = 0; i < 5; i++) { const f = Math.max(0, Math.min(1, (S.brainXp - i * 100) / 100)); H.segs[i].firstChild.style.width = (f * 100).toFixed(0) + '%'; H.segs[i].classList.toggle('full', f >= 1); }
        H.brain.classList.toggle('ready', S.brainXp >= 500);
      });
      setIf('mode', S.mode, (m) => { H.mode.className = 'cr-mode ' + m; H.mode.innerHTML = m === 'social' ? '<span>🎵</span><b>Social</b> <kbd class="kbd">F</kbd>' : '<span>⚔️</span><b>Combat</b> <kbd class="kbd">F</kbd>'; H.grpS.classList.toggle('dim', m !== 'social'); H.grpC.classList.toggle('dim', m === 'social'); });
      // cooldown sweeps
      const cds = S.cooldownFracs();
      for (const id in cds) { const b = (id === 'arch') ? H.barQ : (H.slots[id] && H.slots[id].parentNode === H.barC.el ? H.barC : H.barS); b.setCooldown(id, cds[id]); }
      // evolve
      setIf('evolve', S.brainXp >= 500 && !S.completed, (on) => H.evolve.classList.toggle('on', on));
      // clock
      const tod = S.sky ? S.sky.timeOfDay : 0.5;
      setIf('clock', Math.floor(tod * 24 * 4), () => {
        const hh = Math.floor(tod * 24), mm = Math.floor((tod * 24 - hh) * 60 / 15) * 15;
        const ic = S.sky && S.sky.isNight ? '🌙' : (tod < 0.3 || tod > 0.7 ? '🌅' : '☀️');
        H.clock.innerHTML = '<span class="ic">' + ic + '</span><b>' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + '</b>';
      });
      // event pill
      const ev = S.eventPill;
      if (ev && ev.t > 0) { ev.t -= dt; H.event.classList.add('on'); H.event.innerHTML = ev.icon + ' ' + ev.text + (ev.countdown ? ' <span class="t">' + Math.max(0, Math.ceil(ev.t)) + 's</span>' : ''); if (ev.t <= 0) { H.event.classList.remove('on'); S.eventPill = null; } }
      H.updateTarget();
      H.updatePack();
    };

    // ---- target panel
    const RELATION = { neutral: 'Wild', allied: 'Ally', hostile: 'Angry', extinct: 'Extinct' };
    const TEMPER = { skittish: '😨 Skittish', passive: '😌 Calm', territorial: '😠 Territorial', aggressive: '💢 Aggressive' };
    H.updateTarget = function () {
      const a = S.target;
      if (!a || a.state === 'dead') { setIf('tgt', null, () => H.tp.classList.remove('on')); return; }
      const sp = a.species;
      const rel = sp.isPlayer ? 'kin' : sp.relation;
      const key = a.id + ':' + rel + ':' + (a.impressed ? 1 : 0) + ':' + S.mode + ':' + (a.packOf ? 1 : 0) + ':' + S.packFree();
      setIf('tgt', key, () => {
        H.tp.classList.add('on');
        H.tpName.textContent = sp.name + (a.isEpic ? ' (Epic)' : a.isRogue ? ' (Rogue)' : '');
        H.tpDot.style.background = '#' + ('000000' + (sp.color || 0xffffff).toString(16)).slice(-6);
        const imp = a.impressed ? ' <span class="cr-chip allied">Friend</span>' : '';
        H.tpChips.innerHTML = (a.isAlpha ? '<span class="cr-chip" style="background:#ca8a04">👑 Alpha</span> ' : '') +
          '<span class="cr-chip ' + rel + '">' + (rel === 'kin' ? 'Kin' : RELATION[rel] || rel) + '</span> <span class="cr-chip temp">' + sp.sizeTier + '</span>' + imp +
          (sp.isPlayer ? '' : ' <span class="cr-chip temp" title="Liked gestures">' + sp.likes.map((l) => SP.crHud.ABILITIES[l].icon).join('') + '</span>');
        H.btnSocial.style.display = (sp.isPlayer || a.impressed) ? 'none' : '';
        H.btnCombat.style.display = 'none';
        const canJoin = (sp.isPlayer || sp.relation === 'allied') && !a.packOf;
        H.btnJoin.style.display = canJoin ? '' : 'none';
        H.btnJoin.disabled = S.packFree() <= 0; H.btnJoin.title = S.packFree() <= 0 ? 'No free pack slot (grow your brain)' : 'Recruit into your pack';
        H.tpInt.el.style.display = (sp.isPlayer) ? 'none' : '';
      });
      H.tpHp.set(a.hp, a.maxHp);
      if (!sp.isPlayer) H.tpInt.set(a.interest, 100);
    };

    // ---- pack
    H.updatePack = function () {
      const key = S.pack.map((a) => a.id + ':' + Math.round(a.hp / a.maxHp * 10)).join(',') + '|' + S.packSlots();
      setIf('pack', key, () => {
        H.pack.innerHTML = '';
        S.pack.forEach((a) => {
          const m = el('div', 'cr-pm', '<span>' + (a.species.isPlayer ? '🧬' : '🐾') + '</span><div class="hp"><i style="width:' + Math.max(0, a.hp / a.maxHp * 100).toFixed(0) + '%"></i></div>');
          m.style.background = '#' + ('000000' + (a.species.color || 0x22c55e).toString(16)).slice(-6);
          m.title = a.species.name + ' - click to dismiss';
          m.addEventListener('click', () => S.dismiss(a));
          H.pack.appendChild(m);
        });
        const free = S.packSlots() - S.pack.length;
        for (let i = 0; i < free; i++) { const m = el('div', 'cr-pm empty', '+'); m.title = 'Free pack slot: recruit an ally or a nest-mate (G)'; H.pack.appendChild(m); }
      });
    };

    // ---- hint
    H.setHint = function (html) {
      setIf('hint', html || '', (h) => { H.hint.innerHTML = h; H.hint.classList.toggle('on', !!h); });
    };
    H.hit = function () { H.vig.classList.add('hit'); setTimeout(() => H.vig.classList.remove('hit'), 90); };
    H.showDead = function (on, title) { const big = H.dead.querySelector('.big'); if (big) big.textContent = title || 'You were defeated'; H.dead.classList.toggle('on', on); };
    H.say = function (text, color) { const d = el('div', 'cr-say stroke', text); if (color) d.style.color = color; over.appendChild(d); setTimeout(() => d.remove(), 1000); };
    H.heart = function (x, y, ch) { const d = el('div', 'cr-heart', ch || '💗'); d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.setProperty('--dx', ((Math.random() - 0.5) * 80) + 'px'); over.appendChild(d); setTimeout(() => d.remove(), 1400); };

    // ================================================================ minimap
    const RANGE = 72, GRID = 30;
    const terr = document.createElement('canvas'); terr.width = terr.height = GRID; const tctx = terr.getContext('2d');
    const BIOME_COL = { ocean: '#0e7490', beach: '#fcd34d', grass: '#65a30d', forest: '#15803d', desert: '#f59e0b', tundra: '#cbd5e1', swamp: '#4d7c0f', rock: '#64748b', snow: '#f1f5f9' };
    let terrT = 99, terrPos = new V3(1e9, 0, 0), terrYaw = new V3();
    const _r = new V3(), _f = new V3(), _w = new V3(), _d = new V3();
    function refreshTerrain() {
      const P = S.body.pos, up = S.body.up, f = S.cam.forwardOnSurface();
      _r.crossVectors(f, up).normalize();
      const img = tctx.createImageData(GRID, GRID), R = S.planet.radius;
      for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
        const x = ((i + 0.5) / GRID * 2 - 1) * RANGE, y = (1 - (j + 0.5) / GRID * 2) * RANGE;
        _w.copy(P).addScaledVector(_r, x).addScaledVector(f, y).normalize();
        let col;
        const rr = S.planet.surfaceRadius(_w);
        if (rr < S.planet.seaRadius) { const d = S.planet.seaRadius - rr; col = d > 2.5 ? '#0e7490' : '#22d3ee'; }
        else col = BIOME_COL[S.planet.biomeAt(_w)] || '#65a30d';
        const n = parseInt(col.slice(1), 16), o = (j * GRID + i) * 4;
        img.data[o] = (n >> 16) & 255; img.data[o + 1] = (n >> 8) & 255; img.data[o + 2] = n & 255; img.data[o + 3] = 255;
      }
      tctx.putImageData(img, 0, 0);
      terrPos.copy(P); terrYaw.copy(f);
    }
    function toMap(pos, size) {
      // arc-length projection onto the camera-aligned tangent plane
      const P = S.body.pos, up = S.body.up;
      _d.copy(pos).sub(P); _d.addScaledVector(up, -_d.dot(up));
      const l = _d.length(); if (l < 1e-4) return { x: size / 2, y: size / 2, d: 0, edge: false };
      const ang = Math.acos(Math.max(-1, Math.min(1, P.clone().normalize().dot(pos.clone().normalize()))));
      const arc = ang * S.planet.radius;
      _d.multiplyScalar(arc / l);
      const f = S._camFwd, r = S._camRight;
      let x = _d.dot(r), y = _d.dot(f), dist = Math.hypot(x, y), edge = false;
      if (dist > RANGE * 0.93) { x *= RANGE * 0.93 / dist; y *= RANGE * 0.93 / dist; edge = true; }
      return { x: size / 2 + x / RANGE * size / 2, y: size / 2 - y / RANGE * size / 2, d: arc, edge };
    }
    H.drawMinimap = function (dt) {
      terrT += dt;
      const f = S.cam.forwardOnSurface();
      S._camFwd = f; S._camRight = _r.crossVectors(f, S.body.up).normalize().clone();
      if (terrT > 0.6 || S.body.pos.distanceToSquared(terrPos) > 16 || f.dot(terrYaw) < 0.97) { terrT = 0; refreshTerrain(); }
      const eco = S.eco, T = S.T;
      H.mini.draw((g, w, h) => {
        g.imageSmoothingEnabled = true;
        g.drawImage(terr, 0, 0, w, h);
        g.fillStyle = 'rgba(8,12,20,0.18)'; g.fillRect(0, 0, w, h);
        // fruit boom area
        if (S.boomArea && S.boomArea.t > 0) { const m = toMap(S.boomArea.pos, w); g.strokeStyle = 'rgba(250,204,21,.9)'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(m.x, m.y, 65 / RANGE * w / 2, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
        // nests
        for (const n of eco.nests) {
          const sp = eco.speciesById(n.speciesId); if (!sp || sp.relation === 'extinct' || !sp.arrived) continue;
          if (!n.isPlayer && n.pos.distanceTo(S.body.pos) > 150 && S.brainLevel < 3) continue;
          const m = toMap(n.pos, w);
          if (n.isPlayer) {
            g.fillStyle = '#facc15'; g.strokeStyle = '#080c14'; g.lineWidth = 2.5;
            g.beginPath(); g.moveTo(m.x, m.y - 7); g.lineTo(m.x + 7, m.y); g.lineTo(m.x + 5, m.y + 6); g.lineTo(m.x - 5, m.y + 6); g.lineTo(m.x - 7, m.y); g.closePath(); g.fill(); g.stroke();
            if (S.raidFlash > 0 && Math.floor(T * 5) % 2) { g.strokeStyle = '#ef4444'; g.beginPath(); g.arc(m.x, m.y, 11, 0, 7); g.stroke(); }
          } else {
            g.fillStyle = '#' + ('000000' + sp.color.toString(16)).slice(-6); g.strokeStyle = sp.relation === 'allied' ? '#4ade80' : '#080c14'; g.lineWidth = sp.relation === 'allied' ? 2.5 : 1.8;
            g.beginPath(); g.arc(m.x, m.y, 4.2, 0, 7); g.fill(); g.stroke();
          }
        }
        // bone piles (revealed by brain level)
        for (const bp of S.revealedPiles()) {
          const m = toMap(bp.pos, w);
          g.fillStyle = bp.found ? 'rgba(148,163,184,.8)' : '#fffbeb'; g.strokeStyle = '#080c14'; g.lineWidth = 1.6;
          g.save(); g.translate(m.x, m.y); g.rotate(0.6); g.fillRect(-5, -2, 10, 4); g.strokeRect(-5, -2, 10, 4);
          g.beginPath(); g.arc(-5, -2.5, 2.2, 0, 7); g.arc(-5, 2.5, 2.2, 0, 7); g.arc(5, -2.5, 2.2, 0, 7); g.arc(5, 2.5, 2.2, 0, 7); g.fill(); g.restore();
          if (!bp.found && bp.guardAlive) { g.fillStyle = '#ef4444'; g.font = '700 10px sans-serif'; g.fillText('!', m.x + 6, m.y - 5); }
        }
        // creatures: epics, alphas, hostile, pack
        for (const a of eco.actors) {
          if (a.state === 'dead' || a.species.isPlayer && !a.packOf) continue;
          const m = toMap(a.body.pos, w);
          if (a.packOf) { g.fillStyle = '#22d3ee'; g.strokeStyle = '#080c14'; g.lineWidth = 1.5; g.beginPath(); g.arc(m.x, m.y, 3.4, 0, 7); g.fill(); g.stroke(); continue; }
          if (m.d > RANGE * 1.2 && !a.isEpic) continue;
          if (a.isEpic) { g.fillStyle = '#ef4444'; g.strokeStyle = '#080c14'; g.lineWidth = 2; g.beginPath(); g.moveTo(m.x, m.y - 6); g.lineTo(m.x + 5.5, m.y + 4); g.lineTo(m.x - 5.5, m.y + 4); g.closePath(); g.fill(); g.stroke(); }
          else if (a.isAlpha) { g.fillStyle = '#fde047'; g.strokeStyle = '#080c14'; g.lineWidth = 1.5; g.beginPath(); g.arc(m.x, m.y, 3, 0, 7); g.fill(); g.stroke(); }
          else if (a.state === 'attack' || a.state === 'hunt') { g.fillStyle = '#fb7185'; g.fillRect(m.x - 1.5, m.y - 1.5, 3, 3); }
          else { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(m.x - 1, m.y - 1, 2, 2); }
        }
        if (S.target && S.target.state !== 'dead') { const m = toMap(S.target.body.pos, w); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(m.x, m.y, 7 + Math.sin(T * 6) * 1.2, 0, 7); g.stroke(); }
        // you: arrow pointing along heading
        const hd = S.body.heading, ang = Math.atan2(hd.dot(S._camRight), hd.dot(S._camFwd));
        g.save(); g.translate(w / 2, h / 2); g.rotate(ang); g.fillStyle = '#fff'; g.strokeStyle = '#080c14'; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
        // rim + north-ish marker
        g.strokeStyle = '#080c14'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, 7); g.stroke();
      });
    };

    H.dispose = function () {
      style.remove();
      ['over', 'tp'].forEach((k) => { if (H[k] && H[k].parentNode) H[k].remove(); });
    };
    return H;
  }

  const ABILITIES = {
    bite: { icon: '🦷', key: '1', name: 'Bite', cd: 1.2, desc: 'Quick chomp (range 2.5)' },
    charge: { icon: '🐂', key: '2', name: 'Charge', cd: 8, desc: 'Dash and stun (range 8)' },
    strike: { icon: '⚔️', key: '3', name: 'Strike', cd: 5, desc: 'Hits everything in front' },
    spit: { icon: '💦', key: '4', name: 'Spit', cd: 4, desc: 'Ranged poison (range 14)' },
    sing: { icon: '🎵', key: '5', name: 'Sing', cd: 0, desc: 'Social gesture' },
    dance: { icon: '💃', key: '6', name: 'Dance', cd: 0, desc: 'Social gesture' },
    charm: { icon: '😍', key: '7', name: 'Charm', cd: 0, desc: 'Social gesture' },
    pose: { icon: '💪', key: '8', name: 'Pose', cd: 0, desc: 'Social gesture' }
  };
  SP.crHud = { create: create, ABILITIES: ABILITIES };
})();
