/* MÓDULO — Release v5 (STATIC) — Checklist Freeze OK
   - Netlify drop deploy: sin build (HTML/CSS/JS)
   - Flujo: Landing → Rol → IA-1 → Medición → Presupuesto → Marketplace
   - IA-1: intención → workflow + preajuste (desde TODO ON) + trazabilidad
   - IA-2: ajustes con consecuencias (demo: reglas + avisos)
   - IA-3: materiales Basic/Medium/Premium (coeficiente)
*/

const S = {
  role: "modulo:v5:role",
  prorole: "modulo:v5:prorole",
  last: "modulo:v5:last",
  projPrefix: "modulo:v5:project:",
  providers: "modulo:v5:providers",
  intent: "modulo:v5:intent",
  ia1: "modulo:v5:ia1",
};

const $ = (sel, el=document)=> el.querySelector(sel);
const $$ = (sel, el=document)=> [...el.querySelectorAll(sel)];
const uid = ()=> (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const clamp=(n,a,b)=> Math.max(a, Math.min(b,n));
const norm = (s)=> (s||"").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/\s+/g," ").trim();

function setRole(r){ localStorage.setItem(S.role,r); }
function getRole(){ return localStorage.getItem(S.role) || "particular"; }
function setProRole(r){ localStorage.setItem(S.prorole,r); }
function getProRole(){ return localStorage.getItem(S.prorole) || ""; }
function planFeeFor(role){ return role==="particular"?9: role==="profesional"?49:0; }
function marketplaceFee(){ return 2.49; }

function saveProject(p){
  localStorage.setItem(S.projPrefix+p.id, JSON.stringify(p));
  localStorage.setItem(S.last, p.id);
}
function getProject(id){
  const raw = localStorage.getItem(S.projPrefix+id);
  return raw? JSON.parse(raw): null;
}
function getLastProjectId(){ return localStorage.getItem(S.last) || ""; }

function getProviders(){
  const raw = localStorage.getItem(S.providers);
  return raw? JSON.parse(raw): [];
}
function saveProviders(list){ localStorage.setItem(S.providers, JSON.stringify(list)); }
function seedProvidersIfEmpty(city="Madrid"){
  if (getProviders().length) return;
  saveProviders([
    { id: uid(), name:"Constructor Norte", city, specialties:["Reforma integral","Baños","Cocinas"], googleRating:4.7, verified:true },
    { id: uid(), name:"Estudio Interior", city:"Barcelona", specialties:["Interiorismo","Cocinas"], googleRating:4.9, verified:true },
    { id: uid(), name:"Obra Rápida", city:"Valencia", specialties:["Reforma parcial","Suelos","Pintura"], googleRating:4.5, verified:false },
  ]);
}



// -----------------------------
// UI helpers (topbar)
// -----------------------------
function setTopbar(mode){
  const nav = document.querySelector(".nav");
  const brand = document.querySelector(".brand");
  if (!nav || !brand) return;

  // reset defaults
  brand.style.visibility = "visible";

  if (mode==="splash"){
    nav.innerHTML = `<a class="btn ghost small" href="#/login">Login</a>`;
    brand.style.visibility = "hidden";
    return;
  }

  if (mode==="login"){
    nav.innerHTML = `<a href="#/">Inicio</a>`;
    return;
  }

  // app/public
  const role = getRole();
  const links = [
    `<a href="#/metodo">Método</a>`,
    role==="profesional" ? `` : `<a href="#/planes">Planes</a>`,
    `<a href="#/partner">Partner</a>`,
    `<button id="resetBtn">Reset</button>`
  ].filter(Boolean).join("");
  nav.innerHTML = links;

  // rebind reset each time we repaint nav
  const reset = document.getElementById("resetBtn");
  if (reset){
    reset.onclick = (ev)=>{
      const hard = !!ev.altKey;
      if (hard){
        if (!confirm("Reset TOTAL: se borrarán proyectos y datos de esta demo. ¿Continuar?")) return;
        const keys=[];
        for (let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if (k && k.startsWith("modulo:v5:")) keys.push(k);
        }
        keys.forEach(k=>localStorage.removeItem(k));
      } else {
        if (!confirm("Reset (seguro): volver al inicio y limpiar estado de navegación. No borra proyectos.")) return;
        // Soft reset: limpia estado volátil, mantiene proyectos
        [S.role,S.prorole,S.intent,S.ia1].forEach(k=> localStorage.removeItem(k));
      }
      location.hash="#/";
      // siempre re-seed para evitar demo vacía
      ensureSeedProjects();
      route();
    };
  }
}

// -----------------------------
// Seed (demo estable)
// - Si no hay proyectos guardados, crea 1 profesional + 1 particular
// - Evita la sensación de “demo vacía” tras un reset
// -----------------------------
function listProjectIds(){
  const ids=[];
  for (let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if (k && k.startsWith(S.projPrefix)) ids.push(k.slice(S.projPrefix.length));
  }
  return ids;
}

function ensureSeedProjects(){
  try{
    const ids = listProjectIds();
    if (ids.length) return;

    // Seed profesional
    setRole("profesional"); setProRole("constructor");
    const proId = createProject({
      name: "Demo Profesional · Cliente",
      city: "Madrid",
      role: "profesional",
      proRole: "constructor",
      knowledge: "demo",
      propertyType: "piso",
      workType: "integral",
      totalM2: 60,
      bathroomM2: 4,
      kitchenM2: 8,
      source: "seed",
      sourceNote: "Seed automático",
      intent: "Reforma integral de piso 60m², baño 4m², cocina 8m². Alisar suelos y modificar tabique.",
      ia1: ia1ParseIntent("Reforma integral de piso 60m², baño 4m², cocina 8m². Alisar suelos y tirar un tabique."),
      materialsLevel: "medium",
    });

    // Seed particular
    setRole("particular");
    const partId = createProject({
      name: "Demo Particular · Mi obra",
      city: "Madrid",
      role: "particular",
      proRole: "",
      knowledge: "demo",
      propertyType: "piso",
      workType: "integral",
      totalM2: 60,
      bathroomM2: 4,
      kitchenM2: 8,
      source: "seed",
      sourceNote: "Seed automático",
      intent: "Reforma integral de piso 60m², baño 4m², cocina 8m².",
      ia1: ia1ParseIntent("Reforma integral de piso 60m², baño 4m², cocina 8m²."),
      materialsLevel: "medium",
    });

    // deja el profesional como último por defecto
    localStorage.setItem(S.last, proId);

  }catch(e){
    // si algo falla, no bloquea la demo
    console.warn("Seed failed", e);
  }
}

// -----------------------------
// Normalización de líneas a formato editable (profesional)
// -----------------------------
function editableFromLine(l, idx){
  const meta = l.meta || {};
  let qty = 1, unit = "ud";
  if (meta.m2!=null){ qty = Number(meta.m2)||1; unit="m²"; }
  if (meta.ml!=null){ qty = Number(meta.ml)||1; unit="ml"; }
  const price = qty ? Math.round((l.cost/qty)*100)/100 : Math.round(l.cost*100)/100;
  return {
    id: meta.partida || ("line_"+idx),
    chapter: l.chapter,
    name: l.item,
    qty, unit,
    price,
    // desglose demo (editable)
    breakdown: meta.breakdown || [
      { kind:"materiales", label:"Materiales", amount: Math.round(l.cost*0.55) },
      { kind:"mano_obra", label:"Mano de obra", amount: Math.round(l.cost*0.35) },
      { kind:"medios", label:"Medios auxiliares", amount: Math.round(l.cost*0.10) },
    ]
  };
}

function lineFromEditable(e){
  const qty = Number(e.qty||0);
  const price = Number(e.price||0);
  const cost = Math.max(0, Math.round(qty*price*100)/100);
  return {
    chapter: e.chapter || "Varios",
    item: e.name || "Nueva partida",
    cost,
    roomGroup: "—",
    meta: { partida: e.id, qty, unit: e.unit || "ud", price, breakdown: e.breakdown || [] }
  };
}
// -----------------------------
// Catálogo de módulos (alcance)
// -----------------------------
const MODULES = [
  { key:"demoliciones", label:"Demoliciones y retirada", group:"Demoliciones", note:"Desmontajes, retirada y residuos." },
  { key:"albanileria", label:"Albañilería y preparación", group:"Albañilería", note:"Rozas, recrecidos, remates." },
  { key:"tabiques", label:"Tabiques (catálogo)", group:"Albañilería", note:"Derribos y/o nuevos tabiques según necesidad." },
  { key:"inst_fontaneria", label:"Instalación de fontanería", group:"Instalaciones", note:"Redes y puntos húmedos." },
  { key:"inst_electrica", label:"Instalación eléctrica", group:"Instalaciones", note:"Cuadro, cableado, mecanismos." },
  { key:"admin_electrica", label:"Legalización/boletín eléctrico", group:"Instalaciones", note:"Trámite cuando hay eléctrica.", autoOffWith:["inst_electrica"] },
  { key:"revestimientos", label:"Revestimientos", group:"Acabados", note:"Solados/alicatados (zonas)." },
  { key:"suelos", label:"Cambio de suelos", group:"Acabados", note:"Pavimento general (si aplica)." },
  { key:"alisar_suelos", label:"Alisar/regularizar suelos (catálogo)", group:"Acabados", note:"Partida individual por m²." },
  { key:"pintura", label:"Pintura", group:"Acabados", note:"Paredes/techos según alcance." },
  { key:"carpinteria", label:"Carpintería interior", group:"Acabados", note:"Puertas/armarios (si aplica)." },
  { key:"climatizacion", label:"Climatización / ventilación", group:"Instalaciones", note:"Si aplica (demo)." },
  { key:"gestion", label:"Gestión y coordinación", group:"Gestión", note:"Coordinación, protecciones, limpieza." },
];

const TABIQUE_CATALOG = [
  { id:"pladur70", name:"Pladur 70", eur_ml: 58, note:"Rápido, ligero, buen acabado." },
  { id:"ladrillo", name:"Ladrillo hueco doble", eur_ml: 72, note:"Tradicional y robusto." },
  { id:"trasdosado", name:"Trasdosado autoportante", eur_ml: 66, note:"Aislamiento + paso de instalaciones." },
  { id:"acustico", name:"Tabique acústico", eur_ml: 84, note:"Mayor aislamiento (demo)." },
];

const PARTIDAS_CATALOGO = [
  { id:"alisar_suelos", label:"Regularización/alisado de suelos", chapter:"Revestimientos", unit:"m²", eur_u: 18, when:"alisar_suelos" },
  { id:"pintura", label:"Pintura plástica (pared/techo)", chapter:"Pintura", unit:"m²", eur_u: 22, when:"pintura" },
  { id:"tabique_demolicion", label:"Demolición de tabique", chapter:"Demoliciones", unit:"ml", eur_u: 45, when:"tabiques" },
  { id:"tabique_nuevo", label:"Ejecución de tabique nuevo", chapter:"Albañilería", unit:"ml", eur_u: 58, when:"tabiques" },
];

function applyDependencies(mods){
  for (const m of MODULES){
    if (!m.autoOffWith) continue;
    for (const dep of m.autoOffWith){
      if (mods[dep]===false) mods[m.key]=false;
    }
  }
  return mods;
}

function fullModulesOn(){
  const on = {};
  for (const m of MODULES) on[m.key]=true;
  return applyDependencies(on);
}

function defaultModulesFor(workType){
  // Regla: nace completo (TODO ON)
  return fullModulesOn();
}

// -----------------------------
// IA-1: intención → preset
// -----------------------------
function ia1ParseIntent(text){
  const t = norm(text);
  const out = {
    raw: text || "",
    tokens: [],
    detected: { workType:"", propertyType:"", totalM2:null, bathroomM2:null, kitchenM2:null },
    scope: { modulesOn: [], modulesOff: [], tabique: { action:"", typeId:"", ml:null } },
    notes: [],
    confidence: 0.55
  };

  if (!t) { out.notes.push("Sin intención: se usa flujo por defecto."); return out; }

  if (/(reforma|obra)\s+integral|integral\b/.test(t)) out.detected.workType="integral";
  else if (/reforma\s+parcial|parcial\b/.test(t)) out.detected.workType="parcial";
  else if (/obra\s+nueva|construccion\s+desde\s+cero|construir\s+desde\s+cero/.test(t)) out.detected.workType="obra_nueva";
  else if (/rehabilitacion|estructura|refuerzo\s+estructural/.test(t)) out.detected.workType="rehabilitacion";

  if (/\bpiso\b|apartamento/.test(t)) out.detected.propertyType="piso";
  else if (/\bcasa\b|chalet/.test(t)) out.detected.propertyType="casa";
  else if (/\blocal\b|oficina|comercial/.test(t)) out.detected.propertyType="local";

  const total = t.match(/(\d{2,4})\s*(m2|m²|metros\s+cuadrados)/);
  if (total) out.detected.totalM2 = Number(total[1]);
  const bath = t.match(/(?:bano|baño)\s*(?:de)?\s*(\d{1,3})\s*(m2|m²|metros\s+cuadrados)/);
  if (bath) out.detected.bathroomM2 = Number(bath[1]);
  const kitchen = t.match(/cocina\s*(?:de)?\s*(\d{1,3})\s*(m2|m²|metros\s+cuadrados)/);
  if (kitchen) out.detected.kitchenM2 = Number(kitchen[1]);

  const wantsTabique = /tabique|derribar\s+tabique|tirar\s+tabique|mover\s+tabique/.test(t);
  const wantsAlisar = /alisar|nivelar|regularizar/.test(t) && /suelo|suelos|pavimento|solera/.test(t);
  const wantsElectrica = /electric|cuadro|enchufe|mecanismo/.test(t);

  const wantsNoElectrica = /sin\s+electric|no\s+quiero\s+electric|quita\s+electric/.test(t);

  if (wantsTabique) out.scope.modulesOn.push("tabiques","demoliciones","albanileria");
  if (wantsAlisar) out.scope.modulesOn.push("alisar_suelos","suelos","albanileria");
  if (wantsElectrica) out.scope.modulesOn.push("inst_electrica","admin_electrica");
  if (wantsNoElectrica) out.scope.modulesOff.push("inst_electrica","admin_electrica");

  if (wantsTabique){
    if (/derribar|tirar/.test(t)) out.scope.tabique.action="derribar";
    else if (/hacer|levantar|construir/.test(t)) out.scope.tabique.action="hacer";
    else out.scope.tabique.action="modificar";
    if (/pladur/.test(t)) out.scope.tabique.typeId="pladur70";
    else if (/ladrillo/.test(t)) out.scope.tabique.typeId="ladrillo";
    else if (/acustic/.test(t)) out.scope.tabique.typeId="acustico";
    else out.scope.tabique.typeId="pladur70";
    const ml = t.match(/(\d{1,3})\s*(ml|metros\s+lineales)/);
    if (ml) out.scope.tabique.ml = Number(ml[1]);
  }

  out.scope.modulesOn = [...new Set(out.scope.modulesOn)];
  out.scope.modulesOff = [...new Set(out.scope.modulesOff)];

  if (out.detected.workType || out.detected.propertyType || out.detected.totalM2) out.confidence = Math.max(out.confidence, 0.68);
  if (wantsTabique || wantsAlisar) out.confidence = Math.max(out.confidence, 0.72);

  const tags=[];
  if (out.detected.workType) tags.push("obra:"+out.detected.workType);
  if (out.detected.propertyType) tags.push("inmueble:"+out.detected.propertyType);
  if (out.detected.totalM2) tags.push(out.detected.totalM2+"m²");
  if (out.detected.bathroomM2!=null) tags.push("baño "+out.detected.bathroomM2+"m²");
  if (out.detected.kitchenM2!=null) tags.push("cocina "+out.detected.kitchenM2+"m²");
  if (wantsTabique) tags.push("tabique");
  if (wantsAlisar) tags.push("alisar suelos");
  if (wantsElectrica) tags.push("eléctrica");
  out.tokens = tags;

  return out;
}

function setIntent(text){
  localStorage.setItem(S.intent, text || "");
  const ia = ia1ParseIntent(text || "");
  localStorage.setItem(S.ia1, JSON.stringify(ia));
  return ia;
}
function getIntent(){ return localStorage.getItem(S.intent) || ""; }
function getIA1(){ const raw = localStorage.getItem(S.ia1); return raw? JSON.parse(raw) : ia1ParseIntent(""); }

// -----------------------------
// Motor demo (1 cálculo, 2 vistas)
// -----------------------------
function materialsFactor(level){
  if (level==="basic") return 0.92;
  if (level==="premium") return 1.12;
  return 1.0; // medium default
}

function engineRun(p, stage, version){
  const m = p.measurements;
  const totalM2 = Math.max(20, m.totalM2||60);
  const bathroomM2 = clamp(m.bathroomM2||0,0,totalM2);
  const kitchenM2 = clamp(m.kitchenM2||0,0,totalM2-bathroomM2);
  const restM2 = Math.max(0,totalM2-bathroomM2-kitchenM2);

  const baseRate = p.workType==="obra_nueva"?950 : p.workType==="rehabilitacion"?820 : p.workType==="integral"?720 : 560;
  const matF = materialsFactor(p.materials.level);

  const lines=[];
  const add=(chapter,item,cost,roomGroup,meta=null)=> lines.push({chapter,item,cost:Math.max(0,cost),roomGroup,meta});

  const on = applyDependencies({...p.modules});
  const tab = p.tabique || { action:"modificar", typeId:"pladur70", ml:4 };

  add("Base","Coste base por m² (vivienda)", baseRate*totalM2*matF, "Resto de vivienda");

  if (on.demoliciones) add("Demoliciones","Demoliciones y retirada",34*totalM2,"Resto de vivienda");
  if (on.albanileria) add("Albañilería","Albañilería y preparación",58*totalM2*matF,"Resto de vivienda");

  if (on.tabiques){
    const chosen = TABIQUE_CATALOG.find(x=>x.id===tab.typeId) || TABIQUE_CATALOG[0];
    const ml = Math.max(1, Number(tab.ml||4));
    if (tab.action==="derribar" || tab.action==="modificar"){
      add("Demoliciones",`Demolición de tabique (${ml} ml)`,45*ml,"Resto de vivienda",{partida:"tabique_demolicion", ml, type:chosen.name});
    }
    if (tab.action==="hacer" || tab.action==="modificar"){
      add("Albañilería",`Ejecución tabique ${chosen.name} (${ml} ml)`,(chosen.eur_ml||58)*ml*matF,"Resto de vivienda",{partida:"tabique_nuevo", ml, type:chosen.name});
    }
  }

  if (on.inst_fontaneria && bathroomM2>0) add("Instalaciones","Fontanería (baño)",420+95*bathroomM2*matF,"Baño completo");
  if (on.inst_fontaneria && kitchenM2>0) add("Instalaciones","Fontanería (cocina)",520+88*kitchenM2*matF,"Cocina completa");

  if (on.inst_electrica) add("Instalaciones","Eléctrica (vivienda)",1050*matF,"Resto de vivienda");
  if (on.admin_electrica) add("Instalaciones","Legalización/boletín",240,"Resto de vivienda");

  if (on.revestimientos && bathroomM2>0) add("Revestimientos","Solado+alicatado baño",140*bathroomM2*matF,"Baño completo");
  if (on.revestimientos && kitchenM2>0) add("Revestimientos","Solado+frente cocina",110*kitchenM2*matF,"Cocina completa");
  if (on.suelos && restM2>0) add("Revestimientos","Pavimento resto vivienda",72*restM2*matF,"Resto de vivienda");
  if (on.alisar_suelos && restM2>0) add("Revestimientos","Regularización/alisado de soporte para pavimento",18*restM2*matF,"Resto de vivienda",{partida:"alisar_suelos", m2:restM2});

  if (on.pintura) add("Pintura","Pintura general",22*totalM2*matF,"Resto de vivienda",{partida:"pintura", m2:totalM2});
  if (on.carpinteria) add("Carpintería","Puertas interiores (aprox.)",620*matF,"Resto de vivienda");
  if (on.climatizacion) add("Instalaciones","Climatización / ventilación",690*matF,"Resto de vivienda");
  if (on.gestion) add("Gestión","Gestión y coordinación",520,"Resto de vivienda");


// Profesional: si existe edición manual de partidas, manda sobre el motor (solo en demo v5.1)
if (p.role==="profesional" && Array.isArray(p.manualLines) && p.manualLines.length){
  lines.length = 0;
  for (const e of p.manualLines){
    if (!e || e._deleted) continue;
    const l = lineFromEditable(e);
    lines.push(l);
  }
}


  const costSubtotal = Math.round(lines.reduce((a,b)=>a+b.cost,0)/10)*10;
  const margin = Math.round(costSubtotal*(p.proSettings.marginPct/100)/10)*10;
  const baseWithMargin = costSubtotal+margin;
  const iva = Math.round(baseWithMargin*(p.proSettings.ivaPct/100)/10)*10;
  const pvpTotal = Math.round((baseWithMargin+iva)/10)*10;

  // PVP por estancias (particular)
  const wB = bathroomM2>0 ? 2.3*bathroomM2 : 0;
  const wK = kitchenM2>0 ? 2.1*kitchenM2 : 0;
  const wR = Math.max(1,restM2);
  const sumW = (wB+wK+wR)||1;
  let by=[
    {label:"Baño completo", amount: Math.round(pvpTotal*(wB/sumW)/10)*10},
    {label:"Cocina completa", amount: Math.round(pvpTotal*(wK/sumW)/10)*10},
    {label:"Resto de vivienda", amount: Math.round(pvpTotal*(wR/sumW)/10)*10},
  ].filter(x=>x.amount>0 || x.label==="Resto de vivienda");
  const drift = pvpTotal - by.reduce((a,b)=>a+b.amount,0);
  by[by.length-1].amount += drift;

  const risks=[];
  if (!m.totalM2) risks.push("Faltan m² totales: el presupuesto puede variar.");
  if (on.tabiques) risks.push("Tabiques: puede requerir verificación técnica/licencia (según caso).");

  return { stage, version, createdAt:new Date().toISOString(), lines, totals:{costSubtotal,margin,iva,pvpTotal,pvpByRoom:by}, risks };
}

// -----------------------------
// Proyectos + trazabilidad
// -----------------------------
function createProject(input){
  const id = uid();
  const rest = Math.max(0, input.totalM2 - input.bathroomM2 - input.kitchenM2);

  const p = {
    id,
    name: input.name,
    city: input.city,
    role: input.role,
    proRole: input.proRole,
    knowledge: input.knowledge,
    propertyType: input.propertyType,
    workType: input.workType,
    stage: "orientativo",
    intent: input.intent || "",
    ia: { ia1: input.ia1 || null, ia1Applied:false },
    measurements: {
      totalM2: input.totalM2, bathroomM2: input.bathroomM2, kitchenM2: input.kitchenM2, restM2: rest,
      source: input.source || "manual",
      sourceNote: input.sourceNote || ""
    },
    plan: { paid:true, fee: planFeeFor(input.role) },
    payments: { marketplaceAccessPaid:false, marketplaceFee: marketplaceFee() },
    materials: { level: input.materialsLevel || "medium" }, // basic/medium/premium
    modules: applyDependencies(defaultModulesFor(input.workType)),
    tabique: { action:"modificar", typeId:"pladur70", ml:4 },
    proSettings: { ivaPct:21, marginPct:18 },
    manualLines: [],
    snapshots: [],
    changelog: [],
    providerId: "",
    marketplaceStatus: "none"
  };

  p.snapshots.push(engineRun(p,"orientativo",1));
  saveProject(p);
  localStorage.setItem(S.last, id);
  return id;
}

function changelogPush(p, actor, reason, beforeV, afterV, delta){
  p.changelog.push({ id: uid(), at:new Date().toISOString(), actor, reason, before:beforeV, after:afterV, delta });
}

function applyIA1Preset(id, ia){
  const p = getProject(id);
  if (!p || p.stage==="cerrado") return p;
  const before = p.snapshots[p.snapshots.length-1];

  if (ia?.detected?.totalM2) p.measurements.totalM2 = ia.detected.totalM2;
  if (ia?.detected?.bathroomM2!=null) p.measurements.bathroomM2 = ia.detected.bathroomM2;
  if (ia?.detected?.kitchenM2!=null) p.measurements.kitchenM2 = ia.detected.kitchenM2;

  const mods = p.modules;
  (ia?.scope?.modulesOn||[]).forEach(k=> mods[k]=true);
  (ia?.scope?.modulesOff||[]).forEach(k=> mods[k]=false);
  p.modules = applyDependencies(mods);

  if (ia?.scope?.tabique?.action) p.tabique.action = ia.scope.tabique.action;
  if (ia?.scope?.tabique?.typeId) p.tabique.typeId = ia.scope.tabique.typeId;
  if (ia?.scope?.tabique?.ml!=null) p.tabique.ml = ia.scope.tabique.ml;

  const after = engineRun(p,"orientativo",before.version+1);
  p.snapshots.push(after);
  changelogPush(p, "IA-1", "Preajuste por intención", before.version, after.version, after.totals.pvpTotal - before.totals.pvpTotal);
  p.ia.ia1Applied = true;
  saveProject(p);
  return p;
}

function updateProject(id, mutateFn, reason, actor="usuario"){
  const p = getProject(id);
  if (!p || p.stage==="cerrado") return p;
  const before = p.snapshots[p.snapshots.length-1];
  mutateFn(p);
  p.modules = applyDependencies(p.modules);
  p.stage = "ajustado";
  const after = engineRun(p,"ajustado",before.version+1);
  p.snapshots.push(after);
  changelogPush(p, actor, reason, before.version, after.version, after.totals.pvpTotal - before.totals.pvpTotal);
  saveProject(p);
  return p;
}

function closeProject(id){
  const p = getProject(id);
  if (!p || p.stage==="cerrado") return p;
  const before = p.snapshots[p.snapshots.length-1];
  p.stage = "cerrado";
  const after = engineRun(p,"cerrado",before.version+1);
  p.snapshots.push(after);
  changelogPush(p, "sistema", "Cierre de presupuesto", before.version, after.version, after.totals.pvpTotal - before.totals.pvpTotal);
  saveProject(p);
  return p;
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

function openPdfPrint(p, provider, view){
  const now = new Date();
  const safe = (s)=> (s||"").toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");
  const fileHint = `MODULO_${safe(p.name||"cliente")}_${safe(provider?.name||"proveedor")}_${view}_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}.pdf`;
  const w = window.open("","_blank"); if(!w) return;
  const b = p.snapshots[p.snapshots.length-1];
  const intro = view==="cliente"
    ? "Hoy empieza la parte buena. Este presupuesto es claro, completo y de mercado."
    : "Documento técnico por capítulos y partidas (coste + IVA + margen).";
  const rowsCliente = b.totals.pvpByRoom.map(x=>`<tr><td>${x.label}</td><td style="text-align:right"><b>${x.amount} €</b></td></tr>`).join("");

  const chapterSums = b.lines.reduce((acc,l)=>{ acc[l.chapter]=(acc[l.chapter]||0)+l.cost; return acc; },{});
  const rowsTechSummary = Object.entries(chapterSums)
    .map(([ch,sum])=>`<tr><td><b>${escapeHtml(ch)}</b></td><td style="text-align:right"><b>${Math.round(sum)} €</b></td></tr>`)
    .join("");

  const rowsTechDetail = b.lines.map(l=>{
    const meta = l.meta || {};
    const qty = meta.qty ?? (meta.m2 ?? (meta.ml ?? 1));
    const unit = meta.unit ?? (meta.m2!=null ? "m²" : meta.ml!=null ? "ml" : "ud");
    const price = meta.price ?? (qty ? Math.round((l.cost/qty)*100)/100 : Math.round(l.cost*100)/100);
    return `<tr>
      <td>${escapeHtml(l.chapter)}</td>
      <td>${escapeHtml(l.item)}</td>
      <td style="text-align:right">${Number(qty||0).toFixed(2)}</td>
      <td>${escapeHtml(unit)}</td>
      <td style="text-align:right">${Number(price||0).toFixed(2)} €</td>
      <td style="text-align:right"><b>${Math.round(l.cost)} €</b></td>
    </tr>`;
  }).join("");

  const rows = view==="cliente"
    ? rowsCliente
    : `
      <thead><tr><th colspan="2">Resumen por capítulos</th><th style='text-align:right'>Coste</th></tr></thead>
      ${rowsTechSummary}
      <tr><td colspan="3" style="border-bottom:none"></td></tr>
      <thead><tr><th>Capítulo</th><th>Partida</th><th style="text-align:right">Qty</th><th>Ud</th><th style="text-align:right">€/ud</th><th style="text-align:right">Coste</th></tr></thead>
      ${rowsTechDetail}
    `;
  w.document.write(`
  <html><head><meta charset="utf-8"/><title>${fileHint}</title>
  <style>
    body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin:40px; color:#141416}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
    .logo{width:54px;height:54px;border-radius:16px;background:#1b1b22;color:#c98b2b;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:28px}
    h1{margin:0;font-size:24px;letter-spacing:-.3px}
    .muted{color:#6a6b73}
    .card{border:1px solid #ece4d8;border-radius:16px;padding:16px;margin-top:14px;background:#fffdf9}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    td{padding:8px 0;border-bottom:1px solid #eee}
    th{font-size:12px;color:#6a6b73;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:8px 0;border-bottom:1px solid #eee}
    .kpi{font-size:28px;font-weight:950;letter-spacing:-.4px;color:#1b1b22}
    .hint{margin-top:10px;font-size:12px;color:#6a6b73}
    @media print {.hint{display:none}}
  </style></head><body>
    <div class="top">
      <div class="logo">M</div>
      <div style="text-align:right">
        <div class="muted">Nombre sugerido:</div>
        <div><b>${fileHint}</b></div>
        <div class="muted">${now.toLocaleString()}</div>
      </div>
    </div>
    <h1>Presupuesto ${view==="cliente"?"cliente":"técnico"} · ${escapeHtml(p.name||"cliente")}</h1>
    <div class="muted">Ciudad: <b>${escapeHtml(p.city)}</b> · Proveedor: <b>${escapeHtml(provider?.name||"—")}</b> · Estado: <b>${p.stage.toUpperCase()}</b></div>
    <div class="card">
      <div class="muted">${intro}</div>
      <div style="display:flex;justify-content:space-between;align-items:end;margin-top:10px">
        <div><div class="muted">Total</div><div class="kpi">${b.totals.pvpTotal} €</div></div>
        <div style="text-align:right" class="muted">IVA: <b>${b.totals.iva} €</b><br/>Margen: <b>${b.totals.margin} €</b></div>
      </div>
      <table>
        ${view==="cliente" ? "<thead><tr><th>Estancia</th><th style='text-align:right'>PVP</th></tr></thead>"+rows : rows}
      </table>
      <div class="hint">Archivo → Imprimir → “Guardar como PDF”. Usa el nombre sugerido.</div>
    </div>
  </body></html>`);
  w.document.close(); w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 250);
}

// -----------------------------
// Router
// -----------------------------
function route(){
  const hash = (location.hash || "#/").slice(1);
  const parts = hash.split("/").filter(Boolean);
  const page = parts[0] || "";
  const app = $("#app");

  // topbar (except splash/login)
  if (page!=="" && page!=="login") setTopbar("app");


  if (page==="") return renderSplash(app);
  if (page==="landing") return renderLanding(app);
  if (page==="login") return renderLogin(app);
  if (page==="metodo") return renderMetodo(app);
  if (page==="planes") return renderPlanes(app);
  // v5.1: "Elige tu modo" eliminado. /rol redirige directo a IA-1 usando el rol ya seleccionado.
  if (page==="rol") { location.hash = "#/ia"; return; }
  // role-safe entrypoints (fallback if JS bindings fail on the role screen)
  if (page==="ia-particular"){ setRole("particular"); setProRole(""); location.hash = "#/ia"; return; }
  if (page==="ia-profesional"){ setRole("profesional"); if (!getProRole()) setProRole("constructor"); location.hash = "#/ia"; return; }

  if (page==="ia") return renderIA1(app);
  if (page==="onboarding") return renderOnboarding(app);
  if (page==="dashboard") return renderDashboard(app);
  if (page==="project") return renderProject(app, parts[1]);
  if (page==="paywall") return renderPaywall(app, parts[1]);
  if (page==="marketplace") return renderMarketplace(app, parts[1]);
  if (page==="partner") return renderPartner(app);

  app.innerHTML = `<div class="card"><div class="badge">404</div><div class="hr"></div><a class="btn" href="#/">Inicio</a></div>`;
}



// -----------------------------
// 0) SPLASH + LOGIN (nuevo home)
// -----------------------------
function renderSplash(app){
  setTopbar("splash");
  app.innerHTML = `
    <div class="splashWrap">
      <div class="splashCenter">
        <div class="splashLogo">M</div>
        <div class="splashBrand">MÓDULO</div>
        <div class="splashTag">Presupuestos de obra completos, reales y defendibles.</div>
      </div>
    </div>
  `;
}

function renderLogin(app){
  setTopbar("login");
  app.innerHTML = `
    <div class="grid" style="gap:12px">
      <div class="card">
        <div class="badge ok">Acceso</div>
        <div class="sectionTitle">Elige tu recorrido</div>
        <div class="muted">Pago simulado en demo. Tras el pago entras en MÓDULO.</div>
      </div>

      <div class="grid grid2">
        <!-- Particular a la izquierda (desktop) -->
        <div class="card">
          <div class="badge">Particular</div>
          <div class="sectionTitle">PVP por estancias</div>
          <div class="muted">Decidir con seguridad. El particular no firma contratos.</div>
          <div class="hr"></div>
          <div class="kpi">9 €<span class="small">/proyecto</span></div>
          <div class="hr"></div>
          <button class="btn" id="payPart">Pagar y entrar</button>
        </div>

        <!-- Profesional a la derecha (desktop) -->
        <div class="card">
          <div class="badge">Profesional</div>
          <div class="sectionTitle">Coste por capítulos/partidas</div>
          <div class="muted">Ajustado editable: partidas, medidas, uds, precio, IVA y margen.</div>
          <div class="hr"></div>
          <div class="kpi">49 €<span class="small">/proyecto</span></div>
          <div class="hr"></div>
          <button class="btn" id="payPro">Pagar y entrar</button>
        </div>
      </div>

      <div class="card soft">
        <a class="btn ghost" href="#/">Volver</a>
      </div>
    </div>
  `;

  $("#payPro").onclick = ()=>{
    setRole("profesional");
    setProRole("constructor");
    ensureSeedProjects();
    location.hash = "#/landing";
  };

  $("#payPart").onclick = ()=>{
    setRole("particular");
    ensureSeedProjects();
    location.hash = "#/landing";
  };
}

// -----------------------------
// 1) LANDING
// -----------------------------
function renderLanding(app){
  app.innerHTML = `
    <div class="hero">
      <div class="row" style="justify-content:space-between; align-items:flex-start">
        <div>
          <div class="badge ok">MÓDULO</div>
          <h1>El estándar para presupuestar obras.</h1>
          <p>Un solo cálculo. Dos lenguajes: particular y profesional.</p>
          <div class="hr"></div>
          <p class="muted">MÓDULO genera presupuestos de obra completos, reales y defendibles.<br/>
          Empiezas con todo incluido y ajustas hasta cerrar.<br/>
          Sin humo. Sin improvisar.</p>

          <div class="row" style="margin-top:14px">
            <a class="btn" href="#/rol">Crear presupuesto</a>
            <a class="btn ghost" href="#/#!how">Ver cómo funciona (1 min)</a>
          </div>

          <div class="row" style="margin-top:10px">
            <a class="small" href="#/rol">Particular</a>
            <span class="small muted">·</span>
            <a class="small" href="#/rol">Profesional</a>
            <span class="small muted">·</span>
            <a class="small" href="#/partner">Partner</a>
          </div>
        </div>

        <div class="card" style="min-width:320px; max-width:360px">
          <div class="badge info">Resumen</div>
          <div class="hr"></div>
          <div class="toggle"><div><b>3 fases</b><div class="small">Orientativo → Ajustado → Cerrado (bloquea)</div></div><span class="badge ok">OK</span></div>
          <div style="height:10px"></div>
          <div class="toggle"><div><b>2 vistas</b><div class="small">PVP estancias · Coste capítulos/partidas</div></div><span class="badge ok">OK</span></div>
          <div style="height:10px"></div>
          <div class="toggle"><div><b>Marketplace</b><div class="small">Solo tras cerrado (+2,49€)</div></div><span class="badge ok">OK</span></div>
        </div>
      </div>

      <div id="how" class="anchor"></div>
      <div class="card" style="margin-top:14px">
        <div class="badge">Cómo funciona</div>
        <div class="hr"></div>
        <div class="grid grid3">
          <div class="card soft">
            <b>1) Cuéntanos tu obra</b>
            <div class="small">IA-1 entiende intención y propone alcance completo.</div>
          </div>
          <div class="card soft">
            <b>2) Ajusta sin miedo</b>
            <div class="small">IA-2 explica consecuencias. Todo es reversible hasta cerrar.</div>
          </div>
          <div class="card soft">
            <b>3) Cierra y elige proveedor</b>
            <div class="small">Presupuesto defendible. Marketplace solo post-cierre.</div>
          </div>
        </div>
      </div>
    </div>`;
}

// -----------------------------
// Método / Planes
// -----------------------------
function renderMetodo(app){
  app.innerHTML = `
    <div class="grid grid2">
      <div>
        <h2 style="margin-top:0">El método MÓDULO</h2>
        <p class="muted">Una sola verdad (motor), máxima trazabilidad, nada inventado. La app es capa visual y pedagógica.</p>
        <div class="grid">
          <div class="card"><div class="badge ok">3 fases</div><div class="muted">Orientativo → Ajustado → Cerrado (bloquea).</div></div>
          <div class="card"><div class="badge ok">2 vistas</div><div class="muted">Particular (PVP por estancias) / Profesional (capítulos/partidas + IVA/margen).</div></div>
          <div class="card"><div class="badge ok">Marketplace</div><div class="muted">Solo tras CERRADO. Acceso al match por 2,49€.</div></div>
        </div>
      </div>
      <div class="card">
        <div class="sectionTitle">IA por capas</div>
        <ul class="muted">
          <li><b>IA-1</b>: intención → workflow + preajuste (desde TODO ON).</li>
          <li><b>IA-2</b>: ajustes y dependencias en AJUSTADO.</li>
          <li><b>IA-3</b>: materiales Basic/Medium/Premium.</li>
        </ul>
        <div class="hr"></div>
        <a class="btn" href="#/rol">Crear presupuesto</a>
      </div>
    </div>`;
}

function renderPlanes(app){
  app.innerHTML = `
    <div>
      <h2 style="margin-top:0">Planes</h2>
      <p class="muted">Planes por proyecto. Partner fuera de planes. Marketplace: match 2,49€ tras CERRADO (particular).</p>
      <div class="grid grid2" style="margin-top:12px">
        <div class="card">
          <div class="badge ok">Particular</div>
          <div class="kpi">9 €<span class="small">/proyecto</span></div>
          <div class="muted">PVP de mercado por estancias completas.</div>
          <div class="hr"></div>
          <a class="btn" href="#/rol">Empezar</a>
        </div>
        <div class="card">
          <div class="badge ok">Profesional</div>
          <div class="kpi">49 €<span class="small">/proyecto</span></div>
          <div class="muted">Coste por capítulos/partidas + controla IVA/margen.</div>
          <div class="hr"></div>
          <a class="btn" href="#/rol">Entrar</a>
        </div>
      </div>
    </div>`;
}

// -----------------------------
// 2) ROL (decisión simple)
// -----------------------------
function renderRole(app){
  app.innerHTML = `
    <div>
      <div class="hero">
        <h1>Elige tu modo</h1>
        <p>Una decisión. Luego MÓDULO se encarga del resto.</p>
      </div>
      <div class="grid grid3">
        <div class="card">
          <div class="badge ok">Particular</div>
          <div class="sectionTitle">Decidir con seguridad</div>
          <div class="muted">PVP por estancias. No firma contrato.</div>
          <div class="hr"></div>
          <a class="btn" id="goPart" href="#/ia-particular">Continuar</a>
        </div>
        <div class="card">
          <div class="badge">Partner</div>
          <div class="sectionTitle">Proveedores</div>
          <div class="muted">Registro y solicitudes (demo).</div>
          <div class="hr"></div>
          <a class="btn ghost" id="goPartner" href="#/partner">Entrar</a>
        </div>
        <div class="card">
          <div class="badge ok">Profesional</div>
          <div class="sectionTitle">Ejecutar con trazabilidad</div>
          <div class="muted">Capítulos/partidas + IVA/margen.</div>
          <div class="hr"></div>
          <a class="btn" id="goPro" href="#/ia-profesional">Continuar</a>
        </div>
      </div>
      <div class="hr"></div>
      <div class="callout info">
        <b>Siguiente paso</b>
        <div class="muted">IA-1: “Cuéntame tu obra” (intención → alcance completo).</div>
      </div>
    </div>`;

  // Progressive enhancement: si JS falla, los links navegan igualmente.
  $("#goPart").onclick = (e)=>{ e.preventDefault(); setRole("particular"); location.hash="#/ia"; };
  $("#goPro").onclick = (e)=>{ e.preventDefault(); setRole("profesional"); setProRole("constructor"); location.hash="#/ia"; };
  $("#goPartner").onclick = (e)=>{ e.preventDefault(); setRole("partner"); location.hash="#/partner"; };
}

// -----------------------------
// 3) IA-1 (intención)
// -----------------------------
function renderIA1(app){
  const prev = getIntent();
  const ia = getIA1();

  app.innerHTML = `
    <div class="card">
      <div class="badge ok">IA-1 · Intención</div>
      <h2 style="margin:10px 0 0">Cuéntame tu obra. Yo me encargo del alcance.</h2>
      <p class="muted">Partimos de <b>todo incluido</b> y ajustas hasta dejarlo exacto. La IA <b>no inventa</b>: usa el estándar MÓDULO.</p>

      <label>Describe tu obra
        <textarea id="intent">${escapeHtml(prev || "Reforma integral de piso 60m², baño 4m², cocina 8m². Quiero alisar suelos y tirar un tabique.")}</textarea>
      </label>

      <div class="row" style="margin-top:10px">
        ${["Reforma integral","Baño completo","Cocina completa","Tirar tabique","Alisar suelos","Instalación eléctrica"].map(t=>`<button class="pill" data-chip="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}
      </div>

      <div class="hr"></div>
      <div id="iaPanel" class="callout info"></div>

      <div class="hr"></div>
      <div class="row" style="justify-content:space-between">
        <a class="btn ghost" href="#/rol">Volver</a>
        <div class="row">
          <button class="btn ghost" id="analyzeBtn">Analizar</button>
          <button class="btn" id="startBtn">Empezar</button>
        </div>
      </div>
      <div class="small" style="margin-top:10px"><b>Confianza:</b> MÓDULO trabaja con precios reales de mercado. Este presupuesto se puede ejecutar tal cual.</div>
    </div>`;

  const renderIAPanel = (ia)=>{
    const tags = (ia.tokens||[]).map(t=>`<span class="kbd">${escapeHtml(t)}</span>`).join(" ");
    const on = (ia.scope?.modulesOn||[]).map(k=>`<span class="kbd">+${k}</span>`).join(" ");
    const off = (ia.scope?.modulesOff||[]).map(k=>`<span class="kbd">-${k}</span>`).join(" ");
    const conf = Math.round((ia.confidence||0.5)*100);
    $("#iaPanel").innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><b>Qué he entendido</b> <span class="badge info">${conf}%</span></div>
        <div class="small">Propuesta trazable.</div>
      </div>
      <div style="height:8px"></div>
      <div class="small">Tags: ${tags || "<span class='muted'>—</span>"}</div>
      <div class="small">Propuesta (módulos): ${on || "<span class='muted'>—</span>"} ${off || ""}</div>
      <div class="small muted">Empiezas con TODO ON. Aquí solo preparo un preajuste.</div>
    `;
  };

  renderIAPanel(ia);

  $$("button[data-chip]").forEach(btn=>{
    btn.onclick = ()=>{
      const chip = btn.getAttribute("data-chip");
      const t = $("#intent").value || "";
      $("#intent").value = (t.trim()? (t.trim()+", ") : "") + chip;
    };
  });

  $("#analyzeBtn").onclick = ()=>{
    const txt = $("#intent").value || "";
    const ia = setIntent(txt);
    renderIAPanel(ia);
  };
  $("#startBtn").onclick = ()=>{
    const txt = $("#intent").value || "";
    setIntent(txt);
    location.hash = "#/onboarding";
  };
}

// -----------------------------
// Panel (utilidad)
// -----------------------------
function renderDashboard(app){
  const last = getLastProjectId();
  const role = getRole();
  app.innerHTML = `
    <div class="grid grid2">
      <div class="card">
        <div class="badge ok">Acción</div>
        <div class="sectionTitle">Crear proyecto</div>
        <div class="muted">Onboarding + presupuesto orientativo premium.</div>
        <div class="hr"></div>
        <button class="btn" id="newBtn">Nuevo</button>
        <div class="small" style="margin-top:10px">Rol actual: <b>${role}</b></div>
      </div>
      <div class="card">
        <div class="badge">Acceso rápido</div>
        <div class="sectionTitle">Último proyecto</div>
        <div class="muted">Abrir el último proyecto de este navegador.</div>
        <div class="hr"></div>
        <button class="btn ghost" id="openBtn" ${!last?"disabled":""}>Abrir</button>
      </div>
    </div>`;
  $("#newBtn").onclick=()=> location.hash="#/rol";
  $("#openBtn")?.addEventListener("click", ()=> location.hash=`#/project/${last}`);
}

// -----------------------------
// 4) Onboarding / medición / planos
// -----------------------------
function renderOnboarding(app){
  const role = getRole();
  const proRole = getProRole();

  const intent = getIntent();
  const ia = getIA1();

  app.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="badge ok">Medición</div>
          <h2 style="margin:8px 0 0">Entrada de planos y medidas</h2>
          <p class="muted">En demo guardamos la fuente. La medición mínima útil es: total m² + baño + cocina.</p>
        </div>
        <a class="btn ghost" href="#/ia">Volver</a>
      </div>

      <div class="hr"></div>

      <div class="callout info">
        <b>IA-1</b>
        <div class="small" style="margin-top:6px">${escapeHtml(intent||"—")}</div>
        <div class="small" style="margin-top:8px">Detectado: ${(ia.tokens||[]).map(t=>`<span class="kbd">${escapeHtml(t)}</span>`).join(" ") || "<span class='muted'>—</span>"}</div>
      </div>

      <div class="hr"></div>

      <div class="grid grid2">
        <label>Nombre del proyecto<input id="name" value="${role==="profesional"?"Proyecto cliente":"Mi proyecto"}"/></label>
        <label>Ciudad<input id="city" value="Madrid"/></label>

        <label>Perfil profesional ${role==="profesional"?"":"(solo pro)"}
          <select id="proRole" ${role==="profesional"?"":"disabled"}>
            <option value="arquitecto">Arquitecto</option>
            <option value="inmobiliaria">Inmobiliaria</option>
            <option value="constructor">Constructor</option>
            <option value="interiorista">Interiorista</option>
          </select>
        </label>

        <label>Tipo de inmueble
          <select id="propertyType">
            <option value="piso">Piso</option>
            <option value="casa">Casa</option>
            <option value="local">Local</option>
          </select>
        </label>

        <label>Tipo de obra
          <select id="workType">
            <option value="integral">Reforma integral</option>
            <option value="parcial">Reforma parcial</option>
            <option value="rehabilitacion">Rehabilitación</option>
            <option value="obra_nueva">Obra nueva</option>
          </select>
        </label>

        <label>Nivel de conocimiento
          <select id="knowledge">
            <option value="basico">Básico</option>
            <option value="medio">Medio</option>
            <option value="pro">Pro</option>
          </select>
        </label>
      </div>

      <div class="hr"></div>

      <div class="callout">
        <b>Planos / medición (opciones)</b>
        <div class="grid grid3" style="margin-top:10px">
          ${[
            {k:"manual", t:"Manual", d:"Introducir m²"},
            {k:"plano", t:"Subir plano", d:"Placeholder"},
            {k:"dibujo", t:"Dibujo a mano", d:"Placeholder"},
            {k:"video", t:"Vídeo/escaneo", d:"Placeholder"},
            {k:"integracion", t:"Integración app", d:"Placeholder"},
          ].map(x=>`
            <div class="card soft">
              <b>${x.t}</b>
              <div class="small">${x.d}</div>
              <div style="height:8px"></div>
              <span class="badge ${x.k==="manual"?"ok":"info"}">${x.k==="manual"?"Disponible":"Próximamente"}</span>
            </div>`).join("")}
        </div>
        <div class="hr"></div>
        <label>Fuente seleccionada
          <select id="source">
            <option value="manual">Manual</option>
            <option value="plano">Subir plano (placeholder)</option>
            <option value="dibujo">Dibujo a mano alzada (placeholder)</option>
            <option value="video">Vídeo/escaneo (placeholder)</option>
            <option value="integracion">Integración app medición (placeholder)</option>
          </select>
        </label>
        <label style="margin-top:10px">Notas<input id="sourceNote" placeholder="Ej: plano PDF de inmobiliaria"/></label>
      </div>

      <div class="hr"></div>

      <div class="callout">
        <b>Medición mínima útil</b>
        <div class="muted">Total m² + baño + cocina. El resto se calcula para pintura/suelos/etc.</div>
        <div class="grid grid3" style="margin-top:10px">
          <label>m² totales<input id="total" type="number" value="60"/></label>
          <label>m² baño<input id="bath" type="number" value="4"/></label>
          <label>m² cocina<input id="kitchen" type="number" value="8"/></label>
        </div>
        <div class="small" id="restHint"></div>
      </div>

      <div class="hr"></div>

      <div class="row" style="justify-content:space-between">
        <a class="btn ghost" href="#/rol">Cancelar</a>
        <button class="btn" id="createBtn">Crear proyecto (plan: ${role==="partner"?"Partner": `${planFeeFor(role)}€`}/proyecto)</button>
      </div>
    </div>`;

  if (role==="profesional") $("#proRole").value = proRole || "constructor";
  if (ia?.detected?.propertyType) $("#propertyType").value = ia.detected.propertyType;
  if (ia?.detected?.workType) $("#workType").value = ia.detected.workType;
  if (ia?.detected?.totalM2) $("#total").value = ia.detected.totalM2;
  if (ia?.detected?.bathroomM2!=null) $("#bath").value = ia.detected.bathroomM2;
  if (ia?.detected?.kitchenM2!=null) $("#kitchen").value = ia.detected.kitchenM2;

  const updateRest=()=>{
    const total=Number($("#total").value||0), bath=Number($("#bath").value||0), kitchen=Number($("#kitchen").value||0);
    const rest=Math.max(0,total-bath-kitchen);
    const invalid=(bath+kitchen)>total;
    $("#restHint").innerHTML = `<span class="badge ${invalid?"danger":"ok"}">Resto de vivienda: ${rest} m² ${invalid?"(baño+cocina > total)":""}</span>`;
    $("#createBtn").disabled = invalid || total<=0;
  };
  ["total","bath","kitchen"].forEach(id=> $("#"+id).addEventListener("input", updateRest));
  updateRest();

  $("#createBtn").onclick = ()=>{
    const role=getRole();
    const ia1 = getIA1();
    const pId = createProject({
      role,
      proRole: role==="profesional" ? $("#proRole").value : "",
      knowledge: $("#knowledge").value,
      name: $("#name").value,
      city: $("#city").value,
      propertyType: $("#propertyType").value,
      workType: $("#workType").value,
      totalM2: Number($("#total").value||0),
      bathroomM2: Number($("#bath").value||0),
      kitchenM2: Number($("#kitchen").value||0),
      source: $("#source").value,
      sourceNote: $("#sourceNote").value,
      intent: getIntent(),
      ia1,
      materialsLevel: "medium"
    });

    const iaShouldApply = (getIntent()||"").trim().length > 0;
    if (iaShouldApply) applyIA1Preset(pId, ia1);

    location.hash = `#/project/${pId}`;
  };
}

// -----------------------------
// 5) Proyecto / Presupuesto (3 fases)
// -----------------------------
function renderProject(app, id){
  const p = getProject(id);
  if (!p) return app.innerHTML = `<div class="card"><div class="badge">Sin proyecto</div><div class="hr"></div><a class="btn" href="#/dashboard">Volver</a></div>`;
  seedProvidersIfEmpty(p.city);

  const latest = p.snapshots[p.snapshots.length-1];
  const provider = p.providerId ? getProviders().find(x=>x.id===p.providerId) : null;
  const locked = p.stage==="cerrado";

  app.innerHTML = `
    <div class="grid" style="gap:12px">
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="badge ok">Proyecto</div>
            <div class="sectionTitle">${escapeHtml(p.name)}</div>
            <div class="muted">${escapeHtml(p.city)} · Rol: <b>${p.role}</b>${p.proRole?` · Perfil: <b>${p.proRole}</b>`:""} · Fase: <b>${p.stage.toUpperCase()}</b></div>
            ${p.intent ? `<div class="small" style="margin-top:6px"><span class="badge info">IA-1</span> ${escapeHtml(p.intent)}</div>`:""}
          </div>
          <div style="text-align:right">
            <div class="small">Total</div>
            <div class="kpi">${latest.totals.pvpTotal} €</div>
            <div class="row" style="justify-content:flex-end">
              ${p.role==="profesional" ? `<button class="btn ghost small" id="pdfT">PDF técnico</button>` : `<button class="btn ghost small" id="pdfC">PDF cliente</button><button class="btn ghost small" id="pdfT">PDF técnico</button>`}
            </div>
          </div>
        </div>

        <div class="hr"></div>
        <div class="row" style="justify-content:space-between">
          <div class="row">
            ${p.role==="particular" ? `
              <button class="pill active" id="tabO">Idea</button>
              <button class="pill" id="tabA">Ajustes</button>
              <button class="pill" id="tabC">Cerrado</button>
            ` : `
              <button class="pill active" id="tabO">Orientativo</button>
              <button class="pill" id="tabA">Ajustado</button>
              <button class="pill" id="tabC">Cerrado</button>
            `}
          </div>
          <div class="row">
            <a class="btn ghost small" href="#/dashboard">Panel</a>
          </div>
        </div>

        ${p.providerId ? `
          <div class="callout" style="margin-top:12px">
            <b>Marketplace</b>
            <div class="muted">Proveedor: <b>${escapeHtml(provider?.name||"—")}</b> · Estado: <b>${p.marketplaceStatus}</b></div>
            <div class="small">El particular no firma contrato.</div>
          </div>` : ``}
      </div>

      <div id="tabPane"></div>

      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div><div class="badge">Trazabilidad</div><div class="muted">Historial de versiones y cambios.</div></div>
          <div class="badge">v${latest.version}</div>
        </div>
        <div class="hr"></div>
        <div class="grid grid2">
          <div class="card soft">
            <b>Versiones</b>
            <div class="small">Snapshots del motor (demo).</div>
            <div class="hr"></div>
            <ul class="muted" style="margin:0;padding-left:18px">
              ${p.snapshots.slice().reverse().slice(0,10).map(s=>`<li>v${s.version} · ${s.stage} · ${new Date(s.createdAt).toLocaleString()} · ${s.totals.pvpTotal}€</li>`).join("")}
            </ul>
          </div>
          <div class="card soft">
            <b>Change log</b>
            <div class="small">Quién cambió qué (y por qué).</div>
            <div class="hr"></div>
            ${p.changelog.length?`<ul class="muted" style="margin:0;padding-left:18px">${p.changelog.slice().reverse().slice(0,10).map(c=>`<li>${new Date(c.at).toLocaleString()} · <b>${escapeHtml(c.actor)}</b>: ${escapeHtml(c.reason)} · Δ ${c.delta}€</li>`).join("")}</ul>`:`<div class="muted">Sin cambios aún.</div>`}
          </div>
        </div>
      </div>
    </div>`;

  $("#pdfC")?.addEventListener("click", ()=> openPdfPrint(p, provider, "cliente"));
  $("#pdfT")?.addEventListener("click", ()=> openPdfPrint(p, provider, "tecnico"));

  const tabPane = $("#tabPane");
  const setActive = (which)=>{
    ["tabO","tabA","tabC"].forEach(id=> $("#"+id).classList.remove("active"));
    $("#"+which).classList.add("active");
  };

const renderOrientativo = ()=>{
  setActive("tabO");

  // Tabla profesional: resumen por capítulos (mismo cálculo)
  const chapSums = latest.lines.reduce((acc,l)=>{ acc[l.chapter]=(acc[l.chapter]||0)+l.cost; return acc; },{});
  const chapRows = Object.entries(chapSums)
    .map(([ch,sum])=>({ch, sum: Math.round(sum)}))
    .sort((a,b)=>b.sum-a.sum);

  const proTable = `<table class="table">
    <thead><tr><th>Capítulo</th><th style="text-align:right">Coste</th></tr></thead>
    <tbody>${chapRows.map(r=>`<tr><td><b>${escapeHtml(r.ch)}</b></td><td style="text-align:right"><b>${r.sum} €</b></td></tr>`).join("")}</tbody>
  </table>`;

    // Particular: mostrar contenido por estancias (explicado)
    const linesByRoom = latest.lines.reduce((acc,l)=>{
      const k = l.roomGroup || "General";
      (acc[k] = acc[k] || []).push(l);
      return acc;
    }, {});

    const roomDetails = (p.role==="particular") ? Object.entries(linesByRoom).map(([room, list])=>{
      const sum = Math.round(list.reduce((a,x)=>a+x.cost,0));
      return `
        <details style="margin-top:10px">
          <summary><b>${escapeHtml(room)}</b> · <span class="muted">aprox. ${sum} €</span></summary>
          <div class="small" style="margin-top:8px">
            ${list.slice(0,18).map(x=>`• ${escapeHtml(x.item)}`).join("<br/>")}
            ${list.length>18?`<div class="muted" style="margin-top:6px">+ ${list.length-18} partidas más…</div>`:""}
          </div>
        </details>
      `;
    }).join("") : "";

    tabPane.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="badge ok">${p.role==="particular"?"IDEA":"ORIENTATIVO"}</div>
            <div class="muted">${p.role==="particular"?"Tu idea inicial, ya desglosada.":"Cercano, humano y completo."}</div>
          </div>
          <div class="badge">v${latest.version}</div>
        </div>
        <div class="hr"></div>
        <div class="grid grid2">
          <div class="card soft">
            <div class="sectionTitle">Hoy empieza la parte buena.</div>
            <div class="muted">${p.role==="particular"?"Presupuesto orientativo (idea) para decidir. Incluye el alcance completo típico de una reforma integral.":"Presupuesto orientativo de mercado: completo, realista y pensado para decidir."}</div>
            <div class="hr"></div>
            <div class="badge ok">Total</div>
            <div class="kpi">${latest.totals.pvpTotal} €</div>
            <div class="small">Incluye IVA. ${p.role==="particular"?"(Los precios no se editan en Particular.)":"Tú no tocas nada."}</div>
          </div>
${p.role==="profesional" ? `
<div class="card soft">
  <div class="sectionTitle">Coste por capítulos</div>
  <div class="muted">Vista profesional (mismo cálculo). Puedes editar partidas en AJUSTADO.</div>
  <div class="hr"></div>
  ${proTable}
</div>
` : `
<div class="card soft">
  <div class="sectionTitle">Tu casa, por áreas</div>
  <table class="table">
    <thead><tr><th>Estancia</th><th style="text-align:right">PVP</th></tr></thead>
    <tbody>
      ${latest.totals.pvpByRoom.map(x=>`<tr><td><b>${x.label}</b></td><td style="text-align:right"><b>${x.amount} €</b></td></tr>`).join("")}
    </tbody>
  </table>
  <div class="hr"></div>
  <div class="small muted">Contenido por estancia (qué entra):</div>
  ${roomDetails}
</div>
`}
        </div>

        <div class="hr"></div>

        ${p.role==="particular" ? `
          <div class="row" style="justify-content:flex-end">
            <button class="btn" id="toAjustes">Seguir / Continuar</button>
          </div>
        ` : ``}
</div>
      </div>`;

    $("#toAjustes")?.addEventListener("click", ()=> renderAjustado());
  };

  const renderAjustado = ()=>{
    setActive("tabA");

    // -----------------------------
    // PARTICULAR — Ajustes (sin tocar precios)
    // - Puede: añadir/quitar partidas, modificar qty/ud, elegir materiales (BD/IA demo), cambiar IVA.
    // - No puede: modificar precios.
    // -----------------------------
    if (p.role==="particular"){
      const lockedEd = locked;

      // Materiales demo (BD)
      const MATERIAL_DB = [
        { id:"mat_basic", name:"Básico (estándar)", img:"https://images.unsplash.com/photo-1523413457027-5e7c0e2c36d4?auto=format&fit=crop&w=800&q=60" },
        { id:"mat_medium", name:"Medium (equilibrado)", img:"https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=60" },
        { id:"mat_premium", name:"Premium (alta calidad)", img:"https://images.unsplash.com/photo-1502003148287-a82ef28b4d16?auto=format&fit=crop&w=800&q=60" },
        { id:"mat_cocina", name:"Cocina (pack)", img:"https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=800&q=60" },
        { id:"mat_bano", name:"Baño (pack)", img:"https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=60" },
      ];

      // Editor de partidas (deriva del snapshot si no hay edición manual)
      let items = (Array.isArray(p.manualLinesPart) && p.manualLinesPart.length)
        ? p.manualLinesPart.slice()
        : latest.lines.map((l,i)=>{
            const e = editableFromLine(l,i);
            e.materialId = (l.meta||{}).materialId || "";
            e.imageUrl = (l.meta||{}).imageUrl || "";
            return e;
          });

      const IVA_OPTIONS = [
        {label:"IVA 21%", value:21},
        {label:"IVA 10%", value:10},
        {label:"IVA 0%", value:0},
      ];

      tabPane.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="badge ok">AJUSTES</div>
              <div class="muted">Ajusta tu obra sin tocar precios: medidas, unidades, materiales y alcance.</div>
            </div>
            <div class="badge">v${latest.version}</div>
          </div>

          <div class="hr"></div>

          <div class="grid grid2">
            <div class="callout info">
              <b>Materiales</b>
              <div class="muted">Elige desde tu base de datos (demo) o busca con IA (demo). Puedes añadir imagen.</div>
              <div class="hr"></div>
              <label>Buscar material (IA demo)
                <input id="matQuery" placeholder='Ej. "suelo madera", "azulejo baño"'/>
              </label>
              <div class="row" style="margin-top:10px">
                <button class="btn ghost small" id="matSearch">Buscar</button>
                <div class="small muted" id="matHint">Selecciona una partida abajo y aplica un material.</div>
              </div>
              <div class="hr"></div>
              <label>Tipo de IVA
                <select id="ivaSelect" ${lockedEd?"disabled":""}>
                  ${IVA_OPTIONS.map(o=>`<option value="${o.value}">${o.label}</option>`).join("")}
                </select>
              </label>
              <div class="small muted" style="margin-top:8px">En Particular no se toca margen ni precios.</div>
            </div>

            <div class="callout">
              <b>Cómo funciona</b>
              <div class="muted">1) Ajustas medidas/unidades y alcance (añadir/quitar). 2) Pulsas “Siguiente” para cerrar. 3) Generas PDF o vas a Marketplace.</div>
              <div class="hr"></div>
              <div class="small"><b>Consejo</b>: si añades una partida nueva, MÓDULO la incorpora al alcance para que no falte nada.</div>
            </div>
          </div>

          <div class="hr"></div>

          <div class="sectionTitle">Partidas de tu obra</div>
          <div class="muted">Puedes modificar <b>qty</b> y <b>ud</b>, añadir/quitar partidas y asignar materiales. El precio es fijo (demo).</div>
          <div class="hr"></div>

          <div class="card soft" id="pEditor"></div>

          <div class="hr"></div>
          <div class="row" style="justify-content:space-between">
            <button class="btn ghost" id="saveDraft" ${lockedEd?"disabled":""}>Guardar ajustes</button>
            <button class="btn" id="toCerrado" ${lockedEd?"disabled":""}>Siguiente → Cerrar</button>
          </div>
        </div>
      `;

      // IVA binding
      const ivaSel = $("#ivaSelect");
      if (ivaSel){
        ivaSel.value = String(p.proSettings?.ivaPct ?? 21);
        ivaSel.onchange = ()=>{
          updateProject(p.id, (pp)=>{ pp.proSettings.ivaPct = Number(ivaSel.value||21); }, "Particular: IVA", "usuario");
          location.hash = `#/project/${p.id}`;
        };
      }

      // Render editor
      const renderPEditor = ()=>{
        const host = $("#pEditor");
        if (!host) return;

        const body = items.map((it,i)=>{
          if (it._deleted){
            return `<tr><td colspan="8" class="muted"><i>Partida eliminada:</i> <b>${escapeHtml(it.name||"")}</b> <button class="btn ghost small" data-undo="${i}">Recuperar</button></td></tr>`;
          }
          const cost = Math.round((Number(it.qty||0) * Number(it.price||0))*100)/100;
          const mat = MATERIAL_DB.find(m=>m.id===it.materialId);
          return `
            <tr data-row="${i}">
              <td><input data-f="chapter" data-i="${i}" value="${escapeHtml(it.chapter||"")}" ${lockedEd?"disabled":""}></td>
              <td><input data-f="name" data-i="${i}" value="${escapeHtml(it.name||"")}" ${lockedEd?"disabled":""}></td>
              <td><input data-f="qty" data-i="${i}" type="number" step="0.01" value="${escapeHtml(String(it.qty??1))}" ${lockedEd?"disabled":""}></td>
              <td>
                <select data-f="unit" data-i="${i}" ${lockedEd?"disabled":""}>
                  ${["ud","m²","ml","m","lote"].map(u=>`<option value="${u}" ${it.unit===u?"selected":""}>${u}</option>`).join("")}
                </select>
              </td>
              <td><input data-f="price" data-i="${i}" type="number" step="0.01" value="${escapeHtml(String(it.price??0))}" disabled></td>
              <td style="text-align:right"><b>${Math.round(cost)} €</b></td>
              <td style="text-align:right">
                <button class="btn ghost small" data-pick="${i}" ${lockedEd?"disabled":""}>Material</button>
                <button class="btn ghost small" data-del="${i}" ${lockedEd?"disabled":""}>Quitar</button>
              </td>
            </tr>
            <tr>
              <td colspan="7">
                <details>
                  <summary class="small">Ver partida completa</summary>
                  <div class="grid grid2" style="margin-top:10px">
                    <div>
                      <div class="small"><b>Material asignado:</b> ${escapeHtml(mat?mat.name:"—")}</div>
                      ${it.imageUrl?`<img src="${escapeHtml(it.imageUrl)}" alt="material" style="max-width:100%;border-radius:14px;margin-top:8px"/>`:""}
                    </div>
                    <div class="callout info">
                      <label>Imagen (URL opcional)
                        <input data-f="imageUrl" data-i="${i}" value="${escapeHtml(it.imageUrl||"")}" ${lockedEd?"disabled":""} placeholder="https://..."/>
                      </label>
                      <div class="row" style="margin-top:10px">
                        <button class="btn ghost small" data-auto="${i}" ${lockedEd?"disabled":""}>Auto material (IA demo)</button>
                      </div>
                      <div class="small muted" style="margin-top:8px">En producción: selección desde BD real + IA real.</div>
                    </div>
                  </div>
                </details>
              </td>
            </tr>
          `;
        }).join("");

        host.innerHTML = `
          <table class="table">
            <thead>
              <tr>
                <th>Capítulo</th>
                <th>Partida</th>
                <th>Qty</th>
                <th>Ud</th>
                <th>€/ud</th>
                <th style="text-align:right">PVP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
          <div class="hr"></div>
          <div class="row" style="justify-content:space-between">
            <button class="btn ghost" id="addPRow" ${lockedEd?"disabled":""}>+ Añadir partida</button>
            <div class="small muted">Seleccionada: <span id="selLine">—</span></div>
          </div>
        `;

        // field edits
        $$("input[data-f],select[data-f]", host).forEach(inp=>{
          inp.oninput = ()=>{
            const i = Number(inp.getAttribute("data-i"));
            const f = inp.getAttribute("data-f");
            if (!items[i]) return;
            const v = inp.value;
            if (f==="qty") items[i][f] = Number(v||0);
            else items[i][f] = v;
          };
        });

        // delete/undo
        $$("button[data-del]", host).forEach(btn=>{
          btn.onclick = ()=>{ const i=Number(btn.getAttribute("data-del")); if(items[i]) items[i]._deleted=true; renderPEditor(); };
        });
        $$("button[data-undo]", host).forEach(btn=>{
          btn.onclick = ()=>{ const i=Number(btn.getAttribute("data-undo")); if(items[i]) delete items[i]._deleted; renderPEditor(); };
        });

        // material picker
        let selectedIndex = Number(localStorage.getItem("modulo:v5:selPartIdx")||"-1");
        const setSelected = (i)=>{ selectedIndex=i; localStorage.setItem("modulo:v5:selPartIdx", String(i)); $("#selLine") && ($("#selLine").textContent = items[i]?items[i].name:"—"); };
        if (selectedIndex>=0 && items[selectedIndex]) setSelected(selectedIndex);

        $$("tr[data-row]", host).forEach(tr=>{
          tr.onclick = ()=> setSelected(Number(tr.getAttribute("data-row")));
        });
        $$("button[data-pick]", host).forEach(btn=>{
          btn.onclick = (e)=>{ e.stopPropagation(); setSelected(Number(btn.getAttribute("data-pick"))); openMaterialModal(); };
        });

        $$("button[data-auto]", host).forEach(btn=>{
          btn.onclick = (e)=>{
            e.stopPropagation();
            const i = Number(btn.getAttribute("data-auto"));
            const name = norm(items[i]?.name||"");
            const guess = name.includes("baño")?"mat_bano": name.includes("cocina")?"mat_cocina": name.includes("pint")?"mat_medium": "mat_basic";
            items[i].materialId = guess;
            items[i].imageUrl = (MATERIAL_DB.find(m=>m.id===guess)?.img)||"";
            renderPEditor();
          };
        });

        $("#addPRow")?.addEventListener("click", ()=>{
          items.push({
            id: "custom_"+uid(),
            chapter: "Varios",
            name: "Nueva partida",
            qty: 1,
            unit: "ud",
            price: 50,
            materialId: "",
            imageUrl: "",
            breakdown: []
          });
          renderPEditor();
        });

        // modal inline (simple)
        const openMaterialModal = ()=>{
          const i = selectedIndex;
          if (i<0 || !items[i]) return;
          const overlay = document.createElement("div");
          overlay.style.position="fixed";
          overlay.style.inset="0";
          overlay.style.background="rgba(0,0,0,.35)";
          overlay.style.display="flex";
          overlay.style.alignItems="center";
          overlay.style.justifyContent="center";
          overlay.style.padding="16px";
          overlay.innerHTML = `
            <div class="card" style="max-width:720px;width:100%">
              <div class="row" style="justify-content:space-between">
                <div><div class="badge ok">Material</div><div class="muted">${escapeHtml(items[i].name||"")}</div></div>
                <button class="btn ghost small" id="mClose">Cerrar</button>
              </div>
              <div class="hr"></div>
              <div class="grid grid2">
                ${MATERIAL_DB.map(m=>`
                  <div class="card soft" style="cursor:pointer" data-mat="${m.id}">
                    <div class="small"><b>${escapeHtml(m.name)}</b></div>
                    <img src="${escapeHtml(m.img)}" alt="${escapeHtml(m.name)}" style="max-width:100%;border-radius:14px;margin-top:8px"/>
                  </div>
                `).join("")}
              </div>
              <div class="hr"></div>
              <div class="small muted">Tip: también puedes usar “Auto material (IA demo)” o pegar una imagen (URL) en la partida.</div>
            </div>
          `;
          document.body.appendChild(overlay);
          overlay.querySelector("#mClose").onclick = ()=> overlay.remove();
          overlay.onclick = (e)=>{ if (e.target===overlay) overlay.remove(); };
          $$("[data-mat]", overlay).forEach(card=>{
            card.onclick = ()=>{
              const id = card.getAttribute("data-mat");
              items[i].materialId = id;
              items[i].imageUrl = (MATERIAL_DB.find(m=>m.id===id)?.img)||"";
              overlay.remove();
              renderPEditor();
            };
          });
        };

        // IA demo material search
        const matSearch = $("#matSearch");
        if (matSearch){
          matSearch.onclick = ()=>{
            const q = norm($("#matQuery")?.value||"");
            if (selectedIndex<0 || !items[selectedIndex]){
              $("#matHint") && ($("#matHint").textContent = "Primero selecciona una partida.");
              return;
            }
            const best = MATERIAL_DB.find(m=> norm(m.name).includes(q)) || MATERIAL_DB.find(m=>q.includes("bañ")?m.id==="mat_bano": q.includes("cocin")?m.id==="mat_cocina": m.id==="mat_medium") || MATERIAL_DB[0];
            items[selectedIndex].materialId = best.id;
            items[selectedIndex].imageUrl = best.img;
            $("#matHint") && ($("#matHint").textContent = `Aplicado: ${best.name}`);
            renderPEditor();
          };
        }
      };

      renderPEditor();

      // Guardar ajustes (sin cerrar)
      $("#saveDraft")?.addEventListener("click", ()=>{
        updateProject(p.id, (pp)=>{ pp.manualLinesPart = items; }, "Particular: guardar ajustes", "usuario");
        location.hash = `#/project/${p.id}`;
      });

      // Siguiente → Cerrar
      $("#toCerrado")?.addEventListener("click", ()=>{
        // persistimos primero
        updateProject(p.id, (pp)=>{ pp.manualLinesPart = items; }, "Particular: ajustes antes de cerrar", "usuario");
        // cierre
        closeProject(p.id);
        renderCerrado();
      });

      return;
    }
    tabPane.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div><div class="badge ok">AJUSTADO</div><div class="muted">Quitar/ajustar. Dependencias automáticas. Versionado.</div></div>
          <div class="badge">v${latest.version}</div>
        </div>

        <div class="hr"></div>

        <div class="grid grid2">
          <div class="callout info">
            <b>IA-2 (ajustes con consecuencias)</b>
            <div class="muted">Ejemplos: <span class="kbd">quita eléctrica</span> · <span class="kbd">tabique 6 ml pladur</span> · <span class="kbd">alisar suelos</span></div>
            <div class="row" style="margin-top:10px">
              <input id="iaText" placeholder="Escribe un ajuste…"/>
              <button class="btn" id="iaBtn">Aplicar</button>
            </div>
            <div class="small">Nada se pierde. Todo es reversible hasta cerrar.</div>
          </div>

          <div class="callout">
            <b>IA-3 (materiales)</b>
            <div class="muted">Cambia acabados. El alcance no cambia.</div>
            <div class="row" style="margin-top:10px">
              <button class="pill ${p.materials.level==="basic"?"active":""}" id="matB">Basic</button>
              <button class="pill ${p.materials.level==="medium"?"active":""}" id="matM">Medium</button>
              <button class="pill ${p.materials.level==="premium"?"active":""}" id="matP">Premium</button>
            </div>
            <div class="small">En demo: Basic -8% · Premium +12% aprox.</div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="row" style="justify-content:space-between">
          <div><b>Módulos</b><div class="small">Todo ON por defecto. Quitar/poner crea versión.</div></div>
          <div style="min-width:320px"><input id="search" placeholder='Buscar (ej. "eléctrica", "alisar", "tabique")'/></div>
        </div>

        <div class="grid grid2" id="mods" style="margin-top:10px"></div>

        <div class="hr"></div>

        <div class="grid grid2">
          <div class="card soft">
            <div class="sectionTitle">Catálogo de partidas</div>
            <div class="muted">Partida completa: capítulo, unidad y precio demo.</div>
            <div class="hr"></div>
            <div id="catalog"></div>
          </div>
          <div class="card soft" id="proCtl"></div>
        </div>

        <div class="card soft" id="editor"></div>
      </div>`;

    // IA-3
    $("#matB").onclick = ()=>{ updateProject(p.id, (pp)=>{ pp.materials.level="basic"; }, "IA-3: materiales basic", "IA-3"); location.hash=`#/project/${p.id}`; };
    $("#matM").onclick = ()=>{ updateProject(p.id, (pp)=>{ pp.materials.level="medium"; }, "IA-3: materiales medium", "IA-3"); location.hash=`#/project/${p.id}`; };
    $("#matP").onclick = ()=>{ updateProject(p.id, (pp)=>{ pp.materials.level="premium"; }, "IA-3: materiales premium", "IA-3"); location.hash=`#/project/${p.id}`; };

    // pro controls
    const proCtl = $("#proCtl");
    if (p.role==="profesional"){
      proCtl.innerHTML = `
        <div class="sectionTitle">Controles profesional</div>
        <div class="muted">Aquí sí se puede tocar IVA y margen.</div>
        <div class="row" style="margin-top:10px">
          <label style="flex:1">IVA %<input id="iva" type="number" value="${p.proSettings.ivaPct}" ${locked?"disabled":""}></label>
          <label style="flex:1">Margen %<input id="margen" type="number" value="${p.proSettings.marginPct}" ${locked?"disabled":""}></label>
        </div>`;
      $("#iva").oninput = ()=>{
        updateProject(p.id, (pp)=>{ pp.proSettings.ivaPct = Number($("#iva").value||0); }, "IVA", "usuario");
        location.hash = `#/project/${p.id}`;
      };
      $("#margen").oninput = ()=>{
        updateProject(p.id, (pp)=>{ pp.proSettings.marginPct = Number($("#margen").value||0); }, "Margen", "usuario");
        location.hash = `#/project/${p.id}`;
      };
    } else {
      proCtl.innerHTML = `
        <div class="sectionTitle">Particular</div>
        <div class="muted">El particular no manipula IVA ni margen.</div>
        <div class="kpi">${latest.totals.pvpTotal} €</div>`;
    }


// Editor profesional: partidas (medidas/uds/precio) + desglose (demo)
if (p.role==="profesional"){
  const ed = $("#editor");
  if (ed){
    const lockedEd = locked;
    let items = (Array.isArray(p.manualLines) && p.manualLines.length)
      ? p.manualLines.slice()
      : latest.lines.map((l,i)=> editableFromLine(l,i));

    const renderEditor = ()=>{
      const body = items.map((it, i)=>{
        if (it._deleted){
          return `<tr><td colspan="7" class="muted"><i>Partida eliminada:</i> <b>${escapeHtml(it.name||"")}</b> <button class="btn ghost small" data-undo="${i}">Recuperar</button></td></tr>`;
        }
        const cost = Math.round((Number(it.qty||0) * Number(it.price||0))*100)/100;
        return `
          <tr>
            <td><input data-f="chapter" data-i="${i}" value="${escapeHtml(it.chapter||"")}" ${lockedEd?"disabled":""}></td>
            <td><input data-f="name" data-i="${i}" value="${escapeHtml(it.name||"")}" ${lockedEd?"disabled":""}></td>
            <td><input data-f="qty" data-i="${i}" type="number" step="0.01" value="${escapeHtml(String(it.qty??1))}" ${lockedEd?"disabled":""}></td>
            <td><input data-f="unit" data-i="${i}" value="${escapeHtml(it.unit||"ud")}" ${lockedEd?"disabled":""}></td>
            <td><input data-f="price" data-i="${i}" type="number" step="0.01" value="${escapeHtml(String(it.price??0))}" ${lockedEd?"disabled":""}></td>
            <td style="text-align:right"><b>${Math.round(cost)} €</b></td>
            <td style="text-align:right">
              <button class="btn ghost small" data-del="${i}" ${lockedEd?"disabled":""}>Quitar</button>
            </td>
          </tr>
          <tr>
            <td colspan="7">
              <details>
                <summary class="small">Ver partida completa (desglose)</summary>
                <div class="grid grid2" style="margin-top:10px">
                  <div>
                    <table class="table">
                      <thead><tr><th>Componente</th><th style="text-align:right">€</th><th></th></tr></thead>
                      <tbody>
                        ${(it.breakdown||[]).map((b,bi)=>`
                          <tr>
                            <td><input data-bf="label" data-i="${i}" data-bi="${bi}" value="${escapeHtml(b.label||"")}" ${lockedEd?"disabled":""}></td>
                            <td><input data-bf="amount" data-i="${i}" data-bi="${bi}" type="number" step="1" value="${escapeHtml(String(b.amount??0))}" ${lockedEd?"disabled":""}></td>
                            <td style="text-align:right"><button class="btn ghost small" data-bdel="${i}:${bi}" ${lockedEd?"disabled":""}>Quitar</button></td>
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                    <div class="row" style="margin-top:10px">
                      <button class="btn ghost small" data-badd="${i}" ${lockedEd?"disabled":""}>+ Añadir componente</button>
                      <button class="btn ghost small" data-auto="${i}" ${lockedEd?"disabled":""}>Auto (IA demo)</button>
                    </div>
                    <div class="small muted" style="margin-top:8px">En producción: componentes desde BD o IA real.</div>
                  </div>
                  <div class="callout">
                    <b>Notas</b>
                    <div class="muted">Edita medidas/uds/precio arriba. El coste se recalcula.</div>
                  </div>
                </div>
              </details>
            </td>
          </tr>
        `;
      }).join("");

      ed.innerHTML = `
        <div class="sectionTitle">Editor de partidas (Profesional)</div>
        <div class="muted">AJUSTADO editable partida a partida. Añade/quita/modifica y luego guarda una nueva versión.</div>
        <div class="hr"></div>

        <table class="table">
          <thead>
            <tr>
              <th>Capítulo</th>
              <th>Partida</th>
              <th>Qty</th>
              <th>Ud</th>
              <th>€/ud</th>
              <th style="text-align:right">Coste</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>

        <div class="hr"></div>
        <div class="row" style="justify-content:space-between">
          <div class="row">
            <button class="btn ghost" id="addRow" ${lockedEd?"disabled":""}>+ Nueva partida</button>
          </div>
          <div class="row">
            <button class="btn" id="saveEd" ${lockedEd?"disabled":""}>Guardar versión</button>
          </div>
        </div>
        <div class="small" style="margin-top:10px">Tip: Alt+Reset = wipe total. Reset normal no borra proyectos.</div>
      `;

      // bind row field edits
      $$("input[data-f]", ed).forEach(inp=>{
        inp.oninput = ()=>{
          const i = Number(inp.getAttribute("data-i"));
          const f = inp.getAttribute("data-f");
          const v = inp.value;
          if (!items[i]) return;
          if (f==="qty" || f==="price") items[i][f] = Number(v||0);
          else items[i][f] = v;
        };
      });

      // breakdown edits
      $$("input[data-bf]", ed).forEach(inp=>{
        inp.oninput = ()=>{
          const i = Number(inp.getAttribute("data-i"));
          const bi = Number(inp.getAttribute("data-bi"));
          const f = inp.getAttribute("data-bf");
          if (!items[i] || !items[i].breakdown || !items[i].breakdown[bi]) return;
          if (f==="amount") items[i].breakdown[bi].amount = Number(inp.value||0);
          else items[i].breakdown[bi].label = inp.value;
        };
      });

      $$("button[data-del]", ed).forEach(btn=>{
        btn.onclick = ()=>{
          const i = Number(btn.getAttribute("data-del"));
          if (items[i]) items[i]._deleted = true;
          renderEditor();
        };
      });

      $$("button[data-undo]", ed).forEach(btn=>{
        btn.onclick = ()=>{
          const i = Number(btn.getAttribute("data-undo"));
          if (items[i]) delete items[i]._deleted;
          renderEditor();
        };
      });

      $$("button[data-bdel]", ed).forEach(btn=>{
        btn.onclick = ()=>{
          const [iS, biS] = (btn.getAttribute("data-bdel")||"0:0").split(":");
          const i = Number(iS), bi = Number(biS);
          items[i]?.breakdown?.splice(bi,1);
          renderEditor();
        };
      });

      $$("button[data-badd]", ed).forEach(btn=>{
        btn.onclick = ()=>{
          const i = Number(btn.getAttribute("data-badd"));
          items[i].breakdown = items[i].breakdown || [];
          items[i].breakdown.push({ kind:"custom", label:"Nuevo componente", amount: 0 });
          renderEditor();
        };
      });

      $$("button[data-auto]", ed).forEach(btn=>{
        btn.onclick = ()=>{
          const i = Number(btn.getAttribute("data-auto"));
          const it = items[i];
          const total = Math.round((Number(it.qty||0)*Number(it.price||0))*100)/100;
          it.breakdown = [
            {kind:"materiales", label:"Materiales", amount: Math.round(total*0.55)},
            {kind:"mano_obra", label:"Mano de obra", amount: Math.round(total*0.35)},
            {kind:"medios", label:"Medios auxiliares", amount: Math.round(total*0.10)},
          ];
          renderEditor();
        };
      });

      $("#addRow")?.addEventListener("click", ()=>{
        items.push({
          id: "custom_"+uid(),
          chapter: "Varios",
          name: "Nueva partida",
          qty: 1,
          unit: "ud",
          price: 0,
          breakdown: []
        });
        renderEditor();
      });

      $("#saveEd")?.addEventListener("click", ()=>{
        updateProject(p.id, (pp)=>{ pp.manualLines = items; }, "Edición manual de partidas", "usuario");
        location.hash = `#/project/${p.id}`;
      });
    };

    renderEditor();
  }
}


    // catalog render
    const renderCatalog = ()=>{
      const on = applyDependencies({...p.modules});
      const items = PARTIDAS_CATALOGO.filter(pc=> on[pc.when]);
      $("#catalog").innerHTML = items.length ? items.map(pc=>`
        <div class="toggle" style="margin-bottom:10px">
          <div>
            <b>${pc.label}</b>
            <div class="small">Capítulo: <b>${pc.chapter}</b> · Unidad: <b>${pc.unit}</b> · Precio demo: <b>${pc.eur_u} €/u</b></div>
          </div>
          <span class="badge ok">OK</span>
        </div>`).join("") : `<div class="muted">Activa un módulo (p. ej. “alisar suelos” o “tabiques”).</div>`;
    };

    // modules render
    const renderMods = ()=>{
      const q = ($("#search").value||"").trim().toLowerCase();
      const list = MODULES.filter(m=> !q || m.label.toLowerCase().includes(q) || m.note.toLowerCase().includes(q) || m.key.includes(q));
      $("#mods").innerHTML = list.map(m=>`
        <div class="toggle">
          <div>
            <b>${m.label}</b>
            <div class="small">${m.group} · ${m.note}</div>
          </div>
          <button class="switch ${p.modules[m.key]?"on":""}" data-key="${m.key}" ${locked?"disabled":""}><span class="knob"></span></button>
        </div>`).join("");

      $$("button.switch", $("#mods")).forEach(btn=>{
        btn.onclick = ()=>{
          const key = btn.getAttribute("data-key");
          const turningOff = p.modules[key]===true;
          updateProject(p.id, (pp)=>{ pp.modules[key]=!pp.modules[key]; }, "Ajuste de alcance", "usuario");

          // IA-2 consecuencias mínimas congeladas
          if (turningOff && key==="inst_electrica"){
            updateProject(p.id, (pp)=>{ pp.modules.admin_electrica=false; }, "IA-2: si quitas eléctrica, cae boletín", "IA-2");
          }
          if (key==="tabiques"){
            updateProject(p.id, (pp)=>{ /* no cambia nada más */ }, "IA-2: tabiques pueden requerir licencia/verificación", "IA-2");
          }
          if (!turningOff && key==="alisar_suelos"){
            updateProject(p.id, (pp)=>{ /* entrada partida por catálogo en motor */ }, "IA-2: añadida partida 'alisar suelos' (catálogo)", "IA-2");
          }

          location.hash = `#/project/${p.id}`;
        };
      });

      // Tabique configurador
      const hasTabiques = p.modules.tabiques;
      if (hasTabiques){
        const chosen = TABIQUE_CATALOG.find(x=>x.id===p.tabique.typeId) || TABIQUE_CATALOG[0];
        const cfg = document.createElement("div");
        cfg.className="callout";
        cfg.style.marginTop="12px";
        cfg.innerHTML = `
          <b>MÓDULO TABIQUE (catálogo)</b>
          <div class="small">Acción: <b>${escapeHtml(p.tabique.action)}</b> · Tipo: <b>${escapeHtml(chosen.name)}</b> · ml: <b>${escapeHtml(String(p.tabique.ml||4))}</b></div>
          <div class="hr"></div>
          <div class="grid grid3">
            <label>Acción
              <select id="tAction" ${locked?"disabled":""}>
                <option value="derribar">Derribar</option>
                <option value="hacer">Hacer</option>
                <option value="modificar">Modificar (derribo + nuevo)</option>
              </select>
            </label>
            <label>Tipo
              <select id="tType" ${locked?"disabled":""}>
                ${TABIQUE_CATALOG.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}
              </select>
            </label>
            <label>Metros lineales (ml)
              <input id="tML" type="number" value="${escapeHtml(String(p.tabique.ml||4))}" ${locked?"disabled":""}/>
            </label>
          </div>
          <div class="hr"></div>
          <div class="row">
            <button class="btn small" id="tApply" ${locked?"disabled":""}>Aplicar tabique</button>
            <span class="small muted">Esto afecta a capítulos/partidas y al total.</span>
          </div>
        `;
        $("#mods").parentElement.appendChild(cfg);

        $("#tAction").value = p.tabique.action || "modificar";
        $("#tType").value = p.tabique.typeId || "pladur70";

        $("#tApply").onclick = ()=>{
          updateProject(p.id, (pp)=>{
            pp.tabique.action = $("#tAction").value;
            pp.tabique.typeId = $("#tType").value;
            pp.tabique.ml = Number($("#tML").value||4);
            pp.modules.tabiques = true;
          }, "IA-2: ajustar tabique (catálogo)", "IA-2");
          location.hash = `#/project/${p.id}`;
        };
      }

      renderCatalog();
    };

    $("#search").oninput = renderMods;
    renderMods();

    // IA-2 texto libre (parser + mensajes)
    $("#iaBtn").onclick = ()=>{
      const q = ($("#iaText").value||"").trim();
      if (!q) return;
      const ia = ia1ParseIntent(q); // demo reuse parser
      updateProject(p.id, (pp)=>{
        (ia.scope.modulesOn||[]).forEach(k=> pp.modules[k]=true);
        (ia.scope.modulesOff||[]).forEach(k=> pp.modules[k]=false);
        if (ia.scope?.tabique?.action) pp.tabique.action = ia.scope.tabique.action;
        if (ia.scope?.tabique?.typeId) pp.tabique.typeId = ia.scope.tabique.typeId;
        if (ia.scope?.tabique?.ml!=null) pp.tabique.ml = ia.scope.tabique.ml;
      }, `IA-2: ${q}`, "IA-2");

      // consecuencias congeladas
      if (norm(q).includes("quita electr")){
        updateProject(p.id, (pp)=>{ pp.modules.admin_electrica=false; }, "IA-2: al quitar eléctrica, cae boletín", "IA-2");
      }
      if (norm(q).includes("tabique")){
        updateProject(p.id, (pp)=>{}, "IA-2: tabiques pueden requerir licencia/verificación", "IA-2");
      }
      if (norm(q).includes("alisar")){
        updateProject(p.id, (pp)=>{ pp.modules.alisar_suelos=true; }, "IA-2: añadida partida 'alisar suelos' (catálogo)", "IA-2");
      }

      location.hash = `#/project/${p.id}`;
    };
  };

  const renderCerrado = ()=>{
    setActive("tabC");
    const isClosed = p.stage==="cerrado";
    tabPane.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div><div class="badge ok">CERRADO</div><div class="muted">Bloquea. Marketplace solo desde aquí.</div></div>
          <div class="badge ${isClosed?"ok":""}">${isClosed?"✅ CERRADO":"⏳ NO CERRADO"}</div>
        </div>
        <div class="hr"></div>
        ${!isClosed ? `
          <div class="grid grid2">
            <div class="card soft"><b>Antes de cerrar</b><div class="muted">Revisa Ajustado. Al cerrar, queda bloqueado.</div><div style="height:10px"></div><div class="small">Total actual: <b>${latest.totals.pvpTotal} €</b></div></div>
            <div class="card soft"><b>Cerrar presupuesto</b><div class="muted">En demo es un botón.</div><div style="height:12px"></div><button class="btn" id="closeBtn">Cerrar</button></div>
          </div>` : `
          <div class="grid grid2">
            <div class="card soft">
              <b>Estado</b><div class="muted">Presupuesto cerrado y defendible.</div>
              <div class="hr"></div>
              ${p.role==="particular" ? `
                <div class="badge ok">Marketplace</div>
                <div class="muted">Acceso al match: ${p.payments.marketplaceFee}€ (si no está pagado).</div>
                <div style="height:12px"></div>
                <div class="row" style="gap:10px;flex-wrap:wrap">
                  <button class="btn" id="pdfPretty">PDF bonito</button>
                  <a class="btn" href="#/paywall/${p.id}">Ir a Marketplace</a>
                </div>
              ` : `
                <div class="badge">Profesional</div>
                <div class="muted">El particular no firma. Firma el profesional si aplica.</div>
              `}
            </div>
            <div class="card soft">
              <b>Resumen</b>
              <div class="small">Coste: <b>${latest.totals.costSubtotal} €</b></div>
              <div class="small">Margen: <b>${latest.totals.margin} €</b></div>
              <div class="small">IVA: <b>${latest.totals.iva} €</b></div>
              <div class="hr"></div>
              <div class="kpi">${latest.totals.pvpTotal} €</div>
            </div>
          </div>`}
      </div>`;

    $("#closeBtn")?.addEventListener("click", ()=>{
      closeProject(p.id);
      if (p.role==="particular") location.hash = `#/paywall/${p.id}`;
      else location.hash = `#/project/${p.id}`;
    });

    // PDF bonito (particular) en pantalla Cerrado
    $("#pdfPretty")?.addEventListener("click", ()=> openPdfPrint(getProject(p.id), provider, "cliente"));
  };

  $("#tabO").onclick = renderOrientativo;
  $("#tabA").onclick = renderAjustado;
  $("#tabC").onclick = renderCerrado;

  renderOrientativo();
}

// -----------------------------
// 6) Marketplace paywall + marketplace
// -----------------------------
function renderPaywall(app, id){
  const p = getProject(id);
  if (!p) return app.innerHTML = `<div class="card"><div class="badge">Sin proyecto</div><div class="hr"></div><a class="btn" href="#/dashboard">Volver</a></div>`;
  if (p.stage!=="cerrado") return app.innerHTML = `<div class="card"><div class="badge">Marketplace</div><div class="hr"></div><div class="muted">Solo disponible tras CERRADO.</div><div style="height:12px"></div><a class="btn" href="#/project/${p.id}">Volver</a></div>`;

  app.innerHTML = `
    <div class="card">
      <div class="badge ok">Acceso al match</div>
      <h2 style="margin:8px 0 0">Marketplace</h2>
      <p class="muted">Para acceder al match de proveedores y elegir profesional, pago único de <b>${p.payments.marketplaceFee}€</b>. (Demo: simulado)</p>
      <div class="hr"></div>
      ${!p.payments.marketplaceAccessPaid ? `
        <div class="row" style="justify-content:space-between">
          <a class="btn ghost" href="#/project/${p.id}">Volver</a>
          <button class="btn" id="payBtn">Pagar ${p.payments.marketplaceFee}€ (demo)</button>
        </div>` : `
        <div class="row" style="justify-content:space-between">
          <div class="badge ok">✅ Acceso activado</div>
          <a class="btn" href="#/marketplace/${p.id}">Entrar al marketplace</a>
        </div>`}
    </div>`;

  $("#payBtn")?.addEventListener("click", ()=>{
    p.payments.marketplaceAccessPaid = true;
    saveProject(p);
    location.hash = `#/paywall/${p.id}`;
  });
}

function renderMarketplace(app, id){
  const p = getProject(id);
  if (!p) return app.innerHTML = `<div class="card"><div class="badge">Sin proyecto</div><div class="hr"></div><a class="btn" href="#/dashboard">Volver</a></div>`;
  if (p.stage!=="cerrado") return app.innerHTML = `<div class="card"><div class="badge">Marketplace</div><div class="hr"></div><div class="muted">Solo aparece tras CERRADO.</div><div style="height:12px"></div><a class="btn" href="#/project/${p.id}">Volver</a></div>`;
  if (!p.payments.marketplaceAccessPaid) return app.innerHTML = `<div class="card"><div class="badge">Marketplace</div><div class="hr"></div><div class="muted">Necesitas activar acceso al match (2,49€).</div><div style="height:12px"></div><a class="btn" href="#/paywall/${p.id}">Ir al pago</a></div>`;

  seedProvidersIfEmpty(p.city);
  const providers = getProviders();

  app.innerHTML = `
    <div class="grid" style="gap:12px">
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="badge ok">Marketplace (post-cierre)</div>
            <div class="sectionTitle">Mismo presupuesto. Diferentes profesionales.</div>
            <div class="muted">El alcance está cerrado. Aquí solo eliges quién lo ejecuta.</div>
          </div>
          <a class="btn ghost" href="#/project/${p.id}">Volver</a>
        </div>
        <div class="hr"></div>
        <div class="grid grid3">
          <label>Geografía (ciudad)<input id="city" value="${escapeHtml(p.city)}"/></label>
          <label>Rating Google (mínimo)<input id="minRating" type="number" step="0.1" value="4.5"/></label>
          <div class="callout info"><b>Nota</b><div class="muted">Ratings son demo. En producción se conectan fuentes reales.</div></div>
        </div>
      </div>

      <div class="grid grid2" id="provList"></div>
    </div>`;

  const renderList = ()=>{
    const city = ($("#city").value||"").trim().toLowerCase();
    const minRating = Number($("#minRating").value||0);
    const filtered = providers
      .filter(pr=> !city || pr.city.toLowerCase().includes(city))
      .filter(pr=> pr.googleRating >= minRating)
      .sort((a,b)=> b.googleRating - a.googleRating);

    $("#provList").innerHTML = filtered.length? filtered.map(pr=>`
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="badge ${pr.verified?"ok":""}">${pr.verified?"Verificado":"No verificado"}</div>
            <div class="sectionTitle">${escapeHtml(pr.name)}</div>
            <div class="muted">${escapeHtml(pr.city)} · ⭐ ${pr.googleRating.toFixed(1)}</div>
          </div>
          <div class="badge">Proveedor</div>
        </div>
        <div class="hr"></div>
        <div class="small"><b>Especialidades:</b> ${escapeHtml(pr.specialties.join(", "))}</div>
        <div class="hr"></div>
        <button class="btn" data-send="${pr.id}">Enviar presupuesto cerrado</button>
        <div class="small" style="margin-top:8px">El particular no firma contrato.</div>
      </div>`).join("") : `<div class="card"><div class="badge">Sin resultados</div><div class="hr"></div><div class="muted">Baja el rating mínimo o cambia la ciudad.</div></div>`;

    $$("button[data-send]", $("#provList")).forEach(btn=>{
      btn.onclick=()=>{
        const provId = btn.getAttribute("data-send");
        p.providerId = provId;
        p.marketplaceStatus = "sent";
        saveProject(p);
        location.hash = `#/project/${p.id}`;
      };
    });
  };

  $("#city").oninput = renderList;
  $("#minRating").oninput = renderList;
  renderList();
}

// -----------------------------
// 7) Partner (fuera de planes)
// -----------------------------
function renderPartner(app){
  setRole("partner");
  seedProvidersIfEmpty("Madrid");
  const providers = getProviders();
  app.innerHTML = `
    <div class="grid" style="gap:12px">
      <div class="card">
        <div class="badge">Partner</div>
        <div class="sectionTitle">Registro de proveedores</div>
        <div class="muted">Los proveedores se registran para aparecer en el marketplace post-cierre.</div>
      </div>

      <div class="grid grid2">
        <div class="card">
          <div class="badge ok">Alta proveedor (demo)</div>
          <div class="hr"></div>
          <label>Nombre<input id="pName" value="Proveedor Premium"/></label>
          <label>Ciudad<input id="pCity" value="Madrid"/></label>
          <label>Especialidades (coma)<input id="pSpec" value="Reforma integral, baños, cocinas"/></label>
          <div class="hr"></div>
          <button class="btn" id="saveProv">Guardar</button>
          <div class="small" style="margin-top:10px">En producción: verificación + BD.</div>
        </div>

        <div class="card">
          <div class="badge">Proveedores actuales</div>
          <div class="hr"></div>
          <ul class="muted" style="margin:0;padding-left:18px">
            ${providers.slice(0,10).map(p=>`<li><b>${escapeHtml(p.name)}</b> · ${escapeHtml(p.city)} · ⭐ ${p.googleRating.toFixed(1)}</li>`).join("")}
          </ul>
          <div class="hr"></div>
          <a class="btn ghost" href="#/">Volver</a>
        </div>
      </div>
    </div>`;

  $("#saveProv").onclick = ()=>{
    const list = getProviders();
    list.unshift({
      id: uid(),
      name: $("#pName").value,
      city: $("#pCity").value,
      specialties: ($("#pSpec").value||"").split(",").map(x=>x.trim()).filter(Boolean),
      googleRating: 4.6 + Math.random()*0.3,
      verified: true
    });
    saveProviders(list);
    location.hash = "#/partner";
  };
}

// anchor helper: "#/#!how" scrolls to #how on landing
function handleHashBang(){
  if (location.hash === "#/#!how") {
    location.hash = "#/landing";
    setTimeout(()=>{
      document.getElementById("how")?.scrollIntoView({behavior:"smooth"});
    }, 120);
  }
}


window.addEventListener("hashchange", ()=>{ handleHashBang(); route(); });
ensureSeedProjects();
handleHashBang();
route();
