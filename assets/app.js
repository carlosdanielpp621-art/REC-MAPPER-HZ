/* ============================================================
   REC MAPPER — Client logic (com Google Auth + cargos)
   ============================================================ */

const DISCORD_WEBHOOKS = {
  new:      "https://discord.com/api/webhooks/1522773177304875130/cXlRmT8l5FdeeTehmcWbaqq7nSNER0MC_kLkk4RU6FlLMGn8kQH4SnthBVCGXywhrZ_n",
  approved: "https://discord.com/api/webhooks/1522796036102291466/WwnCI2BIHxW2LUhJKId92eWsMrlC7V5ZZHP4wl9OUvp-Wl8dL_A_WLkPA9C8BYCRKNeh",
  rejected: "https://discord.com/api/webhooks/1522797339675201599/rdZNrZlY0QSsYreOwthHn0zUGhbOeYx7ZL7V6dAu-v-SEJiCunnOtqeW3t8VAHc_5WlQ",
};
const STORAGE_KEY = "recmapper.submissions";

/* ---------- Navegação/Auth ---------- */
const HOME_URL = "/inicio.html";
const LOGIN_URL = "/login.html";
const REGISTRO_URL = "/registro.html";

function isSupabaseAuthKey(k){
  return /^sb-.*-auth-token$/.test(String(k||""));
}
function clearStoredAuth(){
  try {
    [window.localStorage, window.sessionStorage].forEach((storage) => {
      if(!storage) return;
      Object.keys(storage).forEach((k) => {
        if(isSupabaseAuthKey(k)) storage.removeItem(k);
      });
    });
  } catch(e) { /* ignore */ }
}
function markInternalNavigation(){
  try { sessionStorage.setItem("recmapper.internalNavigation", "1"); } catch(e){}
}
function goHome(){
  markInternalNavigation();
  window.location.href = HOME_URL;
}
function goRegistro(){
  markInternalNavigation();
  window.location.href = REGISTRO_URL;
}
function navigateTo(url){
  markInternalNavigation();
  window.location.href = url;
}
function consumeInternalNavigationFlag(){
  let internal = false;
  try {
    internal = sessionStorage.getItem("recmapper.internalNavigation") === "1";
    sessionStorage.removeItem("recmapper.internalNavigation");
  } catch(e){}
  return internal;
}

// Remove sessões antigas que ficaram salvas no localStorage em versões anteriores.
// Isso precisa acontecer antes de criar o client para o site não abrir já logado.
try {
  if (typeof window !== "undefined" && window.localStorage) {
    Object.keys(window.localStorage).forEach((k) => {
      if (isSupabaseAuthKey(k)) window.localStorage.removeItem(k);
    });
  }
} catch (e) { /* ignore */ }

// Se a aba foi restaurada/reaberta sem navegação interna do próprio site,
// apaga a sessão temporária para não deixar o usuário preso no Registro.
try {
  if (typeof window !== "undefined" && window.sessionStorage) {
    const internal = consumeInternalNavigationFlag();
    const justReturnedFromOAuth = /access_token|refresh_token|code|type=recovery/.test(location.href);
    if (!internal && !justReturnedFromOAuth) {
      Object.keys(window.sessionStorage).forEach((k) => {
        if (isSupabaseAuthKey(k)) window.sessionStorage.removeItem(k);
      });
    }
  }
} catch (e) { /* ignore */ }

try {
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      let internal = false;
      try { internal = sessionStorage.getItem("recmapper.internalNavigation") === "1"; } catch(e){}
      if(!internal) clearStoredAuth();
    });
  }
} catch(e) { /* ignore */ }

/* ---------- Supabase ---------- */
const SUPABASE_URL = "https://kbjlmdkjntihvmewgkzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiamxtZGtqbnRpaHZtZXdna3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwOTU5MTUsImV4cCI6MjA5ODY3MTkxNX0.PNsi4v9j4MpOesjvZtoxbQA3bRzMM2-Y4EvYjy4AFhs";
// IMPORTANTE: usamos sessionStorage (em vez de localStorage) para que a sessão
// do usuário NÃO persista entre fechamentos do navegador. Ao fechar o site e
// reabrir, o usuário precisa fazer login novamente para acessar o painel.
const sb = (typeof window !== "undefined" && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/* ---------- Utils ---------- */
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function loadSubs(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return []}}
function saveSubs(list){localStorage.setItem(STORAGE_KEY,JSON.stringify(list))}
function fmtDate(ts){return new Date(ts).toLocaleString("pt-BR")}

/* ---------- Auth + cargos ---------- */
let CURRENT_USER = null;      // { email, name }
let CURRENT_ROLE = null;      // 'responsavel' | 'auxiliar' | 'super_admin' | null
let CURRENT_SERVIDOR = null;  // 'Servidor X' | null (todos)
const SUPER_ADMIN_EMAIL = "criarp21@gmail.com";

async function refreshAuth(){
  if(!sb) return {user:null, role:null};
  const { data: { session } } = await sb.auth.getSession();
  CURRENT_USER = session?.user ? {
    email: (session.user.email||"").toLowerCase(),
    name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email,
  } : null;
  CURRENT_ROLE = null;
  CURRENT_SERVIDOR = null;
  if(CURRENT_USER){
    try{
      const { data } = await sb.from("mapper_roles")
        .select("role,servidor").eq("email", CURRENT_USER.email).maybeSingle();
      CURRENT_ROLE = data?.role || null;
      CURRENT_SERVIDOR = data?.servidor || null;
    }catch(e){ console.warn(e); }
  }
  return { user: CURRENT_USER, role: CURRENT_ROLE, servidor: CURRENT_SERVIDOR };
}

function isMapper(){ return CURRENT_ROLE === "responsavel" || CURRENT_ROLE === "auxiliar" || CURRENT_ROLE === "super_admin" || isSuperAdmin(); }
function isSuperAdmin(){
  return (CURRENT_USER?.email||"").toLowerCase() === SUPER_ADMIN_EMAIL
      || CURRENT_ROLE === "super_admin";
}
function isRootSuperAdmin(){ return (CURRENT_USER?.email||"").toLowerCase() === SUPER_ADMIN_EMAIL; }
function canManageMembers(){ return isSuperAdmin() || CURRENT_ROLE === "responsavel"; }


function goToLogin(returnTo){
  const target = returnTo || location.href;
  try { sessionStorage.setItem("recmapper.loginFrom", target); } catch(e){}
  markInternalNavigation();
  window.location.href = LOGIN_URL;
}

async function signInGoogle(){
  if(!sb) return;
  markInternalNavigation();
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + REGISTRO_URL }
  });
}
async function signOut(){
  try { if(sb) await sb.auth.signOut(); } catch(e){ console.warn(e); }
  CURRENT_USER = null; CURRENT_ROLE = null; CURRENT_SERVIDOR = null;
  try { sessionStorage.removeItem("recmapper.loginFrom"); } catch(e){}
  clearStoredAuth();
  goHome();
}

/* ---------- Toast ---------- */
function toast(msg,type="success",duration=3200){
  const t=document.createElement("div");
  t.className="toast "+type;
  const ic = type==="error"
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  t.innerHTML = `<span class="toast-ic">${ic}</span><span class="toast-msg"></span>`;
  t.querySelector(".toast-msg").textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),350)},duration);
}


/* ---------- Panel (topbar + sidebar) ---------- */
function renderPanel({active="inicio"}={}){
  const showRegistro = isMapper();
  const user = CURRENT_USER;
  // Botão de notificação permanece visível (como no original).
  // As notificações em si somente carregam/aparecem para super admin logado.
  const showNotif = true;
  const canSeeNotifs = isSuperAdmin();
  document.getElementById("panel-root").innerHTML = `
  <header class="topbar">
    <div class="topbar-left">
      <button class="icon-btn" id="toggleSidebar" title="Recolher menu">${icon("menu")}</button>
      <img class="brand-logo" src="/assets/logo.svg.png" alt="REC Mapper" />
    </div>
    <div class="topbar-right">
      ${showNotif?`<div style="position:relative" id="notifWrap">
        <button class="icon-btn" id="notifBtn" title="Notificações" style="position:relative">
          ${icon("bell")}
          <span class="notif-badge" id="notifBadge" style="display:none">0</span>
        </button>
        <div class="notif-panel" id="notifPanel">
          <div class="notif-header">
            <span>Notificações</span>
            <button class="notif-clear" id="notifMarkAll" title="Marcar todas como lidas">Marcar todas</button>
          </div>
          <div class="notif-list" id="notifList">
            <div class="notif-empty">${canSeeNotifs?"Carregando...":"Sem notificações"}</div>
          </div>
        </div>
      </div>`:""}
      <div class="avatar" title="${user?escapeHtml(user.email):'Perfil'}">${icon("user",18)}<span class="status-dot"></span></div>
      ${user
        ? `<button class="icon-btn" id="logoutBtn" title="Sair">${icon("log-out")}</button>`
        : `<button class="icon-btn" id="loginBtn" title="Entrar" onclick="goToLogin(REGISTRO_URL)">${icon("log-in")}</button>`}
    </div>
  </header>
  <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="nav-section">Navegação</div>
      <nav class="nav-list">
        <div class="nav-item">
          <button class="nav-btn ${active==="inicio"?"active":""}" onclick="goHome()">
            <span class="nav-icon">${icon("home")}</span><span class="nav-label">Início</span>
          </button>
        </div>
        ${showRegistro?`
        <div class="nav-item">
          <button class="nav-btn ${active==="registro"?"active":""}" onclick="goRegistro()">
            <span class="nav-icon">${icon("clipboard-list")}</span><span class="nav-label">Registro</span>
          </button>
        </div>`:""}
      </nav>
    </aside>
    <main class="main" id="main-content"></main>
  </div>`;
  // Sidebar: no mobile abre/fecha como drawer; no desktop alterna mini
  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
  const sidebarEl = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  // Estado inicial: fechada no mobile
  if(isMobile()){ sidebarEl.classList.remove("open"); sidebarEl.classList.add("collapsed"); }
  document.getElementById("toggleSidebar").onclick = () => {
    if(isMobile()){
      const opening = !sidebarEl.classList.contains("open");
      sidebarEl.classList.toggle("open", opening);
      sidebarEl.classList.toggle("collapsed", !opening);
      backdrop.classList.toggle("show", opening);
    }else{
      sidebarEl.classList.toggle("collapsed");
    }
  };
  backdrop.onclick = () => {
    sidebarEl.classList.remove("open");
    sidebarEl.classList.add("collapsed");
    backdrop.classList.remove("show");
  };
  // Fecha o drawer ao navegar
  sidebarEl.querySelectorAll(".nav-btn").forEach(b=>{
    const orig = b.onclick;
    b.addEventListener("click",()=>{ if(isMobile()){ sidebarEl.classList.remove("open"); backdrop.classList.remove("show"); }});
  });
  if(showNotif){
    const nb=document.getElementById("notifBtn");
    nb.onclick=e=>{
      e.stopPropagation();
      document.getElementById("notifPanel").classList.toggle("open");
      if(canSeeNotifs) loadNotifications();
    };
    document.addEventListener("click",e=>{
      const w=document.getElementById("notifWrap");
      if(w && !w.contains(e.target)) document.getElementById("notifPanel")?.classList.remove("open");
    });
    const mAll=document.getElementById("notifMarkAll");
    if(mAll) mAll.onclick=async(e)=>{
      e.stopPropagation();
      if(!canSeeNotifs) return;
      await markAllNotificationsRead();
      loadNotifications();
    };
  }
  const lb=document.getElementById("logoutBtn");if(lb)lb.onclick=signOut;
  // Notificações: carregar e agendar limpeza a cada 40 min (somente super admin)
  if(canSeeNotifs){
    loadNotifications();
    if(!window.__notifTimer){
      window.__notifTimer = setInterval(loadNotifications, 20000);
    }
    // Limpeza automática do painel de notificações a cada 40 minutos
    if(!window.__notifCleanupTimer){
      // Executa uma limpeza inicial de itens antigos (> 40 min)
      cleanupOldNotifications();
      window.__notifCleanupTimer = setInterval(cleanupOldNotifications, 40 * 60 * 1000);
    }
  }
}

function roleLabel(r){
  return r==="responsavel" ? "Responsável Mapper(a)"
       : r==="auxiliar"    ? "Auxiliar Mapper(a)"
       : r==="super_admin" ? "Super Admin"
       : "";
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

/* ---------- Ícones ---------- */
function icon(name,size=20){
  const p={
    "menu":`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`,
    "bell":`<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`,
    "user":`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    "log-out":`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>`,
    "log-in":`<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>`,
    "home":`<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>`,
    "clipboard-list":`<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>`,
    "check":`<polyline points="20 6 9 17 4 12"/>`,
    "x":`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
    "arrow-left":`<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
    "send":`<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>`,
    "plus":`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
    "unlock":`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`,
  }[name]||"";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

/* ---------- Discord webhook ---------- */
function normalizeOrgCorp(value){
  const text=String(value||"").trim();
  if(!text) return "—";
  const lower=text.toLowerCase();
  if(lower.includes("família")||lower.includes("familia")) return "Família";
  if(lower.includes("civil")) return "Civil";
  return text;
}
function splitDiscordText(text,maxLength=900){
  const value=String(text ?? "—");
  if(value.length <= maxLength) return [value];
  const parts=[]; let current="";
  value.split(/(\s+)/).forEach(token=>{
    if((current+token).length > maxLength && current.trim()){
      parts.push(current.trim()); current=token;
    }else{ current += token; }
  });
  if(current.trim()) parts.push(current.trim());
  return parts;
}
function buildDiscordFields(sub, responsavelEmail){
  const entries=[
    ["E-mail",sub.email],
    ["Selecione o servidor",sub.servidor],
    ["Nick",sub.nick],
    ["RG",sub.rg],
    ["Discord",sub.discord],
    ["Número",sub.numero],
    ["Idade",sub.idade],
    ["Level",sub.level],
    ["ORG / CORP",normalizeOrgCorp(sub.orgCorp)],
    ["Plataforma",sub.plataforma],
    ["Descreva como você realiza o seu Roleplay (RP) dentro da cidade",sub.rp],
    ["Tem experiência com mapeação?",sub.expMap],
    ["Tem experiência em administração?",sub.expAdm],
    ["Por que você deseja fazer parte do setor Mapper?",sub.motivo],
    ["Qual é o seu nível de conhecimento em mapeamento?",sub.nivel],
    ["Há quanto tempo você joga em nossa cidade?",sub.tempoCidade],
    ["Na sua opinião, quais características são essenciais para um bom Mapper?",sub.caracteristicas],
    ["Você se considera responsável para lidar com propriedades de alto valor? Justifique.",sub.responsabilidade],
    ["Como você agiria caso cometesse um erro no mapeamento de uma casa?",sub.erro],
    ["IP do usuário",sub.ip],
    ["Navegador",sub.navegador],
    ["Data/Hora",sub.data_hora ? new Date(sub.data_hora).toLocaleString("pt-BR") : null],
  ];
  if(responsavelEmail) entries.push(["Responsável", responsavelEmail]);
  const fields=[];
  entries.forEach(([name,value])=>{
    const safeName = name.length > 250 ? name.slice(0,247)+"..." : name;
    splitDiscordText(value,1000).forEach((chunk,index)=>{
      const chunkName = index===0 ? safeName : `${safeName} (parte ${index+1})`;
      fields.push({name:chunkName.slice(0,256),value:chunk||"—",inline:false});
    });
  });
  return fields;
}
async function sendDiscord(sub,action,responsavelEmail){
  const colors={new:0x22d3ee,approved:0x22c55e,rejected:0xef4444};
  const titles={new:"📥 Nova inscrição — Setor Mapper",approved:"✅ Inscrição APROVADA",rejected:"❌ Inscrição RECUSADA"};
  const fields=buildDiscordFields(sub, responsavelEmail);
  const embeds=[];
  for(let i=0;i<fields.length;i+=25){
    embeds.push({
      title:titles[action]||"Formulário",
      color:colors[action]||0x22d3ee,
      timestamp:new Date().toISOString(),
      fields:fields.slice(i,i+25),
      footer:{text: responsavelEmail ? `Responsável: ${responsavelEmail}` : `ID: ${sub.email || sub.id || "—"}`}
    });
  }
  const url = DISCORD_WEBHOOKS[action] || DISCORD_WEBHOOKS.new;
  try{
    await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({embeds})});
  }catch(e){console.warn("Discord webhook falhou",e)}
}

/* ---------- Supabase (formulários) ---------- */
function mapToRow(d){
  const yes = v => String(v||"").toLowerCase().startsWith("s");
  const row = {
    id: Date.now(),
    email: d.email || null, servidor: d.servidor || null, nick: d.nick || null,
    rg: d.rg || null, discord: d.discord || null, "número": d.numero || null,
    idade: d.idade || null, level: d.level || null,
    org_corp: normalizeOrgCorp(d.orgCorp), plataforma: d.plataforma || null,
    tipo_rp: d.rp || null,
    experiencia_mapeacao: yes(d.expMap), experiencia_administracao: yes(d.expAdm),
    motivo_mapper: d.motivo || null, nivel_mapeamento: d.nivel || null,
    tempo_cidade: d.tempoCidade || null, caracteristicas_mapper: d.caracteristicas || null,
    responsabilidade_propriedades: d.responsabilidade || null,
    resolucao_erros_mapeamento: d.erro || null,
  };
  if(d.ip != null) row.ip = d.ip;
  if(d.navegador != null) row.navegador = d.navegador;
  if(d.data_hora != null) row.data_hora = d.data_hora;
  row.status = d.status || "pending";
  return row;
}
function buildAlternativeRow(row){
  const alt = {...row};
  if("navegador" in alt){ alt.browser = alt.navegador; delete alt.navegador; }
  if("data_hora" in alt){ alt.date_time = alt.data_hora; delete alt.data_hora; }
  return alt;
}
function isMissingColumnError(error){
  const msg = (error.message||"") + " " + (error.details||"") + " " + (error.hint||"");
  return /schema cache|column .* does not exist|Could not find the/i.test(msg);
}
async function tryInsertRow(row){ return await sb.from("formularios").insert(row).select().single(); }

async function getUserIp(){
  try{ const r=await fetch("https://api.ipify.org?format=json"); const j=await r.json(); return j.ip||null;
  }catch{ try{ const r2=await fetch("https://ipapi.co/json/"); const j2=await r2.json(); return j2.ip||null; }catch{return null;} }
}
function getUserAgent(){
  if(typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const vendor = navigator.vendor || "";
  const isOpera = ua.indexOf("OPR") > -1 || ua.indexOf("Opera") > -1;
  const isEdge = ua.indexOf("Edg") > -1;
  const isChrome = ua.indexOf("Chrome") > -1 && !isEdge && !isOpera;
  const isFirefox = ua.indexOf("Firefox") > -1;
  const isSafari = ua.indexOf("Safari") > -1 && vendor.indexOf("Apple") > -1 && !isChrome;
  const browserName = isOpera?"Opera":isEdge?"Edge":isChrome?"Chrome":isFirefox?"Firefox":isSafari?"Safari":"Navegador";
  return browserName + (ua ? ` — ${ua}` : "");
}

/* ---------- Bloqueio 48h + liberação ---------- */
const REENVIO_MS = 48 * 60 * 60 * 1000; // 48 horas

async function findDuplicateRecent(d){
  if(!sb) return null;
  const since = new Date(Date.now() - REENVIO_MS).toISOString();
  const email = (d.email||"").toLowerCase();
  const { data, error } = await sb.from("formularios")
    .select("id,data_hora,email,nick,servidor,rg")
    .ilike("email", email)
    .ilike("nick", d.nick||"")
    .eq("servidor", d.servidor||"")
    .ilike("rg", d.rg||"")
    .gte("data_hora", since)
    .order("data_hora",{ascending:false})
    .limit(1);
  if(error){ console.warn("dup check falhou",error); return null; }
  return (data && data[0]) || null;
}

async function findLiberacao(d){
  if(!sb) return null;
  const email = (d.email||"").toLowerCase();
  const { data, error } = await sb.from("formulario_liberacoes")
    .select("id,email,nick,servidor,rg,used_at,created_at")
    .ilike("email", email)
    .ilike("nick", d.nick||"")
    .eq("servidor", d.servidor||"")
    .ilike("rg", d.rg||"")
    .is("used_at", null)
    .order("created_at",{ascending:false})
    .limit(1);
  if(error){ console.warn("liberacao check falhou",error); return null; }
  return (data && data[0]) || null;
}

async function consumeLiberacao(id){
  if(!sb || !id) return;
  await sb.from("formulario_liberacoes").update({used_at: new Date().toISOString()}).eq("id", id);
}

async function createLiberacao({email,nick,servidor,rg}){
  if(!sb) throw new Error("Supabase indisponível");
  const clean = String(email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("E-mail inválido");
  if(!nick || !servidor || !rg) throw new Error("Preencha nick, servidor e RG");
  const { error } = await sb.from("formulario_liberacoes")
    .insert({ email: clean, nick: String(nick).trim(), servidor: String(servidor).trim(), rg: String(rg).trim() });
  if(error) throw error;
  return clean;
}

async function saveToSupabase(data){
  if(!sb){ throw new Error("Supabase client não carregado"); }

  // 1) Verifica duplicidade recente (48h)
  const dup = await findDuplicateRecent(data);
  if(dup){
    // 2) Se houver, procura liberação disponível
    const lib = await findLiberacao(data);
    if(!lib){
      const restante = REENVIO_MS - (Date.now() - new Date(dup.data_hora).getTime());
      const horas = Math.max(1, Math.ceil(restante/3600000));
      throw new Error(`ERRO: Você foi bloqueado por enviar um formulário com as mesmas informações. Aguarde 48 horas antes de realizar um novo envio. Caso identifique algum problema, abra um ticket para suporte.`);
    }
    // consome a liberação e prossegue
    await consumeLiberacao(lib.id);
  }

  let row = mapToRow(data);
  let { data: inserted, error } = await tryInsertRow(row);
  if(error && isMissingColumnError(error)){
    const altRow = buildAlternativeRow(row);
    if(JSON.stringify(altRow) !== JSON.stringify(row)){
      const retry = await tryInsertRow(altRow);
      if(!retry.error) return retry.data;
      error = retry.error;
    }
  }
  if(error){
    if(isMissingColumnError(error)){
      throw new Error("Falha ao salvar: colunas ausentes. Execute o SQL de preparação no Supabase.");
    }
    throw error;
  }
  return inserted;
}

async function loadSubsFromSupabase(){
  if(!sb) throw new Error("Supabase client não carregado");
  const { data, error } = await sb.from("formularios").select("*").order("data_hora",{ascending:false});
  if(error) throw error;
  return (data||[]).map(rowToSub);
}
async function loadSubFromSupabase(id){
  const { data, error } = await sb.from("formularios").select("*").eq("id",id).maybeSingle();
  if(error) throw error;
  return data ? rowToSub(data) : null;
}
async function updateStatusSupabase(id,status){
  const { error } = await sb.from("formularios").update({status}).eq("id",id);
  if(error) throw error;
}
function rowToSub(r){
  return {
    id: r.id,
    createdAt: r.data_hora ? new Date(r.data_hora).getTime() : Date.now(),
    status: r.status || "pending",
    email: r.email, servidor: r.servidor, nick: r.nick, rg: r.rg,
    discord: r.discord, numero: r["número"] ?? r.numero, idade: r.idade,
    level: r.level, orgCorp: r.org_corp, plataforma: r.plataforma,
    rp: r.tipo_rp,
    expMap: r.experiencia_mapeacao ? "Sim" : "Não",
    expAdm: r.experiencia_administracao ? "Sim" : "Não",
    motivo: r.motivo_mapper, nivel: r.nivel_mapeamento,
    tempoCidade: r.tempo_cidade, caracteristicas: r.caracteristicas_mapper,
    responsabilidade: r.responsabilidade_propriedades,
    erro: r.resolucao_erros_mapeamento,
    ip: r.ip, navegador: r.navegador, data_hora: r.data_hora,
  };
}

/* ---------- Cargos (mapper_roles) ---------- */
async function addMapperRole(email, role, servidor){
  if(!sb) throw new Error("Supabase não disponível");
  const clean = String(email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("E-mail inválido");
  const payload = { email: clean, role, servidor: servidor || null };
  const { error } = await sb.from("mapper_roles").upsert(payload, { onConflict: "email" });
  if(error) throw error;
  return clean;
}

/* Bootstrap: recarrega auth quando muda estado */
if(sb){
  sb.auth.onAuthStateChange(()=>{ /* páginas fazem seu próprio refresh */ });
}

/* ---------- Config: trancar formulário ---------- */
async function isFormLocked(){
  if(!sb) return false;
  try{
    const { data } = await sb.from("formulario_config").select("locked").eq("id",1).maybeSingle();
    return !!(data && data.locked);
  }catch(e){ console.warn("isFormLocked",e); return false; }
}
async function setFormLocked(locked){
  if(!sb) throw new Error("Supabase não disponível");
  const payload = { id:1, locked, locked_by: CURRENT_USER?.email||null, locked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await sb.from("formulario_config").upsert(payload,{onConflict:"id"});
  if(error) throw error;
  await createNotification({
    tipo: locked?"locked":"unlocked",
    titulo: locked?"Formulário trancado":"Formulário destrancado",
    mensagem: `${CURRENT_USER?.email||"—"} ${locked?"trancou":"destrancou"} o envio de novos formulários`,
    ator: CURRENT_USER?.email||null
  });
}

/* ---------- Notificações ---------- */
async function createNotification({tipo,titulo,mensagem,formulario_id=null,ator=null}){
  if(!sb) return;
  try{
    await sb.from("notifications").insert({tipo,titulo,mensagem:mensagem||null,formulario_id,ator});
  }catch(e){ console.warn("createNotification",e); }
}
async function loadNotifications(){
  const list = document.getElementById("notifList");
  const badge = document.getElementById("notifBadge");
  if(!list) return;
  if(!sb){ list.innerHTML = `<div class="notif-empty">Sem conexão</div>`; return; }
  try{
    const { data, error } = await sb.from("notifications").select("*").order("created_at",{ascending:false}).limit(30);
    if(error) throw error;
    const items = data||[];
    const unread = items.filter(n=>!n.lida).length;
    if(badge){
      if(unread>0){ badge.style.display="inline-flex"; badge.textContent = unread>99?"99+":String(unread); }
      else{ badge.style.display="none"; }
    }
    if(!items.length){ list.innerHTML = `<div class="notif-empty">Nenhuma notificação</div>`; return; }
    list.innerHTML = items.map(n=>{
      const ic = notifIcon(n.tipo);
      return `<div class="notif-item ${n.lida?'read':'unread'}" data-id="${n.id}" ${n.formulario_id?`data-form="${n.formulario_id}"`:""}>
        <div class="notif-ic ${n.tipo}">${ic}</div>
        <div class="notif-txt">
          <div class="notif-title">${escapeHtml(n.titulo||"")}</div>
          ${n.mensagem?`<div class="notif-msg">${escapeHtml(n.mensagem)}</div>`:""}
          <div class="notif-time">${fmtDate(n.created_at)}${n.ator?` · ${escapeHtml(n.ator)}`:""}</div>
        </div>
      </div>`;
    }).join("");
    list.querySelectorAll(".notif-item").forEach(el=>{
      el.onclick = async ()=>{
        const id = el.getAttribute("data-id");
        const fid = el.getAttribute("data-form");
        try{ await sb.from("notifications").update({lida:true}).eq("id",id); }catch{}
        if(fid) navigateTo(`/detalhe.html?id=${fid}`);
        else loadNotifications();
      };
    });
  }catch(e){
    console.warn("loadNotifications",e);
    list.innerHTML = `<div class="notif-empty">Erro ao carregar</div>`;
  }
}
async function markAllNotificationsRead(){
  if(!sb) return;
  try{ await sb.from("notifications").update({lida:true}).eq("lida",false); }catch(e){ console.warn(e); }
}
/* Limpa (deleta) notificações com mais de 40 minutos.
   Roda automaticamente a cada 40 min enquanto o super admin estiver logado. */
async function cleanupOldNotifications(){
  if(!sb) return;
  if(!isSuperAdmin()) return;
  try{
    const cutoff = new Date(Date.now() - 40*60*1000).toISOString();
    await sb.from("notifications").delete().lt("created_at", cutoff);
    // Atualiza o painel após a limpeza
    loadNotifications();
  }catch(e){ console.warn("cleanupOldNotifications", e); }
}
function notifIcon(tipo){
  const map={new:"send",approved:"check",rejected:"x",deleted:"x",locked:"lock",unlocked:"unlock",edited:"clipboard-list",liberacao:"unlock",role_added:"user",role_removed:"user"};
  return icon(map[tipo]||"bell",16);
}

/* ---------- Delete + Update formulário ---------- */
async function deleteFormularioSupabase(id){
  if(!sb) throw new Error("Supabase não disponível");
  const { error } = await sb.from("formularios").delete().eq("id",id);
  if(error) throw error;
}
async function updateFormularioSupabase(id, data){
  if(!sb) throw new Error("Supabase não disponível");
  const yes = v => String(v||"").toLowerCase().startsWith("s");
  const row = {
    email: data.email||null, servidor: data.servidor||null, nick: data.nick||null,
    rg: data.rg||null, discord: data.discord||null, "número": data.numero||null,
    idade: data.idade||null, level: data.level||null,
    org_corp: normalizeOrgCorp(data.orgCorp), plataforma: data.plataforma||null,
    tipo_rp: data.rp||null,
    experiencia_mapeacao: yes(data.expMap), experiencia_administracao: yes(data.expAdm),
    motivo_mapper: data.motivo||null, nivel_mapeamento: data.nivel||null,
    tempo_cidade: data.tempoCidade||null, caracteristicas_mapper: data.caracteristicas||null,
    responsabilidade_propriedades: data.responsabilidade||null,
    resolucao_erros_mapeamento: data.erro||null,
  };
  const { error } = await sb.from("formularios").update(row).eq("id",id);
  if(error) throw error;
}

/* ---------- Icon extras ---------- */
(function addExtraIcons(){
  const orig = icon;
  window.icon = function(name,size=20){
    const extras = {
      "lock":`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
      "trash":`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>`,
      "copy":`<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
      "edit":`<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`,
      "settings":`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
    };
    if(extras[name]){
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${extras[name]}</svg>`;
    }
    return orig(name,size);
  };
})();
