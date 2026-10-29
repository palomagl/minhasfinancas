// Pure finance helpers. No Firebase, browser state or side effects.
export function parseMoney(value) {
 const input=String(value??"").trim().replace(/\s/g,"");
 if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(input))return NaN;
 const decimal=input.replace(/\./g,"").replace(",",".");
 const result=Number(decimal);
 if(!Number.isFinite(result)||Math.abs(result)>999999999.99)return NaN;
 return Math.round(result*100);
}
export function recurrenceDates(iso,count) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isInteger(count)||count<1||count>24)throw Error("invalid recurrence");
 const [year,month,day]=iso.split("-").map(Number);
 if(month<1||month>12||day<1||day>new Date(year,month,0).getDate())throw Error("invalid date");
 return Array.from({length:count},(_,i)=>{
  const d=new Date(Date.UTC(year,month-1+i,1));
  const y=d.getUTCFullYear(),m=d.getUTCMonth()+1;
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return [y,String(m).padStart(2,"0"),String(Math.min(day,last)).padStart(2,"0")].join("-");
 });
}
export function availableBalance(movements,months) {
 const movementTotal=movements.reduce((s,x)=>s+(x.kind==="income"||x.kind==="adjust"?x.amount:-(x.amount||0)),0);
 const spent=months.flatMap(x=>x.items||[]).filter(x=>x.paid).reduce((s,x)=>s+x.amount,0);
 return movementTotal-spent;
}
