// Finanças 2.0 — receitas, saldo e espaços familiares.
// Este módulo usa o Firebase existente, usando coleções exclusivas da v2.
import { parseMoney, recurrenceDates, availableBalance, householdBalance } from "./finance-core.mjs";
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, addDoc, setDoc, updateDoc, arrayUnion, deleteDoc, onSnapshot, query, where, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = s => document.querySelector(s);
const brl = cents => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
const escapeHtml = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toCents = parseMoney;
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x=>x.toString(16).padStart(2,"0")).join("");
const today = () => { const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
let auth,db,user,months=[],movements=[],families=[],familyId=null,familyUnsub=null,familyMembersUnsub=null,familyIncomeUnsub=null,familyExpenses=[],familyIncomes=[],members=[],unsubs=[],mode="family";
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
 overview.hidden=!user;if(!user)return;
 const previousScroll=overview.scrollTop;
 const hasFamily=!!familyId, person=mode==="personal"&&!families.length;
 const income=movements.filter(x=>x.kind==="income").reduce((a,x)=>a+x.amount,0);
 const {income:familyMoney,paid:familyPaid}=householdBalance(familyIncomes,familyExpenses);
 overview.innerHTML=(families.length?"":'<div class="v2-mode"><button id="v2Family" class="'+(!person?"selected":"")+'">Família</button><button id="v2Personal" class="'+(person?"selected":"")+'">Pessoal</button></div>')+
 (person?'<div class="v2-balance"><small>Meu saldo pessoal</small><strong>'+brl(personalBalance())+'</strong><span>Entradas pessoais: '+brl(income)+' · Despesas pagas: '+brl(paidTotal())+'</span></div><div class="v2-actions"><button id="v2Income">+ Entrada</button><button id="v2Adjust">Ajustar saldo</button><button id="v2History">Histórico</button></div>':
 '<div class="v2-balance"><small>Saldo disponível da família</small><strong>'+brl(familyMoney-familyPaid)+'</strong><span class="v2-family-name">'+escapeHtml(families.find(f=>f.id===familyId)?.name||"Minha família")+'</span>'+(hasFamily?'<button id="v2Families" type="button" class="v2-balance-manage">Pessoas e convites ›</button>':'')+'<div class="v2-balance-details"><span>Recebido <b>'+brl(familyMoney)+'</b></span><span>Pago <b>'+brl(familyPaid)+'</b></span></div></div><div class="v2-actions">'+(hasFamily?'<button id="v2FamilyIncome">+ Entrada</button><button id="v2NewFamilyExpense">+ Conta</button>':'<button id="v2Families">Criar ou entrar na família</button>')+'</div><div id="v2FamilyList"></div>');
 if(!families.length){$("#v2Personal").onclick=()=>switchMode("personal");$("#v2Family").onclick=()=>switchMode("family");}
 if(person){$("#v2Income").onclick=incomeForm;$("#v2Adjust").onclick=adjustForm;$("#v2History").onclick=historyView;}
 else{ $("#v2Families").onclick=familyManager;if(hasFamily){$("#v2FamilyIncome").onclick=familyIncomeForm;$("#v2NewFamilyExpense").onclick=familyExpenseForm;}renderFamilyList();}
 $("#app").classList.toggle("family-view",!person);
 $("#addBtn").hidden=!person;$("#list").hidden=!person;$("#app .summary").hidden=!person;$("#app .month").hidden=false;
 overview.scrollTop=previousScroll;
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
 unsubs.push(onSnapshot(query(collection(db,"v2_families"),where("memberIds","array-contains",user.uid)),snap=>{families=snap.docs.map(d=>({id:d.id,...d.data()}));if(families.length)mode="family";if(familyId&&!families.some(f=>f.id===familyId))selectFamily(null);if(!familyId&&families.length)selectFamily(families[0].id);else updateOverview();},err=>console.error(err)));
}
function selectFamily(id){
 familyUnsub?.();familyMembersUnsub?.();familyIncomeUnsub?.();familyId=id;familyExpenses=[];familyIncomes=[];members=[];
 if(id){
 familyUnsub=onSnapshot(collection(db,"v2_families",id,"expenses"),s=>{familyExpenses=s.docs.map(d=>({id:d.id,...d.data()}));updateOverview();},e=>console.error(e));
 familyIncomeUnsub=onSnapshot(collection(db,"v2_families",id,"incomes"),snap=>{familyIncomes=snap.docs.map(d=>({id:d.id,...d.data()}));updateOverview();},err=>{console.error("Entradas da família:",err);notify("Não foi possível carregar as entradas da família.");});
 familyMembersUnsub=onSnapshot(collection(db,"v2_families",id,"members"),s=>{members=s.docs.map(d=>({id:d.id,...d.data()}));renderFamilyList();},e=>console.error(e));
 }
 updateOverview();
}
function renderFamilyList(){
 const el=$("#v2FamilyList");if(!el||mode!=="family")return;
 const month=selectedMonth();
 const expenses=familyExpenses.filter(x=>(x.date||"").startsWith(month));
 const incomes=familyIncomes.filter(x=>(x.date||"").startsWith(month));
 const incomeTotal=incomes.reduce((sum,x)=>sum+(x.amount||0),0);
 const pending=expenses.filter(x=>x.paid!==true).reduce((sum,x)=>sum+(x.amount||0),0);
 const dateLabel=iso=>iso&&/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso.slice(8,10)+"/"+iso.slice(5,7):"";
 const row=(item,type)=>{
  const isIncome=type==="incomes",done=item.paid===true;
  const date=dateLabel(item.date);
  const subtitle=isIncome?"De "+escapeHtml(item.personName||"Família")+(date?" · "+date:""):done?"Pago por "+escapeHtml(item.payerName||"Membro")+(date?" · "+date:""):"A pagar"+(date?" · "+date:"");
  const id=escapeHtml(item.id);
  const action=isIncome?"data-open-income":"data-open-expense";
  return '<div class="v2-transaction"><button type="button" class="v2-transaction-main" '+action+'="'+id+'" aria-label="'+(isIncome?"Editar entrada ":"Editar despesa ")+escapeHtml(item.description)+'"><span class="v2-transaction-icon '+(isIncome?"v2-icon-income":done?"v2-icon-paid":"v2-icon-bill")+'" aria-hidden="true">'+(isIncome?"↑":done?"✓":"↓")+'</span><span class="v2-transaction-info"><strong>'+escapeHtml(item.description)+'</strong><small>'+subtitle+'</small></span><span class="v2-transaction-amount '+(isIncome?"v2-money-income":"")+'">'+(isIncome?"+":"")+brl(item.amount)+'</span><span class="v2-transaction-chevron" aria-hidden="true">›</span></button>'+(!isIncome&&!done?'<button type="button" class="v2-pay-now" data-paid="'+id+'">Marcar como paga</button>':'')+'</div>';
 };
 const bills=expenses.slice().sort((a,b)=>(Number(a.paid===true)-Number(b.paid===true))||(a.date||"").localeCompare(b.date||"")).map(x=>row(x,"expenses")).join("");
 const entries=incomes.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(x=>row(x,"incomes")).join("");
 el.innerHTML='<div class="v2-section-head"><h3 class="v2-section-title">Contas da casa</h3><span class="v2-pending-total">'+(pending>0?'A pagar '+brl(pending):'Tudo em dia ✓')+'</span></div>'+(bills||'<p class="v2-empty">Nenhuma conta neste mês.</p>')+'<div class="v2-section-head"><h3 class="v2-section-title">Dinheiro que entrou</h3><span class="v2-income-total">'+brl(incomeTotal)+'</span></div>'+(entries||'<p class="v2-empty">Nenhuma entrada neste mês.</p>');
 el.querySelectorAll("[data-paid]").forEach(btn=>btn.onclick=()=>markFamilyPaid(btn.dataset.paid));
 el.querySelectorAll("[data-open-income]").forEach(btn=>btn.onclick=()=>editFamilyEntry("incomes",btn.dataset.openIncome));
 el.querySelectorAll("[data-open-expense]").forEach(btn=>btn.onclick=()=>editFamilyEntry("expenses",btn.dataset.openExpense));
}
function confirmDeleteFamilyEntry(type,id){
 const isIncome=type==="incomes";
 const item=(isIncome?familyIncomes:familyExpenses).find(x=>x.id===id);
 if(!item)return notify("Este lançamento não está mais disponível.");
 const category=isIncome?"entrada":"despesa";
 show("Apagar "+category+"?",'<div class="v2-delete-confirm"><p>Tem certeza que quer apagar <strong>'+escapeHtml(item.description)+'</strong> de <strong>'+brl(item.amount)+'</strong>?</p><p class="v2-helper">Isso remove o lançamento do saldo compartilhado e dos celulares da família. Não é possível desfazer.</p><button id="v2ConfirmDelete" class="v2-danger-confirm">Sim, apagar</button><button id="v2CancelDelete">Manter lançamento</button></div>');
 $("#v2CancelDelete").onclick=()=>root.hidden=true;
 $("#v2ConfirmDelete").onclick=async()=>{
  const button=$("#v2ConfirmDelete");button.disabled=true;button.textContent="Apagando…";
  try{
   await deleteDoc(doc(db,"v2_families",familyId,type,id));
   root.hidden=true;notify("Lançamento apagado.");
  }catch(err){
   console.error("Apagar lançamento:",err);
   button.disabled=false;button.textContent="Sim, apagar";
   notify(err?.code==="permission-denied"?"Sem permissão para apagar. Confira as regras do Firebase.":"Não foi possível apagar. Confira sua conexão.");
  }
 };
}
function editFamilyEntry(type,id){
 const isIncome=type==="incomes";
 const item=(isIncome?familyIncomes:familyExpenses).find(x=>x.id===id);
 if(!item)return notify("Registro não encontrado.");
 const people=members.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name||"Membro")+'</option>').join("");
 const personId=isIncome?item.personId:item.payerId;
 show(isIncome?"Editar entrada":"Editar conta",'<form id="v2Form">'+moneyInput("Valor (R$)")+'<label>Descrição<input id="v2Desc" maxlength="80" required></label><label>'+(isIncome?"Quem recebeu?":"Quem pagou ou vai pagar?")+'<select id="v2EditPerson">'+people+(isIncome?"":'<option value="shared">Pagamos juntos</option>')+'</select></label><details class="v2-advanced"><summary>Alterar data</summary><label>Data<input id="v2EditDate" type="date" required></label></details><button class="v2-primary">Salvar alterações</button></form><button type="button" id="v2DeleteFromEdit" class="v2-delete-link">Apagar este lançamento</button>');
 $("#v2Desc").value=item.description||"";
 $("#v2Amount").value=(item.amount/100).toFixed(2).replace(".",",");
 $("#v2EditDate").value=item.date||today();
 $("#v2EditPerson").value=personId||members[0]?.id||"";
 $("#v2DeleteFromEdit").onclick=()=>confirmDeleteFamilyEntry(type,id);
 $("#v2Form").onsubmit=async e=>{
  e.preventDefault();
  const amount=toCents(formValue("v2Amount")),description=formValue("v2Desc"),date=formValue("v2EditDate"),chosen=formValue("v2EditPerson");
  if(!(amount>0&&amount<=99999999999&&description.length<=80&&description&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&chosen))return notify("Revise os dados informados.");
  const btn=$("#v2Form .v2-primary");btn.disabled=true;btn.textContent="Salvando…";
  const name=chosen==="shared"?"Pagamos juntos":members.find(m=>m.id===chosen)?.name||"Membro";
  const patch=isIncome?{amount,description,date,personId:chosen,personName:name}:{amount,description,date,payerId:chosen,payerName:name};
  try{await updateDoc(doc(db,"v2_families",familyId,type,id),patch);root.hidden=true;notify("Alterações salvas.");}
  catch(err){console.error("Editar registro:",err);btn.disabled=false;btn.textContent="Salvar alterações";notify("Não foi possível editar. Confira as permissões do Firebase.");}
 };
}
function familyIncomeForm(){
 if(!familyId)return familyManager();
 if(!members.length)return notify("Carregando participantes. Tente novamente.");
 const options=members.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name||"Membro")+'</option>').join("");
 show("Adicionar dinheiro",'<form id="v2Form">'+moneyInput("Quanto entrou? (R$)")+'<label>De onde veio?<input id="v2Desc" maxlength="80" placeholder="Salário, Pix, venda..." required></label><label>Quem recebeu?<select id="v2Person">'+options+'</select></label><details class="v2-advanced"><summary>Alterar data</summary><label>Data da entrada<input id="v2IncomeDate" type="date" value="'+(today().startsWith(selectedMonth())?today():selectedMonth()+"-01")+'" required></label></details><button class="v2-primary">Adicionar entrada</button></form>');
 $("#v2Person").value=members.some(m=>m.id===user.uid)?user.uid:members[0].id;
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const amount=toCents(formValue("v2Amount")),description=formValue("v2Desc"),personId=formValue("v2Person"),incomeDate=formValue("v2IncomeDate");if(!(amount>0&&amount<=99999999999&&description&&personId&&/^\d{4}-\d{2}-\d{2}$/.test(incomeDate)))return notify("Preencha valor, descrição e pessoa.");
 const btn=$("#v2Form .v2-primary");btn.disabled=true;btn.textContent="Salvando…";
 try{await addDoc(collection(db,"v2_families",familyId,"incomes"),{amount,description,personId,personName:members.find(m=>m.id===personId)?.name||"Membro",date:incomeDate,createdBy:user.uid,createdAt:serverTimestamp()});root.hidden=true;notify("Entrada adicionada ao saldo da família.");}
 catch(err){console.error(err);btn.disabled=false;btn.textContent="Salvar entrada";notify("Não foi possível salvar. Verifique as regras do Firebase.");}};
}
function markFamilyPaid(id){
 const exp=familyExpenses.find(x=>x.id===id);if(!exp||exp.paid===true)return;
 const options=members.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name||"Membro")+'</option>').join("");
 show("Confirmar pagamento",'<p><strong>'+escapeHtml(exp.description)+'</strong> · '+brl(exp.amount)+'</p><form id="v2Form"><label>Quem pagou?<select id="v2Payer">'+options+'<option value="shared">Pagamos juntos</option></select></label><button class="v2-primary">Confirmar pagamento</button></form>');
 $("#v2Form").onsubmit=async e=>{e.preventDefault();const payerId=formValue("v2Payer");const btn=$("#v2Form .v2-primary");btn.disabled=true;btn.textContent="Confirmando…";
 try{await updateDoc(doc(db,"v2_families",familyId,"expenses",id),{paid:true,payerId,payerName:payerId==="shared"?"Pagamos juntos":members.find(m=>m.id===payerId)?.name||"Membro"});root.hidden=true;notify("Pagamento registrado.");}
 catch(err){console.error(err);btn.disabled=false;btn.textContent="Confirmar pagamento";notify("Não foi possível registrar o pagamento.");}};
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
 const inv=await getDoc(doc(db,"v2_invites",code));if(!inv.exists()||!inv.data().active||inv.data().expiresAt<Date.now()){btn.disabled=false;btn.textContent="Entrar";return notify("Convite inválido ou expirado.");}
 const fid=inv.data().familyId;
 await setDoc(doc(db,"v2_families",fid,"members",user.uid),{name:user.displayName||"Membro",inviteId:code,joinedAt:serverTimestamp()});
 await updateDoc(doc(db,"v2_families",fid),{memberIds:arrayUnion(user.uid)});
 selectFamily(fid);root.hidden=true;notify("Você entrou na família.");
 }catch(err){console.error(err);btn.disabled=false;btn.textContent="Entrar";notify("Não foi possível entrar. Confira o código.");}};
}
function familyExpenseForm(){
 if(!familyId)return familyManager();
 if(!members.length)return notify("Carregando participantes da família. Tente novamente.");
 const options=members.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name||"Membro")+'</option>').join("");
 const month=selectedMonth();
 const defaultDate=today().startsWith(month)?today():month+"-01";
 show("Adicionar conta",'<form id="v2Form"><label>O que precisa pagar?<input id="v2Desc" maxlength="80" placeholder="Luz, mercado, aluguel..." required></label>'+moneyInput("Qual o valor? (R$)")+'<label id="v2PayerLabel">Quem vai pagar?<select id="v2Payer" required>'+options+'<option value="shared">Pagamos juntos</option></select></label><label class="v2-repeat"><input id="v2Paid" type="checkbox"> Já foi paga</label><details class="v2-advanced"><summary>Data, conta fixa ou parcelas</summary><label>Data<input type="date" id="v2Date" value="'+defaultDate+'" required></label><label class="v2-repeat"><input id="v2Recurring" type="checkbox"> Repetir em outros meses</label><div id="v2RepeatBox" hidden><label>Repetição<select id="v2RepeatType"><option value="fixed">Todo mês (próximos 12)</option><option value="installments">Parcelas</option></select></label><label id="v2CountRow" hidden>Quantas parcelas?<input id="v2Count" type="number" min="2" max="24" value="6"></label><p class="v2-helper">Os próximos meses serão criados automaticamente.</p></div></details><button class="v2-primary">Adicionar conta</button></form>');
 $("#v2Payer").value=members.some(m=>m.id===user.uid)?user.uid:members[0].id;
 $("#v2Paid").onchange=()=>{const label=$("#v2PayerLabel");if(label)label.firstChild.textContent=$("#v2Paid").checked?"Quem pagou?":"Quem vai pagar?";};
 $("#v2Recurring").onchange=()=>{$("#v2RepeatBox").hidden=!$("#v2Recurring").checked;};
 $("#v2RepeatType").onchange=()=>{$("#v2CountRow").hidden=$("#v2RepeatType").value!=="installments";};

 $("#v2Form").onsubmit=async e=>{e.preventDefault();const amount=toCents(formValue("v2Amount")),description=formValue("v2Desc"),payerId=formValue("v2Payer"),date=formValue("v2Date");if(!(amount>0&&amount<=99999999999&&description&&/^\d{4}-\d{2}-\d{2}$/.test(date)))return notify("Informe descrição, valor e data.");
 const btn=$("#v2Form button[type=submit],#v2Form button.v2-primary");btn.disabled=true;btn.textContent="Salvando…";
 try{
  const repeating=$("#v2Recurring").checked;
  const paid=$("#v2Paid").checked;
  const kind=repeating?$("#v2RepeatType").value:"once";
  const count=kind==="fixed"?12:kind==="installments"?Number($("#v2Count").value):1;
  if(!Number.isInteger(count)||count<1||count>24||(kind==="installments"&&count<2)){btn.disabled=false;btn.textContent="Salvar despesa";return notify("Escolha entre 2 e 24 parcelas.");}
  const batch=writeBatch(db);
  const col=collection(db,"v2_families",familyId,"expenses");
  const dates=recurrenceDates(date,count);
  for(let i=0;i<dates.length;i++){
   const due=dates[i];
   const suffix=kind==="installments"?" ("+(i+1)+"/"+count+")":"";
   const label=description.slice(0,80-suffix.length)+suffix;
   const ref=doc(col);
   batch.set(ref,{amount,description:label,payerId,payerName:payerId==="shared"?"Pagamos juntos":members.find(m=>m.id===payerId)?.name||"Membro",split:"none",paid:paid&&i===0,createdBy:user.uid,date:due,createdAt:serverTimestamp()});
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
