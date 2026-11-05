/* SP.ui — comic DOM UI helpers. Layers: #hud #popups #toasts #modal #editor-ui */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};

  const $ = (id) => document.getElementById(id);
  function layer(id) {
    let e = $(id);
    if (!e) { e = document.createElement('div'); e.id = id; document.body.appendChild(e); }
    return e;
  }
  function el(tag, className, html) {
    const e = document.createElement(tag || 'div');
    if (className) e.className = className;
    if (html !== undefined && html !== null) { if (typeof html === 'string') e.innerHTML = html; else e.appendChild(html); }
    return e;
  }
  function sfx(n) { try { if (SP.audio) SP.audio.sfx(n); } catch (e) {} }

  let helpLines = [];
  let modalCount = 0;

  const STAGE_INFO = {
    intro: { icon: '☄️', color: 'indigo' }, cell: { icon: '🦠', color: 'cyan' }, creature: { icon: '🦎', color: 'green' },
    tribal: { icon: '🛖', color: 'amber' }, civ: { icon: '🏙️', color: 'purple' }, space: { icon: '🚀', color: 'indigo' }
  };

  const ui = {
    el: el,
    layer: layer,
    hud() { return layer('hud'); },
    clearHud() { layer('hud').innerHTML = ''; },
    clearPopups() { layer('popups').innerHTML = ''; },
    panel(className) { return el('div', 'panel' + (className ? ' ' + className : '')); },

    button(label, o) {
      o = o || {};
      const b = el('button', 'btn' + (o.color ? ' btn-' + o.color : ' btn-slate') + (o.small ? ' btn-sm' : ''));
      b.type = 'button';
      if (o.icon) b.appendChild(el('span', 'btn-icon', o.icon));
      if (label !== undefined && label !== null && label !== '') b.appendChild(el('span', 'btn-label', label));
      if (o.title) b.title = o.title;
      if (o.key) b.appendChild(el('kbd', 'kbd', o.key));
      b.addEventListener('click', function (e) {
        if (b.disabled) return;
        sfx(o.sfx || 'click');
        if (o.onClick) o.onClick(e, b);
      });
      return b;
    },

    bar(o) {
      o = o || {};
      let max = o.max === undefined ? 100 : o.max;
      let color = o.color || 'green';
      const root = el('div', 'bar bar-' + color);
      if (o.width) root.style.width = typeof o.width === 'number' ? o.width + 'px' : o.width;
      if (o.icon) root.appendChild(el('span', 'bar-icon', o.icon));
      const body = el('div', 'bar-body');
      const track = el('div', 'bar-track');
      const fill = el('div', 'bar-fill');
      const txt = el('div', 'bar-text stroke-sm');
      track.appendChild(fill); track.appendChild(txt);
      if (o.label) body.appendChild(el('div', 'bar-label stroke-sm', o.label));
      body.appendChild(track);
      root.appendChild(body);
      let last = -1;
      const api = {
        el: root,
        set(v, m) {
          if (m !== undefined) max = m;
          const f = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
          fill.style.width = (f * 100).toFixed(1) + '%';
          txt.textContent = Math.round(v) + ' / ' + Math.round(max);
          root.classList.toggle('bar-low', f < 0.25);
          if (last >= 0 && Math.abs(v - last) > 0.01 * max) api.flash();
          last = v;
        },
        flash() { root.classList.remove('bar-flash'); void root.offsetWidth; root.classList.add('bar-flash'); },
        setColor(c) { root.classList.remove('bar-' + color); color = c; root.classList.add('bar-' + c); }
      };
      api.set(o.value === undefined ? max : o.value, max);
      return api;
    },

    counter(o) {
      o = o || {};
      const root = el('div', 'counter counter-' + (o.color || 'amber'));
      if (o.icon) root.appendChild(el('span', 'counter-icon', o.icon));
      if (o.label) root.appendChild(el('span', 'counter-label', o.label));
      const val = el('span', 'counter-val stroke-sm', '0');
      root.appendChild(val);
      let prev = null;
      return {
        el: root,
        set(text) {
          text = String(text);
          if (text === prev) return;
          prev = text; val.textContent = text;
          root.classList.remove('counter-pulse'); void root.offsetWidth; root.classList.add('counter-pulse');
        }
      };
    },

    popup(worldPos, camera, text, cls) {
      const v = worldPos.clone().project(camera);
      if (v.z > 1 || v.z < -1) return null;
      const x = (v.x * 0.5 + 0.5) * window.innerWidth, y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      return ui.popupAt(x, y, text, cls);
    },
    popupAt(x, y, text, cls) {
      const p = el('div', 'pop stroke-sm ' + (cls || 'pop-gold'));
      p.textContent = text;
      p.style.left = x + 'px'; p.style.top = y + 'px';
      const L = layer('popups');
      L.appendChild(p);
      while (L.querySelectorAll('.pop').length > 40) { const f = L.querySelector('.pop'); if (f) f.remove(); else break; }
      setTimeout(function () { p.remove(); }, 1100);
      return p;
    },

    toast(text, icon, ms) {
      const L = layer('toasts');
      const t = el('div', 'toast panel');
      t.appendChild(el('span', 'toast-icon', icon === undefined ? 'ℹ️' : icon));
      t.appendChild(el('span', 'toast-text', text));
      L.appendChild(t);
      while (L.children.length > 5) L.firstChild.remove();
      const life = ms || 2500;
      setTimeout(function () { t.classList.add('toast-out'); setTimeout(function () { t.remove(); }, 350); }, life);
      return t;
    },

    modal(o) {
      o = o || {};
      const root = layer('modal');
      const back = el('div', 'modal-back');
      const box = el('div', 'panel modal-box pop-in');
      if (o.className) box.classList.add(o.className);
      let closed = false;
      const handle = {
        el: box,
        close() {
          if (closed) return; closed = true; modalCount--;
          document.removeEventListener('keydown', onKey, true);
          back.classList.add('modal-out');
          setTimeout(function () { back.remove(); }, 160);
          if (o.onClose) o.onClose();
        }
      };
      function onKey(e) {
        if (e.code === 'Escape' && o.closable !== false && root.lastElementChild === back) { e.spHandled = true; e.preventDefault(); handle.close(); }
      }
      if (o.title) box.appendChild(el('h2', 'modal-title stroke', o.title));
      const body = el('div', 'modal-body');
      if (o.body !== undefined) { if (typeof o.body === 'string') body.innerHTML = o.body; else body.appendChild(o.body); }
      box.appendChild(body);
      if (o.buttons && o.buttons.length) {
        const row = el('div', 'modal-buttons');
        o.buttons.forEach(function (bd) {
          row.appendChild(ui.button(bd.label, {
            color: bd.color || 'slate', icon: bd.icon, onClick: function () {
              if (bd.onClick) bd.onClick(handle);
              if (bd.close !== false) handle.close();
            }
          }));
        });
        box.appendChild(row);
      }
      if (o.closable !== false && !o.noX) {
        const x = el('button', 'modal-x btn btn-rose', '✕'); x.type = 'button';
        x.addEventListener('click', function () { sfx('click'); handle.close(); });
        box.appendChild(x);
      }
      back.appendChild(box);
      if (o.closable !== false) back.addEventListener('pointerdown', function (e) { if (e.target === back) handle.close(); });
      root.appendChild(back);
      modalCount++;
      document.addEventListener('keydown', onKey, true);
      sfx('place');
      return handle;
    },
    modalCount() { return modalCount; },

    banner(title, subtitle, ms) {
      const L = layer('popups');
      const old = L.querySelector('.banner'); if (old) old.remove();
      const b = el('div', 'banner');
      b.appendChild(el('div', 'banner-title stroke', title));
      if (subtitle) b.appendChild(el('div', 'banner-sub stroke-sm', subtitle));
      L.appendChild(b);
      setTimeout(function () { b.classList.add('banner-out'); setTimeout(function () { b.remove(); }, 500); }, ms || 2500);
      return b;
    },

    stageCard(o) {
      o = o || {};
      const info = STAGE_INFO[o.stage] || { icon: '⭐', color: 'amber' };
      const root = layer('modal');
      const back = el('div', 'modal-back card-back');
      const box = el('div', 'panel stage-card pop-in');
      box.appendChild(el('div', 'stage-card-badge btn-' + info.color, info.icon));
      box.appendChild(el('h2', 'stage-card-title stroke', o.title || 'Stage Complete!'));
      if (o.card) {
        const c = el('div', 'stage-card-card');
        c.appendChild(el('span', 'stage-card-ribbon', 'CARD'));
        c.appendChild(el('span', 'stage-card-name stroke-sm', String(o.card).replace(/^./, function (m) { return m.toUpperCase(); })));
        box.appendChild(c);
      }
      const ul = el('ul', 'stage-card-lines');
      (o.lines || []).forEach(function (l, i) {
        const li = el('li', 'stage-card-line', l);
        li.style.animationDelay = (0.35 + i * 0.22) + 's';
        ul.appendChild(li);
      });
      box.appendChild(ul);
      let done = false;
      const btn = ui.button('Continue', {
        color: 'green', icon: '▶', onClick: function () {
          if (done) return; done = true; modalCount--;
          back.classList.add('modal-out'); setTimeout(function () { back.remove(); }, 160);
          if (o.onContinue) o.onContinue();
        }
      });
      btn.classList.add('btn-lg');
      box.appendChild(btn);
      back.appendChild(box); root.appendChild(back); modalCount++;
      sfx('win');
      confetti(box);
      return { close() { btn.click(); } };
    },

    // abilities: [{id, icon, key, level, cooldown, name, onClick}]
    abilityBar(abilities) {
      const root = el('div', 'ability-bar');
      const slots = {};
      (abilities || []).forEach(function (a) {
        const s = el('div', 'ability');
        if (a.name) s.title = a.name;
        s.appendChild(el('div', 'ability-icon', a.icon || '❓'));
        const cd = el('div', 'ability-cd'); s.appendChild(cd);
        const cdt = el('div', 'ability-cdt stroke-sm'); s.appendChild(cdt);
        if (a.key) s.appendChild(el('kbd', 'kbd ability-key', a.key));
        const pips = el('div', 'ability-pips'); s.appendChild(pips);
        slots[a.id] = { el: s, cd: cd, cdt: cdt, pips: pips, cooldown: a.cooldown || 0 };
        setPips(slots[a.id], a.level || 0);
        if (a.onClick) s.addEventListener('click', function () { a.onClick(a); });
        root.appendChild(s);
      });
      function setPips(slot, n) {
        slot.pips.innerHTML = '';
        for (let i = 0; i < 5; i++) slot.pips.appendChild(el('i', i < n ? 'on' : ''));
      }
      return {
        el: root,
        // frac = fraction of cooldown REMAINING (1 just used -> 0 ready)
        setCooldown(id, frac) {
          const s = slots[id]; if (!s) return;
          frac = Math.max(0, Math.min(1, frac));
          s.cd.style.setProperty('--cd', (frac * 360).toFixed(1) + 'deg');
          s.cd.style.opacity = frac > 0 ? 1 : 0;
          s.cdt.textContent = frac > 0 && s.cooldown ? Math.ceil(frac * s.cooldown) : '';
          const ready = frac <= 0;
          if (ready && s.wasCd) { s.el.classList.remove('ability-ready'); void s.el.offsetWidth; s.el.classList.add('ability-ready'); }
          s.wasCd = !ready;
        },
        setActive(id, on) { const s = slots[id]; if (s) s.el.classList.toggle('ability-active', !!on); },
        setLevels(map) { for (const id in map) if (slots[id]) setPips(slots[id], map[id]); }
      };
    },

    minimap(o) {
      o = o || {};
      const size = o.size || 160, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const root = el('div', 'minimap panel');
      root.style.width = root.style.height = size + 'px';
      const cv = el('canvas', 'minimap-canvas');
      cv.width = cv.height = Math.round(size * dpr);
      cv.style.width = cv.style.height = '100%';
      root.appendChild(cv);
      const ctx = cv.getContext('2d');
      return {
        el: root, canvas: cv,
        draw(fn) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size, size);
          ctx.save(); ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
          ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, size, size);
          try { fn(ctx, size, size); } finally { ctx.restore(); }
        }
      };
    },

    help(lines) { helpLines = (lines || []).slice(); },
    helpLines() { return helpLines; },
    showHelp(onClose) {
      const body = el('div', 'help-body');
      const g = el('div', 'help-section');
      g.appendChild(el('h3', 'help-h stroke-sm', 'This stage'));
      const ul = el('ul', 'help-list');
      (helpLines.length ? helpLines : ['Nothing special here. Have fun!']).forEach(function (l) { ul.appendChild(el('li', null, l)); });
      g.appendChild(ul); body.appendChild(g);
      const g2 = el('div', 'help-section');
      g2.appendChild(el('h3', 'help-h stroke-sm', 'Everywhere'));
      const u2 = el('ul', 'help-list');
      ['<kbd class="kbd">Esc</kbd> pause menu', '<kbd class="kbd">H</kbd> this help', '<kbd class="kbd">F2</kbd> debug overlay (fps, draw calls)'].forEach(function (l) { u2.appendChild(el('li', null, l)); });
      g2.appendChild(u2); body.appendChild(g2);
      return ui.modal({ title: '❓ Help', body: body, className: 'modal-help', onClose: onClose, buttons: [{ label: 'Got it', color: 'green' }] });
    },

    // little confetti burst used by cards
    confetti: confetti
  };

  function confetti(host) {
    const cols = ['#eab308', '#f43f5e', '#22d3ee', '#a855f7', '#84cc16', '#f97316'];
    const wrap = el('div', 'confetti');
    for (let i = 0; i < 26; i++) {
      const c = el('i');
      c.style.background = cols[i % cols.length];
      c.style.left = (Math.random() * 100) + '%';
      c.style.animationDelay = (Math.random() * 0.4) + 's';
      c.style.setProperty('--dx', ((Math.random() - 0.5) * 160) + 'px');
      c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      wrap.appendChild(c);
    }
    host.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 2500);
  }

  SP.ui = ui;
})();
