"use strict";
const fs=require("fs"),path=require("path"),XLSX=require("xlsx");
const {msgStore}=require("./store");
const root=path.resolve(__dirname,"..");
function normalize(v){let p=String(v||"").replace(/\D/g,"");return p.length===10?"91"+p:p;}
function report(){
 const names=new Map(),dir=path.join(root,"uploads/csv");
 const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^drive_[\w-]+\.csv$/i.test(f)).sort():[];
 for(const file of files){
  const wb=XLSX.read(fs.readFileSync(path.join(dir,file),"utf8"),{type:"string",raw:true});
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
  for(const [p,n] of rows.slice(1)){const k=normalize(p),name=String(n||"").trim();if(k&&name&&name!=="Valued Customer"&&!names.has(k))names.set(k,{name,file});}
 }
 let profiles={};try{profiles=JSON.parse(fs.readFileSync(path.join(root,"data/contacts.json"),"utf8"));}catch(e){if(e.code!=="ENOENT")throw e;}
 const profileMap=new Map(Object.entries(profiles).map(([p,n])=>[normalize(p),typeof n==="string"?n:""]));
 const grouped=new Map();
 for(const m of msgStore){
  if(m.isSent||["sent","outgoing","out"].includes(m.type)||/^\s*(?:📤\s*)?YOU:/i.test(String(m.text||"")))continue;
  const p=normalize(m.phone);if(!/^\d{11,15}$/.test(p))continue;
  if(!grouped.has(p))grouped.set(p,[]);
  grouped.get(p).push(m);
 }
 const fmt=t=>Number.isFinite(Number(t))&&Number(t)>0?new Date(Number(t)*1000).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"";
 const rows=[...grouped].map(([p,ms])=>{
  ms.sort((a,b)=>Number(a.ts)-Number(b.ts));
  const last=ms[ms.length-1],match=names.get(p);
  return {phone:p,displayName:profileMap.get(p)||last.name||"",sheetName:match?.name||"",audience:match?.file||"",messages:ms.map(m=>fmt(m.ts)+" | "+String(m.text||m.intId||"[message]")).join("\n"),lastReply:fmt(last.ts),totalReplies:ms.length,sort:Number(last.ts)||0};
 }).sort((a,b)=>b.sort-a.sort);
 return {rows,files,matched:rows.filter(r=>r.sheetName).length};
}
const cell=v=>{let s=String(v??"");if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
module.exports=function(app){
 app.get("/admin/replied-contacts-report",(req,res)=>{
  try{const r=report();res.set("Cache-Control","no-store");res.json({ok:true,total:r.rows.length,matched:r.matched,files:r.files});}catch(e){res.status(500).json({error:"Unable to build report"});}
 });
 app.get("/admin/replied-contacts-report.csv",(req,res)=>{
  try{const r=report();const headers=["Mobile Number","WhatsApp Display Name (stored)","Google Drive Customer Name","Audience List","Received Messages","Last Reply (IST)","Total Replies"];
  const body=[headers.map(cell).join(","),...r.rows.map(x=>[x.phone,x.displayName,x.sheetName,x.audience,x.messages,x.lastReply,x.totalReplies].map(cell).join(","))].join("\r\n");
  res.set("Cache-Control","no-store");res.set("Content-Type","text/csv; charset=utf-8");res.set("Content-Disposition",'attachment; filename="emkay-replied-contacts.csv"');res.send("\uFEFF"+body);
  }catch(e){res.status(500).json({error:"Unable to build report"});}
 });
};
