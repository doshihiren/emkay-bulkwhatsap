"use strict";
const fs=require("fs");
const path=require("path");
const ROOT=path.join(__dirname,"..","data");
const JOBS=path.join(ROOT,"scheduled-broadcasts.json");
const STATUSES=path.join(ROOT,"broadcast-status.json");
const phone=x=>String(x||"").replace(/\D/g,"");
const read=p=>{try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return [];}};
const csv=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
function rowsFor(job){
 const events=read(STATUSES), people=new Map((job.recipients||[]).map(r=>[phone(r.phone),r]));
 const start=Date.parse(job.startedAt||job.scheduledAt||job.createdAt)/1000;
 const end=job.finishedAt?Date.parse(job.finishedAt)/1000:Date.now()/1000;
 const latest=new Map();
 for(const e of events){
  const t=Number(e.timestamp),p=phone(e.phone);
  if(!e.id||!people.has(p)||!Number.isFinite(t)||t<start||t>end+86400)continue;
  const old=latest.get(e.id);
  if(!old||t>Number(old.timestamp)||t===Number(old.timestamp)&&({read:4,delivered:3,failed:2,sent:1}[e.status]||0)>({read:4,delivered:3,failed:2,sent:1}[old.status]||0))latest.set(e.id,e);
 }
 const byPhone=new Map();
 for(const e of latest.values()){const p=phone(e.phone);if(!byPhone.has(p))byPhone.set(p,[]);byPhone.get(p).push(e);}
 return (job.recipients||[]).map(r=>{
  const ev=byPhone.get(phone(r.phone))||[];
  const statuses=[...new Set(ev.map(e=>e.status))];
  const failures=ev.filter(e=>e.status==="failed");
  return {phone:r.phone,name:r.name||"",status:statuses.join("|")||"unknown",error_codes:[...new Set(failures.map(e=>e.error_code||""))].join("|"),matched_messages:ev.length,confidence:"phone-and-time-only"};
 });
}
module.exports=function(app){
 app.get("/admin/broadcast-report/:id",(req,res)=>{
  const job=read(JOBS).find(j=>j.id===req.params.id);
  if(!job)return res.status(404).json({error:"Campaign not found"});
  const rows=rowsFor(job);
  const counts={};
  for(const r of rows)for(const s of r.status.split("|"))counts[s]=(counts[s]||0)+1;
  res.json({ok:true,campaign:{id:job.id,template:job.template,audience:job.audienceName||"Not recorded",total:job.recipients.length,accepted:job.sent,apiFailed:job.failed,status:job.status},counts,rows,warning:"Historical statuses are matched by phone and time, NOT message ID. They may include other campaigns. Do not automatically retry."});
 });
 app.get("/admin/broadcast-report/:id.csv",(req,res)=>{
  const job=read(JOBS).find(j=>j.id===req.params.id);
  if(!job)return res.status(404).json({error:"Campaign not found"});
  const rows=rowsFor(job);
  const headers=["phone","name","status","error_codes","matched_messages","confidence"];
  const body=[headers.join(","),...rows.map(r=>headers.map(k=>csv(r[k])).join(","))].join("\r\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="broadcast-report-'+job.id+'.csv"');
  res.send("\uFEFF"+body);
 });
};
