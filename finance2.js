// Finanças 2.0 — receitas, saldo e espaços familiares.
// Este módulo usa o Firebase existente, usando coleções exclusivas da v2.
import { parseMoney, recurrenceDates, availableBalance } from "./finance-core.mjs";
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, addDoc, setDoc, updateDoc, arrayUnion, deleteDoc, onSnapshot, query, where, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = s => document.querySelector(s);
const brl = cents => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
const escapeHtml = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toCents = parseMoney;
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x=>x.toString(16).padStart(2,"0")).join("");
const today = () => { const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
let auth,db,user,months=[],movements=[],families=[],familyId=null,familyUnsub=null,familyMembersUnsub=null,familyExpenses=[],members=[],unsubs=[],mode="personal";
const root=document.createElement("section");root.id="v2Panel";root.className="v2-panel";root.hidden=true;document.body.append(root);
const overview=document.createElement("div");overview.id="v2Overview";overview.className="v2-overview";overview.hidden=true;
$("#notice")?.after(overview);
function notify(t){const n=$("#toast");if(n){n.textContent=t;n.hidden=false;setTimeout(()=>{n.hidden=true},3500);}else alert(t);}
function show(title,content){
 root.hidden=false;
 root.innerHTML='<div class="v2-dialog"><header class="v2-heading"><h2>'+escapeHtml(title)+'</h2><button id="v2Close" aria-label="Fechar">×</button></header><div class="v2-body">'+content+'</div></div>';
 $("#v2Close").onclick=()=>{root.hidden=true};
}
function formValue(id){return root.querySelector("#"+id)?.value?.trim()||"";}
function paidTotal(){return months.flatMap(x=>x.items||[]).filter(x=>x.paid).reduce((sum,x)=>sum+(x.amount||0),0);}
function personalBalance(){return availableBalance(movements,months);}
function updateOverview(){
 const personal=mode==="personal";
 overview.hidden=!user;
 if(!user)return;
 const income=movements.filter(x=>x.kind==="income").reduce((s,x)=>s+x.amount,0);
 overview.innerHTML='<div class="v2-mode"><button id="v2Personal" class="'+(personal?"selected":"")+'">Pessoal</button><button id="v2Family" class="'+(!personal?"selected":"")+'">Família</button></div>'+
 (personal?'<div class="v2-balance"><small>Meu saldo disponível</small><strong>'+brl(personalBalance())+'</strong><span>Entradas: '+brl(income)+' · Despesas pagas: '+brl(paidTotal())+'</span></div><div class="v2-actions"><button id="v2Income">+ Entrada</button><button id="v2Adjust">Ajustar saldo</button><button id="v2History">Histórico</button></div>':
 '<div class="v2-balance"><small>Espaço compartilhado</small><strong>'+escapeHtml(families.find(f=>f.id===familyId)?.name||"Minha família")+'</strong><span>Registre as contas da casa e quem pagou.</span></div><div class="v2-actions"><button id="v2Families">Gerenciar família</button>'+(familyId?'<button id="v2NewFamilyExpense">+ Despesa</button>':'')+'</div><div id="v2FamilyList"></div>');
 $("#v2Personal").onclick=()=>switchMode("personal");
 $("#v2Family").onclick=()=>switchMode("family");
 if(personal){
 $("#v2Income").onclick=incomeForm;
 $("#v2Adjust").onclick=adjustForm;
 $("#v2History").onclick=historyView;
 }else{
 $("#v2Families").onclick=familyManager;
 if(familyId)$("#v2NewFamilyExpense").onclick=familyExpenseForm;
 renderFamilyList();
 }
 // O formulário original de despesas deve ser usado só no espaço pessoal.
 $("#addBtn").hidden=!personal;
 $("#list").hidden=!personal;
 $("#app .summary").hidden=!personal;
 $("#app .month").hidden=false;
}
function switchMode(m){mode=m;updateOverview();}
// Month navigation is shared by Pessoal and Família.
["prevBtn","nextBtn"].forEach(id=>$("#"+id)?.addEventListener("click",()=>setTimeout(renderFamilyList,0)));
function selectedMonth(){
 const label=$("#monthLabel")?.textContent||"";
 const names=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
 const month=names.findIndex(n=>label.toLocaleLowerCase("pt-BR").includes(n));
 const year=label.match(/20\d{2}/);
 return year&&month>=0 ? year[0]+"-"+String(month+1).padStart(2,"0") : today().slice(0,7);
}
function moneyInput(label){return '<label>'+label+'<input id="v2Amount" inputmode="decimal" placeholder="Ex.: 1500,00" required></label>';}
function incomeForm(){
 show("Nova entrada",'<form id="v2Form">'+moneyInput("Valor (R$)")+'<label>Descrição<input id="v2Desc" maxlength="80" placeholder="Salário, Pix recebido..." required></label><button class="v2-primary">Salvar entrada</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const amount=toCents(formValue("v2Amount"));const description=formValue("v2Desc");if(!(amount>0&&amount<=99999999999&&description))return notify("Informe valor e descrição.");await saveMovement({kind:"income",amount,description});};
}
function adjustForm(){
 show("Ajustar saldo",'<p>Informe quanto você tem agora. A diferença será registrada no histórico.</p><form id="v2Form">'+moneyInput("Saldo real (R$)")+'<button class="v2-primary">Salvar ajuste</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const target=toCents(formValue("v2Amount"));if(!Number.isSafeInteger(target)||Math.abs(target)>99999999999)return notify("Saldo inválido.");await saveMovement({kind:"adjust",amount:target-personalBalance(),description:"Ajuste de saldo"});};
}
async function saveMovement(data){try{await addDoc(collection(db,"v2_users",user.uid,"movements"),{...data,date:today(),createdAt:serverTimestamp()});root.hidden=true;notify("Salvo com sucesso.");}catch(err){console.error(err);notify("Não foi possível salvar.");}}
function historyView(){
 const items=[...movements].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
 show("Entradas e ajustes",items.length?items.map(x=>'<div class="v2-entry"><span>'+escapeHtml(x.description)+'<small>'+escapeHtml(x.date||"")+'</small></span><b>'+brl(x.amount)+'</b><button data-del="'+escapeHtml(x.id)+'" aria-label="Excluir">×</button></div>').join(""):'<p>Nenhuma movimentação registrada.</p>');
 root.querySelectorAll("[data-del]").forEach(btn=>btn.onclick=async()=>{if(!confirm("Excluir esta movimentação? O saldo será recalculado."))return;try{await deleteDoc(doc(db,"v2_users",user.uid,"movements",btn.dataset.del));historyView();}catch(e){notify("Falha ao excluir.");}});
}
function watchPersonal(){
 unsubs.forEach(fn=>fn());unsubs=[];
 unsubs.push(onSnapshot(collection(db,"v2_users",user.uid,"months"),snap=>{months=snap.docs.map(d=>d.data());updateOverview();},err=>console.error(err)));
 unsubs.push(onSnapshot(collection(db,"v2_users",user.uid,"movements"),snap=>{movements=snap.docs.map(d=>({id:d.id,...d.data()}));updateOverview();},err=>{console.error("Movimentações:",err);notify(err?.code==="permission-denied"?"Firestore sem regras v2 publicadas.":"Não foi possível carregar as entradas.");}));
 unsubs.push(onSnapshot(query(collection(db,"v2_families"),where("memberIds","array-contains",user.uid)),snap=>{families=snap.docs.map(d=>({id:d.id,...d.data()}));if(familyId&&!families.some(f=>f.id===familyId))selectFamily(null);if(!familyId&&families.length)selectFamily(families[0].id);else updateOverview();},err=>console.error(err)));
}
function selectFamily(id){
 familyUnsub?.();familyMembersUnsub?.();familyId=id;familyExpenses=[];members=[];
 if(id){
 familyUnsub=onSnapshot(collection(db,"v2_families",id,"expenses"),s=>{familyExpenses=s.docs.map(d=>({id:d.id,...d.data()}));renderFamilyList();},e=>console.error(e));
 familyMembersUnsub=onSnapshot(collection(db,"v2_families",id,"members"),s=>{members=s.docs.map(d=>({id:d.id,...d.data()}));renderFamilyList();},e=>console.error(e));
 }
 updateOverview();
}
function renderFamilyList(){
 const el=$("#v2FamilyList");if(!el)return;
 const month=selectedMonth(), current=familyExpenses.filter(x=>(x.date||"").startsWith(month));
 const total=current.reduce((n,x)=>n+(x.amount||0),0);
 const head='<div class="v2-month-summary"><span>Contas da família neste mês</span><strong>'+brl(total)+'</strong><small>'+current.length+' '+(current.length===1?'despesa':'despesas')+' registradas</small></div>';
 el.innerHTML=head+(current.length?current.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(x=>'<div class="v2-family-item"><b>'+escapeHtml(x.description)+'</b><strong>'+brl(x.amount)+'</strong><small>'+escapeHtml(x.payerId==="shared"?"Pagamento conjunto":(x.payerName||"Membro")+" pagou")+' · '+escapeHtml(x.split==="equal"?"Divisão igual entre membros":"Sem acerto entre membros")+'</small></div>').join(""):'<p class="v2-empty">Nenhuma despesa da família neste mês. Toque em “+ Despesa” para registrar a primeira.</p>');
}
function familyManager(){
 const f=families[0];
 if(f && !familyId) selectFamily(f.id);
 show("Minha família",'<div class="v2-stack">'+(f?'<div class="v2-family-summary"><strong>'+escapeHtml(f.name)+'</strong><small>Seu espaço compartilhado</small></div><button id="v2Invite">Convidar pessoa</button>':'<p>Organize contas e despesas com quem mora com você.</p><button id="v2Create">Criar família</button><button id="v2Join">Entrar com código</button>')+'</div>');
 if(f) $("#v2Invite").onclick=inviteFamily;
 else {$("#v2Create").onclick=createFamilyForm;$("#v2Join").onclick=joinFamilyForm;}
}
function createFamilyForm(){
 if(families.length){notify("Você já participa de uma família.");return;}
 show("Criar família",'<form id="v2Form"><label>Nome<input id="v2Name" maxlength="50" placeholder="Nossa casa" required></label><button class="v2-primary">Criar família</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const name=formValue("v2Name");if(!name)return;if(families.length)return notify("Você já tem uma família.");const btn=$("#v2Form button");btn.disabled=true;btn.textContent="Criando família…";try{
 const ref=doc(collection(db,"v2_families"));await setDoc(ref,{name,ownerId:user.uid,memberIds:[user.uid],createdAt:serverTimestamp()});
 await setDoc(doc(db,"v2_families",ref.id,"members",user.uid),{name:user.displayName||"Eu",joinedAt:serverTimestamp()});
 selectFamily(ref.id);root.hidden=true;notify("Família criada.");
 }catch(err){btn.disabled=false;btn.textContent="Criar família";console.error("Criar família:",err);notify(err?.code==="permission-denied"?"Sem permissão no Firestore. Publique as regras da versão 2.0 na aba Regras do Firebase.":"Não foi possível criar família: "+(err?.code||"verifique a conexão"));}};
}
async function inviteFamily(){
 const f=families.find(x=>x.id===(familyId||families[0]?.id));if(!f)return;
 if(!familyId)selectFamily(f.id);
 if(f.ownerId!==user.uid)return notify("Somente o administrador pode convidar.");
 try{
 const btn=$("#v2Invite");if(btn){btn.disabled=true;btn.textContent="Gerando convite…";}
 const code=randomCode();
 await setDoc(doc(db,"v2_invites",code),{familyId,ownerId:user.uid,expiresAt:Date.now()+23*60*60*1000,active:true});
 show("Convidar pessoa",'<p>Envie este código à pessoa. Ele expira em 23 horas.</p><div class="v2-code">'+escapeHtml(code)+'</div><button id="v2Copy" class="v2-primary">Copiar código</button>');
 $("#v2Copy").onclick=async()=>{
   const btn=$("#v2Copy");
   try {
     await navigator.clipboard.writeText(code);
     btn.textContent="✓ Código copiado!";
     btn.setAttribute("aria-label","Código copiado!");
     notify("Código copiado!");
   } catch(e) {
     console.error("Copiar convite:",e);
     notify("Não foi possível copiar automaticamente. Selecione o código para copiar.");
   }
 };
 }catch(err){console.error("Convite:",err);notify(err?.code==="permission-denied"?"Firebase recusou o convite. Verifique as regras publicadas.":"Não foi possível criar convite: "+(err?.code||"verifique a conexão"));const btn=$("#v2Invite");if(btn){btn.disabled=false;btn.textContent="Convidar pessoa";}}
}
function joinFamilyForm(){
 if(families.length){notify("Você já participa de uma família.");return;}
 show("Entrar na família",'<form id="v2Form"><label>Código do convite<input id="v2Code" autocomplete="off" required placeholder="Cole o código recebido"></label><button class="v2-primary">Entrar</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const code=formValue("v2Code").toLowerCase();if(!/^[a-f0-9]{32}$/.test(code))return notify("Código inválido.");if(families.length)return notify("Você já tem uma família.");const btn=$("#v2Form button");btn.disabled=true;btn.textContent="Entrando…";try{
 const inv=await getDoc(doc(db,"v2_invites",code));if(!inv.exists()||!inv.data().active||inv.data().expiresAt<Date.now())return notify("Convite inválido ou expirado.");
 const fid=inv.data().familyId;
 await setDoc(doc(db,"v2_families",fid,"members",user.uid),{name:user.displayName||"Membro",inviteId:code,joinedAt:serverTimestamp()});
 await updateDoc(doc(db,"v2_families",fid),{memberIds:arrayUnion(user.uid)});
 selectFamily(fid);root.hidden=true;notify("Você entrou na família.");
 }catch(err){console.error(err);btn.disabled=false;btn.textContent="Entrar";notify("Não foi possível entrar. Confira o código.");}};
}
function familyExpenseForm(){
 if(!familyId)return familyManager();
 if(!members.length){notify("Carregando participantes da família. Tente novamente.");return;}
 const options=members.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name||"Membro")+'</option>').join("");
 const month=selectedMonth();
 const defaultDate=today().startsWith(month)?today():month+"-01";
 show("Nova despesa da família",'<p class="v2-helper">Exemplo: conta de luz de R$ 200, paga pela Marisa. Todos da família poderão ver.</p><form id="v2Form"><label>Descrição<input id="v2Desc" maxlength="80" required placeholder="Ex.: Conta de luz"></label>'+moneyInput("Valor (R$)")+'<label>Data<input type="date" id="v2Date" value="'+defaultDate+'" required></label><label>Quem pagou esta conta?<select id="v2Payer" required>'+options+'<option value="shared">Pagamos juntos</option></select></label><label>Como considerar a divisão?<select id="v2Split"><option value="none">Só registrar quem pagou</option><option value="equal">Dividir igualmente entre membros</option></select></label><label class="v2-repeat"><input id="v2Recurring" type="checkbox"> Conta fixa / repetir mensalmente</label><div id="v2RepeatBox" hidden><label>Tipo de repetição<select id="v2RepeatType"><option value="fixed">Conta fixa (próximos 12 meses)</option><option value="installments">Parcelada (quantidade de parcelas)</option></select></label><label id="v2CountRow" hidden>Quantas parcelas?<input id="v2Count" type="number" min="2" max="24" value="6"></label><p class="v2-helper">Conta fixa: gera os próximos 12 meses. Parcelada: gera apenas a quantidade selecionada. Cada lançamento poderá ser identificado pelo mês.</p></div><p class="v2-helper" id="v2SplitHelp">A despesa aparece para a família, mas não gera cobrança entre pessoas nem desconta outro saldo.</p><button class="v2-primary">Salvar despesa</button></form>');
 $("#v2Recurring").onchange=()=>{$("#v2RepeatBox").hidden=!$("#v2Recurring").checked;};
 $("#v2RepeatType").onchange=()=>{$("#v2CountRow").hidden=$("#v2RepeatType").value!=="installments";};
 $("#v2Split").onchange=()=>{$("#v2SplitHelp").textContent=formValue("v2Split")==="equal"?"A divisão será informativa: ainda não há transferência ou acerto automático de saldos.":"A despesa aparece para a família, mas não gera cobrança entre pessoas nem desconta outro saldo.";};
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const amount=toCents(formValue("v2Amount")),description=formValue("v2Desc"),payerId=formValue("v2Payer"),split=formValue("v2Split"),date=formValue("v2Date");if(!(amount>0&&amount<=99999999999&&description&&/^\d{4}-\d{2}-\d{2}$/.test(date)))return notify("Informe descrição, valor e data.");
 const btn=$("#v2Form button[type=submit],#v2Form button.v2-primary");btn.disabled=true;btn.textContent="Salvando…";
 try{
  const repeating=$("#v2Recurring").checked;
  const kind=repeating?$("#v2RepeatType").value:"once";
  const count=kind==="fixed"?12:kind==="installments"?Number($("#v2Count").value):1;
  if(!Number.isInteger(count)||count<1||count>24||(kind==="installments"&&count<2)){btn.disabled=false;btn.textContent="Salvar despesa";return notify("Escolha entre 2 e 24 parcelas.");}
  const batch=writeBatch(db);
  const col=collection(db,"v2_families",familyId,"expenses");
  const dates=recurrenceDates(date,count);
  for(let i=0;i<dates.length;i++){
   const due=dates[i];
   const label=kind==="installments"?description+" ("+(i+1)+"/"+count+")":description;
   const ref=doc(col);
   batch.set(ref,{amount,description:label,payerId,payerName:payerId==="shared"?"Pagamos juntos":members.find(m=>m.id===payerId)?.name||"Membro",split,createdBy:user.uid,date:due,createdAt:serverTimestamp()});
  }
  await batch.commit();
  root.hidden=true;notify(count===1?"Despesa da família salva.":count+" meses registrados com sucesso.");
 }catch(err){console.error(err);btn.disabled=false;btn.textContent="Salvar despesa";notify("Não foi possível salvar a despesa.");}};
}
window.financas2={familyManager,incomeForm,historyView};
let financeInitialized=false;
function initializeFinances(){
 if(financeInitialized||!window.FIREBASE_CONFIG)return;
 let app;
 try{app=getApp();}catch{return;}
 financeInitialized=true;
 auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,u=>{
  user=u;unsubs.forEach(fn=>fn());unsubs=[];
  selectFamily(null);months=[];movements=[];families=[];
  if(u)watchPersonal();else{overview.hidden=true;root.hidden=true;}
 });
}
window.addEventListener("financas2:firebase-ready",initializeFinances);
initializeFinances();
