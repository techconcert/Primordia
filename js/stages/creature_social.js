/* SP.crSocial -- the rhythm social minigame (DESIGN §6): the target performs gestures drawn from its liked abilities, one per
 * beat; the player answers with the matching social ability (5-8) as the notes cross the hit ring. Success fills the
 * target's interest meter (eco.impress); pack members perform with you and add their levels. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const el = (t, c, h) => SP.ui.el(t, c, h);
  const BEAT = 0.85, TRAVEL = 1.7, WIN = 0.4, PERFECT = 0.13;
  const INFO = () => SP.crHud.ABILITIES;

  function create(S) {
    const Z = {
      active: false, actor: null, phase: 'idle', t: 0, seq: [], slots: [], round: 0, fails: 0, combo: 0, bubble: null, gaveUp: 0,
    };
    const hud = S.hud;
    const _p = new V3();

    // ---------------------------------------------------------------- start / stop
    Z.canTalk = function (a) {
      if (!a || a.state === 'dead') return 'Nobody to talk to';
      const sp = a.species;
      if (sp.isPlayer) return 'That is one of your own!';
      if (a.impressed) return a.species.name + ' already like you!';
      if (a.aggro > 0 || sp.relation === 'hostile') return sp.name + ' are too angry to talk!';
      if (a.state === 'attack' || a.state === 'hunt') return 'It is busy attacking!';
      if (a.guard && a.state === 'attack') return 'The guardian is not in the mood';
      return null;
    };
    Z.start = function (a) {
      if (Z.active && Z.actor === a) return true;
      const why = Z.canTalk(a);
      if (why) { SP.ui.toast(why, '💢', 1800); return false; }
      if (Z.active) Z.stop('switch');
      Z.active = true; Z.actor = a; Z.phase = 'intro'; Z.t = 0; Z.round = 0; Z.fails = 0; Z.combo = 0; Z.seq = []; Z.slots = [];
      SP.eco && S.eco.engage(a, true);
      Z.buildBubble();
      S.setAction && S.faceTarget(a);
      SP.audio && SP.audio.sfx('charm');
      hud.say('Make friends!', '#f9a8d4');
      hud.beat.classList.add('on');
      hud.beat.querySelector('.msg').textContent = a.species.name + ' wants to see:';
      return true;
    };
    Z.stop = function (reason) {
      if (!Z.active) return;
      const a = Z.actor;
      if (a && a.state !== 'dead') { S.eco.engage(a, false); if (a.anim) a.anim.action = null; }
      Z.active = false; Z.actor = null; Z.phase = 'idle';
      if (Z.bubble) { Z.bubble.remove(); Z.bubble = null; }
      hud.beat.classList.remove('on'); hud.beat.querySelector('.notes').innerHTML = '';
      if (reason === 'far') SP.ui.toast('You wandered off...', '👋', 1500);
      if (reason === 'bored') SP.ui.toast((a ? a.species.name : 'It') + ' lost interest.', '😴', 2000);
    };

    Z.buildBubble = function () {
      if (Z.bubble) Z.bubble.remove();
      const b = el('div', 'cr-bubble pink', '<div class="row"></div><div class="tail"></div>');
      hud.over.appendChild(b); Z.bubble = b;
    };
    function renderBubble() {
      const row = Z.bubble.querySelector('.row'); row.innerHTML = '';
      Z.slots.forEach((s, i) => {
        const d = el('div', 'cr-slot', INFO()[s.ab].icon);
        if (Z.phase === 'call' && s.shown) d.classList.add(s.now ? 'now' : 'done');
        else if (Z.phase === 'call' || Z.phase === 'intro') d.classList.add('q');
        if (Z.phase !== 'call' && Z.phase !== 'intro') { if (s.res === 'hit') d.classList.add('done'); else if (s.res === 'miss') d.classList.add('miss'); else if (s.now) d.classList.add('now'); else d.classList.add('q'); }
        if (Z.phase === 'call' && !s.shown) d.innerHTML = '?';
        if (s.res) d.appendChild(el('span', 'res', s.res === 'hit' ? (s.perfect ? '⭐' : '✔️') : '✖️'));
        row.appendChild(d);
      });
      if (!Z.slots.length) row.appendChild(el('div', 'cr-slot q', '💭'));
    }

    // ---------------------------------------------------------------- rounds
    function newRound() {
      const a = Z.actor, likes = a.species.likes, n = 2 + (a.interest >= 35 ? 1 : 0) + (a.interest >= 70 ? 1 : 0);
      Z.seq = []; Z.slots = [];
      let last = null;
      for (let i = 0; i < n; i++) {
        let ab = likes[Math.floor(Math.random() * likes.length)];
        if (ab === last && Math.random() < 0.55) ab = likes[(likes.indexOf(ab) + 1) % likes.length];
        last = ab; Z.seq.push(ab);
        Z.slots.push({ ab: ab, tCall: 0.5 + i * BEAT, tHit: 0, res: null, shown: false, now: false, perfect: false });
      }
      Z.round++; Z.phase = 'call'; Z.t = 0;
      Z.callEnd = 0.5 + n * BEAT;
      hud.beat.querySelector('.msg').textContent = 'Watch ' + a.species.name + '...';
      hud.beat.querySelector('.notes').innerHTML = '';
      renderBubble();
    }
    function startReply() {
      Z.phase = 'reply'; Z.t = 0;
      Z.slots.forEach((s, i) => { s.tHit = TRAVEL + i * BEAT; s.now = false; s.shown = false; s.el = null; });
      hud.beat.querySelector('.msg').textContent = 'Your turn!  (5-8)';
      hud.say('Your turn!', '#fde047');
      SP.audio && SP.audio.sfx('pose', { vol: 0.6 });
      renderBubble();
    }
    function levelFor(ab) {
      let L = S.socialLevel(ab);
      for (const m of S.pack) if (m.state !== 'dead' && m.body.pos.distanceTo(S.body.pos) < 14) L += Math.min(3, (m.species.stats.abilities && m.species.stats.abilities[ab]) || (m.species.isPlayer ? 1 : 0));
      return Math.min(9, L);
    }
    function resolveRound() {
      const a = Z.actor, hits = Z.slots.filter((s) => s.res === 'hit').length, n = Z.slots.length;
      Z.phase = 'result'; Z.t = 0;
      const head = S.headPos(a, 1.4);
      let gain = 0;
      Z.slots.forEach((s) => { if (s.res === 'hit') gain += (10 + 6 * levelFor(s.ab)) * 0.5 * (s.perfect ? 1.25 : 1); });
      if (hits === n) { Z.combo++; gain *= 1 + Math.min(0.3, 0.1 * (Z.combo - 1)); } else Z.combo = 0;
      const mouthy = a.species.temperament === 'aggressive' || a.species.temperament === 'territorial';
      if (hits > 0) {
        Z.fails = 0;
        gain = Math.round(gain);
        const before = a.interest;
        S.eco.impress(a, gain);
        S.fx.hearts(a, hits === n ? 6 : 3);
        SP.audio && SP.audio.sfx('social_ok');
        if (hits === n) { hud.say(Z.combo > 1 ? 'COMBO x' + Z.combo + '!' : 'Perfect!', '#f9a8d4'); a.anim.action = 'celebrate'; a.anim.actionT = 0; a.actionDur = 0.9; }
        else hud.say('Not bad!', '#fde68a');
        S.popupAt(head, '+' + Math.round(a.interest - before) + ' 💗', 'pop-pink');
        
      } else {
        Z.fails++; Z.combo = 0;
        if (a.interest > 15) S.eco.impress(a, -15); else a.interest = 0;
        if (mouthy && (Z.fails >= 2 || Math.random() < 0.25)) { a.aggro = Math.max(a.aggro, 10); }
        SP.audio && SP.audio.sfx('social_bad');
        hud.say('Oops...', '#fca5a5');
        S.popupAt(head, '-15 💔', 'pop-red');
        if (a.anim) { a.anim.action = 'hurt'; a.anim.actionT = 0; a.actionDur = 0.4; }
      }
      renderBubble();
    }

    // ---------------------------------------------------------------- input
    Z.press = function (ab) {
      // always perform the gesture yourself (pack joins in)
      S.perform(ab);
      if (!Z.active) return false;
      if (Z.phase !== 'reply') return true;
      let best = null, bd = 9;
      Z.slots.forEach((s) => { if (s.res) return; const d = Math.abs(Z.t - s.tHit); if (d < bd) { bd = d; best = s; } });
      if (!best || bd > WIN) { return true; }
      if (best.ab === ab) {
        best.res = 'hit'; best.perfect = bd < PERFECT;
        hud.beat.querySelector('.hit').classList.remove('flash'); void hud.beat.offsetWidth; hud.beat.querySelector('.hit').classList.add('flash');
        S.popupAt(S.headPos(S.player, 0.6), best.perfect ? 'PERFECT!' : 'Nice', best.perfect ? 'pop-gold' : 'pop-cyan');
        SP.audio && SP.audio.sfx(ab === 'sing' ? 'sing' : ab === 'dance' ? 'dance' : ab === 'charm' ? 'charm' : 'pose', { vol: 0.8 });
        if (best.el) best.el.classList.add('hit');
      } else {
        best.res = 'miss'; S.popupAt(S.headPos(S.player, 0.6), 'Wrong move!', 'pop-red'); SP.audio && SP.audio.sfx('social_bad', { vol: 0.5 });
        if (best.el) best.el.classList.add('miss');
      }
      renderBubble();
      return true;
    };

    // ---------------------------------------------------------------- update
    Z.update = function (dt) {
      if (!Z.active) return;
      const a = Z.actor;
      if (!a || a.state === 'dead' || S.dead) { Z.stop('lost'); return; }
      const d = a.body.pos.distanceTo(S.body.pos);
      if (d > 17) { Z.stop('far'); return; }
      if (a.aggro > 0 && Z.phase !== 'result') { Z.stop('angry'); SP.ui.toast(a.species.name + ' got angry!', '💢', 2000); return; }
      if (a.impressed) { Z.finishImpressed(); return; }
      // keep it engaged and facing us
      Z.keep = (Z.keep || 0) - dt; if (Z.keep <= 0) { Z.keep = 2; S.eco.engage(a, true); }
      Z.t += dt;
      if (Z.phase === 'intro') {
        if (Z.t > 0.9) newRound();
      } else if (Z.phase === 'call') {
        Z.slots.forEach((s, i) => {
          const was = s.now, on = Z.t >= s.tCall && Z.t < s.tCall + BEAT * 0.9;
          s.now = on; if (Z.t >= s.tCall) s.shown = true;
          if (on && !was) {
            a.anim.action = s.ab; a.anim.actionT = 0; a.actionDur = BEAT * 0.9;
            SP.audio && SP.audio.sfx(s.ab, { vol: 0.5, pitch: 0.9 + i * 0.08 });
            S.fx.notes(a, s.ab);
            renderBubble();
          } else if (!on && was) renderBubble();
        });
        if (Z.t >= Z.callEnd) { Z.slots.forEach((s) => { s.now = false; }); startReply(); }
      } else if (Z.phase === 'reply') {
        const notes = hud.beat.querySelector('.notes');
        const W = hud.beat.clientWidth || 460, hitX = 84, startX = W - 30;
        Z.slots.forEach((s) => {
          const k = (Z.t - (s.tHit - TRAVEL)) / TRAVEL;     // 0 at spawn .. 1 at the ring
          if (!s.el) { s.el = el('div', 'cr-note', INFO()[s.ab].icon); notes.appendChild(s.el); }
          const x = startX + (hitX - startX) * k;
          s.el.style.left = x + 'px'; s.el.style.display = k < 0 ? 'none' : '';
          if (!s.res && Z.t > s.tHit + WIN) { s.res = 'miss'; s.el.classList.add('miss'); renderBubble(); }
          // highlight the upcoming slot in the bubble
          const nowUp = !s.res && Math.abs(Z.t - s.tHit) < WIN;
          if (nowUp !== s.now) { s.now = nowUp; renderBubble(); }
          if (s.res && k > 1.3) s.el.style.opacity = '0.0';
        });
        if (Z.slots.every((s) => s.res) && Z.t > Z.slots[Z.slots.length - 1].tHit + 0.1) resolveRound();
      } else if (Z.phase === 'result') {
        if (Z.t > 1.1) {
          if (a.impressed || a.interest >= 100) { Z.finishImpressed(); return; }
          if (Z.fails >= 3) { Z.stop('bored'); S.eco.impress(a, 0); return; }
          newRound();
        }
      }
      // bubble follows the target's head
      S.headScreen(a, 1.25, Z.bubble);
    };

    Z.finishImpressed = function () {
      const a = Z.actor; Z.stop('done');
      if (a) { S.fx.hearts(a, 10); a.anim.action = 'celebrate'; a.anim.actionT = 0; a.actionDur = 1.6; }
    };

    Z.dispose = function () { Z.stop('exit'); };
    return Z;
  }
  SP.crSocial = { create: create };
})();
