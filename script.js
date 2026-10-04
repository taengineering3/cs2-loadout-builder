const grid = document.getElementById("skin-grid");
const searchBox = document.getElementById("search");
const categoryBox = document.getElementById("category");
const minBox = document.getElementById("min-price");
const maxBox = document.getElementById("max-price");
let allSkins = [];
let prices = {};
let colors = {};

async function loadSkins() {
  grid.innerHTML = "<p>Loading skins...</p>";

  const url = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";
  const response = await fetch(url);
  allSkins = await response.json();

  const priceResponse = await fetch("prices.json");
  prices = await priceResponse.json();
  const colorResponse = await fetch("colors.json");
  colors = await colorResponse.json();

  try {
    const wearResponse = await fetch("prices_by_wear.json");
    pricesByWear = await wearResponse.json();
  } catch (e) {}

  allSkins.sort(() => Math.random() - 0.5);

  const categories = new Set(allSkins.map(skin => skin.category.name));
  for (const name of categories) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    categoryBox.appendChild(option);
  }
  renderDailyCombo();
  updateDisplay();
}

function updateDisplay() {
  if (negativeCheck([minBox, maxBox], document.getElementById("browse-error"), "Prices can't be negative.")) return;
  const text = searchBox.value.toLowerCase();
  const category = categoryBox.value;
  const min = minBox.value === "" ? 0 : Number(minBox.value);
  const max = maxBox.value === "" ? Infinity : Number(maxBox.value);
  const priceFilterOn = minBox.value !== "" || maxBox.value !== "";

  const filtered = allSkins.filter(skin => {
    const matchesText = skin.name.toLowerCase().includes(text);
    const matchesCategory = category === "" || skin.category.name === category;

    const price = prices[skin.name];
    let matchesPrice = true;
    if (priceFilterOn) {
      matchesPrice = price !== undefined && price >= min && price <= max;
    }

    return matchesText && matchesCategory && matchesPrice;
  });

  showSkins(filtered);
}

function showSkins(list) {
  grid.innerHTML = "";
  for (const skin of list.slice(0, 60)) {
    const price = prices[skin.name];
    const priceText = price !== undefined ? `from €${price.toFixed(2)}` : "No price";

    const card = document.createElement("div");
    card.className = "card";
    card.style.borderColor = skin.rarity.color;
    card.style.setProperty("--rar", skin.rarity.color);
    card.innerHTML = `
      <img src="${skin.image}" alt="${skin.name}">
      <h3>${skin.name}</h3>
      <p>${skin.rarity.name}</p>
      <p class="price">${priceText}</p>
      <button class="lock-btn">Lock in loadout</button>
      ${csfloatHtml()}
    `;
    wireCsfloat(card, skin.name);
    card.querySelector(".lock-btn").addEventListener("click", () => lockSkin(skin));
    grid.appendChild(card);
  }
}

// ---------- LOADOUT GENERATOR ----------

const slots = [
  { name: "Knife",        checked: true,  match: skin => skin.category.name === "Knives" },
  { name: "Gloves",       checked: true,  match: skin => skin.category.name === "Gloves" },
  { name: "AK-47",        checked: true,  match: skin => skin.weapon.name === "AK-47" },
  { name: "M4A4",         checked: false, match: skin => skin.weapon.name === "M4A4" },
  { name: "M4A1-S",       checked: true,  match: skin => skin.weapon.name === "M4A1-S" },
  { name: "AWP",          checked: true,  match: skin => skin.weapon.name === "AWP" },
  { name: "Desert Eagle", checked: true,  match: skin => skin.weapon.name === "Desert Eagle" },
  { name: "USP-S",        checked: false, match: skin => skin.weapon.name === "USP-S" },
  { name: "Glock-18",     checked: false, match: skin => skin.weapon.name === "Glock-18" }
];

const slotOptions = document.getElementById("slot-options");
const loadoutBox = document.getElementById("loadout");

// build the checkboxes
slots.forEach((slot, i) => {
  const label = document.createElement("label");
  label.innerHTML = `<input type="checkbox" id="slot-${i}" ${slot.checked ? "checked" : ""}> ${slot.name}`;
  slotOptions.appendChild(label);
});

let current = null;
function generateLoadout() {
    const genMinBox = document.getElementById("gen-min");
  const genMaxBox = document.getElementById("gen-max");
  if (negativeCheck([genMinBox, genMaxBox], document.getElementById("gen-error"), "Budget can't be negative.")) return;
  const minText = document.getElementById("gen-min").value;
  const maxText = document.getElementById("gen-max").value;
  const min = minText === "" ? 0 : Number(minText);
  const max = maxText === "" ? Infinity : Number(maxText);
  const theme = document.getElementById("theme").value;

  // which slots did the user tick?
  const chosenSlots = slots.filter((slot, i) => document.getElementById("slot-" + i).checked);
  if (chosenSlots.length === 0) {
    loadoutBox.innerHTML = "<p>Pick at least one slot.</p>";
    return;
  }

  // skins the user ticked "Keep" on in the previous loadout
  const keptSkins = {};
  if (current) {
    current.chosenSlots.forEach((slot, i) => {
      const index = slots.indexOf(slot);
      if (current.kept[index]) keptSkins[index] = current.picks[i];
    });
  }

  // full pools for each slot (locked skins stay fixed)
  const pools = chosenSlots.map(slot => {
    const index = slots.indexOf(slot);
    if (locked[index]) return [locked[index]];
    const pool = allSkins.filter(skin => slot.match(skin) && prices[skin.name] !== undefined);
    return applyTheme(pool, theme);
  });

  // pools used for generating: kept skins are fixed too
  const genPools = chosenSlots.map((slot, i) => {
    const index = slots.indexOf(slot);
    return keptSkins[index] ? [keptSkins[index]] : pools[i];
  });

  for (let i = 0; i < genPools.length; i++) {
    if (genPools[i].length === 0) {
      loadoutBox.innerHTML = `<p>No priced skins found for ${chosenSlots[i].name}.</p>`;
      return;
    }
  }

  // cheapest skin in each slot
  const cheapest = genPools.map(pool => Math.min(...pool.map(skin => prices[skin.name])));

  for (let attempt = 0; attempt < 1000; attempt++) {
    let spent = 0;
    const picks = [];
    let ok = true;

    for (let i = 0; i < genPools.length; i++) {
      // money we must keep aside for the slots after this one
      const reserved = cheapest.slice(i + 1).reduce((a, b) => a + b, 0);
      const cap = max - spent - reserved;

      const options = genPools[i].filter(skin => prices[skin.name] <= cap);
      if (options.length === 0) { ok = false; break; }

      const pick = weightedPick(options, theme);
      picks.push(pick);
      spent += prices[pick.name];
    }

    if (ok && spent >= min) {
      // remember which slots are still being kept
      const kept = {};
      chosenSlots.forEach(slot => {
        const index = slots.indexOf(slot);
        if (keptSkins[index]) kept[index] = true;
      });

      current = { chosenSlots, picks, pools, theme, min, max, kept };
      showLoadout();
      return;
    }
  }

  loadoutBox.innerHTML = "<p>Couldn't build a loadout in that range. Try a wider budget, fewer slots, or untick some Keeps.</p>";
}

function showLoadout() {
  const { chosenSlots, picks, kept } = current;
  const total = picks.reduce((sum, skin) => sum + prices[skin.name], 0);

  loadoutBox.innerHTML = `<p id="loadout-total">Total: <span class="price">€${total.toFixed(2)}</span></p>`;

  picks.forEach((skin, i) => {
    const index = slots.indexOf(chosenSlots[i]);
    const isLocked = locked[index] !== undefined;
    const isKept = kept[index] === true;

    let extra = "";
    if (isLocked) {
      extra = "<p>🔒 Locked</p>";
    } else {
      extra = `<label class="keep-label"><input type="checkbox" class="keep-box" ${isKept ? "checked" : ""}> Keep</label>`;
      if (!isKept) extra += '<button class="reroll-btn">Reroll</button>';
    }

    const card = document.createElement("div");
    card.className = "card";
    card.style.borderColor = skin.rarity.color;
    card.style.setProperty("--rar", skin.rarity.color);
    card.innerHTML = `
      <p>${chosenSlots[i].name}</p>
      <img src="${skin.image}" alt="${skin.name}">
      <h3>${skin.name}</h3>
      <p class="price">from €${prices[skin.name].toFixed(2)}</p>
      ${extra}
      ${csfloatHtml()}
    `;
    wireCsfloat(card, skin.name);

    if (!isLocked) {
      card.querySelector(".keep-box").addEventListener("change", event => {
        kept[index] = event.target.checked;
        showLoadout();
      });
      if (!isKept) {
        card.querySelector(".reroll-btn").addEventListener("click", () => rerollSlot(i));
      }
    }

    loadoutBox.appendChild(card);
  });
}

function rerollSlot(i) {
  const { picks, pools, theme, min, max } = current;

  // what the other slots already cost
  const others = picks.reduce((sum, skin, j) => (j === i ? sum : sum + prices[skin.name]), 0);

  // other skins for this slot that keep the total inside the budget
  const options = pools[i].filter(skin =>
    skin !== picks[i] &&
    others + prices[skin.name] <= max &&
    others + prices[skin.name] >= min
  );

  if (options.length === 0) {
    alert("No other skin fits your budget for this slot.");
    return;
  }

  picks[i] = weightedPick(options, theme);
  showLoadout();
}

// ---------- LOCK IN LOADOUT ----------

const locked = {}; // no longer used, but older code still refers to it

function poolFor(slot, theme) {
  return applyTheme(allSkins.filter(skin => slot.match(skin) && prices[skin.name] !== undefined), theme);
}

function lockSkin(skin) {
  const index = slots.findIndex(slot => slot.match(skin));
  if (index === -1) { flash("The builder doesn't support " + skin.weapon.name + " yet."); return; }
  if (prices[skin.name] === undefined) { flash("This skin has no price, so it can't be used in a budget."); return; }

  const checkbox = document.getElementById("slot-" + index);
  if (checkbox) checkbox.checked = true;

  if (!current) current = { chosenSlots: [], picks: [], pools: [], theme: "", min: 0, max: Infinity, kept: {} };

  const slot = slots[index];
  let pos = current.chosenSlots.indexOf(slot);
  if (pos === -1) {
    pos = current.chosenSlots.findIndex(s => slots.indexOf(s) > index);
    if (pos === -1) pos = current.chosenSlots.length;
    current.chosenSlots.splice(pos, 0, slot);
    current.picks.splice(pos, 0, skin);
    current.pools.splice(pos, 0, poolFor(slot, current.theme));
  } else {
    current.picks[pos] = skin;
  }
  current.kept[index] = true;

  showLoadout();
  flash("Locked in: " + skin.name);
  location.hash = "#/builder";
}

// ---------- COLOUR THEMES ----------

function colorScore(skin, theme) {
  const c = colors[skin.name];
  return c && c[theme] ? c[theme] : 0;
}

// keep skins that are at least 15% the chosen colour
function applyTheme(pool, theme) {
  if (theme === "") return pool;
  const good = pool.filter(skin => colorScore(skin, theme) >= 0.15);
  if (good.length >= 5) return good;
  // too few matches: fall back to the 10 closest skins
  return [...pool].sort((a, b) => colorScore(b, theme) - colorScore(a, theme)).slice(0, 10);
}

// random pick, but skins with more of the colour are more likely
function weightedPick(options, theme) {
  if (theme === "") return options[Math.floor(Math.random() * options.length)];
  const weights = options.map(skin => colorScore(skin, theme) + 0.05);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

document.getElementById("generate").addEventListener("click", generateLoadout);

// ---------- COLOUR SWATCHES ----------

document.querySelectorAll(".swatch").forEach(button => {
  button.addEventListener("click", () => {
    document.getElementById("theme").value = button.dataset.theme;
    document.querySelectorAll(".swatch").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
  });
});

// ---------- CSFLOAT LINKS ----------

const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

function csfloatHtml() {
  const options = WEARS.map(w => `<option ${w === "Field-Tested" ? "selected" : ""}>${w}</option>`).join("");
  return `<div class="buy-row">
    <select class="wear-select">${options}</select>
    <a class="buy-btn" href="#" target="_blank" rel="noopener">CSFloat ↗</a>
  </div>`;
}

function wireCsfloat(card, skinName) {
  const select = card.querySelector(".wear-select");
  const link = card.querySelector(".buy-btn");
  const update = () => {
    const fullName = `${skinName} (${select.value})`;
    link.href = "https://csfloat.com/search?market_hash_name=" + encodeURIComponent(fullName);
  };
  select.addEventListener("change", update);
  update();
}

// ---------- START THE SITE ----------

searchBox.addEventListener("input", updateDisplay);
categoryBox.addEventListener("change", updateDisplay);
minBox.addEventListener("input", updateDisplay);
maxBox.addEventListener("input", updateDisplay);
["gen-min", "gen-max"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    negativeCheck(
      [document.getElementById("gen-min"), document.getElementById("gen-max")],
      document.getElementById("gen-error"),
      "Budget can't be negative."
    );
  });
});
loadSkins();

// ---------- INPUT CHECKS ----------

function negativeCheck(boxes, errorBox, message) {
  const bad = boxes.some(box => box.value !== "" && Number(box.value) < 0);
  errorBox.textContent = bad ? message : "";
  return bad;
}

// ---------- PAGES ----------

const PAGES = ["home", "builder", "browse", "combos", "shared", "skin"];

function route() {
  const name = location.hash.replace("#/", "").split("?")[0];
  const page = PAGES.includes(name) ? name : "home";
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  document.querySelectorAll(".topbar nav a").forEach(a => a.classList.toggle("active", a.dataset.page === page));
  window.scrollTo(0, 0);
  if (allSkins.length) {
    if (page === "combos") renderMyCombos();
    if (page === "shared") renderShared();
    if (page === "skin") renderSkinPage();
  }
}

window.addEventListener("hashchange", route);
route();

// ---------- COMBO OF THE DAY ----------

let dailyCombo = null;

const THEME_COLORS = {
  red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", blue: "#3b82f6",
  purple: "#a855f7", pink: "#ec4899", black: "#374151", white: "#f3f4f6", grey: "#6b7280"
};

// random numbers that depend on a text seed, so the same day gives the same "random" results
function seededRandom(text) {
  let seed = 0;
  for (const ch of text) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick(options, theme, rand) {
  const weights = options.map(skin => colorScore(skin, theme) + 0.05);
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

function buildDailyCombo() {
  const today = new Date().toISOString().slice(0, 10);
  const rand = seededRandom("cs2-combo-" + today);

  const themes = Object.keys(THEME_COLORS);
  const theme = themes[Math.floor(rand() * themes.length)];
  const budgets = [300, 500, 800, 1200];
  const baseMax = budgets[Math.floor(rand() * budgets.length)];

  const names = ["Knife", "Gloves", "AK-47", "M4A1-S", "AWP", "Desert Eagle"];
  const chosenSlots = slots.filter(slot => names.includes(slot.name));

  // sorted by name so every visitor builds from the same order
  const pools = chosenSlots.map(slot =>
    applyTheme(
      allSkins
        .filter(skin => slot.match(skin) && prices[skin.name] !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name)),
      theme
    )
  );
  if (pools.some(pool => pool.length === 0)) return null;

  const cheapest = pools.map(pool => Math.min(...pool.map(skin => prices[skin.name])));

  // if the budget is too tight, widen it a little
  for (const multiplier of [1, 1.5, 2, 4]) {
    const max = baseMax * multiplier;
    for (let attempt = 0; attempt < 300; attempt++) {
      let spent = 0;
      const picks = [];
      let ok = true;
      for (let i = 0; i < pools.length; i++) {
        const reserved = cheapest.slice(i + 1).reduce((a, b) => a + b, 0);
        const options = pools[i].filter(skin => prices[skin.name] <= max - spent - reserved);
        if (options.length === 0) { ok = false; break; }
        const pick = seededPick(options, theme, rand);
        picks.push(pick);
        spent += prices[pick.name];
      }
      if (ok && spent >= max * 0.5) {
        return { date: today, theme, max, chosenSlots, picks, total: spent };
      }
    }
  }
  return null;
}

function renderDailyCombo() {
  route();
  const box = document.getElementById("daily-combo");
  dailyCombo = buildDailyCombo();
  if (!dailyCombo) { box.innerHTML = ""; return; }

  const d = dailyCombo;
  const themeName = d.theme[0].toUpperCase() + d.theme.slice(1);

  box.innerHTML = `
    <div class="daily-head">
      <div>
        <h2>🎲 Combo of the day</h2>
        <p class="sub">A new loadout every day, the same for everyone.</p>
      </div>
      <div class="daily-tags">
        <span class="chip"><span class="dot" style="background:${THEME_COLORS[d.theme]}"></span>${themeName}</span>
        <span class="chip">Up to €${Math.round(d.max)}</span>
        <span class="chip">Total €${d.total.toFixed(2)}</span>
        <button class="btn-alt" id="use-daily">Use this combo</button>
      </div>
    </div>
    <div id="daily-grid"></div>
  `;

  const grid = document.getElementById("daily-grid");
  d.picks.forEach((skin, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.setProperty("--rar", skin.rarity.color);
    card.innerHTML = `
      <p>${d.chosenSlots[i].name}</p>
      <img src="${skin.image}" alt="${skin.name}">
      <h3>${skin.name}</h3>
      <p class="price">from €${prices[skin.name].toFixed(2)}</p>
      ${csfloatHtml()}
    `;
    wireCsfloat(card, skin.name);
    grid.appendChild(card);
  });

  document.getElementById("use-daily").addEventListener("click", useDailyCombo);
}

function useDailyCombo() {
  const d = dailyCombo;
  slots.forEach((slot, i) => {
    document.getElementById("slot-" + i).checked = d.chosenSlots.includes(slot);
  });
  document.getElementById("theme").value = d.theme;
  document.querySelectorAll(".swatch").forEach(b => b.classList.toggle("active", b.dataset.theme === d.theme));
  document.getElementById("gen-max").value = Math.round(d.max);

  const kept = {};
  d.chosenSlots.forEach(slot => { kept[slots.indexOf(slot)] = true; });
  current = {
    chosenSlots: [...d.chosenSlots],
    picks: [...d.picks],
    pools: d.chosenSlots.map(slot => poolFor(slot, d.theme)),
    theme: d.theme, min: 0, max: d.max, kept
  };
  showLoadout();
  location.hash = "#/builder";
}
// ---------- MY COMBOS AND SHARING ----------

const STORE_KEY = "cs2-my-combos";

function loadCombos() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
}
function storeCombos(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {}
}

// makes text safe to put inside HTML (important, because share links can contain anything)
function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function flash(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function copyText(text, done) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(() => prompt("Copy this link:", text));
  } else {
    prompt("Copy this link:", text);
  }
}

function shareUrl(name, theme, skinNames) {
  return location.origin + location.pathname + "#/shared?n=" + encodeURIComponent(name) +
    "&t=" + encodeURIComponent(theme) + "&s=" + skinNames.map(encodeURIComponent).join("~");
}

function skinsFromNames(names) {
  return names.map(name => allSkins.find(skin => skin.name === name)).filter(Boolean);
}

function fillCards(grid, skins) {
  grid.innerHTML = "";
  skins.forEach(skin => {
    const slot = slots.find(s => s.match(skin));
    const price = prices[skin.name];
    const card = document.createElement("div");
    card.className = "card";
    card.style.setProperty("--rar", skin.rarity.color);
    card.innerHTML = `
      <p>${slot ? slot.name : esc(skin.weapon.name)}</p>
      <img src="${skin.image}" alt="">
      <h3>${esc(skin.name)}</h3>
      <p class="price">${price !== undefined ? "from €" + price.toFixed(2) : "No price"}</p>
      ${csfloatHtml()}
    `;
    wireCsfloat(card, skin.name);
    card.addEventListener("click", event => {
      if (event.target.closest("button, select, a, label, input")) return;
      event.stopPropagation();
      location.hash = "#/skin?n=" + encodeURIComponent(skin.name);
    });
    grid.appendChild(card);
  });
}

function buildPanel(title, subtitle, skins, theme, buttons) {
  const total = skins.reduce((sum, skin) => sum + (prices[skin.name] || 0), 0);
  const panel = document.createElement("div");
  panel.className = "daily";
  panel.innerHTML = `
    <div class="daily-head">
      <div><h2>${esc(title)}</h2><p class="sub">${esc(subtitle)}</p></div>
      <div class="daily-tags">
        ${theme ? `<span class="chip"><span class="dot" style="background:${THEME_COLORS[theme] || "#666"}"></span>${esc(theme)}</span>` : ""}
        <span class="chip">Total €${total.toFixed(2)}</span>
      </div>
    </div>
    <div class="combo-grid"></div>
    <div class="combo-actions"></div>
  `;
  fillCards(panel.querySelector(".combo-grid"), skins);

  const actions = panel.querySelector(".combo-actions");
  buttons.forEach(b => {
    const btn = document.createElement("button");
    btn.className = b.cls || "btn-alt";
    btn.textContent = b.label;
    btn.addEventListener("click", b.onClick);
    actions.appendChild(btn);
  });
  return panel;
}

function loadIntoBuilder(skins, theme) {
  const pairs = [];
  skins.forEach(skin => {
    const index = slots.findIndex(s => s.match(skin));
    if (index !== -1 && !pairs.some(p => p.index === index)) pairs.push({ index, skin });
  });
  if (pairs.length === 0) { flash("None of these weapons are in the builder yet."); return; }
  pairs.sort((a, b) => a.index - b.index);

  slots.forEach((slot, i) => {
    document.getElementById("slot-" + i).checked = pairs.some(p => p.index === i);
  });
  document.getElementById("theme").value = theme;
  document.querySelectorAll(".swatch").forEach(b => b.classList.toggle("active", b.dataset.theme === theme));

  const kept = {};
  pairs.forEach(p => { kept[p.index] = true; });
  current = {
    chosenSlots: pairs.map(p => slots[p.index]),
    picks: pairs.map(p => p.skin),
    pools: pairs.map(p => poolFor(slots[p.index], theme)),
    theme, min: 0, max: Infinity, kept
  };
  showLoadout();
  location.hash = "#/builder";
}

function renderMyCombos() {
  const box = document.getElementById("combos-list");
  const list = loadCombos();
  if (list.length === 0) {
    box.innerHTML = '<p class="sub">No saved combos yet. Build one in the Builder and click Save.</p>';
    return;
  }
  box.innerHTML = "";
  list.forEach(combo => {
    const skins = skinsFromNames(combo.skins);
    box.appendChild(buildPanel(combo.name, "Saved " + combo.date, skins, combo.theme, [
      { label: "Open in builder", onClick: () => loadIntoBuilder(skins, combo.theme) },
      { label: "🔗 Copy share link", onClick: () => copyText(shareUrl(combo.name, combo.theme, combo.skins), () => flash("Share link copied")) },
      { label: "Delete", cls: "btn-danger", onClick: () => {
          storeCombos(loadCombos().filter(c => c.id !== combo.id));
          renderMyCombos();
        } }
    ]));
  });
}

function renderShared() {
  const box = document.getElementById("shared-box");
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const names = (params.get("s") || "").split("~");
  const skins = skinsFromNames(names);
  if (skins.length === 0) {
    box.innerHTML = '<p class="sub">This link doesn\'t contain a valid combo.</p>';
    return;
  }
  const name = params.get("n") || "Shared combo";
  const theme = params.get("t") || "";
  box.innerHTML = "";
  box.appendChild(buildPanel(name, "Shared with you", skins, theme, [
    { label: "Open in builder", onClick: () => loadIntoBuilder(skins, theme) },
    { label: "💾 Save to My Combos", onClick: () => {
        const list = loadCombos();
        list.unshift({ id: Date.now(), name, date: new Date().toISOString().slice(0, 10), theme, skins: skins.map(s => s.name) });
        storeCombos(list);
        flash("Saved to My Combos");
      } }
  ]));
}

function currentComboData() {
  if (!current || current.picks.length === 0) return null;
  return { skins: current.picks.map(skin => skin.name), theme: current.theme || "" };
}

document.getElementById("save-combo").addEventListener("click", () => {
  const data = currentComboData();
  if (!data) { flash("Generate or lock in a loadout first."); return; }
  const list = loadCombos();
  const nameBox = document.getElementById("combo-name");
  const name = nameBox.value.trim() || "Combo " + (list.length + 1);
  list.unshift({ id: Date.now(), name, date: new Date().toISOString().slice(0, 10), theme: data.theme, skins: data.skins });
  storeCombos(list);
  nameBox.value = "";
  flash("Saved to My Combos");
});

document.getElementById("copy-link").addEventListener("click", () => {
  const data = currentComboData();
  if (!data) { flash("Generate or lock in a loadout first."); return; }
  const name = document.getElementById("combo-name").value.trim() || "My combo";
  copyText(shareUrl(name, data.theme, data.skins), () => flash("Share link copied"));
});

// ---------- SKIN PAGE ----------

let pricesByWear = {};

function similarSkins(skin, count) {
  const keys = Object.keys(THEME_COLORS);
  const base = colors[skin.name];
  const distance = other => {
    const c = colors[other.name];
    if (!base || !c) return 99;
    return keys.reduce((sum, k) => sum + Math.pow((base[k] || 0) - (c[k] || 0), 2), 0);
  };
  return allSkins
    .filter(s => s !== skin && s.weapon.name === skin.weapon.name && prices[s.name] !== undefined)
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, count);
}

function renderSkinPage() {
  const box = document.getElementById("skin-box");
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const skin = allSkins.find(s => s.name === (params.get("n") || ""));
  if (!skin) { box.innerHTML = '<p class="sub">Skin not found.</p>'; return; }

  const color = /^#[0-9a-f]{3,8}$/i.test(skin.rarity.color) ? skin.rarity.color : "#666";
  const desc = (skin.description || "").replace(/\\n/g, "\n").replace(/<[^>]*>/g, "").trim();
  const collections = (skin.collections || []).map(c => c.name).join(", ") || "None";
  const cases = (skin.crates || []).map(c => c.name).slice(0, 4).join(", ") || "None";

  const wearRows = (skin.wears || []).map(w => {
    const p = (pricesByWear[skin.name] || {})[w.name];
    const link = "https://csfloat.com/search?market_hash_name=" + encodeURIComponent(`${skin.name} (${w.name})`);
    return `<div class="wear-row">
      <span>${esc(w.name)}</span>
      <span class="${p !== undefined ? "wear-price" : "muted"}">${p !== undefined ? "€" + p.toFixed(2) : "No listings"}</span>
      <a class="buy-btn" href="${link}" target="_blank" rel="noopener">CSFloat ↗</a>
    </div>`;
  }).join("");

  const c = colors[skin.name];
  const bars = c
    ? Object.keys(THEME_COLORS).filter(k => (c[k] || 0) >= 0.02).sort((a, b) => c[b] - c[a]).map(k =>
        `<div class="bar-row"><span>${k}</span><div class="bar"><i style="width:${Math.round(c[k] * 100)}%;background:${THEME_COLORS[k]}"></i></div><span>${Math.round(c[k] * 100)}%</span></div>`
      ).join("")
    : '<p class="muted">No colour data for this skin.</p>';

  box.innerHTML = `
    <button class="btn-alt" id="skin-back">← Back</button>
    <div class="skin-hero" style="--rar:${color}">
      <div class="skin-img"><img src="${skin.image}" alt=""></div>
      <div class="skin-info">
        <h1>${esc(skin.name)}</h1>
        <div class="daily-tags">
          <span class="chip"><span class="dot" style="background:${color}"></span>${esc(skin.rarity.name)}</span>
          <span class="chip">${esc(skin.weapon.name)}</span>
          <span class="chip">${esc(skin.category.name)}</span>
          ${skin.stattrak ? '<span class="chip">StatTrak™ exists</span>' : ""}
          ${skin.souvenir ? '<span class="chip">Souvenir exists</span>' : ""}
        </div>
        ${desc ? `<p class="skin-desc">${esc(desc)}</p>` : ""}
        <div class="facts">
          <div class="gauge-row"><b>Float range</b>${floatGauge(skin)}</div>
          <div><b>Collection</b>${esc(collections)}</div>
          <div><b>Found in</b>${esc(cases)}</div>
        </div>
        <div class="combo-actions">
          <button class="btn-main" id="skin-lock">Lock in loadout</button>
          <button class="btn-alt" id="skin-copy">🔗 Copy link</button>
        </div>
      </div>
    </div>
    <div class="skin-cols">
      <div class="panel"><h2>Price by wear</h2>${wearRows}
        <p class="muted small">Regular versions only, prices from Skinport. CSFloat prices may differ.</p></div>
      <div class="panel"><h2>Colour breakdown</h2>${bars}</div>
    </div>
    <h2>Similar skins</h2>
    <div class="combo-grid" id="similar-grid"></div>
  `;

  document.getElementById("skin-back").addEventListener("click", () => {
    if (history.length > 1) history.back(); else location.hash = "#/browse";
  });
  document.getElementById("skin-lock").addEventListener("click", () => lockSkin(skin));
  document.getElementById("skin-copy").addEventListener("click", () => {
    const url = location.origin + location.pathname + "#/skin?n=" + encodeURIComponent(skin.name);
    copyText(url, () => flash("Link copied"));
  });
  fillCards(document.getElementById("similar-grid"), similarSkins(skin, 6));
}

// clicking a card (but not its buttons or dropdowns) opens the skin page
document.addEventListener("click", event => {
  const card = event.target.closest(".card");
  if (!card || event.target.closest("button, select, a, label, input")) return;
  const title = card.querySelector("h3");
  if (title) location.hash = "#/skin?n=" + encodeURIComponent(title.textContent);
});

function floatGauge(skin) {
  const zones = [["FN", 0, 0.07], ["MW", 0.07, 0.15], ["FT", 0.15, 0.38], ["WW", 0.38, 0.45], ["BS", 0.45, 1]];
  const min = Number(skin.min_float), max = Number(skin.max_float);
  const segments = zones.map(([label, from, to]) => `<span style="width:${(to - from) * 100}%">${label}</span>`).join("");
  return `
    <div class="gauge">
      <div class="zones">${segments}</div>
      <i class="shade" style="left:0;width:${min * 100}%"></i>
      <i class="shade" style="left:${max * 100}%;right:0"></i>
    </div>
    <p class="muted small">This skin ranges from ${min} to ${max}. The greyed-out part of the bar can't occur.</p>`;
}