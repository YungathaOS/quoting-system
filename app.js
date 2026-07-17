/* =====================================================================
   YUNGATHA QUOTING TOOL — app.js
   Plain-language map for John:
   - TEAM_PASSWORD: the one shared password everyone types to get in.
   - PASSWORD_ENABLED: set to false to skip the password screen entirely.
   - firebaseConfig: paste your Firebase project keys here (see the
     "SETUP GUIDE" John was given — this is the ONLY technical part).
   - Everything below that just runs the calculator + syncs data.
   ===================================================================== */

const TEAM_PASSWORD = "YUNGATHA2026"; // <-- change this to whatever password you want the team to use
const PASSWORD_ENABLED = false; // <-- set this back to true to turn the password screen back on

const firebaseConfig = {
  apiKey: "AIzaSyA84NIadABkwzpLaqWZSSsOJEKvffGv_KM",
  authDomain: "yungatha-quoting.firebaseapp.com",
  projectId: "yungatha-quoting",
  storageBucket: "yungatha-quoting.firebasestorage.app",
  messagingSenderId: "1095710346724",
  appId: "1:1095710346724:web:5333fa15d20e783d238bf1"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------------- STATE ----------------
let currentUser = localStorage.getItem("yungatha_user") || null;
let TEAM = [];
let PRICE_LOOKUP = [];
let CLIENTS = [];
let TM_OVERRIDE = [];
let HISTORY = [];
let EXTRAS_ROW_IDS = [];
let EXTRAS_COUNTER = 0;
let QUOTE_CART = [];
let QA_MATCH_ID = null; // currently-matched Price Lookup item id in Quick Accessory/Labour Lookup, if any

// Default material type for the original raw materials list (used only when an
// item doesn't have its own materialType set yet — editing an item in Price
// Lookup and choosing a Material Type always wins over this default).
const DEFAULT_MATERIAL_TYPE = {
  "Ali 1.6mm": "Substrate", "Ali 2mm": "Substrate", "Corflute": "Substrate",
  "ACM / Signbond": "Substrate", "Steel": "Substrate", "Magnet": "Substrate",
  "Avery Workzone": "Vinyl", "Avery Permanent": "Vinyl", "Avery Fluro": "Vinyl",
  "Avery Orange": "Vinyl", "Non-Reflective Vinyl": "Vinyl", "Avery Prismatic": "Vinyl",
  "One Way Vision": "Vinyl",
  "Dura Cast + Laminate": "Overlay", "Frosting": "Overlay", "Anti-Graffiti": "Overlay",
  "UV Overlay": "Overlay",
  "Ink": "Other"
};
function materialTypeOf(item) {
  return item.materialType || DEFAULT_MATERIAL_TYPE[item.description] || "";
}

const TM_CONFIG_MAP = {
  "600|600|Corflute|Avery Workzone": "c600x600_workzone",
  "1200|300|Corflute|Avery Workzone": "c1200x300_workzone",
  "1200|600|Corflute|Avery Workzone": "c1200x600_workzone",
  "600|600|Corflute|Avery Orange": "c600x600_orange",
  "1200|600|Corflute|Avery Orange": "c1200x600_orange"
};

function tierMultiplier(tier) {
  switch (tier) {
    case "100%": return 2.0;
    case "110%": return 2.1;
    case "120%": return 2.2;
    case "140%": return 2.4;
    case "180%": return 2.8;
    default: return 0;
  }
}
function tierPriceField(tier) {
  switch (tier) {
    case "100%": return "p100";
    case "110%": return "p110";
    case "120%": return "p120";
    case "140%": return "p140";
    case "180%": return "p180";
    default: return null;
  }
}
function money(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "$" + Number(n).toFixed(2);
}
function round2(n) { return Math.round(n * 100) / 100; }
function escapeHtml(s) {
  return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---------------- PASSWORD GATE ----------------
function checkPassword() {
  const val = document.getElementById("passwordInput").value;
  if (val === TEAM_PASSWORD) {
    document.getElementById("screenPassword").style.display = "none";
    startAuthAndProceed();
  } else {
    document.getElementById("passwordError").textContent = "Wrong password, try again.";
  }
}
document.getElementById("passwordInput").addEventListener("keydown", e => {
  if (e.key === "Enter") checkPassword();
});

// If the password gate is turned off, skip straight past it on load.
if (!PASSWORD_ENABLED) {
  document.getElementById("screenPassword").style.display = "none";
  startAuthAndProceed();
}

function startAuthAndProceed() {
  auth.signInAnonymously().then(() => {
    // once signed in (invisible to the user), load team list then show name picker or app
    db.collection("team").onSnapshot(snap => {
      TEAM = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTeamList();
      if (currentUser && TEAM.some(t => t.name === currentUser)) {
        enterApp();
      } else {
        showNamePicker();
      }
    });
  }).catch(err => {
    document.getElementById("passwordError").textContent = "Could not connect: " + err.message;
  });
}

// ---------------- NAME PICKER ----------------
function showNamePicker() {
  document.getElementById("screenName").style.display = "flex";
  const list = document.getElementById("nameList");
  list.innerHTML = "";
  TEAM.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(t => {
    const btn = document.createElement("button");
    btn.className = "name-btn";
    btn.textContent = t.name;
    btn.onclick = () => selectUser(t.name);
    list.appendChild(btn);
  });
}
function addNewName() {
  const name = document.getElementById("newNameInput").value.trim();
  if (!name) return;
  db.collection("team").add({ name }).then(() => selectUser(name));
}
function selectUser(name) {
  currentUser = name;
  localStorage.setItem("yungatha_user", name);
  document.getElementById("screenName").style.display = "none";
  enterApp();
}
function switchUser() {
  currentUser = null;
  localStorage.removeItem("yungatha_user");
  document.getElementById("app").style.display = "none";
  showNamePicker();
}

// ---------------- ENTER APP ----------------
function enterApp() {
  document.getElementById("app").style.display = "block";
  document.getElementById("currentUserName").textContent = currentUser;
  attachListeners();
  if (EXTRAS_ROW_IDS.length === 0) addExtraRow();
}

function attachListeners() {
  db.collection("priceLookup").onSnapshot(snap => {
    PRICE_LOOKUP = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshDatalists();
    renderPriceLookupTable();
    calc();
  }, err => setSyncStatus(false));

  db.collection("clients").onSnapshot(snap => {
    CLIENTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshClientDatalist();
    renderClientTable();
  }, err => setSyncStatus(false));

  db.collection("tmOverride").onSnapshot(snap => {
    TM_OVERRIDE = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTmTable();
  }, err => setSyncStatus(false));

  db.collection("history").orderBy("ts", "desc").limit(300).onSnapshot(snap => {
    HISTORY = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHistoryTable();
    setSyncStatus(true);
  }, err => setSyncStatus(false));
}
function setSyncStatus(ok) {
  document.getElementById("syncDot").className = ok ? "" : "off";
}

function logHistory(action, details) {
  db.collection("history").add({
    who: currentUser,
    action,
    details: details || "",
    ts: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ---------------- TABS ----------------
function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
  event.target.classList.add("active");
}

// ---------------- MODAL HELPERS ----------------
function openModal(html) {
  document.getElementById("modalContent").innerHTML = html;
  document.getElementById("modalBackdrop").classList.add("active");
}
function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("active");
  document.getElementById("modalContent").innerHTML = "";
}

// ---------------- DATALISTS ----------------
function refreshDatalists() {
  const rawItems = PRICE_LOOKUP.filter(i => i.section === "RAW MATERIALS");
  const rawMaterials = rawItems.map(i => i.description);
  const byType = t => rawItems.filter(i => materialTypeOf(i) === t).map(i => i.description);

  fillDatalist("substrateList", byType("Substrate"));
  fillDatalist("matSubstrateList", byType("Substrate"));
  fillDatalist("vinylList", byType("Vinyl"));
  fillDatalist("matVinylList", byType("Vinyl"));
  fillDatalist("overlayList", byType("Overlay"));
  fillDatalist("matOverlayList", byType("Overlay"));
  // Extras should show the full material list, not just one type
  fillDatalist("extrasList", rawMaterials);
  fillDatalist("matExtrasList", rawMaterials);

  const cats = [...new Set(PRICE_LOOKUP.filter(i => i.category).map(i => i.category))];
  fillDatalist("accCategoryList", cats.length ? cats : (SEED_PRICE_CATEGORIES || []));

  // price lookup tab filters
  const sections = [...new Set(PRICE_LOOKUP.map(i => i.section).filter(Boolean))];
  fillSelect("plFilterSection", sections, true);
  const plCats = [...new Set(PRICE_LOOKUP.map(i => i.category).filter(Boolean))];
  fillSelect("plFilterCategory", plCats, true);

  // quick accessory/labour cascading lookup datalists
  const accItems = PRICE_LOOKUP.filter(i => i.section === "Accessories" || i.section === "Labour");
  const accCats = [...new Set(accItems.map(i => i.category).filter(Boolean))];
  fillDatalist("qaCategoryList", accCats.length ? accCats : (SEED_PRICE_CATEGORIES || []));
  qaCategoryChanged(true);
}
function refreshClientDatalist() {
  fillDatalist("clientListDatalist", CLIENTS.map(c => c.name));
  const cats = [...new Set(CLIENTS.filter(c => c.category).map(c => c.category))];
  fillDatalist("clientCatList", cats.length ? cats : (SEED_CLIENT_CATEGORIES || []));
  fillSelect("clFilterCategory", cats.length ? cats : (SEED_CLIENT_CATEGORIES || []), true);
  const tiers = [...new Set(CLIENTS.map(c => c.tier).filter(Boolean))];
  fillSelect("clFilterTier", tiers, true);
}
function fillDatalist(id, values) {
  const dl = document.getElementById(id);
  if (!dl) return;
  dl.innerHTML = "";
  [...new Set(values)].sort().forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  });
}
function fillSelect(id, values, keepAllOption) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = "";
  if (keepAllOption) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "All";
    sel.appendChild(opt);
  }
  [...new Set(values)].sort().forEach(v => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

// ---------------- CLIENT / TIER ----------------
function onClientChange() {
  const name = document.getElementById("qClient").value;
  const client = CLIENTS.find(c => c.name.toLowerCase() === name.toLowerCase());
  document.getElementById("qTier").value = client ? client.tier : "";
  document.getElementById("qMarkup").value = client ? markupLabel(client.tier) : "";
  document.getElementById("quoteCartClient").textContent = client ? ("Client: " + client.name + " (" + client.tier + ")") : "";
  calc();
}
function markupLabel(tier) {
  const m = { "100%": "x 2.0", "110%": "x 2.1", "120%": "x 2.2", "140%": "x 2.4", "180%": "x 2.8", "TM": "TM - check override rates", "MRWA": "MRWA - enter manually" };
  return m[tier] || "";
}
function currentTier() {
  return document.getElementById("qTier").value;
}
function rawRate(materialName) {
  if (!materialName) return null;
  const item = PRICE_LOOKUP.find(i => i.section === "RAW MATERIALS" && i.description.toLowerCase() === materialName.toLowerCase());
  return item ? item.p100 : null;
}
function tierPriceForItem(item, tier) {
  if (!item) return null;
  if (tier === "TM" || tier === "MRWA") return item.p140;
  const field = tierPriceField(tier);
  return field ? item[field] : null;
}

// ---------------- SECTION 2 -> SECTION 3 SYNC ----------------
// Correcting Substrate/Vinyl/Overlay/Extras in "Size & Price Lookup" always
// overwrites the matching Custom Sign Builder field, so a fixed mistake there
// always carries through. Editing the Sign Builder fields directly (without
// touching Section 2) is NOT overwritten by unrelated recalculations.
function qSubstrateChanged() {
  document.getElementById("sbSubstrate").value = document.getElementById("qSubstrate").value;
  calc();
}
function qVinylChanged() {
  document.getElementById("sbVinyl").value = document.getElementById("qVinyl").value;
  calc();
}
function qOverlayChanged() {
  document.getElementById("sbOverlay").value = document.getElementById("qOverlay").value;
  calc();
}
function qExtrasChanged() {
  document.getElementById("sbExtras").value = document.getElementById("qExtras").value;
  calc();
}

// ---------------- MAIN CALCULATOR ----------------
function calc() {
  const tier = currentTier();
  const w = parseFloat(document.getElementById("qW").value);
  const h = parseFloat(document.getElementById("qH").value);
  const substrate = document.getElementById("qSubstrate").value;
  const vinyl = document.getElementById("qVinyl").value;
  const overlay = document.getElementById("qOverlay").value;
  const extras = document.getElementById("qExtras").value;

  const sqm = (w > 0 && h > 0) ? (w * h) / 1000000 : null;
  document.getElementById("qSqm").textContent = sqm ? sqm.toFixed(3) : "—";

  // --- Section 2: standard size/price lookup ---
  let stdPrice = null, stdNote = "";
  if (!document.getElementById("qClient").value) {
    stdNote = "Select client first";
  } else if (tier === "TM") {
    const mapKey = [w, h, substrate, vinyl].join("|");
    const col = TM_CONFIG_MAP[mapKey];
    if (!col) {
      stdNote = "TM - check override rates (not a listed TM config)";
    } else {
      const client = document.getElementById("qClient").value;
      const row = TM_OVERRIDE.find(r => r.client && r.client.toLowerCase() === client.toLowerCase());
      const price = row ? row[col] : null;
      if (price === null || price === undefined) stdNote = "No rate set - check with Sales Manager";
      else stdPrice = price;
    }
  } else if (tier === "MRWA") {
    stdNote = "MRWA - enter manually";
  } else if (tier) {
    const field = tierPriceField(tier);
    const match = PRICE_LOOKUP.find(i => i.section === "Standard" && String(i.w) === String(w) && String(i.h) === String(h) &&
      (i.substrate || "") === substrate && (i.vinyl || "") === vinyl && (i.overlay || "") === overlay);
    if (match) {
      stdPrice = match[field];
      if (extras) {
        const extraRate = rawRate(extras);
        if (extraRate !== null && sqm) stdPrice += extraRate * sqm * tierMultiplier(tier);
      }
    } else {
      stdNote = "Not found - use Sign Builder below";
    }
  } else {
    stdNote = "Select client first";
  }
  document.getElementById("qStdPrice").textContent = stdPrice !== null ? money(stdPrice) : "—";
  document.getElementById("qStdNote").textContent = stdNote;

  // --- Section 3: custom sign builder ---
  let rawCost = 0;
  const materials = {
    Substrate: substrate, Vinyl: vinyl, Overlay: overlay, Extras: extras, Ink: "Ink"
  };
  ["Substrate", "Vinyl", "Overlay", "Extras", "Ink"].forEach(layer => {
    const prefix = "sb" + layer;
    const matInputId = prefix; // sbSubstrate, sbVinyl, etc.
    let matVal;
    if (layer === "Ink") { matVal = "Ink"; }
    else { matVal = document.getElementById(matInputId).value; }
    const rate = rawRate(matVal);
    document.getElementById(prefix + "Rate").textContent = rate !== null ? money(rate) + "/sqm" : "—";
    const include = document.getElementById(prefix + "Inc").value;
    const cost = (include === "YES" && rate !== null && sqm) ? rate * sqm : null;
    document.getElementById(prefix + "Cost").textContent = cost !== null ? money(cost) : "—";
    if (cost !== null) rawCost += cost;
  });

  document.getElementById("rRaw").textContent = rawCost ? money(rawCost) : "—";
  const wastage = rawCost ? rawCost * 0.15 : null;
  document.getElementById("rWastage").textContent = wastage !== null ? money(wastage) : "—";
  const rawPlusWastage = rawCost ? rawCost + wastage : null;
  document.getElementById("rRawWastage").textContent = rawPlusWastage !== null ? money(rawPlusWastage) : "—";

  const override = parseFloat(document.getElementById("qOverride").value);
  let markupMult = null, markupLabelText = "—";
  if (override > 0) {
    markupMult = override;
    markupLabelText = "CUSTOM x" + override.toFixed(1);
  } else if (tierMultiplier(tier) > 0) {
    markupMult = tierMultiplier(tier);
    markupLabelText = "x " + markupMult.toFixed(1);
  } else if (tier === "TM") {
    markupLabelText = "TM - not available for custom builder, use TM Override tab";
  } else if (tier === "MRWA") {
    markupLabelText = "MRWA - enter manually";
  } else {
    markupLabelText = "Select client";
  }
  document.getElementById("rMarkupLabel").textContent = markupLabelText;

  const costMarkup = (rawPlusWastage !== null && markupMult !== null) ? rawPlusWastage * markupMult : null;
  document.getElementById("rCostMarkup").textContent = costMarkup !== null ? money(costMarkup) : "—";

  // --- Section 4: extras rows (plain text add-on, qty x price) ---
  const extrasTotal = calcExtrasTotal();
  document.getElementById("qExtrasTotal").textContent = extrasTotal ? money(extrasTotal) : "—";
  document.getElementById("rExtrasLine").textContent = extrasTotal ? money(extrasTotal) : "—";

  const qty = parseFloat(document.getElementById("qQty").value) || 1;
  const baseSell = costMarkup !== null ? costMarkup * qty : (stdPrice !== null ? stdPrice * qty : null);
  const sell = baseSell !== null ? baseSell + extrasTotal : (extrasTotal ? extrasTotal : null);
  document.getElementById("rSell").textContent = sell !== null ? money(sell) : "—";

  window._lastCalc = { tier, w, h, substrate, vinyl, overlay, sqm, rawCost, wastage, rawPlusWastage, markupMult, costMarkup, extrasTotal, qty, sell, stdPrice };
}

function resetQuote() {
  // Clears every field on the Quote Calculator tab, including the Quick
  // Accessory/Labour Lookup and (with confirmation) the current Quote cart.
  if (QUOTE_CART.length && !confirm("This will also clear the " + QUOTE_CART.length + " line(s) currently in your Quote. Continue with Reset ALL?")) return;

  ["qW", "qH", "qSubstrate", "qVinyl", "qOverlay", "qExtras", "qOverride", "sbSubstrate", "sbVinyl", "sbOverlay", "sbExtras"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("qQty").value = 1;
  ["sbSubstrateInc", "sbVinylInc", "sbOverlayInc", "sbExtrasInc", "sbInkInc"].forEach(id => document.getElementById(id).value = "YES");
  document.getElementById("qClient").value = "";
  document.getElementById("qTier").value = "";
  document.getElementById("qMarkup").value = "";
  document.getElementById("qaCategory").value = "";
  document.getElementById("qaType").value = "";
  document.getElementById("qaDimension").value = "";
  document.getElementById("qAccPrice").value = "";
  document.getElementById("qNewItemPrice").value = "";
  document.getElementById("qaQty").value = 1;
  QA_MATCH_ID = null;
  qaEvalMatch();
  EXTRAS_ROW_IDS.slice().forEach(id => removeExtraRow(id, true));
  addExtraRow();
  QUOTE_CART = [];
  renderQuoteCart();
  calc();
  logHistory("Reset ALL quote fields", "");
}

// ---------------- EXTRAS (Section 4) — plain text add-on, qty x unit price ----------------
function addExtraRow() {
  const id = ++EXTRAS_COUNTER;
  EXTRAS_ROW_IDS.push(id);
  const container = document.getElementById("extrasRows");
  const div = document.createElement("div");
  div.className = "extras-row";
  div.id = "extraRow_" + id;
  div.innerHTML = `
    <div><label>Add-on</label><input type="text" placeholder="Describe the add-on" id="extraAddon_${id}" oninput="calc()"></div>
    <div><label>Qty</label><input type="number" min="0" step="1" value="1" id="extraQty_${id}" oninput="calc()"></div>
    <div><label>Unit Price</label><input type="number" step="0.01" id="extraPrice_${id}" oninput="calc()"></div>
    <div><label>Line Price</label><input class="editable-input" readonly id="extraLine_${id}" value="—"></div>
    <div><button class="danger small-btn" type="button" onclick="removeExtraRow(${id})">✕</button></div>`;
  container.appendChild(div);
  calc();
}
function removeExtraRow(id, skipCalc) {
  const el = document.getElementById("extraRow_" + id);
  if (el) el.remove();
  EXTRAS_ROW_IDS = EXTRAS_ROW_IDS.filter(x => x !== id);
  if (!skipCalc) calc();
}
function calcExtrasTotal() {
  let total = 0;
  EXTRAS_ROW_IDS.forEach(id => {
    const qtyEl = document.getElementById("extraQty_" + id);
    const priceEl = document.getElementById("extraPrice_" + id);
    const lineEl = document.getElementById("extraLine_" + id);
    if (!qtyEl || !priceEl || !lineEl) return;
    const qty = parseFloat(qtyEl.value) || 0;
    const price = parseFloat(priceEl.value) || 0;
    const line = qty * price;
    lineEl.value = (qty || price) ? money(line) : "—";
    total += line;
  });
  return round2(total);
}

// ---------------- ADD SIGN TO PRICE LOOKUP ----------------
function addSignToLookup() {
  const c = window._lastCalc;
  if (!c || !c.w || !c.h || !c.substrate) {
    alert("Fill in W, H and Substrate first.");
    return;
  }
  if (!c.rawPlusWastage) {
    alert("Custom Sign Builder has no valid RAW + WASTAGE total yet - fill in materials first.");
    return;
  }
  const key = [c.w, c.h, c.substrate, c.vinyl || "", c.overlay || ""].join("|");
  if (PRICE_LOOKUP.some(i => i.key === key)) {
    alert("This exact config is already in the Price Lookup (key: " + key + ").");
    return;
  }
  const desc = `${c.w}x${c.h}mm | ${c.substrate}` + (c.vinyl ? ` | ${c.vinyl}` : "") + (c.overlay ? ` | ${c.overlay}` : "");
  const item = {
    key, section: "Standard", description: desc, itemNumber: nextItemNumber("SIGN"), w: c.w, h: c.h,
    substrate: c.substrate, vinyl: c.vinyl || "", overlay: c.overlay || "",
    p100: round2(c.rawPlusWastage * 2), p110: round2(c.rawPlusWastage * 2.1),
    p120: round2(c.rawPlusWastage * 2.2), p140: round2(c.rawPlusWastage * 2.4),
    p180: round2(c.rawPlusWastage * 2.8),
    notes: "Added from Sign Builder " + new Date().toLocaleDateString("en-AU"),
    category: "", type: "", dimensions: "", materialType: ""
  };
  db.collection("priceLookup").add(item).then(() => {
    logHistory("Added new sign to Price Lookup", desc);
    alert("Added: " + desc);
  });
}
function nextItemNumber(prefix) {
  const n = PRICE_LOOKUP.length + 1;
  return prefix + "-" + String(n).padStart(4, "0");
}

// ---------------- QUICK ACCESSORY / LABOUR LOOKUP (cascading, select-or-add-new) ----------------
function qaCategoryChanged(silent) {
  const cat = document.getElementById("qaCategory").value;
  const items = PRICE_LOOKUP.filter(i => (i.section === "Accessories" || i.section === "Labour") && (!cat || (i.category || "") === cat));
  const types = [...new Set(items.map(i => i.type).filter(Boolean))];
  fillDatalist("qaTypeList", types);
  if (!silent) { document.getElementById("qaType").value = ""; document.getElementById("qaDimension").value = ""; qaEvalMatch(); }
}
function qaTypeChanged() {
  const cat = document.getElementById("qaCategory").value;
  const type = document.getElementById("qaType").value;
  const items = PRICE_LOOKUP.filter(i => (i.section === "Accessories" || i.section === "Labour") && (!cat || (i.category || "") === cat) && (!type || (i.type || "") === type));
  const dims = [...new Set(items.map(i => i.dimensions).filter(Boolean))];
  fillDatalist("qaDimensionList", dims);
  document.getElementById("qaDimension").value = "";
  qaEvalMatch();
}
function qaDimensionChanged() { qaEvalMatch(); }
function qaEvalMatch() {
  const cat = document.getElementById("qaCategory").value.trim();
  const type = document.getElementById("qaType").value.trim();
  const dim = document.getElementById("qaDimension").value.trim();
  const priceEl = document.getElementById("qAccPrice");
  const noteEl = document.getElementById("qaAddNote");
  const btnEl = document.getElementById("qaAddBtn");
  const newPriceInput = document.getElementById("qNewItemPrice");
  if (!cat && !type && !dim) {
    priceEl.value = "";
    noteEl.textContent = "Fill in Category / Type / Dimension above.";
    btnEl.textContent = "➕ Add to Price Lookup";
    QA_MATCH_ID = null;
    return;
  }
  const item = PRICE_LOOKUP.find(i => (i.section === "Accessories" || i.section === "Labour") &&
    (i.category || "") === cat && (i.type || "") === type && (i.dimensions || "") === dim);
  const tier = currentTier();
  if (item) {
    const price = tierPriceForItem(item, tier);
    priceEl.value = price !== null && price !== undefined ? money(price) : "—";
    noteEl.textContent = "Already in Price Lookup — enter a new price below to update it at your current tier.";
    btnEl.textContent = "🔄 Update Price in Lookup";
    if (price !== null && price !== undefined) newPriceInput.value = price;
    QA_MATCH_ID = item.id;
  } else {
    priceEl.value = "Not found";
    noteEl.textContent = "Not in Price Lookup yet — enter a price at your current tier to add it.";
    btnEl.textContent = "➕ Add to Price Lookup";
    QA_MATCH_ID = null;
  }
}
function addAccessory() {
  const tier = currentTier();
  const mult = tierMultiplier(tier);
  if (!mult) { alert("Select a client on a standard tier (100/110/120/140/180%) before adding or updating a priced item.\nTM and MRWA don't have a fixed multiplier to calculate the other tiers from."); return; }
  const category = document.getElementById("qaCategory").value.trim();
  const type = document.getElementById("qaType").value.trim();
  const dimensions = document.getElementById("qaDimension").value.trim();
  const enteredPrice = parseFloat(document.getElementById("qNewItemPrice").value);
  if ((!category && !type && !dimensions) || isNaN(enteredPrice)) { alert("Fill in Category / Type / Dimension and a price at the current tier first."); return; }

  if (QA_MATCH_ID) {
    // update just this tier's price on the existing item
    const field = tierPriceField(tier) || "p140";
    db.collection("priceLookup").doc(QA_MATCH_ID).update({ [field]: round2(enteredPrice) }).then(() => {
      logHistory("Updated accessory/labour price", [category, type, dimensions].filter(Boolean).join(" - ") + " (" + tier + ")");
      alert("Updated the " + tier + " price.");
      qaEvalMatch();
    });
    return;
  }

  const itemName = [category, type, dimensions].filter(Boolean).join(" - ");
  if (PRICE_LOOKUP.some(i => i.description.toLowerCase() === itemName.toLowerCase())) { alert("'" + itemName + "' is already in the list. It should have been picked up automatically — try re-selecting Category/Type/Dimension."); return; }
  const base100 = enteredPrice / mult;
  const item = {
    key: "|||" + itemName + "||", section: "Accessories", description: itemName, itemNumber: nextItemNumber("ACC"),
    substrate: itemName, w: null, h: null, vinyl: "", overlay: "",
    p100: round2(base100 * 2), p110: round2(base100 * 2.1), p120: round2(base100 * 2.2),
    p140: round2(base100 * 2.4), p180: round2(base100 * 2.8),
    notes: "Entered at " + tier + " tier - added " + new Date().toLocaleDateString("en-AU"),
    category, type, dimensions
  };
  db.collection("priceLookup").add(item).then(() => {
    logHistory("Added new accessory/labour item", itemName + " (" + category + ")");
    document.getElementById("qNewItemPrice").value = "";
    alert("Added '" + itemName + "' — all 5 tiers calculated from the " + tier + " price.");
  });
}
function addAccessoryToQuote() {
  const category = document.getElementById("qaCategory").value.trim();
  const type = document.getElementById("qaType").value.trim();
  const dimensions = document.getElementById("qaDimension").value.trim();
  const desc = [category, type, dimensions].filter(Boolean).join(" - ");
  if (!desc) { alert("Fill in Category / Type / Dimension first."); return; }
  const qty = parseFloat(document.getElementById("qaQty").value) || 1;
  const tier = currentTier();
  let price = null, itemNumber = null;
  if (QA_MATCH_ID) {
    const item = PRICE_LOOKUP.find(i => i.id === QA_MATCH_ID);
    price = tierPriceForItem(item, tier);
    itemNumber = (item && item.itemNumber) || nextItemNumber("ACC");
  } else {
    price = parseFloat(document.getElementById("qNewItemPrice").value);
    if (isNaN(price)) price = null;
    itemNumber = nextItemNumber("ACC");
  }
  if (price === null || price === undefined || isNaN(price)) { alert("No price available yet — look it up (select a matching Category/Type/Dimension) or type a price in the box above first."); return; }
  const client = document.getElementById("qClient").value || "(no client selected)";
  QUOTE_CART.push({
    client, qty, itemNumber, description: desc,
    unitPrice: round2(price), lineTotal: round2(price * qty)
  });
  renderQuoteCart();
  logHistory("Added accessory/labour line to quote", desc);
}

// ---------------- ADD TO QUOTE / QUOTE CART / EXPORT ----------------
function addToQuote() {
  const c = window._lastCalc;
  if (!c || (c.sell === null && !c.extrasTotal)) { alert("Nothing to add yet — fill in the quote calculator first."); return; }
  const client = document.getElementById("qClient").value || "(no client selected)";
  const unitPrice = c.costMarkup !== null ? c.costMarkup : c.stdPrice;
  const desc = describeCurrentSign();
  QUOTE_CART.push({
    client,
    qty: c.qty,
    itemNumber: nextItemNumber("SIGN"),
    description: desc,
    unitPrice: unitPrice !== null ? round2(unitPrice) : 0,
    lineTotal: round2((unitPrice !== null ? unitPrice * c.qty : 0) + (c.extrasTotal || 0))
  });
  renderQuoteCart();
  logHistory("Added line to quote", desc);
}
function describeCurrentSign() {
  const w = document.getElementById("qW").value;
  const h = document.getElementById("qH").value;
  const substrate = document.getElementById("qSubstrate").value || document.getElementById("sbSubstrate").value;
  const vinyl = document.getElementById("qVinyl").value || document.getElementById("sbVinyl").value;
  let desc = "";
  if (w && h) desc += `${w}x${h}mm`;
  if (substrate) desc += (desc ? " | " : "") + substrate;
  if (vinyl) desc += (desc ? " | " : "") + vinyl;
  return desc || "Custom sign";
}
function renderQuoteCart() {
  const tbody = document.getElementById("quoteCartBody");
  tbody.innerHTML = "";
  let total = 0;
  QUOTE_CART.forEach((line, idx) => {
    total += line.lineTotal;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${line.qty}</td><td>${escapeHtml(line.itemNumber)}</td><td>${escapeHtml(line.description)}</td><td>${money(line.unitPrice)}</td><td>${money(line.lineTotal)}</td><td><button class="danger small-btn" onclick="removeQuoteLine(${idx})">✕</button></td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("quoteCartTotal").textContent = money(total);
  const client = QUOTE_CART.length ? QUOTE_CART[QUOTE_CART.length - 1].client : "";
  document.getElementById("quoteCartClient").textContent = client ? ("Client: " + client) : "";
}
function removeQuoteLine(idx) {
  QUOTE_CART.splice(idx, 1);
  renderQuoteCart();
}
function clearQuoteCart() {
  if (QUOTE_CART.length && !confirm("Clear the whole quote?")) return;
  QUOTE_CART = [];
  renderQuoteCart();
}
function exportQuoteExcel() {
  if (!QUOTE_CART.length) { alert("Quote is empty — add lines first."); return; }
  const client = QUOTE_CART[QUOTE_CART.length - 1].client;
  const rows = QUOTE_CART.map(l => ({
    "Quantity": l.qty, "Item Number": l.itemNumber, "Description": l.description,
    "Price": l.unitPrice, "Total Line Price": l.lineTotal
  }));
  const total = QUOTE_CART.reduce((s, l) => s + l.lineTotal, 0);
  rows.push({ "Quantity": "", "Item Number": "", "Description": "TOTAL (ex GST)", "Price": "", "Total Line Price": round2(total) });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.sheet_add_aoa(ws, [["Client:", client]], { origin: -1 });
  XLSX.utils.book_append_sheet(wb, ws, "Quote");
  XLSX.writeFile(wb, "Yungatha_Quote_" + client.replace(/[^a-z0-9]/gi, "_") + ".xlsx");
  logHistory("Exported quote to Excel", client);
}
function exportQuotePdf() {
  if (!QUOTE_CART.length) { alert("Quote is empty — add lines first."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const client = QUOTE_CART[QUOTE_CART.length - 1].client;
  doc.setFontSize(16);
  doc.text("YUNGATHA — QUOTE", 14, 18);
  doc.setFontSize(10);
  doc.text("Client: " + client, 14, 26);
  doc.text("Date: " + new Date().toLocaleDateString("en-AU"), 14, 32);
  const rows = QUOTE_CART.map(l => [l.qty, l.itemNumber, l.description, money(l.unitPrice), money(l.lineTotal)]);
  const total = QUOTE_CART.reduce((s, l) => s + l.lineTotal, 0);
  doc.autoTable({
    startY: 38,
    head: [["Quantity", "Item Number", "Description", "Price", "Total Line Price"]],
    body: rows,
    foot: [["", "", "", "TOTAL (ex GST)", money(round2(total))]],
    theme: "grid"
  });
  doc.save("Yungatha_Quote_" + client.replace(/[^a-z0-9]/gi, "_") + ".pdf");
  logHistory("Exported quote to PDF", client);
}

// ---------------- PRICE LOOKUP TABLE + CRUD ----------------
function renderPriceLookupTable() {
  const search = (document.getElementById("plSearch")?.value || "").toLowerCase();
  const sectionFilter = document.getElementById("plFilterSection")?.value || "";
  const catFilter = document.getElementById("plFilterCategory")?.value || "";
  const tbody = document.getElementById("plTableBody");
  tbody.innerHTML = "";
  PRICE_LOOKUP.filter(i => i.description && i.description.toLowerCase().includes(search))
    .filter(i => !sectionFilter || i.section === sectionFilter)
    .filter(i => !catFilter || i.category === catFilter)
    .sort((a, b) => (a.section || "").localeCompare(b.section) || (a.description || "").localeCompare(b.description))
    .forEach(i => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input type="checkbox" class="plCheck" value="${i.id}"></td><td>${escapeHtml(i.section)}</td><td>${escapeHtml(i.description)}</td><td>${escapeHtml(i.category)}</td><td>${escapeHtml(i.section === "RAW MATERIALS" ? materialTypeOf(i) : "")}</td><td>${money(i.p100)}</td><td>${money(i.p110)}</td><td>${money(i.p120)}</td><td>${money(i.p140)}</td><td>${money(i.p180)}</td><td class="small">${escapeHtml(i.notes)}</td><td><button class="secondary small-btn" onclick="openEditItemModal('${i.id}')">Edit</button> <button class="danger small-btn" onclick="deletePriceLookupItem('${i.id}')">Del</button></td>`;
      tbody.appendChild(tr);
    });
}
function togglePlSelectAll(cb) {
  document.querySelectorAll(".plCheck").forEach(c => c.checked = cb.checked);
}
function bulkDeletePriceLookup() {
  const ids = [...document.querySelectorAll(".plCheck:checked")].map(c => c.value);
  if (!ids.length) { alert("Select at least one row first."); return; }
  if (!confirm("Delete " + ids.length + " item(s) from Price Lookup? This can't be undone.")) return;
  const batch = db.batch();
  ids.forEach(id => batch.delete(db.collection("priceLookup").doc(id)));
  batch.commit().then(() => logHistory("Bulk deleted price lookup items", ids.length + " item(s)"));
}
function deletePriceLookupItem(id) {
  const item = PRICE_LOOKUP.find(i => i.id === id);
  if (!confirm("Delete '" + (item ? item.description : id) + "'?")) return;
  db.collection("priceLookup").doc(id).delete().then(() => logHistory("Deleted price lookup item", item ? item.description : id));
}
function itemFormFields(i) {
  i = i || {};
  const mt = materialTypeOf(i);
  const mtOptions = ["", "Substrate", "Vinyl", "Overlay", "Other"].map(v => `<option value="${v}" ${v === mt ? "selected" : ""}>${v || "(none)"}</option>`).join("");
  return `
    <label>Section</label><input class="editable-input" id="mSection" value="${escapeAttr(i.section || "")}">
    <label>Description</label><input class="editable-input" id="mDescription" value="${escapeAttr(i.description || "")}">
    <label>Material Type <span class="small">(RAW MATERIALS only — controls which dropdown it shows up in)</span></label>
    <select class="editable-input" id="mMaterialType">${mtOptions}</select>
    <label>Category</label><input class="editable-input" id="mCategory" value="${escapeAttr(i.category || "")}">
    <label>Type</label><input class="editable-input" id="mType" value="${escapeAttr(i.type || "")}">
    <label>Dimensions</label><input class="editable-input" id="mDimensions" value="${escapeAttr(i.dimensions || "")}">
    <label>W (mm)</label><input class="editable-input" type="number" id="mW" value="${i.w ?? ""}">
    <label>H (mm)</label><input class="editable-input" type="number" id="mH" value="${i.h ?? ""}">
    <label>Substrate</label><input class="editable-input" id="mSubstrate" value="${escapeAttr(i.substrate || "")}">
    <label>Vinyl</label><input class="editable-input" id="mVinyl" value="${escapeAttr(i.vinyl || "")}">
    <label>Overlay</label><input class="editable-input" id="mOverlay" value="${escapeAttr(i.overlay || "")}">
    <label>100% price</label><input class="editable-input" type="number" step="0.01" id="mP100" value="${i.p100 ?? ""}">
    <label>110% price</label><input class="editable-input" type="number" step="0.01" id="mP110" value="${i.p110 ?? ""}">
    <label>120% price</label><input class="editable-input" type="number" step="0.01" id="mP120" value="${i.p120 ?? ""}">
    <label>140% price</label><input class="editable-input" type="number" step="0.01" id="mP140" value="${i.p140 ?? ""}">
    <label>180% price</label><input class="editable-input" type="number" step="0.01" id="mP180" value="${i.p180 ?? ""}">
    <label>Notes</label><input class="editable-input" id="mNotes" value="${escapeAttr(i.notes || "")}">
  `;
}
function openAddItemModal() {
  openModal(`<span class="close-x" onclick="closeModal()">✕</span><h3>Add Price Lookup Item</h3>${itemFormFields({})}<button onclick="saveNewItem()">Save</button>`);
}
function saveNewItem() {
  const item = readItemForm();
  if (!item.description) { alert("Description is required."); return; }
  item.key = [item.w || "", item.h || "", item.substrate || "", item.vinyl || "", item.overlay || "", item.description].join("|");
  item.itemNumber = nextItemNumber("PL");
  db.collection("priceLookup").add(item).then(() => {
    logHistory("Added price lookup item", item.description);
    closeModal();
  });
}
function openEditItemModal(id) {
  const i = PRICE_LOOKUP.find(x => x.id === id);
  if (!i) return;
  openModal(`<span class="close-x" onclick="closeModal()">✕</span><h3>Edit Price Lookup Item</h3>${itemFormFields(i)}<button onclick="savePriceLookupEdit('${id}')">Save</button>`);
}
function readItemForm() {
  return {
    section: document.getElementById("mSection").value.trim(),
    description: document.getElementById("mDescription").value.trim(),
    materialType: document.getElementById("mMaterialType").value,
    category: document.getElementById("mCategory").value.trim(),
    type: document.getElementById("mType").value.trim(),
    dimensions: document.getElementById("mDimensions").value.trim(),
    w: parseFloat(document.getElementById("mW").value) || null,
    h: parseFloat(document.getElementById("mH").value) || null,
    substrate: document.getElementById("mSubstrate").value.trim(),
    vinyl: document.getElementById("mVinyl").value.trim(),
    overlay: document.getElementById("mOverlay").value.trim(),
    p100: parseFloat(document.getElementById("mP100").value),
    p110: parseFloat(document.getElementById("mP110").value),
    p120: parseFloat(document.getElementById("mP120").value),
    p140: parseFloat(document.getElementById("mP140").value),
    p180: parseFloat(document.getElementById("mP180").value),
    notes: document.getElementById("mNotes").value.trim()
  };
}
function savePriceLookupEdit(id) {
  const item = readItemForm();
  db.collection("priceLookup").doc(id).update(item).then(() => {
    logHistory("Edited price lookup item", item.description);
    closeModal();
  });
}

// ---------------- IMPORT FILE PARSING (CSV, Excel, macro-enabled Excel) ----------------
function parseImportFile(file, callback) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: results => callback(results.data),
      error: err => alert("Could not read file: " + err.message)
    });
  } else if (["xlsx", "xls", "xlsm"].includes(ext)) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        callback(rows);
      } catch (err) {
        alert("Could not read file: " + err.message);
      }
    };
    reader.onerror = () => alert("Could not read file.");
    reader.readAsArrayBuffer(file);
  } else {
    alert("Unsupported file type '." + ext + "'. Please use .csv, .xlsx, .xls or .xlsm.");
  }
}

// ---------------- PRICE LOOKUP IMPORT (CSV / Excel) ----------------
function handlePriceLookupCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  parseImportFile(file, rows => promptImportMode(rows, importPriceLookupRows));
  event.target.value = "";
}
function promptImportMode(rows, importFn) {
  openModal(`
    <span class="close-x" onclick="closeModal()">✕</span>
    <h3>Import ${rows.length} row(s)</h3>
    <p class="small">Choose how to handle the existing data:</p>
    <label><input type="radio" name="importMode" value="replace"> Clear everything currently existing, then upload this file</label>
    <label><input type="radio" name="importMode" value="skipDupes" checked> Skip duplicates — only add rows that aren't already in the list</label>
    <label><input type="radio" name="importMode" value="appendAll"> Just add straight on (don't check for duplicates)</label>
    <button onclick="runImport()">Import</button>
  `);
  window._pendingImport = { rows, importFn };
}
function runImport() {
  const mode = document.querySelector('input[name="importMode"]:checked')?.value || "skipDupes";
  const { rows, importFn } = window._pendingImport || {};
  if (!rows) return;
  importFn(rows, mode);
  closeModal();
}
function importPriceLookupRows(rows, mode) {
  const collection = db.collection("priceLookup");
  const existingKeys = new Set(PRICE_LOOKUP.map(i => (i.description || "").toLowerCase()));
  const finish = () => {
    let toAdd = rows.map(csvRowToPriceLookupItem).filter(r => r.description);
    if (mode === "skipDupes") toAdd = toAdd.filter(r => !existingKeys.has(r.description.toLowerCase()));
    let batch = db.batch(); let count = 0; const commits = [];
    toAdd.forEach(item => {
      const ref = collection.doc();
      batch.set(ref, item);
      count++;
      if (count % 400 === 0) { commits.push(batch.commit()); batch = db.batch(); }
    });
    commits.push(batch.commit());
    Promise.all(commits).then(() => {
      logHistory("Imported price lookup file (" + mode + ")", toAdd.length + " row(s)");
      alert("Imported " + toAdd.length + " row(s).");
    });
  };
  if (mode === "replace") {
    deleteAllInCollection("priceLookup").then(finish);
  } else {
    finish();
  }
}
function csvRowToPriceLookupItem(row) {
  const get = (...keys) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== "") return row[k]; } return ""; };
  const num = v => v === "" || v === undefined ? null : parseFloat(v);
  return {
    section: get("Section", "section") || "Standard",
    description: get("Description", "description"),
    itemNumber: get("Item Number", "itemNumber", "Item Number ") || nextItemNumber("PL"),
    materialType: get("Material Type", "materialType"),
    category: get("Category", "category"),
    type: get("Type", "type"),
    dimensions: get("Dimensions", "dimensions"),
    w: num(get("W", "w")),
    h: num(get("H", "h")),
    substrate: get("Substrate", "substrate"),
    vinyl: get("Vinyl", "vinyl"),
    overlay: get("Overlay", "overlay"),
    p100: num(get("100%", "p100", "P100")),
    p110: num(get("110%", "p110", "P110")),
    p120: num(get("120%", "p120", "P120")),
    p140: num(get("140%", "p140", "P140")),
    p180: num(get("180%", "p180", "P180")),
    notes: get("Notes", "notes"),
    key: [get("W", "w"), get("H", "h"), get("Substrate", "substrate"), get("Vinyl", "vinyl"), get("Overlay", "overlay"), get("Description", "description")].join("|")
  };
}
function deleteAllInCollection(name) {
  return db.collection(name).get().then(snap => {
    let batch = db.batch(); let count = 0; const commits = [];
    snap.docs.forEach(d => {
      batch.delete(d.ref);
      count++;
      if (count % 400 === 0) { commits.push(batch.commit()); batch = db.batch(); }
    });
    commits.push(batch.commit());
    return Promise.all(commits);
  });
}

// ---------------- CLIENTS ----------------
function newClientCategoryChanged() {
  suggestTierFromCategory(document.getElementById("newClientCategory").value, "newClientTier");
}
function suggestTierFromCategory(category, tierSelectId) {
  const cat = (category || "").trim();
  if (!cat) return;
  const matches = CLIENTS.filter(c => (c.category || "").toLowerCase() === cat.toLowerCase() && c.tier);
  if (!matches.length) return;
  const counts = {};
  matches.forEach(c => { counts[c.tier] = (counts[c.tier] || 0) + 1; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best) document.getElementById(tierSelectId).value = best[0];
}
function addClient() {
  const name = document.getElementById("newClientName").value.trim();
  const category = document.getElementById("newClientCategory").value.trim();
  const tier = document.getElementById("newClientTier").value;
  if (!name) { alert("Enter a client name."); return; }
  if (CLIENTS.some(c => c.name.toLowerCase() === name.toLowerCase())) { alert("That client already exists."); return; }
  db.collection("clients").add({ name, category, tier, addedBy: currentUser }).then(() => {
    logHistory("Added new client", name + " (" + tier + ")");
    document.getElementById("newClientName").value = "";
    document.getElementById("newClientCategory").value = "";
  });
}
function renderClientTable() {
  const search = (document.getElementById("clSearch")?.value || "").toLowerCase();
  const catFilter = document.getElementById("clFilterCategory")?.value || "";
  const tierFilter = document.getElementById("clFilterTier")?.value || "";
  const tbody = document.getElementById("clTableBody");
  tbody.innerHTML = "";
  CLIENTS.filter(c => c.name.toLowerCase().includes(search))
    .filter(c => !catFilter || c.category === catFilter)
    .filter(c => !tierFilter || c.tier === tierFilter)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input type="checkbox" class="clCheck" value="${c.id}"></td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.tier)}</td><td class="small">${escapeHtml(c.addedBy)}</td><td><button class="secondary small-btn" onclick="openEditClientModal('${c.id}')">Edit</button> <button class="danger small-btn" onclick="deleteClient('${c.id}')">Del</button></td>`;
      tbody.appendChild(tr);
    });
}
function toggleClSelectAll(cb) { document.querySelectorAll(".clCheck").forEach(c => c.checked = cb.checked); }
function bulkDeleteClients() {
  const ids = [...document.querySelectorAll(".clCheck:checked")].map(c => c.value);
  if (!ids.length) { alert("Select at least one row first."); return; }
  if (!confirm("Delete " + ids.length + " client(s)?")) return;
  const batch = db.batch();
  ids.forEach(id => batch.delete(db.collection("clients").doc(id)));
  batch.commit().then(() => logHistory("Bulk deleted clients", ids.length + " client(s)"));
}
function deleteClient(id) {
  const c = CLIENTS.find(x => x.id === id);
  if (!confirm("Delete '" + (c ? c.name : id) + "'?")) return;
  db.collection("clients").doc(id).delete().then(() => logHistory("Deleted client", c ? c.name : id));
}
function openEditClientModal(id) {
  const c = CLIENTS.find(x => x.id === id);
  if (!c) return;
  openModal(`
    <span class="close-x" onclick="closeModal()">✕</span><h3>Edit Client</h3>
    <label>Name</label><input class="editable-input" id="mName" value="${escapeAttr(c.name)}">
    <label>Category</label><input class="editable-input" id="mCatg" value="${escapeAttr(c.category || "")}" oninput="suggestTierFromCategory(this.value,'mTier')">
    <label>Tier</label>
    <select class="editable-input" id="mTier">
      ${["100%", "110%", "120%", "140%", "180%", "TM", "MRWA"].map(t => `<option ${t === c.tier ? "selected" : ""}>${t}</option>`).join("")}
    </select>
    <button onclick="saveClientEdit('${id}')">Save</button>
  `);
}
function saveClientEdit(id) {
  const name = document.getElementById("mName").value.trim();
  const category = document.getElementById("mCatg").value.trim();
  const tier = document.getElementById("mTier").value;
  db.collection("clients").doc(id).update({ name, category, tier }).then(() => {
    logHistory("Edited client", name);
    closeModal();
  });
}
function handleClientsCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  parseImportFile(file, rows => promptImportMode(rows, importClientRows));
  event.target.value = "";
}
function importClientRows(rows, mode) {
  const existing = new Set(CLIENTS.map(c => c.name.toLowerCase()));
  const finish = () => {
    let toAdd = rows.map(r => ({
      name: r["Name"] || r["name"] || r["Client"] || "",
      category: r["Category"] || r["category"] || "",
      tier: r["Tier"] || r["tier"] || "",
      addedBy: currentUser
    })).filter(r => r.name);
    if (mode === "skipDupes") toAdd = toAdd.filter(r => !existing.has(r.name.toLowerCase()));
    let batch = db.batch(); let count = 0; const commits = [];
    toAdd.forEach(item => {
      const ref = db.collection("clients").doc();
      batch.set(ref, item);
      count++;
      if (count % 400 === 0) { commits.push(batch.commit()); batch = db.batch(); }
    });
    commits.push(batch.commit());
    Promise.all(commits).then(() => {
      logHistory("Imported clients file (" + mode + ")", toAdd.length + " row(s)");
      alert("Imported " + toAdd.length + " client(s).");
    });
  };
  if (mode === "replace") deleteAllInCollection("clients").then(finish);
  else finish();
}

// ---------------- TM OVERRIDE ----------------
const TM_COLS = ["c600x600_workzone", "c1200x300_workzone", "c1200x600_workzone", "c600x600_orange", "c1200x600_orange"];
function renderTmTable() {
  const search = (document.getElementById("tmSearch")?.value || "").toLowerCase();
  const hasRateFilter = document.getElementById("tmFilterHasRate")?.value || "";
  const tbody = document.getElementById("tmTableBody");
  tbody.innerHTML = "";
  TM_OVERRIDE.filter(r => (r.client || "").toLowerCase().includes(search))
    .filter(r => {
      if (!hasRateFilter) return true;
      const hasAny = TM_COLS.some(c => r[c] !== null && r[c] !== undefined);
      return hasRateFilter === "hasRate" ? hasAny : !hasAny;
    })
    .sort((a, b) => (a.client || "").localeCompare(b.client || ""))
    .forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input type="checkbox" class="tmCheck" value="${r.id}"></td><td>${escapeHtml(r.client)}</td><td>${money(r.c600x600_workzone)}</td><td>${money(r.c1200x300_workzone)}</td><td>${money(r.c1200x600_workzone)}</td><td>${money(r.c600x600_orange)}</td><td>${money(r.c1200x600_orange)}</td><td class="small">${escapeHtml(r.notes)}</td><td><button class="secondary small-btn" onclick="openEditTmModal('${r.id}')">Edit</button> <button class="danger small-btn" onclick="deleteTmRow('${r.id}')">Del</button></td>`;
      tbody.appendChild(tr);
    });
}
function toggleTmSelectAll(cb) { document.querySelectorAll(".tmCheck").forEach(c => c.checked = cb.checked); }
function bulkDeleteTm() {
  const ids = [...document.querySelectorAll(".tmCheck:checked")].map(c => c.value);
  if (!ids.length) { alert("Select at least one row first."); return; }
  if (!confirm("Delete " + ids.length + " TM override row(s)?")) return;
  const batch = db.batch();
  ids.forEach(id => batch.delete(db.collection("tmOverride").doc(id)));
  batch.commit().then(() => logHistory("Bulk deleted TM override rows", ids.length + " row(s)"));
}
function deleteTmRow(id) {
  const r = TM_OVERRIDE.find(x => x.id === id);
  if (!confirm("Delete TM override for '" + (r ? r.client : id) + "'?")) return;
  db.collection("tmOverride").doc(id).delete().then(() => logHistory("Deleted TM override row", r ? r.client : id));
}
function tmFormFields(r) {
  r = r || {};
  return `
    <label>Client</label><input class="editable-input" id="tmClient" value="${escapeAttr(r.client || "")}">
    <label>600x600 Workzone</label><input class="editable-input" type="number" step="0.01" id="tmC1" value="${r.c600x600_workzone ?? ""}">
    <label>1200x300 Workzone</label><input class="editable-input" type="number" step="0.01" id="tmC2" value="${r.c1200x300_workzone ?? ""}">
    <label>1200x600 Workzone</label><input class="editable-input" type="number" step="0.01" id="tmC3" value="${r.c1200x600_workzone ?? ""}">
    <label>600x600 Orange</label><input class="editable-input" type="number" step="0.01" id="tmC4" value="${r.c600x600_orange ?? ""}">
    <label>1200x600 Orange</label><input class="editable-input" type="number" step="0.01" id="tmC5" value="${r.c1200x600_orange ?? ""}">
    <label>Notes</label><input class="editable-input" id="tmNotes" value="${escapeAttr(r.notes || "")}">
  `;
}
function openAddTmModal() {
  openModal(`<span class="close-x" onclick="closeModal()">✕</span><h3>Add TM Override Row</h3>${tmFormFields({})}<button onclick="saveNewTm()">Save</button>`);
}
function readTmForm() {
  const num = id => { const v = document.getElementById(id).value; return v === "" ? null : parseFloat(v); };
  return {
    client: document.getElementById("tmClient").value.trim(),
    c600x600_workzone: num("tmC1"), c1200x300_workzone: num("tmC2"), c1200x600_workzone: num("tmC3"),
    c600x600_orange: num("tmC4"), c1200x600_orange: num("tmC5"),
    notes: document.getElementById("tmNotes").value.trim()
  };
}
function saveNewTm() {
  const row = readTmForm();
  if (!row.client) { alert("Client name is required."); return; }
  db.collection("tmOverride").add(row).then(() => { logHistory("Added TM override row", row.client); closeModal(); });
}
function openEditTmModal(id) {
  const r = TM_OVERRIDE.find(x => x.id === id);
  if (!r) return;
  openModal(`<span class="close-x" onclick="closeModal()">✕</span><h3>Edit TM Override Row</h3>${tmFormFields(r)}<button onclick="saveTmEdit('${id}')">Save</button>`);
}
function saveTmEdit(id) {
  const row = readTmForm();
  db.collection("tmOverride").doc(id).update(row).then(() => { logHistory("Edited TM override row", row.client); closeModal(); });
}
function handleTmCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  parseImportFile(file, rows => promptImportMode(rows, importTmRows));
  event.target.value = "";
}
function importTmRows(rows, mode) {
  const existing = new Set(TM_OVERRIDE.map(r => (r.client || "").toLowerCase()));
  const num = v => v === "" || v === undefined ? null : parseFloat(v);
  const finish = () => {
    let toAdd = rows.map(r => ({
      client: r["Client"] || r["client"] || r["TM Client"] || "",
      c600x600_workzone: num(r["600x600 Workzone"] || r["c600x600_workzone"]),
      c1200x300_workzone: num(r["1200x300 Workzone"] || r["c1200x300_workzone"]),
      c1200x600_workzone: num(r["1200x600 Workzone"] || r["c1200x600_workzone"]),
      c600x600_orange: num(r["600x600 Orange"] || r["c600x600_orange"]),
      c1200x600_orange: num(r["1200x600 Orange"] || r["c1200x600_orange"]),
      notes: r["Notes"] || r["notes"] || ""
    })).filter(r => r.client);
    if (mode === "skipDupes") toAdd = toAdd.filter(r => !existing.has(r.client.toLowerCase()));
    let batch = db.batch(); let count = 0; const commits = [];
    toAdd.forEach(item => {
      const ref = db.collection("tmOverride").doc();
      batch.set(ref, item);
      count++;
      if (count % 400 === 0) { commits.push(batch.commit()); batch = db.batch(); }
    });
    commits.push(batch.commit());
    Promise.all(commits).then(() => {
      logHistory("Imported TM override file (" + mode + ")", toAdd.length + " row(s)");
      alert("Imported " + toAdd.length + " row(s).");
    });
  };
  if (mode === "replace") deleteAllInCollection("tmOverride").then(finish);
  else finish();
}

// ---------------- HISTORY ----------------
function renderHistoryTable() {
  const tbody = document.getElementById("historyTableBody");
  tbody.innerHTML = "";
  HISTORY.forEach(h => {
    const when = h.ts && h.ts.toDate ? h.ts.toDate().toLocaleString("en-AU") : "just now";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="small">${escapeHtml(when)}</td><td>${escapeHtml(h.who)}</td><td>${escapeHtml(h.action)}</td><td class="small">${escapeHtml(h.details)}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------------- TEAM / ADMIN ----------------
function renderTeamList() {
  const tbody = document.getElementById("teamTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  TEAM.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(t.name)}</td><td><button class="secondary small-btn" onclick="editTeamMember('${t.id}')">Edit</button> <button class="danger small-btn" onclick="deleteTeamMember('${t.id}')">Del</button></td>`;
    tbody.appendChild(tr);
  });
}
function addTeamMember() {
  const name = document.getElementById("teamNewName").value.trim();
  if (!name) return;
  db.collection("team").add({ name }).then(() => {
    document.getElementById("teamNewName").value = "";
    logHistory("Added team member", name);
  });
}
function editTeamMember(id) {
  const t = TEAM.find(x => x.id === id);
  if (!t) return;
  const newName = prompt("Rename team member:", t.name);
  if (!newName || !newName.trim()) return;
  db.collection("team").doc(id).update({ name: newName.trim() }).then(() => logHistory("Renamed team member", t.name + " -> " + newName.trim()));
}
function deleteTeamMember(id) {
  const t = TEAM.find(x => x.id === id);
  if (!confirm("Remove '" + (t ? t.name : id) + "' from the team list?")) return;
  db.collection("team").doc(id).delete().then(() => logHistory("Removed team member", t ? t.name : id));
}

// ---------------- SEED DATA ----------------
function loadSeedData() {
  const status = document.getElementById("seedStatus");
  status.style.display = "block";
  status.textContent = "Checking...";

  Promise.all([
    db.collection("priceLookup").limit(1).get(),
    db.collection("clients").limit(1).get(),
    db.collection("tmOverride").limit(1).get()
  ]).then(([plSnap, clSnap, tmSnap]) => {
    if (!plSnap.empty || !clSnap.empty || !tmSnap.empty) {
      status.textContent = "Database is not empty — starter data was already loaded before. Nothing done, to avoid duplicates.";
      return;
    }
    status.textContent = "Uploading " + SEED_PRICE_LOOKUP.length + " price items, " + SEED_CLIENTS.length + " clients, " + SEED_TM_OVERRIDE.length + " TM rows... this can take a minute, don't close the tab.";
    let batch = db.batch();
    let count = 0;
    const commits = [];
    function addToBatch(collection, data) {
      const ref = db.collection(collection).doc();
      batch.set(ref, data);
      count++;
      if (count % 400 === 0) {
        commits.push(batch.commit());
        batch = db.batch();
      }
    }
    SEED_PRICE_LOOKUP.forEach(i => addToBatch("priceLookup", i));
    SEED_CLIENTS.forEach(c => addToBatch("clients", c));
    SEED_TM_OVERRIDE.forEach(r => addToBatch("tmOverride", r));
    commits.push(batch.commit());
    Promise.all(commits).then(() => {
      status.textContent = "Done! Starter data loaded.";
      logHistory("Loaded starter data from Excel file", "");
    }).catch(err => {
      status.textContent = "Something went wrong: " + err.message;
    });
  });
}
