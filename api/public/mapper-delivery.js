export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,pub=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key||!pub)return res.status(503).json({error:'Entrega pendente: configure as variáveis de ambiente no servidor.'});
 const input=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 async function api(path,token=key,method='GET',body){const headers={apikey:token===key?key:pub,'Content-Type':'application/json'};if(!token.startsWith('sb_'))headers.Authorization='Bearer '+token;const r=await fetch(base+'/rest/v1/'+path,{method,headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error('Acesso negado');return r.status===204?null:r.json();}
 try{
 let receipt=input.receipt;
 if(input.formId&&['approved','rejected'].includes(input.action)){
  const token=(req.headers.authorization||'').replace('Bearer ','');if(!token)return res.status(401).end();
  const user=await fetch(base+'/auth/v1/user',{headers:{apikey:pub,Authorization:'Bearer '+token}});if(!user.ok)return res.status(401).end();
  const forms=await api('rpc/mapper_list_forms',token,'POST',{_id:Number(input.formId)});if(!forms?.length)return res.status(403).end();
  const items=await api('mapper_delivery_queue?select=id&formulario_id=eq.'+Number(input.formId)+'&action=eq.'+input.action+'&delivered_at=is.null&order=created_at.desc&limit=1');receipt=items?.[0]?.id;
 }
 if(typeof receipt!=='string'||!/^[0-9a-f-]{36}$/i.test(receipt))return res.status(400).end();
 const items=await api('mapper_delivery_queue?select=*&id=eq.'+receipt);const item=items?.[0];if(!item)return res.status(404).end();if(item.delivered_at)return res.json({delivered:true});
 if((item.action!=='new'&&!input.formId)||Date.now()-new Date(item.created_at).getTime()>3600000)return res.status(403).end();
 const url=process.env[item.action==='approved'?'MAPPER_DISCORD_APPROVED_URL':item.action==='rejected'?'MAPPER_DISCORD_REJECTED_URL':'MAPPER_DISCORD_NEW_URL'];if(!url)return res.status(503).end();
 const fields=Object.entries(item.payload).filter(([k])=>!['id','status'].includes(k)).map(([name,v])=>({name,value:String(v??'—').slice(0,1000)}));const embeds=[];for(let i=0;i<fields.length;i+=25)embeds.push({title:item.action==='new'?'Nova inscrição — Setor Mappes':item.action==='approved'?'Inscrição aprovada':'Inscrição recusada',fields:fields.slice(i,i+25)});
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({embeds})});if(!r.ok)return res.status(502).end();await api('mapper_delivery_queue?id=eq.'+receipt,key,'PATCH',{delivered_at:new Date().toISOString(),updated_at:new Date().toISOString()});return res.json({delivered:true});
 }catch{return res.status(502).json({error:'Entrega pendente; formulário permanece salvo.'});}
}
