import test from "node:test";
import assert from "node:assert/strict";
import { parseMoney, recurrenceDates, availableBalance, householdBalance } from "../finance-core.mjs";
test("Brazilian money and invalid values",()=>{
 assert.equal(parseMoney("1500"),150000);
 assert.equal(parseMoney("1.500,25"),150025);
 assert.equal(parseMoney("0,01"),1);
 assert.equal(parseMoney("-120,20"),-12020);
 for(const x of ["","abc","1,234","1.2","Infinity","999999999999","NaN"])assert.ok(Number.isNaN(parseMoney(x)),x);
});
test("repeat on 31st clamps to month length",()=>{
 assert.deepEqual(recurrenceDates("2026-01-31",3),["2026-01-31","2026-02-28","2026-03-31"]);
 assert.deepEqual(recurrenceDates("2028-01-31",3),["2028-01-31","2028-02-29","2028-03-31"]);
});
test("year rollover and installments",()=>{
 assert.deepEqual(recurrenceDates("2026-11-30",4),["2026-11-30","2026-12-30","2027-01-30","2027-02-28"]);
 assert.equal(recurrenceDates("2026-10-01",12).length,12);
});
test("reject invalid dates and recurrence limits",()=>{
 for(const [date,n] of [["2026-02-30",2],["2026-13-01",2],["2026-10-01",0],["2026-10-01",25],["bad",2]])assert.throws(()=>recurrenceDates(date,n));
});
test("balance only debits paid expenses",()=>{
 const m=[{kind:"income",amount:150000},{kind:"adjust",amount:20000}];
 const months=[{items:[{amount:5000,paid:true},{amount:18000,paid:false}]}];
 assert.equal(availableBalance(m,months),165000);
});
test("negative balance and correction",()=>{
 assert.equal(availableBalance([{kind:"income",amount:1000},{kind:"adjust",amount:-2000}],[]),-1000);
});

test("two salaries combine in one household cash balance",()=>{
 const result=householdBalance([{amount:300000,personName:"Marisa"},{amount:400000,personName:"Wesley"}],[{amount:150000,paid:true,payerName:"Marisa"},{amount:200000,paid:true,payerName:"Wesley"}]);
 assert.deepEqual(result,{income:700000,paid:350000,available:350000});
});
test("unpaid bills never reduce household available balance",()=>{
 const result=householdBalance([{amount:120000}],[{amount:50000,paid:false},{amount:10000}]);
 assert.equal(result.available,120000);
 assert.equal(result.paid,0);
});
test("paid bills are counted exactly once",()=>{
 const expenses=[{amount:10000,paid:false},{amount:10000,paid:true}];
 assert.equal(householdBalance([{amount:30000}],expenses).available,20000);
});
test("cash balance may be negative after payment",()=>{
 assert.equal(householdBalance([{amount:1000}],[{amount:2000,paid:true}]).available,-1000);
});
