# TODO

- [ ] Civilization: some cities can be bought for $0 (buy-out price bug). Investigate the buy-out price formula in js/stages/civ_city.js / civ_units.js (zero/negative base price, rel/discount clamp, tiny city). Add a minimum price and a regression check. (user report 2026-10-27)
