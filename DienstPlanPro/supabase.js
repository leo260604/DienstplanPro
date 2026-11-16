'use strict';
/* =====================================================================
   DienstPlan Pro – Speicherung in Supabase
   ---------------------------------------------------------------------
   So funktioniert es:
   1. Beim Start werden alle Daten aus Supabase geladen und in den
      Browser-Zwischenspeicher (localStorage) geschrieben – erst danach
      startet die App (app.js). Die App selbst bleibt unverändert.
   2. Jede Änderung, die die App speichert, wird kurz darauf automatisch
      in die passende Supabase-Tabelle übertragen (nur geänderte Zeilen).
   3. Noch nicht übertragene Änderungen werden gemerkt. Wird die Seite
      vorher neu geladen oder ist das Netz weg, werden sie beim nächsten
      Start bzw. beim nächsten Versuch zuerst hochgeladen.
   Ohne URL/Key unten läuft die App wie bisher nur im Browser.
   Tabellen anlegen: supabase/schema.sql im Supabase SQL Editor ausführen.
===================================================================== */
const DP_SUPABASE_URL='';       // z. B. https://abcdefgh.supabase.co
const DP_SUPABASE_ANON_KEY='';  // Project Settings → API → anon public

(function(){
 const LS=window.localStorage,origSet=Storage.prototype.setItem,origRemove=Storage.prototype.removeItem;
 const lsGet=k=>{try{return LS.getItem(k)}catch(e){return null}};
 const lsSet=(k,v)=>{try{origSet.call(LS,k,v)}catch(e){console.warn('[Supabase] Zwischenspeicher voll:',k,e)}};
 const lsDel=k=>{try{origRemove.call(LS,k)}catch(e){}};
 const parse=t=>{try{return JSON.parse(t)}catch(e){return null}};
 const PENDING='dpSyncPending';
 // Hinweis über die App-Meldung (toast ist in app.js als const angelegt, daher nicht über window erreichbar)
 const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};

 /* ---------------- Zuordnung: Browser-Schlüssel → Tabelle ---------------- */
 const S=(v)=>v===undefined?null:v;
 const take=(o,keys)=>{const extra={};Object.keys(o||{}).forEach(k=>{if(!keys.includes(k))extra[k]=o[k]});return extra};
 const back=(row,map)=>{const o={...(row.extra||{})};Object.entries(map).forEach(([f,c])=>{if(row[c]!==null&&row[c]!==undefined)o[f]=row[c]});return o};
 // Objekt-Sammlungen mit einfacher Feld→Spalten-Zuordnung
 const obj=(table,map,opt={})=>({table,order:opt.order||'sort_order.asc.nullslast,id.asc',sorted:opt.sorted!==false,
  toRow:(o,i)=>{const r={id:String(o.id)};if(opt.sorted!==false)r.sort_order=i;Object.entries(map).forEach(([f,c])=>{if(f!=='id')r[c]=S(o[f])});r.extra=take(o,Object.keys(map));return r},
  fromRow:r=>{const o=back(r,map);o.id=opt.numId&&/^\d+$/.test(r.id)?Number(r.id):r.id;return o}});
 const C={
  dienstplanStaff:{table:'employees',order:'sort_order.asc.nullslast,id.asc',
   toRow:(s,i)=>({id:String(s[8]||('emp-idx-'+i)),sort_order:i,name:S(s[0]),initials:S(s[1]),status_text:S(s[2]),time_text:S(s[3]),color:S(s[4]),team:S(s[5]),email:S(s[6]),phone:S(s[7]),photo:S(s[9]),role:S(s[10]),teams_phone:S(s[11]),extra:s.length>12?{more:s.slice(12)}:{}}),
   fromRow:r=>{const a=[r.name||'',r.initials||'',r.status_text||'',r.time_text||'',r.color||'',r.team||'',r.email||'',r.phone||'',r.id,r.photo||'',r.role||'Mitarbeiter',r.teams_phone||''];return r.extra&&Array.isArray(r.extra.more)?a.concat(r.extra.more):a}},
  dienstplanTeams:obj('teams',{id:'id',name:'name',memberIds:'member_ids',leaderId:'leader_id',deputyId:'deputy_id',standbyColor:'standby_color',settings:'settings'}),
  dienstplanDepartments:obj('departments',{id:'id',name:'name',headId:'head_id',color:'color',teamIds:'team_ids'}),
  dienstplanAssignments:obj('assignments',{id:'id',kind:'kind',team:'team',employee:'employee',shift:'shift',date:'day',start:'start_time',end:'end_time',isAbsence:'is_absence',note:'note',color:'color',groupId:'group_id',groupName:'group_name'},{sorted:false,order:'day.asc.nullslast,start_time.asc.nullsfirst,id.asc'}),
  dienstplanShiftTypes:obj('shift_types',{id:'id',team:'team',name:'name',start:'start_time',end:'end_time',pause:'pause',color:'color'},{numId:true}),
  dienstplanStandbyGroups:obj('standby_groups',{id:'id',name:'name'}),
  dienstplanStandbyTimes:obj('standby_times',{id:'id',name:'name',type:'type',start:'start_time',end:'end_time',color:'color',teamIds:'team_ids',groupId:'group_id'}),
  dienstplanSwaps:obj('swaps',{id:'id',status:'status',from:'from_name',fromId:'from_id',to:'to_name',toId:'to_id',give:'give',take:'take',note:'note',createdAt:'created_ms',decidedAt:'decided_ms'},{sorted:false,order:'created_ms.asc.nullsfirst,id.asc'}),
  dienstplanAuditLog:obj('audit_log',{id:'id',ts:'ts',user:'user_name',role:'role',action:'action',area:'area',title:'title',object:'object',detail:'detail',before:'before_value',after:'after_value'},{sorted:false,order:'ts.desc.nullslast,id.asc'}),
  dienstplanExportLog:obj('export_log',{id:'id',ts:'ts',user:'user_name',role:'role',report:'report',format:'format',rows:'rows',status:'status',range:'range_text',size:'size'},{sorted:false,order:'ts.desc.nullslast,id.asc'}),
  dienstplanNotifications:obj('notifications',{id:'id',recipientId:'recipient_id',recipientRole:'recipient_role',createdAt:'created_ms'},{sorted:false,order:'created_ms.asc.nullsfirst,id.asc'})
 };
 // Einstellungen als Schlüssel/Wert (app_settings)
 const SETTING_KEYS=['dienstplanCockpitLink','dienstplanFavorites','dienstplanNotifyPrefs','dienstplanDashLayout','dienstplanDemoDataVersion','dienstplanAddTeamDonau','dienstplanPermMig2','dienstplanPermMig3'];
 const ROLE_KEYS=['dienstplanRoles','dienstplanPermissions'];
 const SYNC_KEYS=new Set([...Object.keys(C),...SETTING_KEYS,...ROLE_KEYS]);

 /* ---------------- REST-Aufrufe (PostgREST) ---------------- */
 const enabled=!!(DP_SUPABASE_URL&&DP_SUPABASE_ANON_KEY);
 const base=DP_SUPABASE_URL.replace(/\/+$/,'')+'/rest/v1/';
 const hdr=(extra={})=>({apikey:DP_SUPABASE_ANON_KEY,Authorization:'Bearer '+DP_SUPABASE_ANON_KEY,'Content-Type':'application/json',...extra});
 async function req(method,path,body,prefer){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),method==='GET'?12000:30000);let r;
  try{r=await fetch(base+path,{method,headers:hdr(prefer?{Prefer:prefer}:{}),body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:ctl.signal})}
  catch(e){throw new Error(e.name==='AbortError'?'Zeitüberschreitung bei der Verbindung zu Supabase':'Supabase nicht erreichbar: '+(e.message||e))}finally{clearTimeout(to)}
  if(!r.ok){let t='';try{t=await r.text()}catch(e){}throw new Error(`${method} ${path.split('?')[0]} → ${r.status} ${t.slice(0,300)}`)}
  if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null}
 async function getAll(table,order){const out=[];for(let off=0;;off+=1000){const page=await req('GET',`${table}?select=*&order=${order}&limit=1000&offset=${off}`);out.push(...page);if(page.length<1000)break}return out}
 async function upsert(table,rows,pk='id'){for(let i=0;i<rows.length;i+=500)await req('POST',`${table}?on_conflict=${pk}`,rows.slice(i,i+500),'resolution=merge-duplicates,return=minimal')}
 const inList=ids=>'('+ids.map(x=>'"'+String(x).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+')';
 async function remove(table,ids,pk='id'){for(let i=0;i<ids.length;i+=80)await req('DELETE',`${table}?${pk}=in.${encodeURIComponent(inList(ids.slice(i,i+80)))}`,undefined,'return=minimal')}

 /* ---------------- Zustand ---------------- */
 const synced={};      // key → Map(id → JSON der zuletzt übertragenen Zeile)
 let pending=new Set((parse(lsGet(PENDING))||[]).filter(k=>SYNC_KEYS.has(k)));
 const savePending=()=>{pending.size?lsSet(PENDING,JSON.stringify([...pending])):lsDel(PENDING)};
 const status={state:enabled?'start':'off',error:'',lastOk:0};
 window.DPSync={enabled,status,flush:()=>flush(),table:k=>C[k]?.table||(SETTING_KEYS.includes(k)?'app_settings':ROLE_KEYS.includes(k)?'roles':null)};

 // Zeilen einer Sammlung aus dem aktuellen Browserstand bilden (doppelte IDs: erste gewinnt)
 function rowsFor(key){const raw=parse(lsGet(key));if(!Array.isArray(raw))return [];const seen=new Set(),out=[];
  raw.forEach((x,i)=>{if(!x||typeof x!=='object')return;let r;try{r=C[key].toRow(x,i)}catch(e){return}if(!r.id||seen.has(r.id)){if(r.id)console.warn('[Supabase] doppelte ID übersprungen:',key,r.id);return}seen.add(r.id);out.push(r)});return out}
 function roleRows(){const list=parse(lsGet('dienstplanRoles')),perms=parse(lsGet('dienstplanPermissions'));const rows=new Map();
  if(Array.isArray(list))list.forEach((n,i)=>{if(typeof n==='string')rows.set(n,{name:n,sort_order:i,listed:true,permissions:null})});
  if(perms&&typeof perms==='object')Object.entries(perms).forEach(([n,p])=>{const r=rows.get(n)||{name:n,sort_order:1000+rows.size,listed:false,permissions:null};r.permissions=p&&typeof p==='object'?p:null;rows.set(n,r)});
  return [...rows.values()]}

 /* Eine Sammlung übertragen. full=true: Supabase exakt auf den Browserstand bringen (nach Neuladen, Sicherung, Zurücksetzen). */
 async function pushKey(key,full){
  if(C[key]){const t=C[key].table,rows=rowsFor(key),map=new Map(rows.map(r=>[r.id,JSON.stringify(r)]));
   let known=synced[key];if(full||!known){const remote=await getAll(t,'id.asc').catch(()=>null);known=new Map((remote||[]).map(r=>[r.id,'?']))}
   const changed=rows.filter(r=>known.get(r.id)!==map.get(r.id)),gone=[...known.keys()].filter(id=>!map.has(id));
   if(changed.length)await upsert(t,changed);if(gone.length)await remove(t,gone);synced[key]=map;return}
  if(SETTING_KEYS.includes(key)){const v=lsGet(key);if(v===null)await remove('app_settings',[key],'key');else{let j=parse(v);if(j===null)j=v;await upsert('app_settings',[{key,value:j}],'key')}return}
  if(ROLE_KEYS.includes(key)){const rows=roleRows(),map=new Map(rows.map(r=>[r.name,JSON.stringify(r)]));
   let known=synced.__roles;if(full||!known){const remote=await getAll('roles','name.asc').catch(()=>null);known=new Map((remote||[]).map(r=>[r.name,'?']))}
   const changed=rows.filter(r=>known.get(r.name)!==map.get(r.name)),gone=[...known.keys()].filter(n=>!map.has(n));
   if(changed.length)await upsert('roles',changed,'name');if(gone.length)await remove('roles',gone,'name');synced.__roles=map}
 }

 /* Änderungen sammeln und gebündelt übertragen */
 let timer=null,running=null,retry=null,warned=false;
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>flush(),400)}
 async function flush(){
  if(!enabled||!pending.size)return running;
  if(running){await running.catch(()=>{});return flush()}
  running=(async()=>{const keys=[...pending],full=new Set(window.__dpFullPush||[]);
   for(const k of keys){
    try{await pushKey(k,full.has(k));pending.delete(k);savePending();if(window.__dpFullPush)window.__dpFullPush=window.__dpFullPush.filter(x=>x!==k)}
    catch(e){status.state='error';status.error=String(e.message||e);console.warn('[Supabase] Übertragung fehlgeschlagen:',k,e);
     if(!warned){warned=true;say('Speichern in der Datenbank fehlgeschlagen – die Änderungen bleiben im Browser und werden automatisch erneut übertragen.')}
     clearTimeout(retry);retry=setTimeout(()=>flush(),20000);return}}
   status.state='ok';status.error='';status.lastOk=Date.now();if(warned){warned=false;say('Verbindung zur Datenbank wieder da – alle Änderungen sind gespeichert.')}
  })();
  try{await running}finally{running=null}}
 function markChanged(key){if(!SYNC_KEYS.has(key))return;pending.add(key);savePending();if(booted)schedule()}

 // Jede Speicherung der App abfangen (auch direkte localStorage-Aufrufe)
 Storage.prototype.setItem=function(k,v){origSet.call(this,k,v);if(enabled&&this===LS)markChanged(k)};
 Storage.prototype.removeItem=function(k){origRemove.call(this,k);if(enabled&&this===LS)markChanged(k)};
 window.addEventListener('online',()=>flush());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});

 /* ---------------- Start ---------------- */
 let booted=false;
 function showLoader(){if(document.getElementById('dp-sync-loader'))return;const d=document.createElement('div');d.id='dp-sync-loader';d.setAttribute('role','status');
  d.innerHTML='<div class="dp-sync-box"><span class="dp-sync-spin"></span><b>Daten werden geladen …</b><small>Verbindung zur Datenbank</small></div>';document.body.appendChild(d)}
 function hideLoader(){document.getElementById('dp-sync-loader')?.remove()}
 function startApp(){
  const src=document.getElementById('dp-app-src'),s=document.createElement('script');
  if(src){s.textContent=src.textContent;document.body.appendChild(s);afterStart()}
  else{s.src='app.js';s.onload=afterStart;s.onerror=()=>{hideLoader();console.error('app.js konnte nicht geladen werden')};document.body.appendChild(s)}}
 function afterStart(){hideLoader();booted=true;if(enabled&&pending.size)schedule()}

 async function boot(){
  if(!enabled){startApp();return}
  showLoader();
  try{
   // 1) Noch nicht übertragene Änderungen aus der letzten Sitzung zuerst hochladen (Browserstand gewinnt)
   const carry=[...pending];
   if(carry.length){window.__dpFullPush=carry;await flush()}
   // 2) Alles aus Supabase laden
   const keys=Object.keys(C),results=await Promise.all([...keys.map(k=>getAll(C[k].table,C[k].order)),getAll('app_settings','key.asc'),getAll('roles','sort_order.asc.nullslast,name.asc')]);
   const settings=results[keys.length],roles=results[keys.length+1];
   const empty=results.every(r=>!r.length);
   if(empty){
    // Erste Verbindung: aktuellen Browserstand vollständig hochladen
    [...SYNC_KEYS].forEach(k=>{if(lsGet(k)!==null)pending.add(k)});savePending();window.__dpFullPush=[...pending];
    console.info('[Supabase] Datenbank ist leer – vorhandene Daten werden hochgeladen.');
   }else{
    keys.forEach((k,i)=>{if(pending.has(k))return;const rows=results[i];lsSet(k,JSON.stringify(rows.map(C[k].fromRow)));
     synced[k]=new Map(rowsFor(k).map(r=>[r.id,JSON.stringify(r)]))});
    const sMap=new Map(settings.map(r=>[r.key,r.value]));
    SETTING_KEYS.forEach(k=>{if(pending.has(k))return;if(sMap.has(k)){const v=sMap.get(k);lsSet(k,typeof v==='string'?v:JSON.stringify(v))}else lsDel(k)});
    if(!ROLE_KEYS.some(k=>pending.has(k))){const listed=roles.filter(r=>r.listed).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(r=>r.name);
     if(listed.length)lsSet('dienstplanRoles',JSON.stringify(listed));else lsDel('dienstplanRoles');
     const perms={};roles.forEach(r=>{if(r.permissions)perms[r.name]=r.permissions});
     if(Object.keys(perms).length)lsSet('dienstplanPermissions',JSON.stringify(perms));else lsDel('dienstplanPermissions');
     synced.__roles=new Map(roleRows().map(r=>[r.name,JSON.stringify(r)]))}
   }
   status.state='ok';status.lastOk=Date.now();
  }catch(e){
   status.state='error';status.error=String(e.message||e);console.warn('[Supabase] Laden fehlgeschlagen – die App arbeitet mit dem Stand im Browser.',e);
   setTimeout(()=>{warned=true;say('Keine Verbindung zur Datenbank – du arbeitest mit dem zuletzt geladenen Stand. Änderungen werden später übertragen.')},800);
   clearTimeout(retry);retry=setTimeout(()=>flush(),20000);
  }
  startApp();
 }
 boot();
})();
