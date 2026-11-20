"use strict";
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const axios=require("axios");
const {TOKEN}=require("./messaging");
const PHONE_ID=process.env.WHATSAPP_PHONE_NUMBER_ID || "1082548208284300";
const DIR=path.join(__dirname,"..","data");
const FILE=path.join(DIR,"scheduled-broadcasts.json");
const MAX_RECIPIENTS=10000;
let jobs=[];
let busy=false;
function persist(){
 fs.mkdirSync(DIR,{recursive:true});
 const temp=FILE+"."+process.pid+".tmp";
 fs.writeFileSync(temp,JSON.stringify(jobs,null,2),{mode:0o600});
 fs.renameSync(temp,FILE);
}
function publicJob(j){return {id:j.id,template:j.template,scheduledAt:j.scheduledAt,status:j.status,total:j.recipients.length,sent:j.sent,failed:j.failed,createdAt:j.createdAt,lastError:j.lastError||null};}
function load(){
 try{jobs=JSON.parse(fs.readFileSync(FILE,"utf8"));if(!Array.isArray(jobs))jobs=[];}catch(e){if(e.code!=="ENOENT")console.error("[SCHEDULER LOAD]",e.message);jobs=[];}
 for(const j of jobs){if(j.status==="sending")j.status="paused";} // Never auto-repeat an interrupted campaign
 persist();
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function processJobs(){
 if(busy)return;
 const job=jobs.find(j=>j.status==="scheduled" && Date.parse(j.scheduledAt)<=Date.now());
 if(!job)return;
 busy=true;
 job.status="sending";job.startedAt=new Date().toISOString();persist();
 try{
  for(let i=0;i<job.recipients.length;i++){
   if(job.status==="cancelled")break;
   const r=job.recipients[i];
   const payload=JSON.parse(JSON.stringify(job.templatePayload));
   payload.to=r.phone;
   // Personalize only pre-validated name parameter locations.
   for(const component of payload.template.components||[]){
    for(const param of component.parameters||[]){
     if(param.type==="text" && param.text==="__EMKAY_RECIPIENT_NAME__")param.text=r.name||"Valued Customer";
    }
   }
   try{
    const response=await axios.post("https://graph.facebook.com/v19.0/"+PHONE_ID+"/messages",payload,{headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},timeout:30000});
    if(response.data?.messages?.length)job.sent++;else job.failed++;
   }catch(e){job.failed++;job.lastError=e.response?.data?.error?.message||e.message;}
   job.nextIndex=i+1;persist();
   if(i<job.recipients.length-1)await wait(job.delayMs);
  }
  if(job.status!=="cancelled")job.status="completed";
 }catch(e){job.status="paused";job.lastError=e.message;}
 finally{persist();busy=false;}
}
module.exports=function registerSchedule(app){
 load();
 app.get("/admin/scheduled-broadcasts",(req,res)=>res.json({ok:true,jobs:jobs.map(publicJob).reverse()}));
 app.post("/admin/scheduled-broadcasts",(req,res)=>{
  const b=req.body||{};
  const scheduled=Date.parse(b.scheduledAt);
  if(!Number.isFinite(scheduled)||scheduled<Date.now()+30000||scheduled>Date.now()+365*86400000)return res.status(400).json({error:"Choose a future date and time within one year"});
  if(!Array.isArray(b.recipients)||!b.recipients.length||b.recipients.length>MAX_RECIPIENTS)return res.status(400).json({error:"Invalid recipient count"});
  if(!b.templatePayload||b.templatePayload.type!=="template"||!b.templatePayload.template?.name)return res.status(400).json({error:"Valid approved template payload required"});
  const recipients=b.recipients.map(r=>({phone:String(r.phone||"").replace(/\D/g,""),name:String(r.name||"Valued Customer").slice(0,150)}));
  if(recipients.some(r=>!/^\d{10,15}$/.test(r.phone)))return res.status(400).json({error:"Invalid phone number"});
  const delayMs=Number(b.delayMs);
  if(!Number.isInteger(delayMs)||delayMs<1000||delayMs>60000)return res.status(400).json({error:"Delay must be 1-60 seconds"});
  const j={id:crypto.randomUUID(),template:b.templatePayload.template.name,templatePayload:b.templatePayload,recipients,scheduledAt:new Date(scheduled).toISOString(),status:"scheduled",createdAt:new Date().toISOString(),sent:0,failed:0,nextIndex:0,delayMs};
  jobs.push(j);persist();
  res.status(201).json({ok:true,job:publicJob(j)});
 });
 app.post("/admin/scheduled-broadcasts/:id/cancel",(req,res)=>{
  const j=jobs.find(x=>x.id===req.params.id);
  if(!j)return res.status(404).json({error:"Campaign not found"});
  if(j.status!=="scheduled")return res.status(409).json({error:"Only pending campaigns can be cancelled"});
  j.status="cancelled";persist();res.json({ok:true,job:publicJob(j)});
 });
 setInterval(()=>{processJobs().catch(e=>console.error("[SCHEDULER]",e.message));},10000).unref();
 console.log("[SCHEDULER] Loaded",jobs.length,"campaigns");
};
