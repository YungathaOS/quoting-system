/* =====================================================================
   YUNGATHA QUOTING TOOL — app.js
   Plain-language map for John:
   - TEAM_PASSWORD: the one shared password everyone types to get in.
   - firebaseConfig: paste your Firebase project keys here (see the
     "SETUP GUIDE" John was given — this is the ONLY technical part).
   - Everything below that just runs the calculator + syncs data.
   ===================================================================== */

const TEAM_PASSWORD = "YUNGATHA2026"; // <-- change this to whatever password you want the team to use

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

// ---------------- DATALISTS ----------------
function refreshDatalists() {
  const uniq = field => [...new Set(PRICE_LOOKUP.filter(i => i.section === "Standard" || i.section === "RAW MATERIALS").map(i => i[field]).filter(Boolean))];
  fillDatalist("substrateList", uniq("substrate"));
  fillDatalist("vinylList", uniq("vinyl"));
  fillDatalist("overlayList", uniq("overlay"));
  const rawMaterials = PRICE_LOOKUP.filter(i => i.section === "RAW MATERIALS").map(i => i.description);
  fillDatalist("extrasList", rawMaterials);
  fillDatalist("matSubstrateList", rawMaterials);
  fillDatalist("matVinylList", rawMaterials);
  fillDatalist("matOverlayList", rawMaterials);
  fillDatalist("matExtrasList", rawMaterials);
  const accLabour = PRICE_LOOKUP.filter(i => i.section === "Accessories" || i.section === "Labour").map(i => i.description);
  fillDatalist("accessoryLabourList", accLabour);
  const cats = [...new Set(PRICE_LOOKUP.filter(i => i.category).map(i => i.category))];
  fillDatalist("accCategoryList", cats.length ? cats : (SEED_PRICE_CATEGORIES || []));
}
function refreshClientDatalist() {
  fillDatalist("clientListDatalist", CLIENTS.map(c => c.name));
  const cats = [...new Set(CLIENTS.filter(c => c.category).map(c => c.category))];
  fillDatalist("clientCatList", cats.length ? cats : (SEED_CLIENT_CATEGORIES || []));
}
function fillDatalist(id, values) {
  const dl = document.getElementById(id);
  dl.innerHTML = "";
  [...new Set(values)].sort().forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  });
}

// ---------------- CLIENT / TIER ----------------
function onClientChange() {
  const name = document.getElementById("qClient").value;
  const client = CLIENTS.find(c => c.name.toLowerCase() === name.toLowerCase());
  document.getElementById("qTier").value = client ? client.tier : "";
  document.getElementById("qMarkup").value = client ? markupLabel(client.tier) : "";
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
    else { matVal = document.getElementById(matInputId).value || materials[layer]; }
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

  const qty = parseFloat(document.getElementById("qQty").value) || 1;
  const sell = costMarkup !== null ? costMarkup * qty : (stdPrice !== null ? stdPrice * qty : null);
  document.getElementById("rSell").textContent = sell !== null ? money(sell) : "—";

  window._lastCalc = { tier, w, h, substrate, vinyl, overlay, sqm, rawCost, wastage, rawPlusWastage, markupMult, costMarkup, qty, sell };
}

function resetQuote() {
  ["qW", "qH", "qSubstrate", "qVinyl", "qOverlay", "qExtras", "qOverride", "sbSubstrate", "sbVinyl", "sbOverlay", "sbExtras"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("qQty").value = 1;
  ["sbSubstrateInc", "sbVinylInc", "sbOverlayInc", "sbExtrasInc", "sbInkInc"].forEach(id => document.getElementById(id).value = "YES");
  document.getElementById("qClient").value = "";
  document.getElementById("qTier").value = "";
  document.getElementById("qMarkup").value = "";
  document.getElementById("qAccItem").value = "";
  document.getElementById("qAccPrice").value = "";
  document.getElementById("qNewItemName").value = "";
  document.getElementById("qNewItemPrice").value = "";
  document.getElementById("qNewItemCategory").value = "";
  calc();
  logHistory("Reset quote fields", "");
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
    key, section: "Standard", description: desc, w: c.w, h: c.h,
    substrate: c.substrate, vinyl: c.vinyl || "", overlay: c.overlay || "",
    p100: round2(c.rawPlusWastage * 2), p110: round2(c.rawPlusWastage * 2.1),
    p120: round2(c.rawPlusWastage * 2.2), p140: round2(c.rawPlusWastage * 2.4),
    p180: round2(c.rawPlusWastage * 2.8),
    notes: "Added from Sign Builder " + new Date().toLocaleDateString("en-AU"),
    category: "", dimensions: ""
  };
  db.collection("priceLookup").add(item).then(() => {
    logHistory("Added new sign to Price Lookup", desc);
    alert("Added: " + desc);
  });
}
function round2(n) { return Math.round(n * 100) / 100; }

// ---------------- ACCESSORY / LABOUR LOOKUP ----------------
function lookupAccessory() {
  const itemName = document.getElementById("qAccItem").value;
  const tier = currentTier();
  const item = PRICE_LOOKUP.find(i => (i.section === "Accessories" || i.section === "Labour") && i.description.toLowerCase() === itemName.toLowerCase());
  if (!item) { document.getElementById("qAccPrice").value = "New item — enter price below, click Add"; return; }
  let price;
  if (tier === "TM" || tier === "MRWA") price = item.p140;
  else price = item[tierPriceField(tier)];
  document.getElementById("qAccPrice").value = price !== undefined && price !== null ? money(price) : "—";
}
function addAccessory() {
  const tier = currentTier();
  const mult = tierMultiplier(tier);
  if (!mult) { alert("Select a client on a standard tier (100/110/120/140/180%) before adding a new priced item.\nTM and MRWA don't have a fixed multiplier to calculate the other tiers from."); return; }
  const itemName = document.getElementById("qNewItemName").value.trim();
  const enteredPrice = parseFloat(document.getElementById("qNewItemPrice").value);
  const category = document.getElementById("qNewItemCategory").value.trim();
  if (!itemName || isNaN(enteredPrice)) { alert("Type the item name and its price at the current tier first."); return; }
  if (PRICE_LOOKUP.some(i => i.description.toLowerCase() === itemName.toLowerCase())) { alert("'" + itemName + "' is already in the list. Edit it there instead."); return; }
  const base100 = enteredPrice / mult;
  const item = {
    key: "|||" + itemName + "||", section: "Accessories", description: itemName,
    substrate: itemName, w: null, h: null, vinyl: "", overlay: "",
    p100: round2(base100 * 2), p110: round2(base100 * 2.1), p120: round2(base100 * 2.2),
    p140: round2(base100 * 2.4), p180: round2(base100 * 2.8),
    notes: "Entered at " + tier + " tier - added " + new Date().toLocaleDateString("en-AU"),
    category, dimensions: ""
  };
  db.collection("priceLookup").add(item).then(() => {
    logHistory("Added new accessory/labour item", itemName + " (" + category + ")");
    document.getElementById("qNewItemName").value = "";
    document.getElementById("qNewItemPrice").value = "";
    document.getElementById("qNewItemCategory").value = "";
    alert("Added '" + itemName + "' — all 5 tiers calculated from the " + tier + " price.");
  });
}

// ---------------- PRICE LOOKUP TABLE ----------------
function renderPriceLookupTable() {
  const search = (document.getElementById("plSearch")?.value || "").toLowerCase();
  const tbody = document.getElementById("plTableBody");
  tbody.innerHTML = "";
  PRICE_LOOKUP.filter(i => i.description && i.description.toLowerCase().includes(search))
    .sort((a, b) => (a.section || "").localeCompare(b.section) || (a.description || "").localeCompare(b.description))
    .forEach(i => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i.section || ""}</td><td>${i.description || ""}</td><td>${money(i.p100)}</td><td>${money(i.p110)}</td><td>${money(i.p120)}</td><td>${money(i.p140)}</td><td>${money(i.p180)}</td><td class="small">${i.notes || ""}</td>`;
      tbody.appendChild(tr);
    });
}

// ---------------- CLIENTS ----------------
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
  const tbody = document.getElementById("clTableBody");
  tbody.innerHTML = "";
  CLIENTS.filter(c => c.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${c.name}</td><td>${c.category || ""}</td><td>${c.tier || ""}</td><td class="small">${c.addedBy || ""}</td>`;
      tbody.appendChild(tr);
    });
}

// ---------------- TM OVERRIDE ----------------
function renderTmTable() {
  const search = (document.getElementById("tmSearch")?.value || "").toLowerCase();
  const tbody = document.getElementById("tmTableBody");
  tbody.innerHTML = "";
  TM_OVERRIDE.filter(r => (r.client || "").toLowerCase().includes(search))
    .sort((a, b) => (a.client || "").localeCompare(b.client || ""))
    .forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.client}</td><td>${money(r.c600x600_workzone)}</td><td>${money(r.c1200x300_workzone)}</td><td>${money(r.c1200x600_workzone)}</td><td>${money(r.c600x600_orange)}</td><td>${money(r.c1200x600_orange)}</td><td class="small">${r.notes || ""}</td>`;
      tbody.appendChild(tr);
    });
}

// ---------------- HISTORY ----------------
function renderHistoryTable() {
  const tbody = document.getElementById("historyTableBody");
  tbody.innerHTML = "";
  HISTORY.forEach(h => {
    const when = h.ts && h.ts.toDate ? h.ts.toDate().toLocaleString("en-AU") : "just now";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="small">${when}</td><td>${h.who || ""}</td><td>${h.action || ""}</td><td class="small">${h.details || ""}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------------- TEAM / ADMIN ----------------
function renderTeamList() {
  const ul = document.getElementById("teamList");
  if (!ul) return;
  ul.innerHTML = "";
  TEAM.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(t => {
    const li = document.createElement("li");
    li.textContent = t.name;
    ul.appendChild(li);
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
