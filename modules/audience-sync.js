"use strict";
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const XLSX = require("xlsx");
const FOLDER_ID = "1DPaAmmwe_9BF2y6sukqDeYihLkawrf67";
const OUT = path.resolve(__dirname, "../uploads/csv");

module.exports = function registerAudienceSync(app) {
  let busy = false;
  app.post("/admin/drive-audiences/refresh", async (req, res) => {
    if (busy) return res.status(409).json({error:"Refresh already running"});
    busy = true;
    const results = [];
    try {
      const key = process.env.GOOGLE_DRIVE_API_KEY;
      if (!key) return res.status(503).json({error:"GOOGLE_DRIVE_API_KEY is not configured"});
      const files = [];
      let pageToken;
      do {
        const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
          params: {q:"'"+FOLDER_ID+"' in parents and trashed = false",
            fields:"nextPageToken,files(id,name,mimeType)",pageSize:100,pageToken,key},
          timeout:30000
        });
        files.push(...(response.data.files || []));
        pageToken = response.data.nextPageToken;
      } while(pageToken);
      fs.mkdirSync(OUT,{recursive:true});
      for (const file of files.filter(f => /\.(csv|xlsx)$/i.test(f.name))) {
        try {
          if (!/^[a-zA-Z0-9_-]+\.(csv|xlsx)$/i.test(file.name)) throw Error("Invalid filename");
          const response = await axios.get("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id),{
            params:{alt:"media",key},responseType:"arraybuffer",timeout:60000,maxContentLength:15*1024*1024
          });
          const bytes = Buffer.from(response.data);
          const workbook = /\.xlsx$/i.test(file.name)
            ? XLSX.read(bytes,{type:"buffer"})
            : XLSX.read(bytes.toString("utf8"),{type:"string",raw:true});
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:""});
          const headers = (rows[0] || []).map(v=>String(v).toLowerCase().trim());
          const phoneCol = headers.findIndex(v=>/^(phone|mobile|mobile number|phone number|whatsapp|whatsapp number|contact|contact number|number)$/.test(v));
          const nameCol = headers.findIndex(v=>/^(name|customer name|client name|agent name|party name|contact name)$/.test(v));
          if (phoneCol < 0) throw Error("Phone column not found in first row");
          const contacts = [], seen = new Set();
          for (const row of rows.slice(1)) {
            let phone = String(row[phoneCol] ?? "").replace(/\D/g,"");
            if (phone.length === 10) phone = "91"+phone;
            if (!/^\d{11,15}$/.test(phone) || seen.has(phone)) continue;
            seen.add(phone);
            const name = String(nameCol < 0 ? "" : row[nameCol] ?? "").replace(/[\r\n]+/g," ").trim() || "Valued Customer";
            contacts.push([phone,name]);
          }
          if (!contacts.length) throw Error("No valid contacts");
          const name = "drive_"+file.name.replace(/\.(csv|xlsx)$/i,"")+".csv";
          const dest = path.join(OUT,name);
          const temp = dest+".tmp-"+process.pid;
          fs.writeFileSync(temp,XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([["phone","name"],...contacts])),{mode:0o600});
          fs.renameSync(temp,dest);
          results.push({source:file.name,name,contacts:contacts.length,status:"imported"});
        } catch(e) {results.push({source:file.name,status:"error",error:e.message});}
      }
      res.json({ok:true,results});
    } catch(e) {res.status(502).json({error:e.message});}
    finally {busy=false;}
  });
};
