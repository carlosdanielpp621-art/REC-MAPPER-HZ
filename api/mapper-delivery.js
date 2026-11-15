import { createClient } from "@supabase/supabase-js";
async function relay(request) {
  const headers = { "Content-Type": "application/json" };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("{}", { status: 403, headers });
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(Number(body.id)) || !["new", "approved", "rejected"].includes(body.action))
    return new Response("{}", { status: 400, headers });
  let userEmail = null;
  if (body.action !== "new") {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer "))
      return new Response("{}", { status: 401, headers });
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"];
    if (!url || !key)
      return new Response("{}", { status: 503, headers });
    const client = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data, error } = await client.auth.getUser(auth.slice(7));
    if (error || !data.user?.email)
      return new Response("{}", { status: 401, headers });
    userEmail = data.user.email.toLowerCase();
    const { data: allowed, error: accessError } = await client.rpc("mapper_list_forms", { _id: Number(body.id) });
    if (accessError || !allowed?.length)
      return new Response("{}", { status: 403, headers });
  } else if (typeof body.receipt !== "string" || !/^[0-9a-f-]{36}$/.test(body.receipt)) {
    return new Response("{}", { status: 403, headers });
  }
  const serviceUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey)
    return new Response("{}", { status: 503, headers });
  const supabaseAdmin = createClient(serviceUrl, serviceKey, { auth: { persistSession: false }, global: { fetch: (input, init) => {
    const h = new Headers(init?.headers);
    if (serviceKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${serviceKey}`)
      h.delete("Authorization");
    h.set("apikey", serviceKey);
    return fetch(input, { ...init, headers: h });
  } } });
  let query = supabaseAdmin.from("mapper_delivery_queue").select("*").eq("formulario_id", Number(body.id)).eq("action", body.action).is("delivered_at", null).order("created_at", { ascending: true }).limit(1);
  if (body.action === "new")
    query = query.eq("id", body.receipt);
  const { data: entries, error } = await query;
  if (error)
    return new Response("{}", { status: 503, headers });
  const entry = entries?.[0];
  if (!entry)
    return new Response('{"ok":true}', { headers });
  const names = { email: "E-mail", servidor: "Servidor", nick: "Nick", rg: "RG", discord: "Discord", "número": "Número", idade: "Idade", level: "Level", org_corp: "ORG / CORP", plataforma: "Plataforma", tipo_rp: "Roleplay", experiencia_mapeacao: "Experiência com mapeação", experiencia_administracao: "Experiência em administração", motivo_mapper: "Motivo para ser Mapper", nivel_mapeamento: "Conhecimento", tempo_cidade: "Tempo na cidade", caracteristicas_mapper: "Características", responsabilidade_propriedades: "Responsabilidade", resolucao_erros_mapeamento: "Resolução de erros", ip: "IP", navegador: "Navegador", data_hora: "Data/Hora" };
  const payload = entry.payload;
  const fields = Object.entries(names).flatMap(([key, name]) => {
    const value = String(payload[key] ?? "—");
    return Array.from({ length: Math.max(1, Math.ceil(value.length / 1000)) }, (_, i) => ({ name: i ? `${name} (continuação)` : name, value: value.slice(i * 1000, (i + 1) * 1000) || "—" }));
  });
  if (userEmail)
    fields.push({ name: "Responsável", value: userEmail });
  const envNames = { new: "MAPPER_DISCORD_NEW_URL", approved: "MAPPER_DISCORD_APPROVED_URL", rejected: "MAPPER_DISCORD_REJECTED_URL" };
  const envName = envNames[body.action];
  if (!envName)
    return new Response("{}", { status: 400, headers });
  const webhook = process.env[envName];
  if (!webhook)
    return new Response("{}", { status: 503, headers });
  const titles = { new: "Nova inscrição — Setor Mapper", approved: "Inscrição APROVADA", rejected: "Inscrição RECUSADA" };
  let batch = [];
  let size = 0;
  const messages = [];
  for (const field of fields) {
    const n = field.name.length + field.value.length;
    if (batch.length === 25 || size + n > 5000) {
      messages.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(field);
    size += n;
  }
  if (batch.length)
    messages.push(batch);
  for (const chunk of messages) {
    const result = await fetch(webhook, { method: "POST", headers, body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [{ title: titles[body.action], fields: chunk, timestamp: entry.created_at }] }) });
    if (!result.ok)
      return new Response("{}", { status: 502, headers });
  }
  const { error: writeError } = await supabaseAdmin.from("mapper_delivery_queue").update({ delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", entry.id).is("delivered_at", null);
  return new Response(JSON.stringify({ ok: !writeError }), { status: writeError ? 503 : 200, headers });
}
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const h = new Headers;
  for (const [k, v] of Object.entries(req.headers))
    if (v)
      h.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const origin = `https://${req.headers.host}`;
  const request = new Request(origin + req.url, { method: "POST", headers: h, body: JSON.stringify(typeof req.body === "string" ? JSON.parse(req.body) : req.body) });
  try {
    const response = await relay(request);
    res.status(response.status).setHeader("Content-Type", "application/json").send(await response.text());
  } catch {
    res.status(503).json({ ok: false });
  }
}
