// Finanças 2.0 — receitas, saldo e espaços familiares.
// Este módulo usa o Firebase NOVO da v2, nunca o projeto original.
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, addDoc, setDoc, updateDoc, arrayUnion, deleteDoc, onSnapshot, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = s => document.querySelector(s);
const brl = cents => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
const escapeHtml = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toCents = value => { const s=String(value).trim().replace(/\s/g,"").replace(/\./g,"").replace(",","."); const n=Number(s); return Number.isFinite(n)?Math.round(n*100):NaN; };
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
function personalBalance(){return movements.reduce((sum,x)=>sum+(x.kind==="income"?x.amount:x.kind==="adjust"?x.amount:-(x.amount||0)),0)-paidTotal();}
function updateOverview(){
 const personal=mode==="personal";
 overview.hidden=!user;
 if(!user)return;
 const income=movements.filter(x=>x.kind==="income").reduce((s,x)=>s+x.amount,0);
 overview.innerHTML='<div class="v2-mode"><button id="v2Personal" class="'+(personal?"selected":"")+'">Pessoal</button><button id="v2Family" class="'+(!personal?"selected":"")+'">Família</button></div>'+
 (personal?'<div class="v2-balance"><small>Meu saldo disponível</small><strong>'+brl(personalBalance())+'</strong><span>Entradas: '+brl(income)+' · Despesas pagas: '+brl(paidTotal())+'</span></div><div class="v2-actions"><button id="v2Income">+ Entrada</button><button id="v2Adjust">Ajustar saldo</button><button id="v2History">Histórico</button></div>':
 '<div class="v2-balance"><small>Espaço compartilhado</small><strong>'+(familyId?"Minha família":"Nenhuma família selecionada")+'</strong><span>Despesas e pagamentos em conjunto</span></div><div class="v2-actions"><button id="v2Families">Gerenciar família</button>'+(familyId?'<button id="v2NewFamilyExpense">+ Despesa</button>':'')+'</div><div id="v2FamilyList"></div>');
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
 $("#app .month").hidden=!personal;
}
function switchMode(m){mode=m;updateOverview();}
function moneyInput(label){return '<label>'+label+'<input id="v2Amount" inputmode="decimal" placeholder="Ex.: 1500,00" required></label>';}
function incomeForm(){
 show("Nova entrada",'<form id="v2Form">'+moneyInput("Valor (R$)")+'<label>Descrição<input id="v2Desc" maxlength="80" placeholder="Salário, Pix recebido..." required></label><button class="v2-primary">Salvar entrada</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const amount=toCents(formValue("v2Amount"));const description=formValue("v2Desc");if(!(amount>0&&amount<=99999999999&&description))return notify("Informe valor e descrição.");await saveMovement({kind:"income",amount,description});};
}
function adjustForm(){
 show("Ajustar saldo",'<p>Informe quanto você tem agora. A diferença será registrada no histórico.</p><form id="v2Form">'+moneyInput("Saldo real (R$)")+'<button class="v2-primary">Salvar ajuste</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const target=toCents(formValue("v2Amount"));if(!Number.isSafeInteger(target)||Math.abs(target)>99999999999)return notify("Saldo inválido.");await saveMovement({kind:"adjust",amount:target-personalBalance(),description:"Ajuste de saldo"});};
}
async function saveMovement(data){try{await addDoc(collection(db,"users",user.uid,"movements"),{...data,date:today(),createdAt:serverTimestamp()});root.hidden=true;notify("Salvo com sucesso.");}catch(err){console.error(err);notify("Não foi possível salvar.");}}
function historyView(){
 const items=[...movements].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
 show("Entradas e ajustes",items.length?items.map(x=>'<div class="v2-entry"><span>'+escapeHtml(x.description)+'<small>'+escapeHtml(x.date||"")+'</small></span><b>'+brl(x.amount)+'</b><button data-del="'+escapeHtml(x.id)+'" aria-label="Excluir">×</button></div>').join(""):'<p>Nenhuma movimentação registrada.</p>');
 root.querySelectorAll("[data-del]").forEach(btn=>btn.onclick=async()=>{if(!confirm("Excluir esta movimentação? O saldo será recalculado."))return;try{await deleteDoc(doc(db,"users",user.uid,"movements",btn.dataset.del));historyView();}catch(e){notify("Falha ao excluir.");}});
}
function watchPersonal(){
 unsubs.forEach(fn=>fn());unsubs=[];
 unsubs.push(onSnapshot(collection(db,"users",user.uid,"months"),snap=>{months=snap.docs.map(d=>d.data());updateOverview();},err=>console.error(err)));
 unsubs.push(onSnapshot(collection(db,"users",user.uid,"movements"),snap=>{movements=snap.docs.map(d=>({id:d.id,...d.data()}));updateOverview();},err=>notify("Não foi possível carregar as entradas.")));
 unsubs.push(onSnapshot(query(collection(db,"families"),where("memberIds","array-contains",user.uid)),snap=>{families=snap.docs.map(d=>({id:d.id,...d.data()}));if(familyId&&!families.some(f=>f.id===familyId))selectFamily(null);updateOverview();},err=>console.error(err)));
}
function selectFamily(id){
 familyUnsub?.();familyMembersUnsub?.();familyId=id;familyExpenses=[];members=[];
 if(id){
 familyUnsub=onSnapshot(collection(db,"families",id,"expenses"),s=>{familyExpenses=s.docs.map(d=>({id:d.id,...d.data()}));renderFamilyList();},e=>console.error(e));
 familyMembersUnsub=onSnapshot(collection(db,"families",id,"members"),s=>{members=s.docs.map(d=>({id:d.id,...d.data()}));renderFamilyList();},e=>console.error(e));
 }
 updateOverview();
}
function renderFamilyList(){
 const el=$("#v2FamilyList");if(!el)return;
 el.innerHTML=familyExpenses.length?familyExpenses.map(x=>'<div class="v2-family-item"><b>'+escapeHtml(x.description)+'</b><strong>'+brl(x.amount)+'</strong><small>Pago por: '+escapeHtml(x.payerName||"Não informado")+' · '+escapeHtml(x.split==="equal"?"Dividido igualmente":x.split==="shared"?"Pagamento conjunto":"Sem divisão")+'</small></div>').join(""):'<p class="v2-empty">Nenhuma despesa compartilhada.</p>';
}
function familyManager(){
 show("Minha família",'<div class="v2-stack">'+families.map(f=>'<button class="v2-choice" data-family="'+escapeHtml(f.id)+'">'+escapeHtml(f.name)+'</button>').join("")+'<button id="v2Create">Criar família</button><button id="v2Join">Entrar com código</button>'+(familyId?'<button id="v2Invite">Convidar pessoa</button>':'')+'</div>');
 root.querySelectorAll("[data-family]").forEach(b=>b.onclick=()=>{selectFamily(b.dataset.family);root.hidden=true;});
 $("#v2Create").onclick=createFamilyForm;
 $("#v2Join").onclick=joinFamilyForm;
 if(familyId)$("#v2Invite").onclick=inviteFamily;
}
function createFamilyForm(){
 show("Criar família",'<form id="v2Form"><label>Nome<input id="v2Name" maxlength="50" placeholder="Nossa casa" required></label><button class="v2-primary">Criar família</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const name=formValue("v2Name");if(!name)return;try{
 const ref=doc(collection(db,"families"));await setDoc(ref,{name,ownerId:user.uid,memberIds:[user.uid],createdAt:serverTimestamp()});
 await setDoc(doc(db,"families",ref.id,"members",user.uid),{name:user.displayName||"Eu",joinedAt:serverTimestamp()});
 selectFamily(ref.id);root.hidden=true;notify("Família criada.");
 }catch(err){console.error(err);notify("Falha ao criar família.");}};
}
async function inviteFamily(){
 const f=families.find(x=>x.id===familyId);if(!f)return;
 if(f.ownerId!==user.uid)return notify("Somente o administrador pode convidar.");
 try{
 const code=randomCode();
 await setDoc(doc(db,"invites",code),{familyId,ownerId:user.uid,expiresAt:Date.now()+24*60*60*1000,active:true});
 show("Convidar pessoa",'<p>Envie este código à pessoa. Ele expira em 24 horas.</p><div class="v2-code">'+escapeHtml(code)+'</div><button id="v2Copy" class="v2-primary">Copiar código</button>');
 $("#v2Copy").onclick=async()=>{try{await navigator.clipboard.writeText(code);notify("Código copiado.");}catch(e){notify("Selecione e copie o código.");}};
 }catch(err){console.error(err);notify("Falha ao criar convite.");}
}
function joinFamilyForm(){
 show("Entrar na família",'<form id="v2Form"><label>Código do convite<input id="v2Code" autocomplete="off" required placeholder="Cole o código recebido"></label><button class="v2-primary">Entrar</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const code=formValue("v2Code").toLowerCase();if(!/^[a-f0-9]{32}$/.test(code))return notify("Código inválido.");try{
 const inv=await getDoc(doc(db,"invites",code));if(!inv.exists()||!inv.data().active||inv.data().expiresAt<Date.now())return notify("Convite inválido ou expirado.");
 const fid=inv.data().familyId;
 await setDoc(doc(db,"families",fid,"members",user.uid),{name:user.displayName||"Membro",inviteId:code,joinedAt:serverTimestamp()});
 await updateDoc(doc(db,"families",fid),{memberIds:arrayUnion(user.uid)});
 selectFamily(fid);root.hidden=true;notify("Você entrou na família.");
 }catch(err){console.error(err);notify("Não foi possível entrar. Confira o código.");}};
}
function familyExpenseForm(){
 const options=members.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name||"Membro")+'</option>').join("");
 show("Despesa da família",'<form id="v2Form">'+moneyInput("Valor (R$)")+'<label>Descrição<input id="v2Desc" maxlength="80" required placeholder="Conta de luz"></label><label>Quem pagou?<select id="v2Payer">'+options+'<option value="shared">Pagamos juntos</option></select></label><label>Divisão<select id="v2Split"><option value="equal">Igualmente entre todos</option><option value="none">Apenas registrar</option></select></label><button class="v2-primary">Salvar despesa</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const amount=toCents(formValue("v2Amount")),description=formValue("v2Desc"),payerId=formValue("v2Payer"),split=formValue("v2Split");if(!(amount>0&&amount<=99999999999&&description))return notify("Informe valor e descrição.");
 try{await addDoc(collection(db,"families",familyId,"expenses"),{amount,description,payerId,payerName:payerId==="shared"?"Pagamos juntos":members.find(m=>m.id===payerId)?.name||"Membro",split,createdBy:user.uid,date:today(),createdAt:serverTimestamp()});root.hidden=true;notify("Despesa da família salva.");}catch(err){console.error(err);notify("Falha ao salvar despesa.");}};
}
window.financas2={familyManager,incomeForm,historyView};
if(window.FIREBASE_CONFIG){
 try{const app=getApp();auth=getAuth(app);db=getFirestore(app);onAuthStateChanged(auth,u=>{user=u;unsubs.forEach(fn=>fn());unsubs=[];selectFamily(null);months=[];movements=[];families=[];if(u)watchPersonal();else{overview.hidden=true;root.hidden=true;}});}catch(e){console.error(e);}
}
