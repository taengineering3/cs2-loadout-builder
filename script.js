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

  allSkins.sort(() => Math.random() - 0.5);

  const categories = new Set(allSkins.map(skin => skin.category.name));
  for (const name of categories) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    categoryBox.appendChild(option);
  }

  updateDisplay();
}

function updateDisplay() {
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

// ---------- LOCKED ITEMS ----------

const locked = {};

function lockSkin(skin) {
  const index = slots.findIndex(slot => slot.match(skin));

  if (index === -1) {
    alert("This weapon type isn't in the generator yet.");
    return;
  }
  if (prices[skin.name] === undefined) {
    alert("This skin has no price, so it can't be used in a budget.");
    return;
  }

  locked[index] = skin;
  document.getElementById("slot-" + index).checked = true;
  showLocked();
}

function showLocked() {
  const box = document.getElementById("locked-list");
  box.innerHTML = "";

  for (const index in locked) {
    const skin = locked[index];
    const item = document.createElement("div");
    item.className = "locked-item";
    item.innerHTML = `<span>🔒 ${slots[index].name}: ${skin.name} (€${prices[skin.name].toFixed(2)})</span> <button>Remove</button>`;
    item.querySelector("button").addEventListener("click", () => {
      delete locked[index];
      showLocked();
    });
    box.appendChild(item);
  }
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

loadSkins();