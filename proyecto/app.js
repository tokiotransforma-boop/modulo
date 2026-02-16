// MÓDULO — Demo MVP CERO (SPA sin dependencias)
// Pantalla 1: Landing (logo grande + gancho) + Login arriba derecha
// Pantalla 2: Login/Alta + Pago (Particular 9€ / Profesional 49€)
// Luego: Flujo básico (selector tipo obra → ajustes → cerrado)

const STORAGE_KEY = "modulo_demo_state_v2";
const DEMO_BYPASS = true; // Demo: permite entrar sin pago


const UI = { edit: null, proPartidas: { filtersOpen:false, chapterId:"all" } }; // UI transient (no se guarda en localStorage)


function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function formatEUR(n){
  return new Intl.NumberFormat("es-ES", { style:"currency", currency:"EUR" }).format(n || 0);
}

function safeNumber(v){
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function clampNonNeg(n){ return Math.max(0, safeNumber(n)); }

function normalizeStateData(s){
  try{
    (s.chapters||[]).forEach(ch => {
      if(typeof ch.on !== "boolean") ch.on = true;
      (ch.items||[]).forEach(it => {
        it.qty = clampNonNeg(it.qty);
        it.pu  = safeNumber(it.pu);
        it.mo  = safeNumber(it.mo);
        it.mat = safeNumber(it.mat);
        if(!it.unit || !String(it.unit).trim()) it.unit = "ud";
        if(typeof it.on !== "boolean") it.on = true;
      });
    });
    (s.materials||[]).forEach(m => {
      m.cost = clampNonNeg(m.cost);
      m.pvp  = clampNonNeg(m.pvp);
      if(!m.product || !String(m.product).trim()) m.product = "Material";
    });
    if(!s.config) s.config = {};
    s.config.ivaCompra = 0.21;
    if(!Number.isFinite(s.config.ivaVenta)) s.config.ivaVenta = 0.21;
    if(!Number.isFinite(s.config.margin)) s.config.margin = 0;
    if(!Number.isFinite(s.config.discount)) s.config.discount = 0;
  }catch(e){
    console.warn("normalizeStateData error:", e);
  }
  return s;
}

function matchTrabajo(ch, it, job){
  if(job === "all") return true;
  const j = String(job||"").toLowerCase();
  const id = String((it && it.id) || (ch && ch.id) || "").toLowerCase();
  const nm = String((it && it.name) || (ch && ch.name) || "").toLowerCase();
  return id.includes(j) || nm.includes(j);
}
function filterChaptersByTrabajo(chapters, job){
  if(job === "all") return chapters || [];
  const out = [];
  for(const ch of (chapters||[])){
    if(ch.id === "protecciones"){ out.push(ch); continue; }
    if(matchTrabajo(ch, null, job) || (ch.items||[]).some(it => matchTrabajo(ch, it, job))){
      if(ch.id !== job){
        const clone = deepClone(ch);
        clone.items = (clone.items||[]).filter(it => matchTrabajo(clone, it, job));
        out.push(clone);
      }else{
        out.push(ch);
      }
    }
  }
  return out;
}

// Activa/desactiva capítulos y partidas en el estado según "Trabajo" (manteniendo Protecciones).
function applyTrabajoFilterToState(job){
  const j = job || "all";
  (state.chapters||[]).forEach(ch => {
    if(ch.id === "protecciones"){ ch.on = true; (ch.items||[]).forEach(it=>it.on=true); return; }
    const keepCh = matchTrabajo(ch, null, j) || (ch.items||[]).some(it => matchTrabajo(ch, it, j));
    ch.on = (j === "all") ? true : !!keepCh;
    (ch.items||[]).forEach(it => {
      it.on = (j === "all") ? true : (ch.on ? matchTrabajo(ch, it, j) : false);
    });
  });
}

function exportProjectJSON(){
  try{
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `modulo_proyecto_${(new Date()).toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
  }catch(e){
    alert("No se pudo exportar el proyecto.");
    console.warn(e);
  }
}
function importProjectJSONFromFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(String(reader.result||"{}"));
      if(!parsed || typeof parsed !== "object") throw new Error("JSON inválido");
      state = normalizeStateData(Object.assign(defaultState(), parsed));
      ensureStateUpgrade();
      save(state);
      navigate(state.ui?.lastPath || (state.product === "pro" ? "/pro" : "/particular"));
    }catch(e){
      alert("Archivo inválido. Debe ser un JSON exportado desde MÓDULO.");
      console.warn(e);
    }
  };
  reader.readAsText(file);
}
function triggerImportJSON(){
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    importProjectJSONFromFile(f);
  };
  input.click();
}

// --- Particular: Estancias (medición simple por estancia) ---
const ESTANCIAS_DEFAULTS = [
  { key:"cocina",     label:"Cocina",     count:1, l:3.0, w:3.0, h:2.5 },
  { key:"bano",       label:"Baño",       count:1, l:2.0, w:2.0, h:2.5 },
  { key:"aseo",       label:"Aseo",       count:1, l:1.5, w:1.5, h:2.5 },
  { key:"pasillo",    label:"Pasillo",    count:1, l:4.0, w:1.2, h:2.5 },
  { key:"habitacion", label:"Habitación", count:1, l:3.0, w:3.0, h:2.5 },
];

function isParticular(){
  return state.product !== "pro";
}

function ensureEstancias(){
  if(!isParticular()) return;
  if(Array.isArray(state.estancias) && state.estancias.length) return;
  state.estancias = deepClone(ESTANCIAS_DEFAULTS);
}

function estanciasMetrics(estancias){
  const e = Array.isArray(estancias) ? estancias : [];
  let floor = 0;
  let walls = 0;
  let rooms = 0;
  let cocina = 0, wet = 0;
  for(const r of e){
    const c = Math.max(0, Math.round(Number(r.count || 0)));
    const l = safeNumber(r.l), w = safeNumber(r.w), h = safeNumber(r.h);
    rooms += c;
    floor += c * (l * w);
    walls += c * (2 * (l + w) * h);

    if(r.key === "cocina") cocina += c;
    if(r.key === "bano" || r.key === "aseo") wet += c;
  }
  return { floorM2: floor, wallsM2: walls, rooms, cocina, wet };
}

function ensureEstanciasBase(){
  if(!isParticular()) return;
  if(state.estanciasBase && state.estanciasBaseWorkflowId === state.workflowId) return;
  // Base de referencia: cantidades tal cual genera el workflow
  state.estanciasBase = deepClone(state.chapters || []);
  state.estanciasBaseWorkflowId = state.workflowId || null;
}

function findBaseQty(baseChapters, chId, itId){
  const ch = (baseChapters || []).find(c => c.id === chId);
  const it = ch ? (ch.items || []).find(i => i.id === itId) : null;
  return it ? (typeof it.qty === "number" ? it.qty : safeNumber(it.qty)) : 0;
}

function refAreasFromBase(baseChapters){
  // Referencia de suelo: qty de "proteccion_suelos" si existe; fallback: primer m² de "recrecidos"/"pavimento"
  let floorRef = 0;
  let wallsRef = 0;

  for(const ch of (baseChapters || [])){
    for(const it of (ch.items || [])){
      if(it.id === "proteccion_suelos" && it.unit === "m²"){
        floorRef = Number(it.qty || 0);
      }
      if(it.id === "pintura_paredes" && it.unit === "m²"){
        wallsRef = Number(it.qty || 0);
      }
    }
  }
  if(!floorRef){
    for(const ch of (baseChapters || [])){
      for(const it of (ch.items || [])){
        if((it.id === "recrecidos" || it.id === "pavimento") && it.unit === "m²"){
          floorRef = Number(it.qty || 0);
          break;
        }
      }
      if(floorRef) break;
    }
  }
  if(!wallsRef){
    // Heurística: si no hay paredes, usamos 2.7 * 2 como ratio típico (aprox) sobre suelo
    wallsRef = floorRef ? floorRef * 5.4 : 200;
  }
  if(!floorRef) floorRef = 60;
  return { floorRef, wallsRef };
}

function applyEstanciasToChapters(){
  if(!isParticular()) return;
  ensureEstancias();
  ensureEstanciasBase();

  const m = estanciasMetrics(state.estancias);
  const refs = refAreasFromBase(state.estanciasBase);

  // "Solo lo pedido" (Particular) según estancias.
  // Regla mínima y segura: si no hay cocina → desactivar capítulo cocina;
  // si no hay baños/aseos → desactivar capítulo baños.
  // Mantener siempre Protecciones y el resto tal cual (para no cambiar la UI).
  const setChapterOn = (chapterId, on) => {
    const ch = (state.chapters || []).find(c => c.id === chapterId);
    if(!ch) return;
    ch.on = !!on;
    for(const it of (ch.items || [])) it.on = !!on;
  };
  if(typeof m.cocina === "number") setChapterOn("cocina", m.cocina > 0);
  if(typeof m.wet === "number") setChapterOn("banos", m.wet > 0);

  const floorRatio = refs.floorRef > 0 ? (m.floorM2 / refs.floorRef) : 1;
  const wallsRatio = refs.wallsRef > 0 ? (m.wallsM2 / refs.wallsRef) : 1;

  // Escalas por estancias clave
  const baseRooms = 5; // cocina + baño + aseo + pasillo + 1 habitación
  const baseWet = 2;   // baño + aseo
  const roomRatio = baseRooms ? (m.rooms / baseRooms) : 1;
  const wetRatio = baseWet ? (m.wet / baseWet) : 1;
  const cocinaRatio = (m.cocina || 0) > 0 ? m.cocina : 1;

  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  // Aplicamos a state.chapters (manteniendo toggles y edits de pu)
  for(const ch of (state.chapters || [])){
    const baseCh = (state.estanciasBase || []).find(b => b.id === ch.id);
    if(!baseCh) continue;

    for(const it of (ch.items || [])){
      const baseIt = (baseCh.items || []).find(bi => bi.id === it.id);
      if(!baseIt) continue;

      const baseQty = Number(baseIt.qty || 0);
      const unit = String(it.unit || baseIt.unit || "");

      let factor = 1;

      if(unit === "m²"){
        const id = String(it.id || "").toLowerCase();
        const chid = String(ch.id || "").toLowerCase();

        const isCeiling = id.includes("techo") || id.includes("techos");
        const isWallish = id.includes("pared") || id.includes("alicat") || id.includes("tabique") || id.includes("tabiquer")
          || chid === "pintura" || chid === "banos" || chid === "cocina";

        factor = isCeiling ? floorRatio : (isWallish ? wallsRatio : floorRatio);

        // Ajuste extra por nº de cocinas/baños si aplica
        if(chid === "cocina") factor *= cocinaRatio;      // 1 cocina base
        if(chid === "banos") factor *= wetRatio;          // baño+aseo base
      } else if(unit === "m³"){
        factor = floorRatio;
      } else if(unit === "ml"){
        const chid = String(ch.id || "").toLowerCase();
        if(chid === "cocina") factor = cocinaRatio;
      } else if(unit === "set"){
        const chid = String(ch.id || "").toLowerCase();
        if(chid === "banos") factor = wetRatio;
      } else if(unit === "ud"){
        const id = String(it.id || "").toLowerCase();
        const chid = String(ch.id || "").toLowerCase();

        if(id === "cuadro" || baseQty === 1){
          factor = 1;
        } else if(chid === "electricidad" || chid === "fontaneria"){
          factor = roomRatio;
        } else if(chid === "banos"){
          factor = wetRatio;
        } else if(chid === "cocina"){
          factor = cocinaRatio;
        }
      } else {
        factor = 1;
      }

      // Aplicar qty calculada (mínimo 0)
      const newQty = Math.max(0, round2(baseQty * factor));
      it.qty = newQty;
    }
  }

  save(state);
}

function updateEstanciaDim(key, field, value){
  ensureEstancias();
  const r = (state.estancias || []).find(x => x.key === key);
  if(!r) return;
  r[field] = safeNumber(value);
  applyEstanciasToChapters();
  render();
}

function changeEstanciaCount(key, delta){
  ensureEstancias();
  const r = (state.estancias || []).find(x => x.key === key);
  if(!r) return;
  const next = Math.max(0, Math.round(Number(r.count || 0) + delta));
  r.count = next;
  applyEstanciasToChapters();
  render();
}

function doubleEstancia(key){
  ensureEstancias();
  const r = (state.estancias || []).find(x => x.key === key);
  if(!r) return;
  const c = Math.max(0, Math.round(Number(r.count || 0)));
  r.count = (c === 0) ? 1 : c * 2;
  applyEstanciasToChapters();
  render();
}
// --- /Estancias ---

const WORKFLOWS = {
  integral: {
    id: "01_reforma_integral",
    label: "Reforma integral",
    chapters: [
      { id:"protecciones", name:"Protecciones y preparación", tag:"Base", items:[
        { id:"proteccion_suelos", name:"Protección de suelos", unit:"m²", qty:60, pu:6 },
        { id:"proteccion_muebles", name:"Protección de mobiliario", unit:"ud", qty:6, pu:18 },
      ]},
      { id:"demoliciones", name:"Demoliciones y residuos", tag:"Obra", items:[
        { id:"derribos_tabiques", name:"Demolición de tabiques", unit:"m²", qty:18, pu:32 },
        { id:"retirada_escombros", name:"Retirada de escombros", unit:"m³", qty:6, pu:55 },
      ]},
      { id:"albanileria", name:"Albañilería", tag:"Obra", dependsOn:["demoliciones"], items:[
        { id:"recrecidos", name:"Recrecidos y nivelación", unit:"m²", qty:60, pu:18 },
        { id:"tabiqueria", name:"Tabiquería y trasdosados", unit:"m²", qty:22, pu:38 },
      ]},
      { id:"fontaneria", name:"Fontanería", tag:"Instalaciones", items:[
        { id:"tomas_agua", name:"Tomas de agua", unit:"ud", qty:10, pu:42 },
        { id:"desagues", name:"Desagües", unit:"ud", qty:8, pu:39 },
      ]},
      { id:"electricidad", name:"Electricidad", tag:"Instalaciones", items:[
        { id:"puntos_luz", name:"Puntos de luz", unit:"ud", qty:14, pu:35 },
        { id:"enchufes", name:"Enchufes", unit:"ud", qty:22, pu:18 },
        { id:"cuadro", name:"Cuadro eléctrico", unit:"ud", qty:1, pu:240 },
      ]},
      { id:"banos", name:"Baños", tag:"Acabados", items:[
        { id:"alicatado_bano", name:"Alicatado baño", unit:"m²", qty:28, pu:42 },
        { id:"sanitarios", name:"Sanitarios", unit:"set", qty:1, pu:890 },
      ]},
      { id:"cocina", name:"Cocina", tag:"Acabados", items:[
        { id:"alicatado_cocina", name:"Alicatado cocina", unit:"m²", qty:18, pu:42 },
        { id:"mobiliario", name:"Mobiliario cocina", unit:"ml", qty:5, pu:260 },
        { id:"encimera", name:"Encimera", unit:"ml", qty:3.2, pu:220 },
      ]},
      { id:"pintura", name:"Pintura", tag:"Acabados", items:[
        { id:"pintura_paredes", name:"Pintura paredes", unit:"m²", qty:160, pu:7.5 },
        { id:"pintura_techos", name:"Pintura techos", unit:"m²", qty:70, pu:8.5 },
      ]},
    ],
  },
  parcial: {
    id: "02_reforma_parcial",
    label: "Reforma parcial",
    chapters: [
      { id:"protecciones", name:"Protecciones y preparación", tag:"Base", items:[
        { id:"proteccion_suelos", name:"Protección de suelos", unit:"m²", qty:25, pu:6 },
        { id:"proteccion_muebles", name:"Protección de mobiliario", unit:"ud", qty:3, pu:18 },
      ]},
      { id:"pintura", name:"Pintura", tag:"Acabados", items:[
        { id:"pintura_paredes", name:"Pintura paredes", unit:"m²", qty:85, pu:7.5 },
        { id:"pintura_techos", name:"Pintura techos", unit:"m²", qty:32, pu:8.5 },
      ]},
      { id:"electricidad", name:"Electricidad (mejoras)", tag:"Instalaciones", items:[
        { id:"enchufes", name:"Enchufes", unit:"ud", qty:8, pu:18 },
        { id:"puntos_luz", name:"Puntos de luz", unit:"ud", qty:5, pu:35 },
      ]},
    ],
  },
  puntual: {
    id: "03_puntual",
    label: "Puntual (unitario)",
    chapters: [
      { id:"protecciones", name:"Protecciones y preparación", tag:"Base", items:[
        { id:"proteccion_suelos", name:"Protección de suelos", unit:"m²", qty:18, pu:6 },
        { id:"proteccion_muebles", name:"Protección de mobiliario", unit:"ud", qty:2, pu:18 },
      ]},
      { id:"pintura", name:"Pintura", tag:"Unitario", items:[
        { id:"pintura_paredes", name:"Pintura paredes", unit:"m²", qty:60, pu:7.5 },
        { id:"pintura_techos", name:"Pintura techos", unit:"m²", qty:25, pu:8.5 },
      ]},
      { id:"fontaneria", name:"Fontanería", tag:"Unitario", items:[
        { id:"tomas_agua", name:"Tomas de agua", unit:"ud", qty:3, pu:42 },
        { id:"desagues", name:"Desagües", unit:"ud", qty:2, pu:39 },
      ]},
      { id:"electricidad", name:"Electricidad", tag:"Unitario", items:[
        { id:"puntos_luz", name:"Puntos de luz", unit:"ud", qty:4, pu:35 },
        { id:"enchufes", name:"Enchufes", unit:"ud", qty:6, pu:18 },
      ]},
      { id:"carpinteria", name:"Carpintería", tag:"Unitario", items:[
        { id:"puertas", name:"Puertas interiores", unit:"ud", qty:1, pu:220 },
        { id:"rodapies", name:"Rodapiés", unit:"ml", qty:18, pu:9.5 },
      ]},
      { id:"aluminio", name:"Aluminio", tag:"Unitario", items:[
        { id:"ventana_aluminio", name:"Ventana aluminio", unit:"ud", qty:1, pu:480 },
        { id:"persiana", name:"Persiana", unit:"ud", qty:1, pu:180 },
      ]},
      { id:"clima", name:"Clima / Aerotermia", tag:"Unitario", items:[
        { id:"split", name:"Split (instalación)", unit:"ud", qty:1, pu:290 },
        { id:"preinstalacion", name:"Preinstalación", unit:"ud", qty:1, pu:420 },
      ]},
    ],
  },
  obra_nueva: {
    id: "99_obra_nueva_legacy",
    label: "Obra nueva",
    chapters: [
      { id:"preparacion", name:"Preparación / replanteo", tag:"Base", items:[
        { id:"replanteo", name:"Replanteo", unit:"ud", qty:1, pu:380 },
        { id:"medios_aux", name:"Medios auxiliares", unit:"ud", qty:1, pu:520 },
      ]},
      { id:"instalaciones", name:"Instalaciones completas", tag:"Instalaciones", items:[
        { id:"electricidad", name:"Electricidad completa", unit:"ud", qty:1, pu:3200 },
        { id:"fontaneria", name:"Fontanería completa", unit:"ud", qty:1, pu:2800 },
      ]},
      { id:"acabados", name:"Acabados", tag:"Acabados", items:[
        { id:"pavimento", name:"Pavimento", unit:"m²", qty:90, pu:34 },
        { id:"pintura", name:"Pintura", unit:"m²", qty:180, pu:7.5 },
      ]},
    ],
  },
};

function defaultState(){
  return {
    entradaMode: null, // "plano" | "manual" (legacy)
    entradaFileName: null, // nombre del archivo subido (demo)
    auth: {
      isLoggedIn: false,
      plan: null, // "particular" | "pro"
      paymentStatus: "none", // none | paid
      customer: {
        nombre: "",
        apellidos: "",
        email: "",
        telefono: "",
        ciudad: "",
        direccion: "",
        empresa: "",
        nif: "",
        profesion: "",
      },
    },
    product: "particular",
    phase: "idea",
    tipoObra: null,
    workflowId: null,
    chapters: [],
    // Materiales (pantalla dedicada). MVP: gestión manual (producto/coste/PVP + imágenes)
    materials: [],
    inventoryFileName: null,
    project: {
      client: {
        nombre: "",
        apellidos: "",
        email: "",
        telefono: "",
        ciudad: "",
        direccion: "",
        empresa: "",
        nif: "",
      },
    },
    config: {
      ivaCompra: 0.21,
      ivaVenta: 0.21,
      allowIva10: false,
      margin: 0.0,
      discount: 0.0,
    },
    // Particular: Estancias (medición simple por estancia)
    estancias: null,
    estanciasBase: null,
    estanciasBaseWorkflowId: null,

    marketplacePro: {
      subscribed: false,
      visible: false,
      priceMonthly: 5,
      startedAt: null,
    },
    ui: {
      lastPath: null,
      proTrabajo: "all",
    },
  };
}

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  }catch{ return defaultState(); }
}
function save(s){
  normalizeStateData(s);
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch(e){ console.warn("localStorage no disponible (se continúa en memoria):", e); }
}

function ensureMaterialsState(){
  if(!Array.isArray(state.materials)) state.materials = [];
  if(typeof state.inventoryFileName !== "string") state.inventoryFileName = null;

  // Seed demo materials (solo una vez) para que la lista no esté vacía
  if(state.materialsSeeded !== true){
    const hadAny = Array.isArray(state.materials) && state.materials.length > 0;
    if(!hadAny){
      state.materials = defaultDemoMaterials().map(x => ({
        id: "m_" + Math.random().toString(16).slice(2),
        product: x.product,
        cost: Number(x.cost || 0),
        pvp: Number(x.pvp || 0),
        image: null,
      }));
      save(state);
    }
    state.materialsSeeded = true;
  }
}

function defaultDemoMaterials(){
  return [
    { product:"WC", cost:0, pvp:0 },
    { product:"Plato de ducha", cost:0, pvp:0 },
    { product:"Mampara", cost:0, pvp:0 },
    { product:"Grifo", cost:0, pvp:0 },
    { product:"Lavabo", cost:0, pvp:0 },
    { product:"Baldosa", cost:0, pvp:0 },
    { product:"Tarima sintética", cost:0, pvp:0 },
  ];
}

function ensureStateUpgrade(){
  if(!state || typeof state !== "object") return;

  if(!state.config || typeof state.config !== "object") state.config = {};
  if(typeof state.config.ivaCompra !== "number") state.config.ivaCompra = 0.21;
  if(typeof state.config.ivaVenta !== "number") state.config.ivaVenta = 0.21;
  if(typeof state.config.margin !== "number") state.config.margin = 0.0;
  if(typeof state.config.discount !== "number") state.config.discount = 0.0;


  // Auth/customer (compat)
  if(!state.auth || typeof state.auth !== "object") state.auth = deepClone(defaultState().auth);
  if(typeof state.auth.isLoggedIn !== "boolean") state.auth.isLoggedIn = false;
  if(typeof state.auth.plan !== "string" && state.auth.plan !== null) state.auth.plan = null;
  if(typeof state.auth.paymentStatus !== "string") state.auth.paymentStatus = "none";
  if(!state.auth.customer || typeof state.auth.customer !== "object") state.auth.customer = deepClone(defaultState().auth.customer);
  const ac = state.auth.customer;
  for(const k of ["nombre","apellidos","email","telefono","ciudad","direccion","empresa","nif","profesion"]){
    if(typeof ac[k] !== "string") ac[k] = "";
  }

  if(!state.project || typeof state.project !== "object") state.project = {};
  if(!state.project.client || typeof state.project.client !== "object"){
    state.project.client = { nombre:"", apellidos:"", email:"", telefono:"", ciudad:"", direccion:"", empresa:"", nif:"" };
  }else{
    const c = state.project.client;
    for(const k of ["nombre","apellidos","email","telefono","ciudad","direccion","empresa","nif"]){
      if(typeof c[k] !== "string") c[k] = "";
    }
  }

  if(!state.marketplacePro || typeof state.marketplacePro !== "object"){
    state.marketplacePro = { subscribed:false, visible:false, priceMonthly:5, startedAt:null };
  }else{
    const m = state.marketplacePro;
    if(typeof m.subscribed !== "boolean") m.subscribed = false;
    if(typeof m.visible !== "boolean") m.visible = false;
    if(typeof m.priceMonthly !== "number") m.priceMonthly = 5;
    if(m.startedAt !== null && typeof m.startedAt !== "string") m.startedAt = null;
  }

  // UI state (persistente)
  if(!state.ui || typeof state.ui !== "object") state.ui = {};
  if(typeof state.ui.lastPath !== "string" && state.ui.lastPath !== null) state.ui.lastPath = null;
  if(typeof state.ui.proTrabajo !== "string") state.ui.proTrabajo = "all";
  if(typeof state.ui.proInputMode !== "string") state.ui.proInputMode = "manual";

  // Migración: eliminamos Obra nueva (se mantiene solo como legacy)
  if(state.tipoObra === "obra_nueva") state.tipoObra = "integral";

  // Snapshots (versiones)
  if(!Array.isArray(state.snapshots)) state.snapshots = [];


}

// PRO: modo de entrada (manual / IA placeholder)
function setProInputMode(mode){
  ensureStateUpgrade();
  if(!state.ui || typeof state.ui !== "object") state.ui = {};
  state.ui.proInputMode = (mode === "ia") ? "ia" : "manual";
  save(state);
  render();
}

// PRO: volver a elegir encargo (sin rediseñar pantallas)
function resetProEncargo(){
  ensureStateUpgrade();
  state.phase = "idea";
  state.tipoObra = null;
  state.workflowId = null;
  state.chapters = [];
  state.materials = [];
  state.entradaFileName = "";
  save(state);
  navigate("/pro");
}



//
// Snapshots (versiones) — Idea -> Ajustado -> Cerrado
//
function ensureSnapshotsState(){
  if(!Array.isArray(state.snapshots)) state.snapshots = [];
}

function snapshotPhaseLabel(){
  if(state.phase === "idea") return "Idea";
  if(state.phase === "cerrado") return "Cerrado";
  return "Ajustado";
}

function snapshotSanitizedState(){
  const data = deepClone(state);
  // Evita recursion
  delete data.snapshots;
  // UI transitoria no importa para volver atras
  if(data && data.ui) data.ui = { ...data.ui, lastPath: data.ui.lastPath || route() };
  return data;
}

function saveSnapshot(name){
  ensureStateUpgrade();
  ensureSnapshotsState();
  const label = snapshotPhaseLabel();
  const now = new Date();
  const nice = now.toLocaleString("es-ES");
  const snap = {
    id: "s_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    name: (name && String(name).trim()) ? String(name).trim() : (label + " — " + nice),
    phase: label,
    product: state.product || ((state.auth && state.auth.plan === "pro") ? "pro" : "particular"),
    path: route(),
    createdAt: now.toISOString(),
    data: snapshotSanitizedState(),
  };
  state.snapshots.unshift(snap);
  // Limite para no crecer infinito (MVP)
  state.snapshots = state.snapshots.slice(0, 25);
  save(state);
}

function deleteSnapshot(id){
  ensureSnapshotsState();
  state.snapshots = (state.snapshots || []).filter(s => s.id !== id);
  save(state);
}

function restoreSnapshot(id){
  ensureSnapshotsState();
  const snap = (state.snapshots || []).find(s => s.id === id);
  if(!snap) return;
  const keepSnaps = state.snapshots;
  state = { ...defaultState(), ...deepClone(snap.data) };
  ensureStateUpgrade();
  state.snapshots = keepSnaps;
  save(state);
  const p = snap.path || (state.ui && state.ui.lastPath) || (state.product === "pro" ? "/pro" : "/particular");
  navigate(p);
}

function snapshotsModal(){
  ensureSnapshotsState();
  if(!UI.snapshots || typeof UI.snapshots !== "object") UI.snapshots = { open:false };
  const sm = UI.snapshots;
  if(!sm.open) return null;

  const list = (state.snapshots || []);
  const close = () => { sm.open = false; render(); };
  const onSave = () => {
    const suggested = snapshotPhaseLabel();
    const name = window.prompt("Nombre de la version (opcional)", suggested);
    saveSnapshot(name);
    render();
  };

  return el("div", { class:"modalOverlay" }, [
    el("div", { class:"modalCard" }, [
      el("div", { class:"modalHead" }, [
        el("div", {}, [
          el("div", { style:"font-weight:800; font-size:18px" }, "Versiones (Snapshots)"),
          el("div", { class:"muted" }, "Guarda una version y vuelve atras cuando quieras (Idea -> Ajustado -> Cerrado)."),
        ]),
        el("div", { class:"row" }, [
          el("button", { class:"btn", onclick: onSave }, "Guardar version"),
          el("button", { class:"btn ghost", onclick: close }, "Cerrar"),
        ]),
      ]),
      el("div", { class:"hr" }),
      list.length ? el("div", { class:"tree" }, list.map(s => {
        const when = (() => { try{ return new Date(s.createdAt).toLocaleString("es-ES"); }catch(e){ return ""; } })();
        return el("div", { class:"item" }, [
          el("div", { style:"flex:1" }, [
            el("div", { class:"name" }, s.name || "Version"),
            el("div", { class:"sub" }, `${s.phase || "Ajustado"} · ${when}`),
          ]),
          el("div", { class:"row" }, [
            el("button", { class:"btn", onclick: () => restoreSnapshot(s.id) }, "Restaurar"),
            el("button", { class:"btn ghost", onclick: () => { if(confirm("¿Eliminar esta version?")) { deleteSnapshot(s.id); render(); } } }, "Eliminar"),
          ]),
        ]);
      })) : el("div", { class:"notice" }, "Aun no tienes versiones guardadas. Pulsa Guardar version."),
      el("div", { class:"hr" }),
      el("div", { class:"small" }, "Consejo: guarda una version antes de ajustar cantidades o antes de Cerrado, para poder volver atras."),
    ]),
  ]);
}

function openSnapshots(){
  if(!UI.snapshots || typeof UI.snapshots !== "object") UI.snapshots = { open:false };
  UI.snapshots.open = true;
  render();
}


function addMaterialRow(){
  ensureMaterialsState();
  state.materials.push({
    id: "m_" + Math.random().toString(16).slice(2),
    product: "",
    cost: 0,
    pvp: 0,
    image: null, // dataURL
  });
  save(state);
  rerender();
}

function updateMaterialField(id, key, value){
  ensureMaterialsState();
  const m = state.materials.find(x => x.id === id);
  if(!m) return;
  if(key === "product") m.product = String(value || "");
  if(key === "cost") m.cost = safeNumber(value);
  if(key === "pvp") m.pvp = safeNumber(value);
  save(state);
  rerender();
}

function removeMaterialRow(id){
  ensureMaterialsState();
  state.materials = state.materials.filter(x => x.id !== id);
  save(state);
  rerender();
}

function onInventoryExcelSelected(file){
  if(!file) return;
  ensureMaterialsState();
  state.inventoryFileName = file.name || "inventario";
  save(state);
  // MVP: solo aceptar subida; importación automática vendrá después
  rerender();
}

function onMaterialImageSelected(id, file){
  if(!file) return;
  ensureMaterialsState();
  const m = state.materials.find(x => x.id === id);
  if(!m) return;
  const reader = new FileReader();
  reader.onload = () => {
    m.image = String(reader.result || "");
    save(state);
    rerender();
  };
  reader.readAsDataURL(file);
}

function clearMaterialImage(id){
  ensureMaterialsState();
  const m = state.materials.find(x => x.id === id);
  if(!m) return;
  m.image = null;
  save(state);
  rerender();
}

let state = load();
ensureStateUpgrade();

function applyDependencies(s){
  const map = Object.fromEntries(s.chapters.map(c => [c.id, c]));
  let changed = true;
  while(changed){
    changed = false;
    for(const ch of s.chapters){
      if(!ch.on) continue;
      const deps = ch.dependsOn || [];
      if(deps.some(d => map[d] && !map[d].on)){
        ch.on = false;
        ch.items.forEach(i => i.on = false);
        changed = true;
      }
    }
  }
}

function calcTotals(s, config){
  const cfg = config || {};
  const ivaVenta = Number(cfg.ivaVenta || 0);
  const margin = Number(cfg.margin || 0);
  const discount = Number(cfg.discount || 0);

  // Base (coste) = suma de partidas activas: (mat+mo o PU) + decorativo €/ud
  const coste = (s.chapters || [])
    .filter(c => c.on)
    .flatMap(c => (c.items || []).filter(i => i.on))
    .reduce((sum, i) => {
      const qty = Number(i.qty || 0);
      const hasSplit = ("mat_cost" in i) || ("mo_cost" in i);
      const basePU = hasSplit ? (Number(i.mat_cost || 0) + Number(i.mo_cost || 0)) : Number(i.pu || 0);
      const deco = Number(i.deco_cost || 0);
      return sum + qty * (basePU + deco);
    }, 0);

  // Venta (sin IVA): coste + margen - descuento (descuento total)
  const netoRaw = coste * (1 + margin) - discount;
  const neto = Math.max(0, netoRaw);

  const ivaImporte = neto * ivaVenta;
  const total = neto + ivaImporte;

  // Compat: "subtotal" es base venta sin IVA
  return { coste, neto, subtotal: neto, ivaVenta, ivaImporte, total, margin, discount };
}

// --- MOTOR (separación ligera para escalar sin romper UI) ---
const MOTOR = {
  calcTotals,
  applyEstanciasToChapters,
  ensureMaterialsState,
  filterChaptersByTrabajo,
  normalizeStateData,
};





function itemUnitCost(it){
  const hasSplit = ("mat_cost" in it) || ("mo_cost" in it);
  const basePU = hasSplit ? (Number(it.mat_cost || 0) + Number(it.mo_cost || 0)) : Number(it.pu || 0);
  const deco = Number(it.deco_cost || 0);
  return basePU + deco;
}

function calcChapterBase(ch){
  if(!ch || !ch.on) return 0;
  return (ch.items || []).filter(it => it.on).reduce((sum, it) => {
    const qty = Number(it.qty || 0);
    return sum + qty * itemUnitCost(it);
  }, 0);
}

function accessGranted(){
  if(DEMO_BYPASS) return true;
  return state.auth.isLoggedIn && state.auth.paymentStatus === "paid";
}

/** Router */
function navigate(path){
  history.pushState({}, "", path);
  try{
    ensureStateUpgrade();
    if(!state.ui || typeof state.ui !== "object") state.ui = {};
    state.ui.lastPath = path;
    save(state);
  }catch{}
  render();
}
window.addEventListener("popstate", () => render());
function route(){
  const p = window.location.pathname.replace(/\/+$/, "") || "/";
  return p;
}


/** Theme (PRO por profesión) — no afecta a Particular */
function proRoleSlug(v){
  const s = String(v || "").trim().toLowerCase();
  if(!s) return "";
  // Normaliza acentos y espacios
  const n = s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");
  const map = {
    "constructor": "constructor",
    "arquitecto": "arquitecto",
    "interiorista": "interiorista",
    "inmobiliaria": "inmobiliaria",
    "industrial": "industrial",
  };
  return map[n] || "";
}

function applyTheme(){
  const b = document.body;
  if(!b) return;

  const p = route();
  const proContext =
    p.startsWith("/pro") ||
    (p.startsWith("/login") && (state.auth.plan === "pro")) ||
    (p.startsWith("/entrada") && state.product === "pro");

  b.classList.toggle("proTheme", !!proContext);

  // Limpia roles previos
  for(const cls of Array.from(b.classList)){
    if(cls.startsWith("role-")) b.classList.remove(cls);
  }

  if(proContext){
    const prof = (state.auth && state.auth.customer) ? state.auth.customer.profesion : "";
    const slug = proRoleSlug(prof);
    if(slug) b.classList.add("role-" + slug);
  }
}


/** UI helpers */
function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k === "class") node.className = v;
    else if(k === "html") node.innerHTML = v;
    else if(k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if(k === "style") node.setAttribute("style", v);
    // Para atributos booleanos (disabled, checked, etc.) NO debemos escribir "false" como string,
    // porque la mera presencia del atributo los activa.
    else if(typeof v === "boolean"){
      if(v) node.setAttribute(k, "");
    }
    else node.setAttribute(k, v);
  }
  for(const c of (Array.isArray(children) ? children : [children])){
    if(c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function kpi(label, value){
  return el("div", { class:"kpi" }, [
    el("div", { class:"v" }, value),
    el("div", { class:"l" }, label),
  ]);
}

function stepper(product, phase){
  const steps = product === "pro"
    ? ["IA", "Partidas", "Materiales", "Presupuesto Cerrado"]
    : ["IA", "Estancias", "Partidas", "Materiales", "Presupuesto Cerrado"];

  const idx = (() => {
    if(product === "pro"){
      // Compatibilidad: "ajustes" = Partidas, "cerrado" = Presupuesto
      const p = (phase === "ajustes") ? "partidas" : (phase === "cerrado") ? "presupuesto" : phase;
      if(p === "ia" || p === "idea") return 0;
      if(p === "medicion") return 1; // compat: medicion ya no existe, se trata como Partidas
      if(p === "partidas") return 1;
      if(p === "materiales") return 2;
      if(p === "presupuesto") return 3;
      if(p === "marketplace") return 3;
      return 0;
    }else{
      // Particular: Estancias → Partidas (capítulos) → Materiales
      const p = (phase === "ajustes") ? "partidas" : phase; // compat
      if(p === "ia" || p === "idea") return 0;
      if(p === "estancias") return 1;
      if(p === "partidas") return 2;
      if(p === "materiales") return 3;
      if(p === "cerrado") return 4;
      if(p === "marketplace") return 4;
      return 0;
    }
  })();

  return el("div", { class:"stepper" }, steps.map((s,i) => {
    const cls = i < idx ? "step done" : i === idx ? "step active" : "step";
    return el("div", { class:cls }, [
      el("div", { class:"dot" }),
      el("div", {}, s),
    ]);
  }));
}


/* =========================
   PRO — panel colapsable (sistema minimalista)
   (UI transitoria: no toca localStorage)
   ========================= */
function proPanel(ui, key, title, bodyNodes, defaultOpen){
  if(!ui || typeof ui !== "object") ui = {};
  if(!ui.expanded || typeof ui.expanded !== "object") ui.expanded = {};
  if(!(key in ui.expanded)) ui.expanded[key] = !!defaultOpen;
  const isOpen = !!ui.expanded[key];
  const toggle = () => { ui.expanded[key] = !isOpen; render(); };
  return el("div", { class:"pro-panel" + (isOpen ? "" : " collapsed") }, [
    el("div", { class:"pro-panel-header", onclick: toggle }, [
      el("div", { class:"pro-panel-left" }, [
        el("div", { class:"chev" }, isOpen ? "▾" : "▸"),
        el("div", { style:"font-weight:900" }, title),
      ]),
      el("div", { class:"pro-panel-right" }, ""),
    ]),
    isOpen ? el("div", { class:"pro-panel-body" }, bodyNodes) : null,
  ]);
}

/** Actions */
function resetAll(){
  state = defaultState();
  save(state);
  navigate("/");
}

function setPlan(plan){
  state.auth.plan = plan;              // "particular" | "pro"
  state.product = plan === "pro" ? "pro" : "particular";
  state.entradaMode = null;
  save(state);
  render();
}

function updateCustomerField(key, val){
  state.auth.customer[key] = val;
  save(state);
}

function updateClientField(key, val){
  ensureStateUpgrade();
  state.project.client[key] = String(val ?? "");
  save(state);
}

function updateMarginPercent(value){
  const p = safeNumber(value);
  const clamped = Math.max(0, Math.min(300, p));
  state.config.margin = clamped / 100;
  save(state);
  renderTotalsOnly();
}

function updateDiscountEUR(value){
  const v = Math.max(0, safeNumber(value));
  state.config.discount = v;
  save(state);
  renderTotalsOnly();
}

function setIvaVentaPercent(pct){
  const p = Number(pct);
  const map = { 21: 0.21, 10: 0.10, 0: 0.0 };
  state.config.ivaVenta = map[p] ?? 0.21;
  state.config.allowIva10 = state.config.ivaVenta === 0.10;
  save(state);
  renderTotalsOnly();
}

function activeBudgetLines(){
  const groups = (state.chapters || [])
    .filter(ch => ch.on)
    .map(ch => ({ ch, items: (ch.items || []).filter(it => it.on) }))
    .filter(g => g.items.length);
  return groups;
}

function printPresupuestoCerrado(){
  ensureStateUpgrade();
  const totals = MOTOR.calcTotals(state, state.config);

  // Compat: Particular migra de "ajustes" a "estancias"
  if(isParticular() && state.phase === "ajustes"){
    state.phase = "estancias";
    save(state);
  }

  // Metadata presupuesto (número y fecha)
  if(!state.project) state.project = {};
  if(!state.project.meta) state.project.meta = {};
  if(!state.project.meta.budgetNo){
    const y = new Date().getFullYear();
    const rnd = Math.floor(Math.random()*9000)+1000;
    state.project.meta.budgetNo = `MOD-${y}-${rnd}`;
  }
  if(!state.project.meta.createdAt){
    state.project.meta.createdAt = new Date().toISOString();
  }
  save(state);

  const me = state.auth && state.auth.customer ? state.auth.customer : {};
  const cl = state.project && state.project.client ? state.project.client : {};
  const meta = state.project.meta;

  const wfLabel = state.tipoObra ? WORKFLOWS[state.tipoObra].label : "";
  const viewLabel = isParticular() ? "Particular" : "PRO";

  const esc = (s) => String(s || "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
  const pct = (n) => Math.round((Number(n||0))*100);
  const money = (n) => (Number(n||0)).toFixed(2) + " €";
  const dateES = (iso) => {
    try{
      const d = new Date(iso);
      const dd = String(d.getDate()).padStart(2,"0");
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }catch{ return ""; }
  };

  const groups = activeBudgetLines();
  const mats = Array.isArray(state.materials) ? state.materials : [];
  const matsRows = mats.filter(m => (Number(m.qty||0) > 0) || (Number(m.pvp||0) > 0) || (Number(m.cost||0) > 0));

  const linesHtml = groups.map(g => {
    const chName = esc(g.ch.name);
    const chBase = calcChapterBase(g.ch);
    const itemRows = g.items.map(it => {
      const qty = Number(it.qty || 0);
      const unit = esc(it.unit || "");
      const mat = Number(it.materialCost || 0);
      const mo  = Number(it.laborCost || 0);
      const base = (qty * (mat + mo));
      return `<tr>
        <td class="indent">${esc(it.name)}</td>
        <td class="num">${qty.toFixed(2)}</td>
        <td>${unit}</td>
        <td class="num">${money(mat)}</td>
        <td class="num">${money(mo)}</td>
        <td class="num">${money(base)}</td>
      </tr>`;
    }).join("");

    return `
      <tr class="chapter-row">
        <td><strong>${chName}</strong></td>
        <td class="num"></td>
        <td></td>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num"><strong>${money(chBase)}</strong></td>
      </tr>
      ${itemRows}
    `;
  }).join("");

  const matsHtml = matsRows.length ? matsRows.map(m => {
    const qty = Number(m.qty||0);
    const pvp = Number(m.pvp||0);
    const cost = Number(m.cost||0);
    return `<tr>
      <td>${esc(m.name)}</td>
      <td class="num">${qty ? qty.toFixed(2) : ""}</td>
      <td class="num">${pvp ? money(pvp) : ""}</td>
      <td class="num">${cost ? money(cost) : ""}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="4" class="muted">Sin materiales decorativos.</td></tr>`;

  const contractText = `
    <h2>Contrato estándar (intocable) — Placeholder</h2>
    <p class="muted">
      Este documento es un placeholder del contrato estándar. En el producto final, el contrato será un texto legal fijo
      (no editable) y solo se habilitará tras <strong>Cerrado</strong>. Se rellenará automáticamente con los datos del
      cliente, empresa, importe y alcance.
    </p>
    <div class="siggrid">
      <div class="sigbox"><div class="muted">Firma cliente</div><div class="sigline"></div></div>
      <div class="sigbox"><div class="muted">Firma profesional</div><div class="sigline"></div></div>
    </div>
  `;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>Presupuesto — MÓDULO</title>
<style>
  @page{ size:A4; margin:18mm; }
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111; margin:0}
  .page{padding:0}
  h1{margin:0 0 6px 0; font-size:20px}
  h2{margin:0 0 10px 0; font-size:14px}
  .muted{color:#555; font-size:12px}
  .meta{display:flex; justify-content:space-between; gap:12px; margin-top:6px; flex-wrap:wrap}
  .pill{border:1px solid #e5e7eb; border-radius:999px; padding:6px 10px; font-size:12px; display:inline-block}
  .grid{display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:14px}
  .box{border:1px solid #e5e7eb; border-radius:10px; padding:12px}
  .box h3{margin:0 0 8px 0; font-size:13px}
  table{width:100%; border-collapse:collapse; margin-top:14px}
  th,td{border-bottom:1px solid #e5e7eb; padding:7px; font-size:11px; vertical-align:top}
  th{background:#f8fafc; text-align:left}
  .num{text-align:right; white-space:nowrap}
  .indent{padding-left:18px}
  .chapter-row td{background:#fcfcfd}
  .totals{margin-top:14px; border:1px solid #e5e7eb; border-radius:10px; padding:12px}
  .trow{display:flex; justify-content:space-between; font-size:12px; margin:6px 0}
  .strong{font-weight:800}
  .pagebreak{page-break-before: always; margin-top:0}
  .siggrid{display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:22px}
  .sigbox{border:1px dashed #cbd5e1; border-radius:10px; padding:12px}
  .sigline{height:46px; border-bottom:1px solid #111; margin-top:26px}
</style></head><body>
  <div class="page">
    <h1>Presupuesto ${esc(viewLabel)} — ${esc(wfLabel)}</h1>

    <div class="meta">
      <div class="pill"><strong>Nº</strong> ${esc(meta.budgetNo)}</div>
      <div class="pill"><strong>Fecha</strong> ${esc(dateES(meta.createdAt))}</div>
      <div class="pill"><strong>IVA compra</strong> 21% (bloqueado)</div>
      <div class="pill"><strong>IVA venta</strong> ${pct(state.config.ivaVenta)}%</div>
    </div>

    <div class="grid">
      <div class="box">
        <h3>Cliente</h3>
        <div class="muted">${esc([cl.nombre, cl.apellidos].filter(Boolean).join(" "))}</div>
        <div class="muted">${esc(cl.empresa)}${cl.nif ? " · " + esc(cl.nif) : ""}</div>
        <div class="muted">${esc(cl.email)}${cl.telefono ? " · " + esc(cl.telefono) : ""}</div>
        <div class="muted">${esc([cl.direccion, cl.ciudad].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="box">
        <h3>Profesional</h3>
        <div class="muted">${esc([me.nombre, me.apellidos].filter(Boolean).join(" "))}</div>
        <div class="muted">${esc(me.empresa)}${me.nif ? " · " + esc(me.nif) : ""}</div>
        <div class="muted">${esc(me.email)}${me.telefono ? " · " + esc(me.telefono) : ""}</div>
        <div class="muted">${esc([me.direccion, me.ciudad].filter(Boolean).join(" · "))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="num">Cant.</th>
          <th>Ud.</th>
          <th class="num">Mat.</th>
          <th class="num">MO</th>
          <th class="num">Base</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml || `<tr><td colspan="6" class="muted">No hay partidas activas.</td></tr>`}
      </tbody>
    </table>

    <h2 style="margin-top:18px">Materiales decorativos</h2>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th class="num">Cant.</th>
          <th class="num">PVP</th>
          <th class="num">Coste</th>
        </tr>
      </thead>
      <tbody>
        ${matsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div class="trow"><span>Coste base</span><span>${money(totals.coste)}</span></div>
      <div class="trow"><span>Margen (${pct(totals.margin)}%)</span><span>${money(totals.coste * (totals.margin||0))}</span></div>
      <div class="trow"><span>Decorativos (PVP)</span><span>${money(totals.decorativosPvp || 0)}</span></div>
      <div class="trow"><span>Subtotal</span><span>${money(totals.subtotal || totals.neto)}</span></div>
      <div class="trow"><span>Descuento</span><span>-${money(totals.descuentoImporte || 0)}</span></div>
      <div class="trow"><span>Base (sin IVA)</span><span>${money(totals.neto)}</span></div>
      <div class="trow"><span>IVA venta (${pct(totals.ivaVenta)}%)</span><span>${money(totals.ivaImporte)}</span></div>
      <div class="trow"><span class="strong">TOTAL</span><span class="strong">${money(totals.total)}</span></div>
    </div>
  </div>

  <div class="pagebreak">
    ${contractText}
  </div>
</body></html>`;

  const w = window.open("", "_blank");
  if(!w){
    alert("El navegador bloqueó la ventana de impresión. Permite popups para imprimir/guardar PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try{ w.print(); }catch{} }, 250);
}


function canPay(){
  const c = state.auth.customer;
  // mínimos para demo
  if(!c.nombre || !c.email || !c.telefono) return false;
  if(state.auth.plan === "pro"){
    if(!c.empresa || !c.nif || !c.profesion) return false;
  }
  return true;
}

function payNow(){
  // En demo: simulamos pago exitoso
  state.auth.isLoggedIn = true;
  state.auth.paymentStatus = "paid";
  save(state);
  // enviar al flujo del producto correspondiente
  navigate("/entrada");
}

function setEntradaFile(file){
  state.entradaFileName = file ? file.name : null;
  save(state);
}

function logout(){
  // mantiene datos por comodidad pero "sale"
  state.auth.isLoggedIn = false;
  state.auth.paymentStatus = "none";
  state.auth.plan = null;
  state.entradaMode = null;
  save(state);
  navigate("/");
}

function generateBase(tipoObra, product){
  const wf = WORKFLOWS[tipoObra];
  if(!wf){
    alert("No se pudo generar: tipo de obra inválido.");
    return;
  }
  const template = deepClone(wf.chapters).map(ch => ({
    ...ch,
    on: true,
    items: ch.items.map(it => ({ ...it, on: true, deco_cost: (typeof it.deco_cost === 'number' ? it.deco_cost : 0) })),
  }));
  state.tipoObra = tipoObra;
  state.workflowId = wf.id;

  const prod = product || state.product; // "pro" | "particular"
  // PRO ya no muestra pantalla "Medición" (se elimina). Arrancamos en Partidas.
  // Particular: sustituimos Partidas por Estancias (medidas por estancia) antes de Materiales.
  state.phase = (prod === "particular") ? "estancias" : "ajustes";

  if(prod === "particular"){
    // reset estancias para este presupuesto
    state.estancias = null;
    state.estanciasBase = null;
    state.estanciasBaseWorkflowId = null;
  }

  state.chapters = template;

  // Si es un encargo puntual en PRO, aplicamos filtro por trabajo automáticamente.
  if(prod === "pro" && tipoObra === "puntual"){
    ensureStateUpgrade();
    const job = (state.ui && state.ui.proTrabajo) ? state.ui.proTrabajo : "all";
    if(job && job !== "all") applyTrabajoFilterToState(job);
  }

  save(state);
  render();
}


function goToPhase(phase){
  // Regla: Marketplace solo disponible tras Cerrado
  if(phase === "marketplace" && state.phase !== "cerrado"){
    alert("Marketplace solo disponible tras Presupuesto Cerrado.");
    return;
  }
  // Compat: fase antigua "medicion" redirige a Partidas ("ajustes")
  state.phase = (phase === "medicion") ? "ajustes" : phase;
  save(state);
  render();
}



function activateMarketplacePro(){
  ensureStateUpgrade();
  state.marketplacePro.subscribed = true;
  state.marketplacePro.visible = true;
  state.marketplacePro.startedAt = new Date().toISOString().slice(0,10);
  save(state);
  render();
}

function cancelMarketplacePro(){
  ensureStateUpgrade();
  state.marketplacePro.subscribed = false;
  state.marketplacePro.visible = false;
  state.marketplacePro.startedAt = null;
  save(state);
  render();
}

function toggleChapter(chId){
  const ch = state.chapters.find(c => c.id === chId);
  if(!ch) return;
  ch.on = !ch.on;
  ch.items.forEach(i => i.on = ch.on);
  applyDependencies(state);
  save(state);
  render();
}

function toggleItem(chId, itemId){
  const ch = state.chapters.find(c => c.id === chId);
  if(!ch) return;
  const it = ch.items.find(i => i.id === itemId);
  if(!it) return;
  it.on = !it.on;
  if(ch.items.every(i => !i.on)) ch.on = false;
  if(it.on) ch.on = true;
  applyDependencies(state);
  save(state);
  render();
}

function updateQty(chId, itemId, value){
  const ch = state.chapters.find(c => c.id === chId);
  if(!ch) return;
  const it = ch.items.find(i => i.id === itemId);
  if(!it) return;
  const n = Number(String(value).replace(",", "."));
  if(Number.isFinite(n) && n >= 0){
    it.qty = n;
    save(state);
    renderTotalsOnly();
  }
}

function updateDecoCost(chId, itemId, value){
  const ch = state.chapters.find(c => c.id === chId);
  if(!ch) return;
  const it = (ch.items || []).find(i => i.id === itemId);
  if(!it) return;
  const n = Number(String(value).replace(",", "."));
  it.deco_cost = isFinite(n) ? n : 0;
  save(state);
  renderTotalsOnly();
}

// --- PRO editor helpers (unidad + coste material negro + mano de obra) ---
function ensureCostSplit(it){
  if(!it) return;
  if(!("mat_cost" in it) && !("mo_cost" in it)){
    it.mat_cost = Number(it.pu || 0);
    it.mo_cost = 0;
  }
}

function openEditItem(chId, itemId){
  const ch = (state.chapters || []).find(c => c.id === chId);
  const it = ch && (ch.items || []).find(i => i.id === itemId);
  if(!it) return;
  ensureCostSplit(it);
  UI.edit = { chId, itemId };
  save(state);
  render();
}
function closeEditItem(){
  UI.edit = null;
  render();
}

function updateUnit(chId, itemId, value){
  const ch = (state.chapters || []).find(c => c.id === chId);
  const it = ch && (ch.items || []).find(i => i.id === itemId);
  if(!it) return;
  it.unit = String(value || "");
  save(state);
}

function updateMatCost(chId, itemId, value){
  const ch = (state.chapters || []).find(c => c.id === chId);
  const it = ch && (ch.items || []).find(i => i.id === itemId);
  if(!it) return;
  ensureCostSplit(it);
  const n = Number(String(value).replace(",", "."));
  it.mat_cost = isFinite(n) ? n : 0;
  save(state);
  renderTotalsOnly();
}

function updateMoCost(chId, itemId, value){
  const ch = (state.chapters || []).find(c => c.id === chId);
  const it = ch && (ch.items || []).find(i => i.id === itemId);
  if(!it) return;
  ensureCostSplit(it);
  const n = Number(String(value).replace(",", "."));
  it.mo_cost = isFinite(n) ? n : 0;
  save(state);
  renderTotalsOnly();
}

function ivaControls(){
  const cfg = state.config;

  const chk1 = el("input", { type:"checkbox" });
  const chk2 = el("input", { type:"checkbox" });
  const chk3 = el("input", { type:"checkbox" });

  if(cfg.allowIva10){ chk1.checked = true; chk2.checked = true; chk3.checked = true; }

  return el("div", { class:"card", style:"padding:12px;background:rgba(15,23,42,.35)" }, [
    el("div", { class:"row" }, [
      el("div", {}, [
        el("div", { style:"font-weight:900" }, "¿Aplicar IVA venta 10%?"),
        el("div", { class:"small" }, "Marca los checks para habilitar 10%. Si no, queda en 21%."),
      ]),
      el("button", { class:"btn", onclick: () => {
        const ok = chk1.checked && chk2.checked && chk3.checked;
        cfg.allowIva10 = ok;
        cfg.ivaVenta = ok ? 0.10 : 0.21;
        save(state);
        render();
      }}, "Aplicar"),
    ]),
    el("div", { class:"hr" }),
    el("label", { class:"small" }, [chk1, " Es vivienda (uso residencial)"]),
    el("div", {}),
    el("label", { class:"small" }, [chk2, " Es reforma/rehabilitación que cumple condiciones"]),
    el("div", {}),
    el("label", { class:"small" }, [chk3, " El destinatario es particular (no promotor/empresa)"]),
    el("div", { class:"hr" }),
    el("div", { class:"small" }, `IVA compra: ${Math.round(cfg.ivaCompra*100)}% (bloqueado) · IVA venta actual: ${Math.round(cfg.ivaVenta*100)}%`),
  ]);
}

/** Views */
function topbar(){
  const p = route();
  const showLogin = !state.auth.isLoggedIn;
  return el("div", { class:"topbar" }, [
    el("div", { class:"brand", onclick: () => navigate("/") }, [
      el("div", { class:"pill" }, "MÓDULO"),
      el("div", {}, "Demo"),
      el("div", { class:"pill" }, "Netlify-ready"),
    ]),
    el("div", { class:"nav" }, [
      state.auth.isLoggedIn ? el("div", { class:"pill" }, state.auth.plan === "pro" ? "PRO" : "Particular") : null,
      state.auth.isLoggedIn ? el("button", { class:"btn ghost", onclick: () => navigate("/entrada") }, "Ir a mi panel") : null,
      showLogin ? el("button", { class:"btn primary", onclick: () => navigate("/login") }, "Login") : null,
      state.auth.isLoggedIn ? el("button", { class:"btn ghost", onclick: logout }, "Salir") : null,
      el("button", { class:"btn ghost", onclick: resetAll }, "Reset"),
    ].filter(Boolean)),
  ]);
}

function topbarLanding(){
  // SOLO para landing: replicar exactamente la UI de la captura (sin tocar PRO)
  return el("div", { class:"topbar" }, [
    el("div", { class:"brand", onclick: () => navigate("/") }, [
      el("div", { class:"pill" }, "MÓDULO"),
    ]),
    el("div", { class:"nav" }, [
      el("button", { class:"btn primary", onclick: () => navigate("/login") }, "Login"),
    ]),
  ]);
}

function viewLanding(){
  ensureStateUpgrade();

  // ¿hay sesión para continuar?
  const canResume = !!(state && state.auth && state.auth.isLoggedIn && state.auth.paymentStatus === "paid");
  const hasWork = !!(state && state.tipoObra && Array.isArray(state.chapters) && state.chapters.length);

  const resumePath = (() => {
    if(!canResume) return null;
    // si ya generó base, entra al producto (PRO/Particular) en el punto donde se quedó
    if(hasWork){
      const prod = state.product || (state.auth.plan === "pro" ? "pro" : "particular");
      return prod === "pro" ? "/pro" : "/particular";
    }
    // si solo está logueado, vuelve a Entrada
    return "/entrada";
  })();

  // Demo guiada (4 pasos)
  if(!UI.landingTour || typeof UI.landingTour !== "object") UI.landingTour = { open:false, step:0 };
  const t = UI.landingTour;

  const steps = [
    { title:"1/4 — Elige tu panel", text:"Selecciona Particular o Profesional. En demo puedes entrar sin pagar." },
    { title:"2/4 — Entrada rápida", text:"Elige tipo de obra (y plano opcional en PRO). MÓDULO genera una plantilla base." },
    { title:"3/4 — Ajusta lo pedido", text:"Activa/desactiva capítulos y ajusta cantidades. En PRO añade mano de obra y material negro; decorativos en Materiales." },
    { title:"4/4 — Cierra y exporta", text:"En Presupuesto Cerrado defines IVA venta, margen y generas el PDF. Marketplace y contrato se desbloquean solo tras Cerrado." },
  ];

  const openTour = () => { t.open = true; t.step = 0; render(); };
  const closeTour = () => { t.open = false; render(); };
  const next = () => { t.step = Math.min(steps.length-1, t.step+1); render(); };
  const prev = () => { t.step = Math.max(0, t.step-1); render(); };

  return el("div", { class:"container" }, [
    topbarLanding(),
    el("div", { class:"hero" }, [
      el("div", { class:"heroCard" }, [
        el("div", { class:"heroInner" }, [
          el("div", { class:"logoM" }, [ el("span", {}, "M") ]),
          el("h1", { class:"heroTitle" }, "MÓDULO"),
          el("p", { class:"heroHook" }, "De la ejecución a la transformación. Presupuestos claros, rápidos y fiables."),
          el("div", { class:"heroActions" }, [
            el("button", { class:"btn primary", onclick: () => {
              state.auth.plan = "particular";
              state.product = "particular";
              save(state);
              navigate("/login");
            }}, "Particular"),
            el("button", { class:"btn", onclick: () => {
              state.auth.plan = "pro";
              state.product = "pro";
              save(state);
              navigate("/login");
            }}, "Profesional"),
            canResume && resumePath ? el("button", { class:"btn ghost", onclick: () => navigate(resumePath) }, "Continuar") : null,
          ].filter(Boolean)),
          el("div", { class:"row", style:"margin-top:12px; gap:10px; flex-wrap:wrap" }, [
            el("button", { class:"btn ghost", onclick: openTour }, "Demo guiada (4 pasos)"),
            el("button", { class:"btn danger", disabled:true }, "IA por plano (Próximamente)"),
          ]),
          canResume ? el("div", { class:"small", style:"margin-top:10px" }, "Tu sesión se guarda automáticamente en este navegador.") : null,
        ].filter(Boolean)),
      ]),
    ]),
    t.open ? el("div", { class:"modalOverlay", onclick:(e)=>{ if(e.target && e.target.classList && e.target.classList.contains('modalOverlay')) closeTour(); } }, [
      el("div", { class:"modalCard" }, [
        el("div", { class:"modalHead" }, [
          el("div", { style:"font-weight:900" }, "Demo guiada"),
          el("button", { class:"btn ghost", style:"padding:6px 10px", onclick: closeTour }, "Cerrar"),
        ]),
        el("div", { class:"hr" }),
        el("h3", { style:"margin:0 0 8px 0" }, steps[t.step].title),
        el("div", { class:"muted" }, steps[t.step].text),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: prev, disabled: t.step === 0 }, "Anterior"),
          el("button", { class:"btn primary", onclick: next, disabled: t.step === steps.length-1 }, "Siguiente"),
        ]),
      ]),
    ]) : null,
  ]);
}

function viewLogin(){
  const plan = state.auth.plan || "particular";
  const price = plan === "pro" ? 49 : 9;
  const priceLabel = plan === "pro" ? "Licencia profesional" : "Proyecto particular";

  const c = state.auth.customer;

  return el("div", { class:"container" }, [
    topbar(),
    el("div", { class:"grid two" }, [
      el("div", { class:"card" }, [
        el("h2", {}, "Acceso + pago"),
        el("div", { class:"muted" }, "Completa tus datos y realiza el pago para empezar."),
        el("div", { class:"hr" }),
        el("div", { class:"tabs" }, [
          el("div", { class:"tab" + (plan === "particular" ? " active" : ""), onclick: () => setPlan("particular") }, "Particular"),
          el("div", { class:"tab" + (plan === "pro" ? " active" : ""), onclick: () => setPlan("pro") }, "Profesional"),
        ]),
        el("div", { class:"form" }, [
          el("div", { class:"row2" }, [
            field("Nombre", "nombre", c.nombre),
            field("Apellidos", "apellidos", c.apellidos),
          ]),
          el("div", { class:"row2" }, [
            field("Email", "email", c.email, "email"),
            field("Teléfono", "telefono", c.telefono, "tel"),
          ]),
          el("div", { class:"row2" }, [
            field("Ciudad", "ciudad", c.ciudad),
            field("Dirección", "direccion", c.direccion),
          ]),
          plan === "pro" ? el("div", { class:"row2" }, [
            field("Empresa", "empresa", c.empresa),
            field("NIF/CIF", "nif", c.nif),
          ]) : null,
          plan === "pro" ? el("div", { class:"row2" }, [
            el("div", { class:"field" }, [
              el("div", { class:"label" }, "Profesión"),
              el("select", {
                class:"input",
                onchange: (e) => { updateCustomerField("profesion", e.target.value); applyTheme(); },
              }, [
                el("option", { value:"", selected: !c.profesion }, "Selecciona…"),
                el("option", { value:"Constructor", selected: c.profesion === "Constructor" }, "Constructor"),
                el("option", { value:"Arquitecto", selected: c.profesion === "Arquitecto" }, "Arquitecto"),
                el("option", { value:"Interiorista", selected: c.profesion === "Interiorista" }, "Interiorista"),
                el("option", { value:"Inmobiliaria", selected: c.profesion === "Inmobiliaria" }, "Inmobiliaria"),
                el("option", { value:"Industrial", selected: c.profesion === "Industrial" }, "Industrial"),
              ]),
            ]),
            el("div", { class:"small" }, "El color del interfaz cambia según la profesión."),
          ]) : null,
          el("div", { class:"hr" }),
          el("button", {
            class:"btn primary",
            disabled: !canPay() && !DEMO_BYPASS,
            onclick: payNow,
          }, `Pagar ${formatEUR(price)} — ${priceLabel}`),
          el("div", { class:"small" }, "Demo: el pago se simula. También puedes entrar sin pagar (solo demo). Integración real (Stripe/Mircapays) → Próximamente."),
          el("button", {
            class:"btn",
            onclick: () => {
              // Entra sin pagar (solo demo)
              state.auth.isLoggedIn = true;
              state.auth.paymentStatus = "paid";
              state.auth.plan = state.auth.plan || "particular";
              state.product = state.auth.plan === "pro" ? "pro" : "particular";
              save(state);
              navigate("/entrada");
            }
          }, "Entrar en demo sin pagar"),
        ].filter(Boolean)),
      ]),
      el("div", { class:"card" }, [
        el("h2", {}, "Tu plan"),
        el("div", { class:"kpis" }, [
          kpi("Precio", formatEUR(price)),
          kpi("Modalidad", plan === "pro" ? "Licencia" : "Por proyecto"),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"success" }, plan === "pro"
          ? "PRO: herramienta para generar presupuestos para particulares (capítulos, mediciones, versiones, materiales, margen)."
          : "Particular: flujo simple para obtener un presupuesto entendible y cerrar para Marketplace."),
        el("div", { class:"hr" }),
        el("div", { class:"warn" }, "En este MVP básico, lo primero es: tipo de obra → plantilla completa → quitar/poner → Cerrado."),
      ]),
    ]),
  ]);
}

function clientField(label, key, value, type="text"){
  return el("div", { class:"field" }, [
    el("div", { class:"label" }, label),
    el("input", {
      class:"input",
      type,
      value: value || "",
      oninput: (e) => updateClientField(key, e.target.value),
      placeholder: label,
    }),
  ]);
}

function field(label, key, value, type="text"){
  return el("div", { class:"field" }, [
    el("div", { class:"label" }, label),
    el("input", {
      class:"input",
      type,
      value: value || "",
      oninput: (e) => updateCustomerField(key, e.target.value),
      placeholder: label,
    }),
  ]);
}


function viewEntrada(){
  if(!accessGranted()){
    return el("div", { class:"container" }, [
      topbar(),
      el("div", { class:"card" }, [
        el("h2", {}, "Acceso requerido"),
        el("div", { class:"muted" }, "Para continuar necesitas completar acceso (en demo puedes entrar sin pagar)."),
        el("div", { class:"hr" }),
        el("button", { class:"btn primary", onclick: () => navigate("/login") }, "Ir a Login"),
      ]),
    ]);
  }

  const isPro = state.product === "pro";
  const planLabel = isPro ? "Profesional" : "Particular";

  // PRO — mismo sistema minimalista (paneles colapsables)
  if(isPro){
    if(!UI.proEntrada || typeof UI.proEntrada !== "object") UI.proEntrada = { viewOpen:false, expanded:{} };
    const pe = UI.proEntrada;

    const openView = () => { pe.viewOpen = true; render(); };
    const closeView = () => { pe.viewOpen = false; render(); };
    const expandAll = () => { pe.expanded.plano = true; pe.expanded.tipo = true; render(); };
    const collapseAll = () => { pe.expanded.plano = false; pe.expanded.tipo = false; render(); };

    const planoPanel = proPanel(pe, "plano", "Plano (opcional)", [
      el("div", { class:"small" }, "PDF o imagen. Interpretación por IA: Próximamente."),
      el("div", { class:"hr" }),
      el("input", {
        class:"input",
        type:"file",
        accept:"application/pdf,image/*",
        onchange: (e) => {
          const f = e.target.files && e.target.files[0];
          setEntradaFile(f);
          alert(f ? `Plano cargado: ${f.name} (IA: Próximamente)` : "Sin archivo");
          render();
        },
        title: "Subir plano",
      }),
      state.entradaFileName
        ? el("div", { class:"success", style:"margin-top:10px" }, `Plano seleccionado: ${state.entradaFileName}`)
        : el("div", { class:"small", style:"margin-top:8px" }, "También puedes continuar sin plano."),
    ], false);

    const tipoPanel = proPanel(pe, "tipo", "Tipo de encargo", [
      el("div", { class:"muted" }, "Elige una opción. Generaremos una plantilla base y luego podrás quitar/poner capítulos y partidas."),
      el("div", { class:"hr" }),
      el("div", { class:"cards" }, [
        el("div", { class:"choice", onclick: () => { state.tipoObra = "integral"; state.ui.proTrabajo = "all"; save(state); render(); } }, [
          el("div", { class:"t" }, "Reforma integral"),
          el("div", { class:"d" }, "Todo lo típico de una reforma integral. Luego quitas lo que no necesitas."),
          state.tipoObra === "integral" ? el("div", { class:"success", style:"margin-top:10px" }, "Seleccionado") : null,
        ].filter(Boolean)),
        el("div", { class:"choice", onclick: () => { state.tipoObra = "parcial"; state.ui.proTrabajo = "all"; save(state); render(); } }, [
          el("div", { class:"t" }, "Reforma parcial"),
          el("div", { class:"d" }, "Plantilla más ligera para mejoras/acabados."),
          state.tipoObra === "parcial" ? el("div", { class:"success", style:"margin-top:10px" }, "Seleccionado") : null,
        ].filter(Boolean)),
        el("div", { class:"choice", onclick: () => { state.tipoObra = "puntual"; if(!state.ui.proTrabajo || state.ui.proTrabajo === "all") state.ui.proTrabajo = "pintura"; save(state); render(); } }, [
          el("div", { class:"t" }, "Puntual"),
          el("div", { class:"d" }, "Trabajos unitarios: pintura, fontanería, carpintería, etc."),
          state.tipoObra === "puntual" ? el("div", { class:"success", style:"margin-top:10px" }, "Seleccionado") : null,
        ].filter(Boolean)),
      ]),
      state.tipoObra === "puntual" ? el("div", { class:"field", style:"margin-top:12px" }, [
        el("div", { class:"label" }, "Trabajo"),
        el("select", { class:"input", value: (state.ui && state.ui.proTrabajo) ? state.ui.proTrabajo : "pintura", onchange: (e) => { state.ui.proTrabajo = e.target.value; save(state); } }, [
          el("option", { value:"pintura" }, "Pintura"),
          el("option", { value:"fontaneria" }, "Fontanería"),
          el("option", { value:"electricidad" }, "Electricidad"),
          el("option", { value:"carpinteria" }, "Carpintería"),
          el("option", { value:"aluminio" }, "Aluminio"),
          el("option", { value:"derribos" }, "Derribos"),
          el("option", { value:"clima" }, "Clima / Aerotermia"),
        ]),
        el("div", { class:"small" }, "En Puntual, el presupuesto base se genera ya filtrado por este trabajo."),
      ]) : null,
    ], true);

    return el("div", { class:"container" }, [
      topbar(),
      el("div", { class:"card pro-entrada", style:"position:relative" }, [
        el("h2", {}, `Entrada de información — ${planLabel}`),
        el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openView }, "Vista"),
        el("div", { class:"muted" }, "1) (Opcional) Sube un plano para interpretación por IA. 2) Elige el tipo de obra para generar el presupuesto base."),
        el("div", { class:"hr" }),
        planoPanel,
        tipoPanel,
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: () => navigate("/") }, "Inicio"),
          el("button", {
            class:"btn primary",
            disabled: !state.tipoObra,
            onclick: () => {
              // Genera presupuesto base y entra a ajustes directamente
              generateBase(state.tipoObra, state.product);
              navigate(state.product === "pro" ? "/pro" : "/particular");
            }
          }, "Generar presupuesto base"),
        ]),
        !state.tipoObra ? el("div", { class:"notice", style:"margin-top:12px" }, "Selecciona el tipo de obra para continuar.") : null,
      ].filter(Boolean)),
      pe.viewOpen ? el("div", { style:[
        "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
      ].join(";") }, [
        el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
          el("h2", {}, "Vista — Entrada (PRO)"),
          el("div", { class:"muted" }, "Vista limpia por defecto. Puedes desplegar/contraer todos los paneles."),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: expandAll }, "Desplegar todo"),
            el("button", { class:"btn ghost", onclick: collapseAll }, "Contraer todo"),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn primary", onclick: closeView }, "Cerrar"),
          ]),
        ]),
      ]) : null,
    ]);
  }

  // Particular — sin cambios
return el("div", { class:"container" }, [
      topbar(),
      el("div", { class:"card" }, [
        el("h2", {}, `Entrada de información — ${planLabel}`),
        el("div", { class:"muted" }, "1) (Opcional) Sube un plano para interpretación por IA. 2) Elige el tipo de obra para generar el presupuesto base."),
        el("div", { class:"hr" }),
  
        el("h3", {}, "Plano (opcional)"),
        el("div", { class:"small" }, "PDF o imagen. Interpretación por IA: Próximamente."),
        el("div", { class:"hr" }),
        el("input", {
          class:"input",
          type:"file",
          accept:"application/pdf,image/*",
          onchange: (e) => {
            const f = e.target.files && e.target.files[0];
            setEntradaFile(f);
            alert(f ? `Plano cargado: ${f.name} (IA: Próximamente)` : "Sin archivo");
            render();
          },
          title: "Subir plano",
        }),
        state.entradaFileName ? el("div", { class:"success", style:"margin-top:10px" }, `Plano seleccionado: ${state.entradaFileName}`) : el("div", { class:"small", style:"margin-top:8px" }, "También puedes continuar sin plano."),
  
        el("div", { class:"hr" }),
  
        el("h3", {}, "Tipo de encargo"),
        el("div", { class:"muted" }, "Elige una opción. Generaremos una plantilla base y luego podrás quitar/poner capítulos y partidas."),
        el("div", { class:"hr" }),
        el("div", { class:"cards" }, [
          el("div", { class:"choice", onclick: () => { state.tipoObra = "integral"; save(state); render(); } }, [
            el("div", { class:"t" }, "Reforma integral"),
            el("div", { class:"d" }, "Todo lo típico de una reforma integral. Luego quitas lo que no necesitas."),
            state.tipoObra === "integral" ? el("div", { class:"success", style:"margin-top:10px" }, "Seleccionado") : null,
          ].filter(Boolean)),
          el("div", { class:"choice", onclick: () => { state.tipoObra = "parcial"; save(state); render(); } }, [
            el("div", { class:"t" }, "Reforma parcial"),
            el("div", { class:"d" }, "Plantilla más ligera para mejoras/acabados."),
            state.tipoObra === "parcial" ? el("div", { class:"success", style:"margin-top:10px" }, "Seleccionado") : null,
          ].filter(Boolean)),
          el("div", { class:"choice", onclick: () => { state.tipoObra = "puntual"; save(state); render(); } }, [
            el("div", { class:"t" }, "Puntual"),
            el("div", { class:"d" }, "Trabajos unitarios: pintura, fontanería, carpintería, etc."),
            state.tipoObra === "puntual" ? el("div", { class:"success", style:"margin-top:10px" }, "Seleccionado") : null,
          ].filter(Boolean)),
        ]),
  
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: () => navigate("/") }, "Inicio"),
          el("button", {
            class:"btn primary",
            disabled: !state.tipoObra,
            onclick: () => {
              // Genera presupuesto base y entra a ajustes directamente
              generateBase(state.tipoObra, state.product);
              navigate(state.product === "pro" ? "/pro" : "/particular");
            }
          }, "Generar presupuesto base"),
        ]),
        !state.tipoObra ? el("div", { class:"notice", style:"margin-top:12px" }, "Selecciona el tipo de obra para continuar.") : null,
      ].filter(Boolean)),
    ]);
}
function viewParticular(){
  if(!accessGranted()){
    // si no pagó, lo llevamos a login
    return el("div", { class:"container" }, [
      topbar(),
      el("div", { class:"card" }, [
        el("h2", {}, "Acceso requerido"),
        el("div", { class:"muted" }, "Para crear un presupuesto necesitas completar acceso + pago."),
        el("div", { class:"hr" }),
        el("button", { class:"btn primary", onclick: () => navigate("/login") }, "Ir a Login"),
      ]),
    ]);
  }

  const wfLabel = state.tipoObra ? WORKFLOWS[state.tipoObra].label : "";
  const header = el("div", { class:"card" }, [
    el("h2", {}, "Particular"),
    stepper("particular", state.phase),
    el("div", { class:"hr" }),
    el("div", { class:"muted" }, "Elige tipo de obra, ajusta lo que entra y cierra el presupuesto."),
  ]);

  if(!state.tipoObra || state.phase === "idea"){
    ensureStateUpgrade();
    if(!state.ui) state.ui = {};
    if(!state.ui.proInputMode) state.ui.proInputMode = "manual";
    const setProInputMode = (m) => { ensureStateUpgrade(); state.ui.proInputMode = m; save(state); render(); };
    return el("div", { class:"container" }, [
      topbar(),
      header,
      el("div", { class:"card" }, [
        el("h2", {}, "¿Qué tipo de obra quieres hacer?"),
        el("div", { class:"muted" }, "Generamos una plantilla completa. Luego quitas lo que no necesitas."),
        el("div", { class:"hr" }),
        el("div", { class:"cards" }, [
          choice("Reforma integral", "Incluye todos los capítulos típicos.", () => generateBase("integral")),
          choice("Reforma parcial", "Plantilla más ligera.", () => generateBase("parcial")),
          choice("Puntual", "Trabajos unitarios (pintura, fontanería, carpintería...).", () => generateBase("puntual")),
        ]),
      ]),
    ]);
  }

  
    if(state.phase === "estancias"){
    ensureEstancias();
    applyEstanciasToChapters();

    const m = estanciasMetrics(state.estancias);
    const totals = MOTOR.calcTotals(state, state.config);

    // UI minimalista — Particular (estancias colapsables)
    if(!UI.partEstancias || typeof UI.partEstancias !== "object") UI.partEstancias = { viewOpen:false, expanded:{} };
    const pe = UI.partEstancias;
    if(!pe.expanded || typeof pe.expanded !== "object") pe.expanded = {};
    if(!pe._initCollapse){
      (state.estancias||[]).forEach(r => { if(!(r.key in pe.expanded)) pe.expanded[r.key] = false; });
      pe._initCollapse = true;
    }
    const openView = () => { pe.viewOpen = true; render(); };
    const closeView = () => { pe.viewOpen = false; render(); };
    const expandAll = () => { (state.estancias||[]).forEach(r => pe.expanded[r.key] = true); render(); };
    const collapseAll = () => { (state.estancias||[]).forEach(r => pe.expanded[r.key] = false); render(); };

    const estanciaCard = (r) => {
      const isOpen = !!pe.expanded[r.key];
      const toggleOpen = () => { pe.expanded[r.key] = !isOpen; render(); };

      return el("div", { class:"card", style:"padding:14px; margin-bottom:12px" }, [
        el("div", { class:"row" }, [
          el("div", { class:"left" }, [
            el("div", { class:"chev", style:"cursor:pointer", onclick:(e)=>{ e.stopPropagation(); toggleOpen(); } }, isOpen ? "▾" : "▸"),
            el("div", {}, [
              el("div", { style:"font-weight:900" }, r.label),
              el("div", { class:"small" }, isOpen ? "Largo · Ancho · Alto + unidades" : "Despliega para editar medidas"),
            ]),
          ]),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: (e) => { e.stopPropagation(); changeEstanciaCount(r.key, -1); } }, "−"),
            el("div", { class:"pill" }, `x${Math.max(0, Math.round(Number(r.count||0)))}`),
            el("button", { class:"btn ghost", onclick: (e) => { e.stopPropagation(); changeEstanciaCount(r.key, +1); } }, "+"),
            el("button", { class:"btn ghost", onclick: (e) => { e.stopPropagation(); doubleEstancia(r.key); } }, "Duplicar (x2)"),
          ]),
        ]),
        isOpen ? el("div", {}, [
          el("div", { class:"hr" }),
          el("div", { class:"row2" }, [
            el("div", { class:"field" }, [
              el("div", { class:"label" }, "Largo (m)"),
              el("input", { class:"input", type:"text", value: String(r.l ?? ""), oninput:(e)=>updateEstanciaDim(r.key, "l", e.target.value) }),
            ]),
            el("div", { class:"field" }, [
              el("div", { class:"label" }, "Ancho (m)"),
              el("input", { class:"input", type:"text", value: String(r.w ?? ""), oninput:(e)=>updateEstanciaDim(r.key, "w", e.target.value) }),
            ]),
            el("div", { class:"field" }, [
              el("div", { class:"label" }, "Alto (m)"),
              el("input", { class:"input", type:"text", value: String(r.h ?? ""), oninput:(e)=>updateEstanciaDim(r.key, "h", e.target.value) }),
            ]),
          ]),
        ]) : null,
      ]);
    };

    const estanciaCards = (state.estancias || []).map(estanciaCard);

    const viewModal = pe.viewOpen ? el("div", { style:[
      "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
    ].join(";") }, [
      el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
        el("h2", {}, "Vista — Estancias"),
        el("div", { class:"muted" }, "Vista limpia por defecto. Despliega o contrae estancias cuando lo necesites."),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn", onclick: expandAll }, "Desplegar todo"),
          el("button", { class:"btn", onclick: collapseAll }, "Contraer todo"),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: closeView }, "Cerrar"),
        ]),
      ]),
    ]) : null;

    return el("div", { class:"container" }, [
      topbar(),
      header,
      viewModal,
      snapshotsModal(),
      el("div", { class:"grid two" }, [
        el("div", {}, [
          el("div", { class:"card", style:"position:relative" }, [
            el("h2", {}, `Estancias — ${wfLabel}`),
            el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openView }, "Vista"),
            el("div", { class:"muted" }, "Define cuántas estancias tienes y sus medidas. El sistema recalcula automáticamente. En el siguiente paso verás capítulos y partidas."),
            el("div", { class:"hr" }),
            el("div", { class:"kpis" }, [
              kpi("Suelo (m²)", String(Math.round((m.floorM2||0)*10)/10)),
              kpi("Paredes (m²)", String(Math.round((m.wallsM2||0)*10)/10)),
              kpi("Estancias", String(m.rooms || 0)),
            ]),
          ]),
          ...estanciaCards,
        ]),
        el("div", { class:"card" }, [
          el("h2", {}, "Resumen"),
          el("div", { class:"kpis", id:"kpis_particular_estancias" }, [
            kpi("Subtotal", formatEUR(totals.subtotal)),
            kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.subtotal * totals.ivaVenta)),
            kpi("Total", formatEUR(totals.total)),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: () => navigate("/entrada") }, "Anterior: Entrada"),
            el("button", { class:"btn primary", onclick: () => goToPhase("partidas") }, "Siguiente: Partidas"),
          ]),
        ]),
      ]),
    ]);
  }


    if(state.phase === "partidas" || state.phase === "ajustes"){
    // "ajustes" queda como compatibilidad: ahora la pantalla se llama Partidas
    ensureEstancias();
    applyEstanciasToChapters();

    const totals = MOTOR.calcTotals(state, state.config);

    // Particular Partidas tools (capítulos contraídos + filtro)
    if(!UI.partPartidas || typeof UI.partPartidas !== "object") UI.partPartidas = { filtersOpen:false, chapterId:"all", expanded:{} };
    const pf = UI.partPartidas;
    if(!pf.expanded || typeof pf.expanded !== "object") pf.expanded = {};
    if(!pf._initCollapse){
      (state.chapters||[]).forEach(ch => { if(!(ch.id in pf.expanded)) pf.expanded[ch.id] = false; });
      pf._initCollapse = true;
    }
    const openFilters = () => { pf.filtersOpen = true; render(); };
    const closeFilters = () => { pf.filtersOpen = false; render(); };
    const setChapterFilter = (id) => { pf.chapterId = id; if(id && id !== "all") pf.expanded[id] = true; render(); };
    const setTrabajoFilter = (job) => { pf.trabajo = job || "all"; ensureStateUpgrade(); state.ui.proTrabajo = pf.trabajo;
      if(pf.trabajo !== "all"){
        (state.chapters||[]).forEach(ch => {
          const keep = (ch.id === "protecciones") || matchTrabajo(ch, null, pf.trabajo) || (ch.items||[]).some(it => matchTrabajo(ch, it, pf.trabajo));
          ch.on = !!keep;
          (ch.items||[]).forEach(it => { it.on = keep ? matchTrabajo(ch, it, pf.trabajo) : false; });
        });
      }else{
        (state.chapters||[]).forEach(ch => { ch.on = true; (ch.items||[]).forEach(it => it.on = true); });
      }
      save(state); render(); };
    const openAllChapters = () => { (state.chapters||[]).forEach(ch => ch.on = true); save(state); render(); };
    const openAllItems = () => { (state.chapters||[]).forEach(ch => (ch.items||[]).forEach(it => it.on = true)); save(state); render(); };
    const expandAllView = () => { (state.chapters||[]).forEach(ch => pf.expanded[ch.id] = true); render(); };
    const collapseAllView = () => { (state.chapters||[]).forEach(ch => pf.expanded[ch.id] = false); render(); };

    const job = pf.trabajo || "all";
const byJob = (() => {
  if(job === "all") return (state.chapters||[]);
  const map = {
    electricidad: ["electricidad","instalaciones"],
    fontaneria: ["fontaneria","instalaciones"],
    pintura: ["pintura"],
    derribos: ["demoliciones"],
    carpinteria: ["carpinteria"],
    clima: ["clima","aerotermia"],
  };
  const keys = map[job] || [];
  const norm = (s) => String(s||"").toLowerCase();
  return (state.chapters||[]).filter(ch => {
    const id = norm(ch.id);
    const name = norm(ch.name);
    const tag = norm(ch.tag);
    return keys.some(k => id.includes(k) || name.includes(k) || tag.includes(k));
  });
})();

const filteredChapters = (pf.chapterId && pf.chapterId !== "all")
  ? byJob.filter(ch => ch.id === pf.chapterId)
  : byJob;

    const filtersOverlay = pf.filtersOpen ? el("div", { style:[
      "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
    ].join(";") }, [
      el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
        el("h2", {}, "Filtros — Partidas"),
        el("div", { class:"muted" }, "Elige un capítulo o trabaja con todos. Atajos rápidos: abrir todos los capítulos o todas las partidas. También puedes desplegar/contraer todo para una vista limpia."),
        el("div", { class:"hr" }),
        el("div", { class:"field" }, [
          el("div", { class:"label" }, "Capítulo"),
          el("select", { class:"input", onchange:(e)=>setChapterFilter(e.target.value) }, [
            el("option", { value:"all", selected: pf.chapterId === "all" }, "Todos los capítulos"),
            ...(state.chapters||[]).map(ch => el("option", { value:ch.id, selected: pf.chapterId === ch.id }, ch.name)),
          ]),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn", onclick: openAllChapters }, "Abrir todos los capítulos"),
          el("button", { class:"btn", onclick: openAllItems }, "Abrir todas las partidas"),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn", onclick: expandAllView }, "Desplegar todo"),
          el("button", { class:"btn", onclick: collapseAllView }, "Contraer todo"),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: closeFilters }, "Cerrar"),
        ]),
      ]),
    ]) : null;

    return el("div", { class:"container" }, [
      topbar(),
      header,
      filtersOverlay,
      el("div", { class:"grid two" }, [
        el("div", { class:"card pro-partidas", style:"position:relative" }, [
          el("h2", {}, `Partidas — ${wfLabel}`),
          el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openFilters }, "Filtros"),
          el("div", { class:"muted" }, "Vista limpia por defecto. Despliega lo que necesites: capítulos y partidas (cantidades, mano de obra y material negro). Los decorativos van en Materiales."),
          el("div", { class:"hr" }),
          filteredChapters.length
            ? el("div", { class:"tree" }, filteredChapters.map(ch => chapterCardProCollapsible(ch, pf)))
            : el("div", { class:"notice" }, "No hay capítulos para este filtro en la plantilla demo. Prueba con 'Todo' o cambia de tipo de obra."),
        ]),
        el("div", { class:"card" }, [
          el("h2", {}, "Resumen"),
          el("div", { class:"kpis", id:"kpis_particular_partidas" }, [
            kpi("Subtotal", formatEUR(totals.subtotal)),
            kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.subtotal * totals.ivaVenta)),
            kpi("Total", formatEUR(totals.total)),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: () => goToPhase("estancias") }, "Anterior: Estancias"),
            el("button", { class:"btn primary", onclick: () => goToPhase("materiales") }, "Siguiente: Materiales"),
          ]),
        ]),
      ]),
    ]);
  }

    if(state.phase === "materiales"){
  ensureMaterialsState();
  const totals = MOTOR.calcTotals(state, state.config);

  const invInput = el("input", {
    id: "inv_excel_part",
    type: "file",
    accept: ".xlsx,.xls,.csv",
    style: "display:none",
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      onInventoryExcelSelected(f);
      e.target.value = "";
    }
  });

  const materialsUI = (state.materials || []);
  const matsCost = materialsUI.reduce((s,m)=>s+Number(m.cost||0),0);
  const matsPvp  = materialsUI.reduce((s,m)=>s+Number(m.pvp||0),0);

  return el("div", { class:"container" }, [
    topbar(),
    header,
    el("div", { class:"cols" }, [
      el("div", { class:"card" }, [
        el("h2", {}, `Materiales — ${wfLabel}`),
        el("div", { class:"muted" }, "Elementos decorativos (WC, plato de ducha, grifo, lavabo, mampara, baldosa, tarima sintética…). Define Coste y PVP por unidad."),
        el("div", { class:"hr" }),
        invInput,
        el("div", { class:"row" }, [
          el("button", { class:"btn danger", disabled:true }, "Añadir con IA (Próximamente)"),
          el("button", { class:"btn primary", onclick: () => document.getElementById("inv_excel_part")?.click() }, "Importar inventario (Excel)"),
          el("button", { class:"btn", onclick: () => addMaterialRow() }, "Añadir material"),
        ]),
        state.inventoryFileName
          ? el("div", { class:"small", style:"margin-top:10px" }, `Archivo cargado: ${state.inventoryFileName} (importación automática: Próximamente)`)
          : null,
        el("div", { class:"hr" }),
        materialsUI.length
          ? el("div", { class:"tree" }, materialsUI.map(m => el("div", { class:"item" }, [
              el("div", { style:"flex:1" }, [
                el("div", { class:"name" }, m.product && String(m.product).trim() ? m.product : "Material"),
                el("div", { class:"sub" }, "Coste y PVP"),
                el("div", { class:"row", style:"margin-top:10px" }, [
                  el("input", { class:"input", type:"text", placeholder:"Material", value: m.product || "", oninput:(e)=>updateMaterialField(m.id,"product", e.target.value) }),
                  el("input", { class:"input", type:"text", placeholder:"Coste (€)", value: String(Number(m.cost||0).toFixed(2)), oninput:(e)=>updateMaterialField(m.id,"cost", e.target.value) }),
                  el("input", { class:"input", type:"text", placeholder:"PVP (€)", value: String(Number(m.pvp||0).toFixed(2)), oninput:(e)=>updateMaterialField(m.id,"pvp", e.target.value) }),
                ]),
                el("div", { class:"row", style:"margin-top:10px" }, [
                  el("input", { class:"input", type:"file", accept:"image/*", onchange:(e)=>{ const f=e.target.files&&e.target.files[0]; onMaterialImageSelected(m.id,f); e.target.value=""; } }),
                  el("button", { class:"btn ghost", onclick:()=>clearMaterialImage(m.id), disabled: !m.image }, "Quitar imagen"),
                ]),
              ]),
              el("div", { style:"width:140px; text-align:right" }, [
                m.image ? el("img", { src:m.image, style:"max-width:140px; max-height:90px; border-radius:10px; display:block; margin-left:auto" }) : el("div", { class:"muted" }, "Sin imagen"),
                el("div", { style:"margin-top:10px" }, el("button", { class:"btn danger", onclick:()=>removeMaterialRow(m.id) }, "Eliminar")),
              ]),
            ])))
          : el("div", { class:"notice" }, "Aún no hay materiales. Pulsa “Añadir material” o importa un Excel."),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: () => goToPhase("partidas") }, "Anterior: Partidas"),
          el("button", { class:"btn primary", onclick: () => goToPhase("cerrado") }, "Siguiente: Presupuesto Cerrado"),
        ]),
      ]),
      el("div", { class:"card" }, [
        el("h2", {}, "Resumen"),
        el("div", { class:"kpis", id:"kpis_particular_materiales" }, [
          kpi("Subtotal", formatEUR(totals.subtotal)),
          kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.subtotal * totals.ivaVenta)),
          kpi("Total", formatEUR(totals.total)),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"kpis" }, [
          kpi("Materiales (coste)", formatEUR(matsCost)),
          kpi("Materiales (PVP)", formatEUR(matsPvp)),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"notice" }, "Importación automática desde Excel: Próximamente (ahora solo permite subir el archivo)."),
      ]),
    ]),
  ]);
}

if(state.phase === "cerrado"){
    ensureStateUpgrade();
    const totals = MOTOR.calcTotals(state, state.config);

    const cl = state.project.client;
    const me = state.auth.customer;

    const ivaPct = Math.round((state.config.ivaVenta || 0) * 100);
    const marginPct = Math.round((state.config.margin || 0) * 100);

    // UI minimalista (paneles colapsables) — Particular
    if(!UI.partCerrado || typeof UI.partCerrado !== "object") UI.partCerrado = { viewOpen:false, expanded:{} };
    const pc = UI.partCerrado;
    if(!pc.expanded || typeof pc.expanded !== "object") pc.expanded = {};
    const openView = () => { pc.viewOpen = true; render(); };
    const closeView = () => { pc.viewOpen = false; render(); };
    const expandAll = () => { ["cliente","ajustes","capitulos","acciones"].forEach(k => pc.expanded[k] = true); render(); };
    const collapseAll = () => { ["cliente","ajustes","capitulos","acciones"].forEach(k => pc.expanded[k] = false); render(); };

    const viewModal = pc.viewOpen ? el("div", { style:[
      "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
    ].join(";") }, [
      el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
        el("h2", {}, "Vista — Presupuesto Cerrado"),
        el("div", { class:"muted" }, "Despliega o contrae secciones para una vista limpia y minimalista."),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn", onclick: expandAll }, "Desplegar todo"),
          el("button", { class:"btn", onclick: collapseAll }, "Contraer todo"),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: closeView }, "Cerrar"),
        ]),
      ]),
    ]) : null;

    return el("div", { class:"container" }, [
      topbar(),
      header,
      viewModal,
      el("div", { class:"grid two" }, [
        el("div", { class:"card", style:"position:relative" }, [
          el("h2", {}, `Presupuesto Cerrado — ${wfLabel}`),
          el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openView }, "Vista"),
          el("div", { class:"muted" }, "Vista limpia por defecto. Despliega lo que necesites: cliente, ajustes, capítulos y acciones."),
          el("div", { class:"hr" }),

          proPanel(pc, "cliente", "Cliente (para cabecera del PDF)", [
            el("div", { class:"row2" }, [
              clientField("Nombre", "nombre", cl.nombre),
              clientField("Apellidos", "apellidos", cl.apellidos),
            ]),
            el("div", { class:"row2" }, [
              clientField("Email", "email", cl.email, "email"),
              clientField("Teléfono", "telefono", cl.telefono, "tel"),
            ]),
            el("div", { class:"row2" }, [
              clientField("Ciudad", "ciudad", cl.ciudad),
              clientField("Dirección", "direccion", cl.direccion),
            ]),
          ]),

          proPanel(pc, "ajustes", "Ajustes globales", [
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Margen (%)"),
                el("input", { class:"input", type:"text", value: String(marginPct), oninput:(e)=>updateMarginPercent(e.target.value) }),
              ]),
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "IVA venta (%)"),
                el("select", { class:"input", onchange:(e)=>setIvaVentaPercent(e.target.value) }, [
                  el("option", { value:"21", selected: ivaPct === 21 }, "21%"),
                  el("option", { value:"10", selected: ivaPct === 10 }, "10%"),
                  el("option", { value:"0", selected: ivaPct === 0 }, "0%"),
                ]),
              ]),
            ]),
          ]),

          proPanel(pc, "capitulos", "Capítulos incluidos", [
            el("div", { class:"tree" }, (state.chapters||[]).filter(ch => ch.on).map(ch => chapterCardResumen(ch))),
          ]),

          proPanel(pc, "acciones", "Acciones", [
            el("div", { class:"row" }, [
              el("button", { class:"btn", onclick: () => printPresupuestoCerrado() }, "Imprimir / Guardar PDF"),
              el("button", { class:"btn", onclick: () => exportProjectJSON() }, "Exportar (JSON)"),
              el("button", { class:"btn", onclick: () => triggerImportJSON() }, "Importar (JSON)"),
              el("button", { class:"btn", onclick: openSnapshots }, "Versiones"),
            ]),
            el("div", { class:"hr" }),
            el("div", { class:"row" }, [
              el("button", { class:"btn", onclick: () => goToPhase("marketplace") }, "Marketplace"),
              el("button", { class:"btn danger", disabled:true }, "Contrato (Próximamente)"),
            ]),
          ], true),
        ]),
        el("div", { class:"card" }, [
          el("h2", {}, "Totales"),
          el("div", { class:"kpis", id:"kpis_particular_cerrado" }, [
            kpi("Coste (base)", formatEUR(totals.coste)),
            kpi("Margen", formatEUR(totals.margen)),
            kpi("Subtotal", formatEUR(totals.subtotal)),
            kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.subtotal * totals.ivaVenta)),
            kpi("Total", formatEUR(totals.total)),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: () => goToPhase("materiales") }, "Anterior: Materiales"),
            el("button", { class:"btn primary", onclick: () => goToPhase("marketplace") }, "Ir a Marketplace"),
          ]),
        ]),
      ]),
    ]);
  }

  
    if(state.phase === "marketplace"){
	    // Marketplace PARTICULAR (diferente a PRO)
	    // - El particular ve por defecto solo profesionales ya desbloqueados
	    // - Si quiere filtrar por distancia o reseña, desbloquea por 2,49€ (demo)

	    const pros = [
	      { id:"p1", name:"Electricista BCN", trade:"Electricidad", city:"Barcelona", km:2.3, rating:4.8, reviews:128, unlocked:true, phone:"600 111 222", email:"hola@electricistabcn.es" },
	      { id:"p2", name:"Fontanería Rápida", trade:"Fontanería", city:"Barcelona", km:4.7, rating:4.6, reviews:92, unlocked:true, phone:"600 333 444", email:"info@fontaneriarapida.es" },
	      { id:"p3", name:"Pinturas Norte", trade:"Pintura", city:"Barcelona", km:7.9, rating:4.4, reviews:51, unlocked:false, phone:"600 555 666", email:"contacto@pinturasnorte.es" },
	      { id:"p4", name:"Carpintería PRO", trade:"Carpintería", city:"Hospitalet", km:6.2, rating:4.7, reviews:77, unlocked:false, phone:"600 777 888", email:"ventas@carpinteriapro.es" },
	      { id:"p5", name:"Clima & Aerotermia", trade:"Climatización", city:"Badalona", km:12.5, rating:4.5, reviews:64, unlocked:false, phone:"600 999 000", email:"equipo@climaaerotermia.es" },
	    ];

	    if(!state.marketplaceParticular || typeof state.marketplaceParticular !== "object"){
	      state.marketplaceParticular = {
	        filtersUnlocked: false,
	        paywallOpen: false,
	        priceUnlock: 2.49,
	        filter: { maxKm: 10, minRating: 4 },
	      };
	      save(state);
	    }

	    const mp = state.marketplaceParticular;

	    // UI minimalista (paneles colapsables) — Particular
	    if(!UI.partMarketplace || typeof UI.partMarketplace !== "object") UI.partMarketplace = { viewOpen:false, expanded:{} };
	    const pm = UI.partMarketplace;
	    if(!pm.expanded || typeof pm.expanded !== "object") pm.expanded = {};
	    const openView = () => { pm.viewOpen = true; render(); };
	    const closeView = () => { pm.viewOpen = false; render(); };
	    const expandAll = () => { ["filtros","pros","nav","info"].forEach(k => pm.expanded[k] = true); render(); };
	    const collapseAll = () => { ["filtros","pros","nav","info"].forEach(k => pm.expanded[k] = false); render(); };

	    const applyFilters = (list) => {
	      const maxKm = Number(mp.filter?.maxKm ?? 10);
	      const minRating = Number(mp.filter?.minRating ?? 4);
	      return list.filter(p => (p.km <= maxKm) && (p.rating >= minRating));
	    };

	    const visiblePros = mp.filtersUnlocked
	      ? applyFilters(pros)
	      : pros.filter(p => p.unlocked);

	    const openPaywall = () => {
	      mp.paywallOpen = true;
	      save(state);
	      render();
	    };
	    const closePaywall = () => {
	      mp.paywallOpen = false;
	      save(state);
	      render();
	    };
	    const unlockFilters = () => {
	      mp.filtersUnlocked = true;
	      mp.paywallOpen = false;
	      save(state);
	      render();
	    };

	    const setFilterMaxKm = (v) => {
	      if(!mp.filtersUnlocked) return openPaywall();
	      mp.filter.maxKm = Number(v);
	      save(state);
	      render();
	    };
	    const setFilterMinRating = (v) => {
	      if(!mp.filtersUnlocked) return openPaywall();
	      mp.filter.minRating = Number(v);
	      save(state);
	      render();
	    };

	    const contactPro = (p) => {
	      alert(`${p.name}\n${p.trade} · ${p.city}\nDistancia: ${p.km} km · Reseña: ${p.rating} (${p.reviews})\n\nTel: ${p.phone}\nEmail: ${p.email}`);
	    };

	    const proCard = (p) => el("div", { class:"card", style:"padding:14px; margin-bottom:12px" }, [
	      el("div", { class:"row" }, [
	        el("div", {}, [
	          el("div", { style:"font-weight:900" }, p.name),
	          el("div", { class:"small" }, `${p.trade} · ${p.city}`),
	        ]),
	        el("div", { class:"row" }, [
	          el("div", { class:"tag" }, `${p.km} km`),
	          el("div", { class:"tag" }, `★ ${p.rating} (${p.reviews})`),
	        ]),
	      ]),
	      el("div", { class:"hr" }),
	      el("div", { class:"row" }, [
	        el("button", { class:"btn", onclick: () => contactPro(p) }, "Ver contacto"),
	        el("button", { class:"btn danger", disabled:true }, "Chat (Próximamente)"),
	      ]),
	    ]);

	    const paywallModal = mp.paywallOpen ? el("div", { style:[
	      "position:fixed",
	      "inset:0",
	      "background:rgba(0,0,0,.55)",
	      "display:flex",
	      "align-items:center",
	      "justify-content:center",
	      "padding:20px",
	      "z-index:10000"
	    ].join(";") }, [
	      el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
	        el("h2", {}, "Desbloquear filtros"),
	        el("div", { class:"muted" }, `Para filtrar por distancia o reseña, desbloquea por ${formatEUR(mp.priceUnlock)} (demo).`),
	        el("div", { class:"hr" }),
	        el("div", { class:"row" }, [
	          el("button", { class:"btn primary", onclick: unlockFilters }, `Pagar ${formatEUR(mp.priceUnlock)}`),
	          el("button", { class:"btn ghost", onclick: closePaywall }, "Cancelar"),
	        ]),
	      ]),
	    ]) : null;

	    const viewModal = pm.viewOpen ? el("div", { style:[
	      "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
	    ].join(";") }, [
	      el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
	        el("h2", {}, "Vista — Marketplace"),
	        el("div", { class:"muted" }, "Vista limpia por defecto. Despliega filtros, listado y notas cuando lo necesites."),
	        el("div", { class:"hr" }),
	        el("div", { class:"row" }, [
	          el("button", { class:"btn", onclick: expandAll }, "Desplegar todo"),
	          el("button", { class:"btn", onclick: collapseAll }, "Contraer todo"),
	        ]),
	        el("div", { class:"hr" }),
	        el("div", { class:"row" }, [
	          el("button", { class:"btn ghost", onclick: closeView }, "Cerrar"),
	        ]),
	      ]),
	    ]) : null;

	    return el("div", { class:"container" }, [
	      topbar(),
	      header,
	      paywallModal,
	      viewModal,
	      el("div", { class:"grid two" }, [
	        el("div", { class:"card", style:"position:relative" }, [
	          el("h2", {}, "Marketplace"),
	          el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openView }, "Vista"),
	          el("div", { class:"muted" }, "Por defecto ves los profesionales ya desbloqueados. Si quieres filtrar por distancia o reseña, desbloquea filtros (2,49€)."),
	          el("div", { class:"hr" }),

	          proPanel(pm, "filtros", "Filtros", [
	            el("div", { class:"small" }, mp.filtersUnlocked ? "Filtros activos." : `Bloqueados. Desbloquea por ${formatEUR(mp.priceUnlock)}.`),
	            el("div", { class:"hr" }),
	            el("div", { class:"row2" }, [
	              el("div", { class:"field" }, [
	                el("div", { class:"label" }, "Distancia máxima"),
	                el("select", { class:"input", onchange:(e)=>setFilterMaxKm(e.target.value) }, [
	                  el("option", { value:"5", selected: Number(mp.filter.maxKm) === 5 }, "5 km"),
	                  el("option", { value:"10", selected: Number(mp.filter.maxKm) === 10 }, "10 km"),
	                  el("option", { value:"20", selected: Number(mp.filter.maxKm) === 20 }, "20 km"),
	                  el("option", { value:"50", selected: Number(mp.filter.maxKm) === 50 }, "50 km"),
	                ]),
	              ]),
	              el("div", { class:"field" }, [
	                el("div", { class:"label" }, "Reseña mínima"),
	                el("select", { class:"input", onchange:(e)=>setFilterMinRating(e.target.value) }, [
	                  el("option", { value:"3", selected: Number(mp.filter.minRating) === 3 }, "3+"),
	                  el("option", { value:"4", selected: Number(mp.filter.minRating) === 4 }, "4+"),
	                  el("option", { value:"4.5", selected: Number(mp.filter.minRating) === 4.5 }, "4.5+"),
	                ]),
	              ]),
	            ]),
	            !mp.filtersUnlocked
	              ? el("div", { class:"row", style:"margin-top:10px" }, [
	                  el("button", { class:"btn primary", onclick: () => openPaywall() }, `Desbloquear filtros (${formatEUR(mp.priceUnlock)})`),
	                ])
	              : null,
	          ]),

	          proPanel(pm, "pros", "Profesionales", [
	            visiblePros.length
	              ? el("div", {}, visiblePros.map(proCard))
	              : el("div", { class:"notice" }, "No hay profesionales que cumplan el filtro actual."),
	          ], true),

	          proPanel(pm, "nav", "Navegación", [
	            el("button", { class:"btn ghost", onclick: () => goToPhase("cerrado") }, "Volver a Presupuesto Cerrado"),
	          ]),
	        ]),

	        el("div", { class:"card" }, [
	          proPanel(pm, "info", "Cómo funciona", [
	            el("div", { class:"muted" }, "Puedes contactar directamente con profesionales ya desbloqueados. Para desbloquear más y filtrar por distancia o reseñas: pago único 2,49€ (demo)."),
	            el("div", { class:"hr" }),
	            el("div", { class:"notice" }, "Marketplace real + reseñas verificadas: Próximamente."),
	          ], true),
	        ]),
	      ]),
	    ]);
  }

return el("div", { class:"container" }, [
    topbar(),
    header,
    el("div", { class:"card" }, [
      el("h2", {}, "Fase no soportada"),
      el("div", { class:"muted" }, `La fase "${state.phase}" no existe en PRO. Volvemos a Partidas.`),
      el("div", { class:"hr" }),
      el("button", { class:"btn primary", onclick: () => goToPhase("ajustes") }, "Volver a Partidas"),
    ]),
  ]);
}

function viewPro(){
  if(!accessGranted()){
    return el("div", { class:"container" }, [
      topbar(),
      el("div", { class:"card" }, [
        el("h2", {}, "Acceso requerido"),
        el("div", { class:"muted" }, "Para entrar como PRO necesitas completar acceso + pago."),
        el("div", { class:"hr" }),
        el("button", { class:"btn primary", onclick: () => { setPlan("pro"); navigate("/login"); } }, "Ir a Login PRO"),
      ]),
    ]);
  }

  const header = el("div", { class:"card" }, [
    el("h2", {}, "Profesional"),
    stepper("pro", state.phase),
    el("div", { class:"hr" }),
    el("div", { class:"warn" }, "PRO avanzado (planos, mediciones avanzadas, versiones, materiales, margen, PDF técnico) → Próximamente. MVP básico: plantilla y cierre."),
    (state.tipoObra && state.phase !== "idea") ? el("div", { class:"row", style:"margin-top:10px" }, [
      el("button", { class:"btn", onclick: resetProEncargo }, "Cambiar encargo"),
      el("button", { class:"btn danger", onclick: () => { setProInputMode("ia"); resetProEncargo(); } }, "Con IA (Próximamente)"),
    ]) : null,
  ].filter(Boolean));

  const wfLabel = state.tipoObra ? WORKFLOWS[state.tipoObra].label : "";

  if(!state.tipoObra || state.phase === "idea"){
    return el("div", { class:"container" }, [
      topbar(),
      header,
      el("div", { class:"card" }, [
        el("h2", {}, "¿Qué tipo de encargo vas a presupuestar?"),
        el("div", { class:"muted" }, "Puedes hacerlo en modo manual (MVP) o iniciar con IA (próximamente)."),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class: `btn ${state.ui.proInputMode === "manual" ? "primary" : ""}`, onclick: () => setProInputMode("manual") }, "Manual"),
          el("button", { class: `btn ${state.ui.proInputMode === "ia" ? "primary" : "danger"}`, onclick: () => setProInputMode("ia") }, "Con IA (Próximamente)"),
        ]),
        state.ui.proInputMode === "ia" ? el("div", { class:"notice", style:"margin-top:10px;" }, [
          el("div", { class:"small" }, "Sube plano/fotos y la IA propondrá mediciones y partidas. En el MVP queda como placeholder (no bloquea)."),
          el("div", { class:"hr" }),
          el("div", { class:"field" }, [
            el("div", { class:"label" }, "Plano o fotos"),
            el("input", { class:"input", type:"file", accept:".pdf,image/*", onchange:(e)=>{ const f=e.target.files && e.target.files[0]; ensureStateUpgrade(); state.entradaFileName = f ? f.name : ""; save(state); render(); } }),
            el("div", { class:"small" }, `Archivo: ${state.entradaFileName || "—"}`),
          ]),
          el("div", { class:"row" }, [
            el("button", { class:"btn danger", disabled:true }, "Interpretar y medir (IA)"),
            el("button", { class:"btn", onclick: () => setProInputMode("manual") }, "Continuar manual"),
          ]),
        ]) : null,
        el("div", { class:"hr" }),
        // Para que sea imposible "no ver" la opción IA, la mostramos dentro de cada tarjeta (placeholder)
        el("div", { class:"cards" }, [
          el("div", { class:"choice" }, [
            el("h3", {}, "Reforma integral"),
            el("div", { class:"muted" }, "Plantilla completa por capítulos/partidas."),
            el("div", { class:"row", style:"margin-top:10px" }, [
              el("button", { class:"btn primary", onclick: () => { setProInputMode("manual"); generateBase("integral"); } }, "Manual"),
              el("button", { class:"btn danger", disabled:true, title:"Próximamente" }, "Con IA"),
            ]),
          ]),
          el("div", { class:"choice" }, [
            el("h3", {}, "Reforma parcial"),
            el("div", { class:"muted" }, "Plantilla reducida."),
            el("div", { class:"row", style:"margin-top:10px" }, [
              el("button", { class:"btn primary", onclick: () => { setProInputMode("manual"); generateBase("parcial"); } }, "Manual"),
              el("button", { class:"btn danger", disabled:true, title:"Próximamente" }, "Con IA"),
            ]),
          ]),
          el("div", { class:"choice" }, [
            el("h3", {}, "Puntual"),
            el("div", { class:"muted" }, "Trabajos unitarios (pintura, fontanería, carpintería...)."),
            el("div", { class:"small", style:"margin-top:8px" }, "Trabajo:"),
            el("select", { class:"input", value: (state.ui && state.ui.proTrabajo && state.ui.proTrabajo !== 'all') ? state.ui.proTrabajo : 'pintura', onchange:(e)=>{ ensureStateUpgrade(); state.ui.proTrabajo = e.target.value; save(state); } }, [
              el("option", { value:"pintura" }, "Pintura"),
              el("option", { value:"fontaneria" }, "Fontanería"),
              el("option", { value:"electricidad" }, "Electricidad"),
              el("option", { value:"carpinteria" }, "Carpintería"),
              el("option", { value:"aluminio" }, "Aluminio"),
              el("option", { value:"derribos" }, "Derribos"),
              el("option", { value:"clima" }, "Clima / Aerotermia"),
            ]),
            el("div", { class:"row", style:"margin-top:10px" }, [
              el("button", { class:"btn primary", onclick: () => { ensureStateUpgrade(); setProInputMode("manual"); state.ui.proTrabajo = state.ui.proTrabajo && state.ui.proTrabajo !== 'all' ? state.ui.proTrabajo : 'pintura'; save(state); generateBase("puntual"); } }, "Manual"),
              el("button", { class:"btn danger", disabled:true, title:"Próximamente" }, "Con IA"),
            ]),
          ]),
        ]),
      ]),
    ]);
  }

  // Compat: la fase "medicion" se eliminó. Si existe en estado antiguo, saltamos a Partidas.
  if(state.phase === "medicion"){
    state.phase = "ajustes";
    save(state);
  }

  // Compat BUGFIX: si por un flujo antiguo/erróneo el PRO quedó en "partidas", lo tratamos como "ajustes" (Partidas).
  if(state.phase === "partidas"){
    state.phase = "ajustes";
    save(state);
  }

if(state.phase === "medicion"){
  const wfLabel = state.tipoObra ? WORKFLOWS[state.tipoObra].label : "";
  return el("div", { class:"container" }, [
    topbar(),
    header,
    el("div", { class:"grid two" }, [
      el("div", { class:"card" }, [
        el("h2", {}, `Medición (PRO) — ${wfLabel}`),
        el("div", { class:"muted" }, "Placeholder no bloqueante. Conteo por plano y mediciones avanzadas → Próximamente."),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn danger", disabled:true }, "Cargar plano y contar (Próximamente)"),
          el("button", { class:"btn danger", disabled:true }, "Detección automática (Próximamente)"),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"notice" }, "Puedes continuar sin medición. El presupuesto base ya está generado."),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: () => navigate("/entrada") }, "Anterior: Entrada"),
          el("button", { class:"btn primary", onclick: () => goToPhase("ajustes") }, "Siguiente: Partidas"),
        ]),
      ]),
      el("div", { class:"card" }, [
        el("h2", {}, "Estado"),
        el("div", { class:"small" }, "Esta pantalla nunca bloquea el flujo. Mantiene SPA sin recargas."),
        el("div", { class:"hr" }),
        el("div", { class:"success" }, `Tipo de obra: ${wfLabel || "—"} · Plano: ${state.entradaFileName || "no"} (IA: Próximamente)`),
      ]),
    ]),
  ]);
}


if(state.phase === "ajustes"){
    const totals = MOTOR.calcTotals(state, state.config);
    // PRO Partidas tools (sin mover layout): filtro por capítulo + abrir todo
    if(!UI.proPartidas || typeof UI.proPartidas !== "object") UI.proPartidas = { filtersOpen:false, chapterId:"all", trabajo: (state.ui && state.ui.proTrabajo) ? state.ui.proTrabajo : "all", expanded:{} };
    const pf = UI.proPartidas;
    if(!pf.expanded || typeof pf.expanded !== "object") pf.expanded = {};
    // Default: capítulos contraídos (vista limpia)
    if(!pf._initCollapse){
      (state.chapters||[]).forEach(ch => { if(!(ch.id in pf.expanded)) pf.expanded[ch.id] = false; });
      pf._initCollapse = true;
    }
    const openFilters = () => { pf.filtersOpen = true; render(); };
    const closeFilters = () => { pf.filtersOpen = false; render(); };
    const setChapterFilter = (id) => { pf.chapterId = id; if(id && id !== "all") pf.expanded[id] = true; render(); };
    const openAllChapters = () => { (state.chapters||[]).forEach(ch => ch.on = true); save(state); render(); };
    const openAllItems = () => { (state.chapters||[]).forEach(ch => (ch.items||[]).forEach(it => it.on = true)); save(state); render(); };
    const expandAllView = () => { (state.chapters||[]).forEach(ch => pf.expanded[ch.id] = true); render(); };
    const collapseAllView = () => { (state.chapters||[]).forEach(ch => pf.expanded[ch.id] = false); render(); };

    const chaptersByTrabajo = filterChaptersByTrabajo((state.chapters||[]).filter(ch=>ch.on), pf.trabajo || "all");
    const filteredChapters = (pf.chapterId && pf.chapterId !== "all")
      ? chaptersByTrabajo.filter(ch => ch.id === pf.chapterId)
      : chaptersByTrabajo;
    return el("div", { class:"container" }, [
      topbar(),
      header,
      el("div", { class:"grid two" }, [
        el("div", { class:"card pro-partidas", style:"position:relative" }, [
          el("h2", {}, `Partidas — ${wfLabel}`),
          el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openFilters }, "Filtros"),
          el("div", { class:"muted" }, "Aquí trabajas partidas: cantidades, mano de obra y material negro. Los decorativos van en la pantalla Materiales."),
          el("div", { class:"hr" }),
          filteredChapters.length
            ? el("div", { class:"tree" }, filteredChapters.map(ch => chapterCardProCollapsible(ch, pf)))
            : el("div", { class:"notice" }, "No hay capítulos para este filtro en la plantilla demo. Prueba con 'Todo' o cambia de tipo de obra."),
        ]),
        el("div", { class:"card" }, [
          el("h2", {}, "Resumen PRO"),
          el("div", { class:"kpis", id:"kpis_pro" }, [
            kpi("Subtotal", formatEUR(totals.subtotal)),
            kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.subtotal * totals.ivaVenta)),
            kpi("Total", formatEUR(totals.total)),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: () => navigate("/entrada") }, "Anterior: Entrada"),
            el("button", { class:"btn primary", onclick: () => goToPhase("materiales") }, "Siguiente: Materiales"),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"notice" }, "PDF técnico + margen: Próximamente."),
        ]),
      ]),
      pf.filtersOpen ? el("div", { style:[
        "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
      ].join(";") }, [
        el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
          el("h2", {}, "Filtros — Partidas (PRO)"),
          el("div", { class:"muted" }, "Elige un capítulo o trabaja con todos. Atajos rápidos: abrir todos los capítulos o todas las partidas."),
          el("div", { class:"hr" }),
          el("div", { class:"field" }, [
            el("div", { class:"label" }, "Trabajo"),
            el("select", { class:"input", value: pf.trabajo || "all", onchange: (e) => setTrabajoFilter(e.target.value) }, [
              el("option", { value:"all" }, "Todo"),
              el("option", { value:"electricidad" }, "Electricidad"),
              el("option", { value:"fontaneria" }, "Fontanería"),
              el("option", { value:"pintura" }, "Pintura"),
              el("option", { value:"derribos" }, "Derribos"),
              el("option", { value:"carpinteria" }, "Carpintería"),
              el("option", { value:"aluminio" }, "Aluminio"),
              el("option", { value:"clima" }, "Clima / Aerotermia"),
            ]),
            el("div", { class:"small" }, "Filtra para ver solo lo pedido por trabajo (MVP demo)."),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"field" }, [
            el("div", { class:"label" }, "Capítulo"),
            el("select", { class:"input", value: pf.chapterId || "all", onchange: (e) => setChapterFilter(e.target.value) }, [
              el("option", { value:"all" }, "Todos los capítulos"),
              ...(state.chapters||[]).map(ch => el("option", { value: ch.id }, ch.name)),
            ]),
          ]),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: expandAllView }, "Desplegar todo"),
            el("button", { class:"btn ghost", onclick: collapseAllView }, "Contraer todo"),
          ]),
          el("div", { class:"row" }, [
            el("button", { class:"btn", onclick: openAllChapters }, "Abrir todos los capítulos"),
            el("button", { class:"btn", onclick: openAllItems }, "Abrir todas las partidas"),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn primary", onclick: closeFilters }, "Cerrar"),
          ]),
        ]),
      ]) : null,
    ]);
  }

  
if(state.phase === "materiales"){
  ensureMaterialsState();
  const totals = MOTOR.calcTotals(state, state.config);

  const invInput = el("input", {
    id: "inv_excel_pro",
    type: "file",
    accept: ".xlsx,.xls,.csv",
    style: "display:none",
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      onInventoryExcelSelected(f);
      e.target.value = "";
    }
  });

  const materialsUI = (state.materials || []);
  const matsCost = materialsUI.reduce((s,m)=>s+Number(m.cost||0),0);
  const matsPvp  = materialsUI.reduce((s,m)=>s+Number(m.pvp||0),0);

  return el("div", { class:"container" }, [
    topbar(),
    header,
    el("div", { class:"grid two" }, [
      el("div", { class:"card pro-materiales" }, [
        el("h2", {}, `Materiales — ${wfLabel}`),
        el("div", { class:"muted" }, "Elementos decorativos (WC, plato de ducha, grifo, lavabo, mampara, baldosa, tarima sintética…). Define Coste y PVP por unidad."),
        el("div", { class:"hr" }),
        invInput,
        el("div", { class:"row" }, [
          el("button", { class:"btn danger", disabled:true }, "Añadir con IA (Próximamente)"),
          el("button", { class:"btn primary", onclick: () => document.getElementById("inv_excel_pro")?.click() }, "Importar inventario (Excel)"),
          el("button", { class:"btn", onclick: () => addMaterialRow() }, "Añadir material"),
        ]),
        state.inventoryFileName
          ? el("div", { class:"small", style:"margin-top:10px" }, `Archivo cargado: ${state.inventoryFileName} (importación automática: Próximamente)`)
          : null,
        el("div", { class:"hr" }),
        materialsUI.length
          ? el("div", { class:"tree" }, materialsUI.map(m => el("div", { class:"item" }, [
              el("div", { style:"flex:1" }, [
                el("div", { class:"name" }, m.product && String(m.product).trim() ? m.product : "Material"),
                el("div", { class:"sub" }, "Coste y PVP"),
                el("div", { class:"row", style:"margin-top:10px" }, [
                  el("input", { class:"input", type:"text", placeholder:"Material", value: m.product || "", oninput:(e)=>updateMaterialField(m.id,"product", e.target.value) }),
                  el("input", { class:"input", type:"text", placeholder:"Coste (€)", value: String(Number(m.cost||0).toFixed(2)), oninput:(e)=>updateMaterialField(m.id,"cost", e.target.value) }),
                  el("input", { class:"input", type:"text", placeholder:"PVP (€)", value: String(Number(m.pvp||0).toFixed(2)), oninput:(e)=>updateMaterialField(m.id,"pvp", e.target.value) }),
                ]),
                el("div", { class:"row", style:"margin-top:10px" }, [
                  el("input", { class:"input", type:"file", accept:"image/*", onchange:(e)=>{ const f=e.target.files&&e.target.files[0]; onMaterialImageSelected(m.id,f); e.target.value=""; } }),
                  el("button", { class:"btn ghost", onclick:()=>clearMaterialImage(m.id), disabled: !m.image }, "Quitar imagen"),
                ]),
              ]),
              el("div", { style:"width:140px; text-align:right" }, [
                m.image ? el("img", { src:m.image, style:"max-width:140px; max-height:90px; border-radius:10px; display:block; margin-left:auto" }) : el("div", { class:"muted" }, "Sin imagen"),
                el("div", { style:"margin-top:10px" }, el("button", { class:"btn danger", onclick:()=>removeMaterialRow(m.id) }, "Eliminar")),
              ]),
            ])))
          : el("div", { class:"notice" }, "Aún no hay materiales. Pulsa “Añadir material” o importa un Excel."),
        el("div", { class:"hr" }),
        el("div", { class:"row" }, [
          el("button", { class:"btn ghost", onclick: () => goToPhase("ajustes") }, "Anterior: Partidas"),
          el("button", { class:"btn primary", onclick: () => goToPhase("cerrado") }, "Siguiente: Presupuesto Cerrado"),
        ]),
      ]),
      el("div", { class:"card" }, [
        el("h2", {}, "Resumen PRO"),
        el("div", { class:"kpis", id:"kpis_pro_mats" }, [
          kpi("Subtotal", formatEUR(totals.subtotal)),
          kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.subtotal * totals.ivaVenta)),
          kpi("Total", formatEUR(totals.total)),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"kpis" }, [
          kpi("Materiales (coste)", formatEUR(matsCost)),
          kpi("Materiales (PVP)", formatEUR(matsPvp)),
        ]),
        el("div", { class:"hr" }),
        el("div", { class:"notice" }, "Importación automática desde Excel: Próximamente (ahora solo permite subir el archivo)."),
      ]),
    ]),
  ]);
}

if(state.phase === "cerrado"){
    ensureStateUpgrade();
    const totals = MOTOR.calcTotals(state, state.config);
    const wfLabel = state.tipoObra ? WORKFLOWS[state.tipoObra].label : "";

    const cl = (state.project && state.project.client) ? state.project.client : {};
    const me = (state.auth && state.auth.customer) ? state.auth.customer : {};
    const ivaPct = Math.round((state.config.ivaVenta || 0) * 100);
    const marginPct = Math.round((state.config.margin || 0) * 100);

    // UI minimalista (paneles colapsables) — PRO
    if(!UI.proCerrado || typeof UI.proCerrado !== "object") UI.proCerrado = { viewOpen:false, expanded:{} };
    const pc = UI.proCerrado;
    const openView = () => { pc.viewOpen = true; render(); };
    const closeView = () => { pc.viewOpen = false; render(); };
    const expandAll = () => { ["cliente","ajustes","capitulos","acciones"].forEach(k => pc.expanded[k] = true); render(); };
    const collapseAll = () => { ["cliente","ajustes","capitulos","acciones"].forEach(k => pc.expanded[k] = false); render(); };

    return el("div", { class:"container" }, [
      topbar(),
      header,
      snapshotsModal(),
      el("div", { class:"grid two" }, [
        el("div", { class:"card pro-cerrado", style:"position:relative" }, [
          el("h2", {}, `Presupuesto Cerrado (PRO) — ${wfLabel}`),
          el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openView }, "Vista"),
          el("div", { class:"muted" }, "Vista limpia por defecto. Despliega lo que necesites: cliente, ajustes, capítulos y acciones."),
          el("div", { class:"hr" }),

          proPanel(pc, "cliente", "Cliente (para cabecera del PDF)", [
            el("div", { class:"row2" }, [
              clientField("Nombre", "nombre", cl.nombre),
              clientField("Apellidos", "apellidos", cl.apellidos),
            ]),
            el("div", { class:"row2" }, [
              clientField("Email", "email", cl.email, "email"),
              clientField("Teléfono", "telefono", cl.telefono, "tel"),
            ]),
            el("div", { class:"row2" }, [
              clientField("Ciudad", "ciudad", cl.ciudad),
              clientField("Dirección", "direccion", cl.direccion),
            ]),
            el("div", { class:"row2" }, [
              clientField("Empresa", "empresa", cl.empresa),
              clientField("NIF/CIF", "nif", cl.nif),
            ]),
          ], false),

          proPanel(pc, "ajustes", "Ajustes globales", [
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Margen (%)"),
                el("input", { class:"input", type:"text", value: String(marginPct), oninput:(e)=>updateMarginPercent(e.target.value) }),
                el("div", { class:"small" }, "Aplica al total base antes de IVA."),
              ]),
            ]),
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "IVA venta"),
                el("select", { class:"input", onchange:(e)=>setIvaVentaPercent(e.target.value) }, [
                  el("option", { value:"21", selected: ivaPct === 21 }, "21%"),
                  el("option", { value:"10", selected: ivaPct === 10 }, "10%"),
                  el("option", { value:"0",  selected: ivaPct === 0  }, "0%"),
                ]),
                el("div", { class:"small" }, "IVA compra 21% bloqueado."),
              ]),
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Tus datos (desde alta)"),
                el("div", { class:"small" }, `${(me.empresa||"")}${me.nif ? " · " + me.nif : ""}`),
                el("div", { class:"small" }, `${(me.email||"")}${me.telefono ? " · " + me.telefono : ""}`),
              ]),
            ]),
          ], false),

          proPanel(pc, "capitulos", "Capítulos (resumen)", [
            el("div", { class:"small" }, "Ves solo capítulos. Edita precios en Partidas y decorativos en Materiales."),
            el("div", { class:"hr" }),
            el("div", { class:"tree" }, (state.chapters || []).filter(ch => ch.on).map(ch => chapterCardResumen(ch))),
          ], false),

          proPanel(pc, "acciones", "Acciones", [
            el("div", { class:"row" }, [
              el("button", { class:"btn ghost", onclick: () => goToPhase("materiales") }, "Anterior: Materiales"),
              el("button", { class:"btn primary", onclick: () => printPresupuestoCerrado() }, "Imprimir / Guardar PDF"),
              el("button", { class:"btn", onclick: openSnapshots }, "Versiones"),
            ]),
            el("div", { class:"hr" }),
            el("div", { class:"row" }, [
              el("button", { class:"btn", onclick: () => goToPhase("marketplace") }, "Marketplace (PRO)"),
              el("button", { class:"btn danger", disabled:true }, "Contrato (Próximamente)"),
            ]),
          ], true),
        ]),

        el("div", { class:"card" }, [
          el("h2", {}, "Totales"),
          el("div", { class:"kpis", id:"kpis_pro2" }, [
            kpi("Coste (base)", formatEUR(totals.coste)),
            kpi(`Margen (${Math.round((totals.margin||0)*100)}%)`, formatEUR(totals.coste * (totals.margin||0))),
            kpi("Base venta (sin IVA)", formatEUR(totals.neto)),
            kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.ivaImporte)),
            kpi("Total", formatEUR(totals.total)),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"success" }, "Snapshot: PRESUPUESTO CERRADO (PRO)."),
        ]),
      ]),
      pc.viewOpen ? el("div", { style:[
        "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
      ].join(";") }, [
        el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
          el("h2", {}, "Vista — Presupuesto Cerrado (PRO)"),
          el("div", { class:"muted" }, "Contrae para limpiar la vista o despliega para editar."),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: expandAll }, "Desplegar todo"),
            el("button", { class:"btn ghost", onclick: collapseAll }, "Contraer todo"),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn primary", onclick: closeView }, "Cerrar"),
          ]),
        ]),
      ]) : null,
    ]);
  }

// Marketplace (PRO) — solo accesible tras Presupuesto Cerrado
  if(state.phase === "marketplace"){
    ensureStateUpgrade();
    const wfLabel = state.tipoObra ? WORKFLOWS[state.tipoObra].label : "";
    const m = state.marketplacePro || { subscribed:false, visible:false, priceMonthly:5, startedAt:null };
    const me = (state.auth && state.auth.customer) ? state.auth.customer : {};

    // UI minimalista (paneles colapsables) — PRO
    if(!UI.proMarketplace || typeof UI.proMarketplace !== "object") UI.proMarketplace = { viewOpen:false, expanded:{} };
    const pm = UI.proMarketplace;
    const openView = () => { pm.viewOpen = true; render(); };
    const closeView = () => { pm.viewOpen = false; render(); };
    const expandAll = () => { ["estado","suscripcion","acciones","notas","preview"].forEach(k => pm.expanded[k] = true); render(); };
    const collapseAll = () => { ["estado","suscripcion","acciones","notas","preview"].forEach(k => pm.expanded[k] = false); render(); };

    const statusText = m.visible ? "VISIBLE" : "INVISIBLE";
    const statusBox = el("div", { class: m.visible ? "success" : "warn" },
      m.visible
        ? "Tu perfil está visible en el Marketplace."
        : "Tu perfil existe en el Marketplace pero está invisible."
    );

    const previewStyle = m.visible
      ? ""
      : "opacity:.35; filter: blur(1px);";

    const companyLine = (me.empresa || [me.nombre, me.apellidos].filter(Boolean).join(" ") || "Profesional");
    const cityLine = (me.ciudad || "");
    const emailLine = (me.email || "");
    const phoneLine = (me.telefono || "");

    return el("div", { class:"container" }, [
      topbar(),
      header,
      el("div", { class:"grid two" }, [
        el("div", { class:"card pro-marketplace", style:"position:relative" }, [
          el("h2", {}, `Marketplace (PRO) — ${wfLabel || ""}`.trim()),
          el("button", { class:"btn ghost", style:"position:absolute; top:14px; right:14px; padding:6px 10px;", onclick: openView }, "Vista"),
          el("div", { class:"muted" }, "Vista limpia por defecto. Despliega estado, suscripción y acciones cuando lo necesites."),
          el("div", { class:"hr" }),

          proPanel(pm, "estado", "Estado", [
            statusBox,
            el("div", { class:"hr" }),
            el("div", { class:"row" }, [
              el("div", { class:"pill" }, `Estado: ${statusText}`),
              el("div", { class:"pill" }, `Precio: ${Number(m.priceMonthly || 5)}€/mes`),
              m.startedAt ? el("div", { class:"pill" }, `Alta: ${m.startedAt}`) : null,
            ].filter(Boolean)),
          ], true),

          proPanel(pm, "suscripcion", "Suscripción", [
            !m.subscribed
              ? el("button", { class:"btn primary", onclick: () => activateMarketplacePro() }, "Activar visibilidad (pago 5€/mes)")
              : el("div", { class:"row" }, [
                  el("button", { class:"btn", onclick: () => cancelMarketplacePro() }, "Cancelar suscripción"),
                  el("div", { class:"small" }, "Demo: al cancelar vuelves a INVISIBLE."),
                ]),
          ], false),

          proPanel(pm, "acciones", "Acciones", [
            el("div", { class:"row" }, [
              el("button", { class:"btn ghost", onclick: () => goToPhase("cerrado") }, "Volver a Presupuesto Cerrado"),
              el("button", { class:"btn danger", disabled:true }, "Particular me hace visible (Próximamente)"),
            ]),
          ], true),

          proPanel(pm, "notas", "Notas", [
            el("div", { class:"notice" }, "MVP: solo control de visibilidad. Leads, reseñas y ranking: Próximamente."),
          ], false),
        ]),

        el("div", { class:"card" }, [
          el("h2", {}, "Vista previa"),
          el("div", { class:"muted" }, "Si estás INVISIBLE, el Particular no verá tu ficha hasta que se active."),
          el("div", { class:"hr" }),
          proPanel(pm, "preview", "Ficha (como te verá un Particular)", [
            el("div", { class:"card", style:`padding:14px; background:rgba(15,23,42,.35); ${previewStyle}` }, [
              el("div", { style:"font-weight:900" }, companyLine),
              el("div", { class:"small" }, [cityLine, emailLine, phoneLine].filter(Boolean).join(" · ") || "(datos desde alta)"),
              el("div", { class:"hr" }),
              el("div", { class:"small" }, "Etiqueta: Profesional verificado (demo)"),
              el("div", { class:"small" }, "Categorías/servicios: Próximamente"),
            ]),
            !m.visible
              ? el("div", { class:"warn" }, "INVISIBLE: esta ficha no se mostraría en la lista pública.")
              : el("div", { class:"success" }, "VISIBLE: esta ficha se mostraría en la lista pública."),
          ], true),
        ]),
      ]),
      pm.viewOpen ? el("div", { style:[
        "position:fixed","inset:0","background:rgba(0,0,0,.55)","display:flex","align-items:center","justify-content:center","padding:20px","z-index:9999"
      ].join(";") }, [
        el("div", { class:"card", style:"max-width:560px; width:100%;" }, [
          el("h2", {}, "Vista — Marketplace (PRO)"),
          el("div", { class:"muted" }, "Contrae para limpiar la vista o despliega para revisar todos los paneles."),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn ghost", onclick: expandAll }, "Desplegar todo"),
            el("button", { class:"btn ghost", onclick: collapseAll }, "Contraer todo"),
          ]),
          el("div", { class:"hr" }),
          el("div", { class:"row" }, [
            el("button", { class:"btn primary", onclick: closeView }, "Cerrar"),
          ]),
        ]),
      ]) : null,
    ]);
  }

return el("div", { class:"container" }, [
    topbar(),
    header,
    el("div", { class:"card" }, [
      el("h2", {}, "Fase no soportada"),
      el("div", { class:"muted" }, `La fase "${state.phase}" no existe en PRO. Volvemos a Partidas.`),
      el("div", { class:"hr" }),
      el("button", { class:"btn primary", onclick: () => goToPhase("ajustes") }, "Volver a Partidas"),
    ]),
  ]);
}

function choice(title, desc, onClick){
  return el("div", { class:"choice", onclick: onClick }, [
    el("div", { class:"t" }, title),
    el("div", { class:"d" }, desc),
  ]);
}

function chapterCard(ch){
  const deps = (ch.dependsOn || []);
  return el("div", { class:"chapter" }, [
    el("div", { class:"row" }, [
      el("div", { class:"left" }, [
        el("div", { class:"toggle" }, [
          el("div", { class:"switch" + (ch.on ? " on" : ""), onclick: () => toggleChapter(ch.id) }),
        ]),
        el("div", {}, [
          el("div", { style:"font-weight:900" }, ch.name),
          el("div", { class:"small" }, deps.length ? `Depende de: ${deps.join(", ")}` : (ch.tag || "")),
        ]),
      ]),
      el("div", { class:"tag" }, ch.on ? "Activo" : "Desactivado"),
    ]),
    el("div", { class:"items" },
      ch.items.map(it => el("div", { class:"item" }, [
        el("div", {}, [
          el("div", { class:"name" }, it.name),
          el("div", { class:"sub" }, `${it.unit} · PU ${formatEUR(it.pu)}`),
        ]),
        el("div", { class:"qty" }, [
          el("div", { class:"switch" + (it.on ? " on" : ""), onclick: () => toggleItem(ch.id, it.id) }),
          el("input", {
            class:"input",
            type:"text",
            value: String(it.qty),
            disabled: !it.on || !ch.on,
            oninput: (e) => updateQty(ch.id, it.id, e.target.value),
            title: "Cantidad",
          }),
        ]),
      ]))
    )
  ]);
}
function chapterCardPro(ch){
  const deps = (ch.dependsOn || []);
  return el("div", { class:"chapter" }, [
    el("div", { class:"row" }, [
      el("div", { class:"left" }, [
        el("div", { class:"toggle" }, [
          el("div", { class:"switch" + (ch.on ? " on" : ""), onclick: () => toggleChapter(ch.id) }),
        ]),
        el("div", {}, [
          el("div", { style:"font-weight:900" }, ch.name),
          el("div", { class:"small" }, deps.length ? `Depende de: ${deps.join(", ")}` : (ch.tag || "")),
        ]),
      ]),
      el("div", { class:"tag" }, ch.on ? "Activo" : "Desactivado"),
    ]),
    el("div", { class:"items" },
      (ch.items || []).map(it => {
        const isEditing = UI.edit && UI.edit.chId === ch.id && UI.edit.itemId === it.id;
        const hasSplit = ("mat_cost" in it) || ("mo_cost" in it);
        const mat = hasSplit ? Number(it.mat_cost || 0) : Number(it.pu || 0);
        const mo  = hasSplit ? Number(it.mo_cost || 0) : 0;

        return el("div", { class:"item" }, [
          el("div", {}, [
            el("div", { class:"name" }, it.name),
            el("div", { class:"sub" }, `${it.unit} · Coste base €/ud ${formatEUR((mat + mo) || Number(it.pu||0))}`),
          ]),
          el("div", { class:"qty" }, [
            el("div", { class:"switch" + (it.on ? " on" : ""), onclick: () => toggleItem(ch.id, it.id) }),
            el("input", {
              class:"input",
              type:"text",
              value: String(it.qty),
              disabled: !it.on || !ch.on,
              oninput: (e) => updateQty(ch.id, it.id, e.target.value),
              title: "Cantidad",
            }),
            el("input", {
              class:"input",
              type:"text",
              value: String(Number(mat || 0).toFixed(2)),
              disabled: !it.on || !ch.on,
              oninput: (e) => updateMatCost(ch.id, it.id, e.target.value),
              title: "Material negro €/ud",
              style: "width:120px",
            }),
            el("button", {
              class:"btn ghost",
              disabled: !it.on || !ch.on,
              onclick: (e) => { e.stopPropagation(); openEditItem(ch.id, it.id); },
            }, "Editar"),
          ]),
          isEditing ? el("div", { class:"card", style:"margin-top:10px;padding:12px;background:rgba(15,23,42,.35)" }, [
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Unidad"),
                el("input", { class:"input", type:"text", value: String(it.unit||""), oninput: (e) => updateUnit(ch.id, it.id, e.target.value) }),
              ]),
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Cantidad"),
                el("input", { class:"input", type:"text", value: String(it.qty||0), oninput: (e) => updateQty(ch.id, it.id, e.target.value) }),
              ]),
            ]),
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Material negro €/ud"),
                el("input", { class:"input", type:"text", value: String(hasSplit ? (it.mat_cost||0) : (it.pu||0)), oninput: (e) => updateMatCost(ch.id, it.id, e.target.value) }),
              ]),
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Mano de obra €/ud"),
                el("input", { class:"input", type:"text", value: String(hasSplit ? (it.mo_cost||0) : 0), oninput: (e) => updateMoCost(ch.id, it.id, e.target.value) }),
              ]),
            ]),
            el("div", { class:"row" }, [
              el("button", { class:"btn", onclick: closeEditItem }, "Cerrar"),
            ]),
          ]) : null,
        ].filter(Boolean));
      })
    )
  ]);
}

function chapterCardProCollapsible(ch, pf){
  const deps = (ch.dependsOn || []);
  const expanded = (pf && pf.expanded) ? pf.expanded : {};
  const isOpen = !!expanded[ch.id];
  const toggleOpen = () => {
    if(!pf.expanded || typeof pf.expanded !== "object") pf.expanded = {};
    pf.expanded[ch.id] = !isOpen;
    render();
  };

  return el("div", { class:"chapter" + (isOpen ? "" : " collapsed") }, [
    el("div", { class:"row pro-ch-header", onclick: toggleOpen }, [
      el("div", { class:"left" }, [
        el("div", { class:"chev" }, isOpen ? "▾" : "▸"),
        el("div", { class:"toggle" }, [
          el("div", { class:"switch" + (ch.on ? " on" : ""), onclick: (e) => { e.stopPropagation(); toggleChapter(ch.id); } }),
        ]),
        el("div", {}, [
          el("div", { style:"font-weight:900" }, ch.name),
          el("div", { class:"small" }, deps.length ? `Depende de: ${deps.join(", ")}` : (ch.tag || "")),
        ]),
      ]),
      el("div", { class:"tag" }, ch.on ? "Activo" : "Desactivado"),
    ]),
    isOpen ? el("div", { class:"items" },
      (ch.items || []).map(it => {
        const isEditing = UI.edit && UI.edit.chId === ch.id && UI.edit.itemId === it.id;
        const hasSplit = ("mat_cost" in it) || ("mo_cost" in it);
        const mat = hasSplit ? Number(it.mat_cost || 0) : Number(it.pu || 0);
        const mo  = hasSplit ? Number(it.mo_cost || 0) : 0;

        return el("div", { class:"item" }, [
          el("div", {}, [
            el("div", { class:"name" }, it.name),
            el("div", { class:"sub" }, `${it.unit} · Coste base €/ud ${formatEUR((mat + mo) || Number(it.pu||0))}`),
          ]),
          el("div", { class:"qty" }, [
            el("div", { class:"switch" + (it.on ? " on" : ""), onclick: () => toggleItem(ch.id, it.id) }),
            el("input", {
              class:"input",
              type:"text",
              value: String(it.qty),
              disabled: !it.on || !ch.on,
              oninput: (e) => updateQty(ch.id, it.id, e.target.value),
              title: "Cantidad",
            }),
            el("input", {
              class:"input",
              type:"text",
              value: String(Number(mat || 0).toFixed(2)),
              disabled: !it.on || !ch.on,
              oninput: (e) => updateMatCost(ch.id, it.id, e.target.value),
              title: "Material negro €/ud",
              style: "width:120px",
            }),
            el("button", {
              class:"btn ghost",
              disabled: !it.on || !ch.on,
              onclick: (e) => { e.stopPropagation(); openEditItem(ch.id, it.id); },
            }, "Editar"),
          ]),
          isEditing ? el("div", { class:"card", style:"margin-top:10px;padding:12px;background:rgba(15,23,42,.35)" }, [
            el("div", { class:"row2" }, [
              field("Unidad", el("input", { class:"input", value: it.unit, oninput:(e)=>updateItemField(ch.id,it.id,"unit",e.target.value)})),
              field("Cantidad", el("input", { class:"input", value: String(it.qty), oninput:(e)=>updateQty(ch.id,it.id,e.target.value)})),
              field("Material negro €/ud", el("input", { class:"input", value: String(Number(mat||0).toFixed(2)), oninput:(e)=>updateMatCost(ch.id,it.id,e.target.value)})),
            ]),
            el("div", { class:"row2" }, [
              field("MO €/ud", el("input", { class:"input", value: String(Number(mo||0).toFixed(2)), oninput:(e)=>updateMoCost(ch.id,it.id,e.target.value)})),
              el("div", {}, ""),
              el("div", { class:"row", style:"justify-content:flex-end" }, [
                el("button", { class:"btn", onclick: () => { UI.edit = null; render(); } }, "Cerrar editor"),
              ]),
            ]),
          ]) : null,
        ]);
      })
    ) : null,
  ]);
}





function chapterCardDecorativosCollapsible(ch, mf){
  const expanded = (mf && mf.expanded) ? mf.expanded : {};
  const isOpen = !!expanded[ch.id];
  const toggleOpen = () => {
    if(!mf.expanded || typeof mf.expanded !== "object") mf.expanded = {};
    mf.expanded[ch.id] = !isOpen;
    render();
  };
  return el("div", { class:"chapter" + (isOpen ? "" : " collapsed") }, [
    el("div", { class:"row pro-ch-header", onclick: toggleOpen }, [
      el("div", { class:"left" }, [
        el("div", { class:"chev" }, isOpen ? "▾" : "▸"),
        el("div", {}, [
          el("div", { style:"font-weight:900" }, ch.name),
          el("div", { class:"small" }, (ch.tag || "")),
        ]),
      ]),
      el("div", { class:"tag" }, ch.on ? "Activo" : "Desactivado"),
    ]),
    isOpen ? el("div", { class:"items" }, (ch.items || []).map(it => {
      const disabled = !ch.on || !it.on;
      return el("div", { class:"item" }, [
        el("div", {}, [
          el("div", { class:"name" }, it.name),
          el("div", { class:"sub" }, `${it.unit} · Decorativo €/ud`),
        ]),
        el("div", { class:"qty" }, [
          el("input", {
            class:"input",
            type:"text",
            value: String(Number(it.deco_cost || 0).toFixed(2)),
            disabled,
            oninput: (e) => updateDecoCost(ch.id, it.id, e.target.value),
            title: "Decorativo €/ud",
            style: "width:130px",
          }),
        ]),
      ]);
    })) : null,
  ]);
}

function chapterCardDecorativos(ch){
  return el("div", { class:"chapter" }, [
    el("div", { class:"row" }, [
      el("div", { class:"left" }, [
        el("div", {}, [
          el("div", { style:"font-weight:900" }, ch.name),
          el("div", { class:"small" }, (ch.tag || "")),
        ]),
      ]),
      el("div", { class:"tag" }, ch.on ? "Activo" : "Desactivado"),
    ]),
    el("div", { class:"items" }, (ch.items || []).map(it => {
      const disabled = !ch.on || !it.on;
      return el("div", { class:"item" }, [
        el("div", {}, [
          el("div", { class:"name" }, it.name),
          el("div", { class:"sub" }, `${it.unit} · Decorativo €/ud`),
        ]),
        el("div", { class:"qty" }, [
          el("input", {
            class:"input",
            type:"text",
            value: String(Number(it.deco_cost || 0).toFixed(2)),
            disabled,
            oninput: (e) => updateDecoCost(ch.id, it.id, e.target.value),
            title: "Decorativo €/ud",
            style: "width:130px",
          }),
        ]),
      ]);
    })),
  ]);
}

function chapterCardResumen(ch){
  const amount = calcChapterBase(ch);
  const nItems = (ch.items || []).filter(i => i.on).length;
  return el("div", { class:"item" }, [
    el("div", {}, [
      el("div", { class:"name" }, ch.name),
      el("div", { class:"sub" }, `${nItems} partidas activas`),
    ]),
    el("div", { style:"text-align:right" }, [
      el("div", { class:"name" }, formatEUR(amount)),
      el("div", { class:"sub" }, "Base (sin margen/IVA)"),
    ]),
  ]);
}

function chapterCardProCerrado(ch){
  const deps = (ch.dependsOn || []);
  return el("div", { class:"chapter" }, [
    el("div", { class:"row" }, [
      el("div", { class:"left" }, [
        el("div", { class:"toggle" }, [
          el("div", { class:"switch" + (ch.on ? " on" : ""), onclick: () => toggleChapter(ch.id) }),
        ]),
        el("div", {}, [
          el("div", { style:"font-weight:900" }, ch.name),
          el("div", { class:"small" }, deps.length ? `Depende de: ${deps.join(", ")}` : (ch.tag || "")),
        ]),
      ]),
      el("div", { class:"tag" }, ch.on ? "Activo" : "Desactivado"),
    ]),
    el("div", { class:"items" },
      (ch.items || []).map(it => {
        const isEditing = UI.edit && UI.edit.chId === ch.id && UI.edit.itemId === it.id;
        const hasSplit = ("mat_cost" in it) || ("mo_cost" in it);
        const mat = hasSplit ? Number(it.mat_cost || 0) : Number(it.pu || 0);
        const mo  = hasSplit ? Number(it.mo_cost || 0) : 0;
        const deco = Number(it.deco_cost || 0);

        return el("div", { class:"item" }, [
          el("div", {}, [
            el("div", { class:"name" }, it.name),
            el("div", { class:"sub" }, `${it.unit} · Base €/ud ${formatEUR((mat + mo + deco) || Number(it.pu||0))}`),
          ]),
          el("div", { class:"qty" }, [
            el("div", { class:"switch" + (it.on ? " on" : ""), onclick: () => toggleItem(ch.id, it.id) }),
            el("input", {
              class:"input",
              type:"text",
              value: String(it.qty),
              disabled: !it.on || !ch.on,
              oninput: (e) => updateQty(ch.id, it.id, e.target.value),
              title: "Cantidad",
            }),
            el("button", {
              class:"btn ghost",
              disabled: !it.on || !ch.on,
              onclick: (e) => { e.stopPropagation(); openEditItem(ch.id, it.id); },
            }, "Editar"),
          ]),
          isEditing ? el("div", { class:"card", style:"margin-top:10px;padding:12px;background:rgba(15,23,42,.35)" }, [
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Unidad"),
                el("input", { class:"input", type:"text", value: String(it.unit||""), oninput: (e) => updateUnit(ch.id, it.id, e.target.value) }),
              ]),
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Cantidad"),
                el("input", { class:"input", type:"text", value: String(it.qty||0), oninput: (e) => updateQty(ch.id, it.id, e.target.value) }),
              ]),
            ]),
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Material negro €/ud"),
                el("input", { class:"input", type:"text", value: String(hasSplit ? (it.mat_cost||0) : (it.pu||0)), oninput: (e) => updateMatCost(ch.id, it.id, e.target.value) }),
              ]),
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Mano de obra €/ud"),
                el("input", { class:"input", type:"text", value: String(hasSplit ? (it.mo_cost||0) : 0), oninput: (e) => updateMoCost(ch.id, it.id, e.target.value) }),
              ]),
            ]),
            el("div", { class:"row2" }, [
              el("div", { class:"field" }, [
                el("div", { class:"label" }, "Decorativo €/ud"),
                el("input", { class:"input", type:"text", value: String(Number(it.deco_cost||0).toFixed(2)), oninput: (e) => updateDecoCost(ch.id, it.id, e.target.value) }),
              ]),
              el("div", { class:"field" }, [
                el("div", { class:"label" }, " "),
                el("div", { class:"small" }, "Decorativos se suman a la base €/ud."),
              ]),
            ]),
            el("div", { class:"row" }, [
              el("button", { class:"btn", onclick: closeEditItem }, "Cerrar"),
            ]),
          ]) : null,
        ].filter(Boolean));
      })
    )
  ]);
}




/** Render */
function renderTotalsOnly(){
  const totals = MOTOR.calcTotals(state, state.config);
  const ids = ["kpis","kpis2","kpis_pro","kpis_pro2","kpis_pro_mats"];
  for(const id of ids){
    const node = document.getElementById(id);
    if(!node) continue;
    node.innerHTML = "";

    // Presupuesto Cerrado (PRO): KPIs extendidos
    if(id === "kpis_pro2"){
      node.appendChild(kpi("Coste (base)", formatEUR(totals.coste)));
      node.appendChild(kpi(`Margen (${Math.round((totals.margin||0)*100)}%)`, formatEUR(totals.coste * (totals.margin||0))));
      node.appendChild(kpi("Base venta (sin IVA)", formatEUR(totals.neto)));
      node.appendChild(kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.ivaImporte)));
      node.appendChild(kpi("Total", formatEUR(totals.total)));
      continue;
    }

    // Default (3 KPIs)
    node.appendChild(kpi("Subtotal", formatEUR(totals.subtotal)));
    node.appendChild(kpi(`IVA venta (${Math.round(totals.ivaVenta*100)}%)`, formatEUR(totals.subtotal * totals.ivaVenta)));
    node.appendChild(kpi("Total", formatEUR(totals.total)));
  }
}



function render(){
  const app = document.getElementById("app");
  if(!app) return;

  try{
    const p = route();
    applyTheme();
    app.innerHTML = "";

    if(p === "/"){
      app.appendChild(viewLanding());
      return;
    }
    if(p.startsWith("/login")){
      app.appendChild(viewLogin());
      return;
    }
    if(p.startsWith("/entrada")){
      app.appendChild(viewEntrada());
      return;
    }
    if(p.startsWith("/particular")){
      state.product = "particular";
      save(state);
      app.appendChild(viewParticular());
      return;
    }
    if(p.startsWith("/pro")){
      state.product = "pro";
      save(state);
      app.appendChild(viewPro());
      return;
    }

    // fallback
    app.appendChild(viewLanding());
  }catch(err){
    console.error(err);
    const a = document.getElementById("app");
    if(!a) return;
    a.innerHTML = "";
    a.appendChild(el("div", { class:"container" }, [
      el("div", { class:"card" }, [
        el("h2", {}, "Error en la app"),
        el("div", { class:"muted" }, "Se ha producido un error JavaScript. No debería aparecer una pantalla en blanco."),
        el("div", { class:"hr" }),
        el("pre", { style:"white-space:pre-wrap;font-size:12px;overflow:auto;max-height:260px" }, String(err && (err.stack || err.message) || err)),
        el("div", { class:"hr" }),
        el("button", { class:"btn primary", onclick: () => resetAll() }, "Reset demo"),
      ]),
    ]));
  }
}

render();

