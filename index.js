const axios = require("axios");
const express = require("express");
const bodyParser = require("body-parser");
const STOCK = require("./modules/stock");
const PRICES = require("./modules/prices");
const {
  TOKEN,
  sendText,
  sendButtons,
  sendList,
  sendImage
} = require("./modules/messaging");
const { loadFolders, getImages, getFolderId } = require("./modules/drive");
const { buildAndSendPDF } = require("./modules/pdf");
const { msgStore, replyStore, logMsg } = require("./modules/store");

// Load contact name lookup
let contactNames = {};
try { contactNames = JSON.parse(require('fs').readFileSync('./data/contacts.json','utf8')); } catch(e) {}
console.log('Loaded', Object.keys(contactNames).length, 'contact names');

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = "emkaybot2024";
const BRAND = "Emkay Trendz";
const sessions = {};

function sess(p) { if (!sessions[p]) sessions[p]={step:"start"}; return sessions[p]; }
function reset(p) { sessions[p]={step:"start"}; return sessions[p]; }

async function showDesigns(phone, s) {
  const all = s.allDesigns, page = s.page||0, PER = 7;
  const start = page*PER, slice = all.slice(start,start+PER);
  const total = Math.ceil(all.length/PER);
  const dRows = slice.map((name,i)=>({ id:"D"+(start+i), title:name.substring(0,24), description:STOCK[name].length+" colours in stock" }));
  const nRows = [];
  if (page<total-1) nRows.push({ id:"NAV_NEXT", title:"Next Page", description:"Page "+(page+2)+" of "+total });
  if (page>0) nRows.push({ id:"NAV_PREV", title:"Prev Page", description:"Page "+page+" of "+total });
  nRows.push({ id:"NAV_HOME", title:"Main Menu", description:"Start over" });
  const sections = [{ title:"Designs Pg "+(page+1)+"/"+total, rows:dRows }];
  if (nRows.length) sections.push({ title:"Navigation", rows:nRows });
  await sendList(phone, BRAND+"\n"+s.category+" - "+s.type+"\nPage "+(page+1)+" of "+total+"\n\nSelect a design:", "View Designs", sections);
}

async function showColours(phone, s) {
  const colours = STOCK[s.designName];
  const rows = colours.slice(0,9).map((c,i)=>({ id:"C"+i, title:("Design "+c).substring(0,24), description:s.designName+" - tap for image & PDF" }));
  rows.push({ id:"C_BACK", title:"Back to Designs", description:"Browse other designs" });
  await sendList(phone, s.designName+"\n"+colours.length+" designs in stock\n\nSelect a design code:", "View Designs", [{ title:"Available Design Codes", rows }]);
}

async function handle(phone, text, intId, msg) {
  let s = sess(phone);
  const t = (text||"").trim().toLowerCase();
  const id = intId||"";
  s.lastActive = Math.floor(Date.now()/1000);
  console.log("["+phone+"] step="+s.step+" id="+id+" t="+t);

  // Track which template this reply came from via context
  if (msg.context && msg.context.id) {
    s.lastMsgId = msg.context.id;
  }
  // Set lastTemplate based on button payload context
  if (id === "Get Price" && !s.lastTemplate) {
    s.lastTemplate = "corduroy_print"; // default
  }

  if (id==="get_price" || t==="get price" || t==="price" || t==="interested") {
    const fromBroadcast = (id === "Get Price" || id === "get_price");
    // Detect which template from button payload
    if (fromBroadcast && msg.button?.payload) {
      const payload = msg.button.payload.toLowerCase();
      if (payload.includes("autograph")) s.lastTemplate = "autograph1432";
      else if (payload.includes("corduroy")) s.lastTemplate = "corduroy";
    }
    // Detect which template from button payload
    if (fromBroadcast && msg.button?.payload) {
      const payload = msg.button.payload.toLowerCase();
      if (payload.includes("autograph")) s.lastTemplate = "autograph1432";
      else if (payload.includes("corduroy")) s.lastTemplate = "corduroy";
    }
    const sessionAge = s.lastActive ? (Math.floor(Date.now()/1000) - s.lastActive) : 99999;
    if (!fromBroadcast && (!s.designName || sessionAge > 86400)) {
      await sendText(phone,
      "🙏 *Thank you for your interest in Emkay Trendz!*\n\n"+
      "For the latest price and availability, please contact our team on WhatsApp:\n\n"+
      "👤 *NATWAR PRAJAPATI*\n"+
      "https://wa.me/919328062066\n\n"+
      "👤 *RANGARAM DEWASI*\n"+
      "https://wa.me/919104493036\n\n"+
      "📍 272, New Cloth Market, Ahmedabad\n\n"+
      "_Emkay Trendz_"
      );
      return;
    }
    // Set design based on which template the customer replied to
    if (fromBroadcast && !s.designName) {
      // Check context - last message sent to this user
      if (s.lastTemplate === "autograph1432") {
        s.designName="AUTOGRAPH"; s.colour="1432";
      } else {
        s.designName="CORDUROY PRINT"; s.colour="207";
      }
    }
    const design = s.designName||"CORDUROY PRINT";
    const colour = s.colour||"207";
    const price = (PRICES[design] && PRICES[design][colour]) ? PRICES[design][colour] : 210;
    await sendText(phone,
      "💰 *Price Details*\n\n"+
      "🧵 *"+design+"*\n"+
      "Design Code: *"+colour+"*\n"+
      "━━━━━━━━━━━━━━━━━\n"+
      "Price: *₹"+price+" per meter*\n"+
      "Minimum Order: 50 meters per colour\n"+
      "📦 In Stock | Premium Cotton\n"+
      "━━━━━━━━━━━━━━━━━\n\n"+
      "To place your order or enquiry, contact our team on WhatsApp:\n\n"+
      "👤 *NATWAR PRAJAPATI*\n"+
      "https://wa.me/919328062066\n\n"+
      "👤 *RANGARAM DEWASI*\n"+
      "https://wa.me/919104493036\n\n"+
      "📍 272, New Cloth Market, Ahmedabad\n\n"+
      "_"+BRAND+"_"
    );
    return;
  }

  if (false && ["hi","hello","hey","hii","hai","start","menu"].includes(t)||id==="NAV_HOME") {
    await sendText(phone,
      "🙏 *Thank you for your interest in Emkay Trendz!*\n\n"+
      "For the latest price and availability, please contact our team on WhatsApp:\n\n"+
      "👤 *NATWAR PRAJAPATI*\n"+
      "https://wa.me/919328062066\n\n"+
      "👤 *RANGARAM DEWASI*\n"+
      "https://wa.me/919104493036\n\n"+
      "📍 272, New Cloth Market, Ahmedabad\n\n"+
      "_Emkay Trendz_"
    );
    return;
    return;
  }

  if (s.step==="cat") {
    if (id==="CAT_SUIT") { s.step="suit_type"; await sendButtons(phone, "Suiting - Select type:", [{ id:"TYP_PLAIN", title:"Plain" }]); }
    else if (id==="CAT_SHIRT") { s.step="shirt_type"; await sendButtons(phone, "Shirting - Select type:", [{ id:"TYP_PRINT", title:"Print" },{ id:"TYP_PLAIN", title:"Plain" }]); }
    else await sendButtons(phone, "Please select category:", [{ id:"CAT_SUIT", title:"Suiting" },{ id:"CAT_SHIRT", title:"Shirting" }]);
    return;
  }

  if (s.step==="suit_type") {
    await sendText(phone, "Suiting designs coming soon!\n\nType Hi to go back.");
    return;
  }

  if (s.step==="shirt_type") {
    if (id==="TYP_PRINT"||id==="TYP_PLAIN") {
      s.category="Shirting"; s.type=id==="TYP_PRINT"?"Print":"Plain";
      s.step="browse"; s.page=0; s.allDesigns=Object.keys(STOCK).sort();
      await showDesigns(phone, s);
    } else {
      await sendButtons(phone, "Select type:", [{ id:"TYP_PRINT", title:"Print" },{ id:"TYP_PLAIN", title:"Plain" }]);
    }
    return;
  }

  if (s.step==="browse") {
    if (id==="NAV_NEXT") { s.page=(s.page||0)+1; await showDesigns(phone,s); return; }
    if (id==="NAV_PREV") { s.page=Math.max(0,(s.page||0)-1); await showDesigns(phone,s); return; }
    if (id.startsWith("D")) {
      const idx=parseInt(id.substring(1)), name=s.allDesigns[idx];
      if (name) { s.designName=name; s.folderId=getFolderId(name); s.step="colours"; await showColours(phone,s); }
      return;
    }
    await showDesigns(phone,s);
    return;
  }

  if (s.step==="colours") {
    if (id==="C_BACK") { s.step="browse"; await showDesigns(phone,s); return; }
    if (id.startsWith("C")) {
      const idx=parseInt(id.substring(1)), colours=STOCK[s.designName];
      if (idx>=0&&idx<colours.length) {
        const colour=colours[idx]; s.colour=colour;
        await sendText(phone, "Please wait...\n\nFetching "+s.designName+" Design Code "+colour+" and generating your PDF...");
        const imgs = s.folderId ? await getImages(s.folderId) : [];
        const match = imgs.find(img=>img.name.toLowerCase().includes(colour.toLowerCase()));
        if (match) await sendImage(phone, match.id, s.designName+" - Design Code "+colour);
        await buildAndSendPDF(phone, s.designName, colours, imgs);
        s.step="done";
        await sendButtons(phone, "PDF for *"+s.designName+"* sent!\n\nWhat next?", [{ id:"DONE_LIST", title:"Design List" },{ id:"DONE_HOME", title:"Start Over" }]);
      }
      return;
    }
    await showColours(phone,s);
    return;
  }

  if (s.step==="done") {
    if (id==="DONE_LIST") { s.step="browse"; await showDesigns(phone,s); }
    else if (id==="DONE_HOME") { s=reset(phone); s.step="cat"; await sendButtons(phone, "Welcome to *"+BRAND+"*!\n\nSelect category:", [{ id:"CAT_SUIT", title:"Suiting" },{ id:"CAT_SHIRT", title:"Shirting" }], BRAND); }
    else await sendButtons(phone, "What next?", [{ id:"DONE_LIST", title:"Design List" },{ id:"DONE_HOME", title:"Start Over" }]);
    return;
  }

  // Bot disabled for unrecognised messages
}




// ─────────────────────────────────────────────
// BROADCAST STATUS SYSTEM
// ─────────────────────────────────────────────

const fs = require("fs");

const BROADCAST_STATUS_FILE =
  __dirname + "/data/broadcast-status.json";

function ensureBroadcastStatusFile() {
  try {
    const dir = __dirname + "/data";

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(BROADCAST_STATUS_FILE)) {
      fs.writeFileSync(
        BROADCAST_STATUS_FILE,
        "[]",
        "utf8"
      );
    }
  } catch (e) {
    console.error(
      "[BROADCAST STATUS] File init error:",
      e.message
    );
  }
}

function loadBroadcastStatuses() {
  ensureBroadcastStatusFile();

  try {
    const raw =
      fs.readFileSync(
        BROADCAST_STATUS_FILE,
        "utf8"
      );

    if (!raw.trim()) return [];

    const data = JSON.parse(raw);

    return Array.isArray(data)
      ? data
      : [];

  } catch (e) {
    console.error(
      "[BROADCAST STATUS] Read error:",
      e.message
    );

    return [];
  }
}

function saveBroadcastStatuses(data) {
  ensureBroadcastStatusFile();

  try {
    fs.writeFileSync(
      BROADCAST_STATUS_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error(
      "[BROADCAST STATUS] Write error:",
      e.message
    );
  }
}

function saveWhatsAppStatuses(statuses) {

  if (
    !Array.isArray(statuses) ||
    statuses.length === 0
  ) {
    return;
  }

  const all =
    loadBroadcastStatuses();

  for (const st of statuses) {

    const id =
      st.id || "";

    const phone =
      st.recipient_id || "";

    const status =
      st.status || "unknown";

    /*
     * Use message ID + status.
     *
     * A single WhatsApp message can generate:
     *
     * sent
     * delivered
     * read
     *
     * therefore we must NOT treat the message ID
     * alone as a duplicate.
     */
    const exists =
      all.some(x =>
        x.id === id &&
        x.status === status
      );

    if (exists) {
      continue;
    }

    const error =
      Array.isArray(st.errors) &&
      st.errors.length
        ? st.errors[0]
        : null;

    const record = {
      id: id,

      phone: phone,

      status: status,

      timestamp:
        st.timestamp || null,

      recipient_user_id:
        st.recipient_user_id || null,

      pricing:
        st.pricing || null,

      error_code:
        error?.code || null,

      error_title:
        error?.title || null,

      error_message:
        error?.message || null,

      error_details:
        error?.error_data?.details || null,

      received_at:
        new Date().toISOString()
    };

    all.push(record);

    console.log(
      "[BROADCAST STATUS]",
      phone,
      status,
      error?.message || ""
    );
  }

  /*
   * Keep latest 100,000 status records.
   */
  const finalData =
    all.length > 100000
      ? all.slice(-100000)
      : all;

  saveBroadcastStatuses(finalData);
}


// ─────────────────────────────────────────────
// BROADCAST STATUS API
// ─────────────────────────────────────────────

app.get(
  "/admin/broadcast-status",
  (req, res) => {

    try {

      const statuses =
        loadBroadcastStatuses();

      const summary = {
        total:
          statuses.length,

        sent:
          statuses.filter(
            x => x.status === "sent"
          ).length,

        delivered:
          statuses.filter(
            x => x.status === "delivered"
          ).length,

        read:
          statuses.filter(
            x => x.status === "read"
          ).length,

        failed:
          statuses.filter(
            x => x.status === "failed"
          ).length,

        pending:
          0
      };

      /*
       * Latest status for each phone.
       */
      const latestByPhone = {};

      for (const x of statuses) {

        if (!x.phone) continue;

        const old =
          latestByPhone[x.phone];

        if (
          !old ||
          String(x.timestamp || "") >
          String(old.timestamp || "")
        ) {
          latestByPhone[x.phone] = x;
        }
      }

      const contacts =
        Object.values(
          latestByPhone
        ).sort(
          (a,b) =>
            String(b.timestamp || "")
              .localeCompare(
                String(a.timestamp || "")
              )
        );

      res.json({
        success: true,

        summary: summary,

        contacts: contacts,

        statuses:
          statuses
            .slice()
            .reverse()
      });

    } catch (e) {

      console.error(
        "[BROADCAST API ERROR]",
        e
      );

      res.status(500).json({
        success: false,
        error: e.message
      });
    }
  }
);

ensureBroadcastStatusFile();


// ── Webhook ──
app.get("/webhook", (req,res) => {
  if (req.query["hub.mode"]==="subscribe"&&req.query["hub.verify_token"]===VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(req.query["hub.challenge"]);
  } else res.sendStatus(403);
});

app.post("/webhook", async (req,res) => {
  res.sendStatus(200);
  console.log("RAW:", JSON.stringify(req.body));
  try {
    const value=req.body?.entry?.[0]?.changes?.[0]?.value;

    // WhatsApp delivery/read/failure callbacks
    const statuses=value?.statuses;

    if(statuses?.length){
      saveWhatsAppStatuses(statuses);
      console.log(
        "[WEBHOOK] Processed",
        statuses.length,
        "WhatsApp status callback(s)"
      );
    }

    // Normal incoming WhatsApp messages
    const msgs=value?.messages;

    if(!msgs?.length){
      if(statuses?.length) return;

      console.log("No messages in payload");
      return;
    }

    const msg=msgs[0], phone=msg.from;
    let text="", intId=null;
    console.log("MSG TYPE:", msg.type);
    if (msg.type==="text") text=msg.text?.body||"";
    else if (msg.type==="button") { text=msg.button?.text||""; intId=msg.button?.payload||""; }
    else if (msg.type==="interactive") {
      if (msg.interactive?.type==="button_reply") { intId=msg.interactive.button_reply?.id; text=msg.interactive.button_reply?.title||""; }
      else if (msg.interactive?.type==="list_reply") { intId=msg.interactive.list_reply?.id; text=msg.interactive.list_reply?.title||""; }
    }
      // Capture all supported WhatsApp media/message types
      let mediaUrl = null;
      let mediaId = null;

      if (["image","video","audio","document","sticker","location","contacts"].includes(msg.type)) {
        const typeLabel = msg.type;

        mediaId =
          msg.image?.id ||
          msg.video?.id ||
          msg.audio?.id ||
          msg.document?.id ||
          msg.sticker?.id ||
          null;

        if (mediaId) {
          try {
            const mr = await axios.get(
              "https://graph.facebook.com/v19.0/" + mediaId,
              {
                headers: {
                  Authorization: "Bearer " + TOKEN
                }
              }
            );

            mediaUrl = mr.data?.url || null;
          } catch(e) {
            console.error(
              "[MEDIA] URL fetch failed:",
              e.response?.data || e.message
            );
          }
        }

        if (typeLabel === "image") {
          text =
            "[MEDIA:image:" +
            (mediaUrl || "") +
            ":id:" + (mediaId || "") + "]";

        } else if (typeLabel === "document") {
          text =
            "[MEDIA:document:" +
            (msg.document?.filename || "document") +
            ":id:" + (mediaId || "") + "]";

        } else if (typeLabel === "video") {
          text =
            "[MEDIA:video:" +
            (mediaUrl || "") +
            ":id:" + (mediaId || "") + "]";

        } else if (typeLabel === "audio") {
          text =
            "[MEDIA:audio:" +
            (mediaUrl || "") +
            ":id:" + (mediaId || "") + "]";

        } else if (typeLabel === "sticker") {
          text =
            "[MEDIA:sticker:" +
            (mediaUrl || "") +
            ":id:" + (mediaId || "") + "]";

        } else if (typeLabel === "location") {
          text =
            "[LOCATION:" +
            (msg.location?.latitude || "") +
            "," +
            (msg.location?.longitude || "") +
            "]";

        } else if (typeLabel === "contacts") {
          text = "[CONTACT received]";
        }
      }

    // Resolve WhatsApp profile/contact display name
    const waContact = Array.isArray(value?.contacts)
      ? value.contacts.find(c => c?.wa_id === phone)
      : null;

    const name =
      waContact?.profile?.name ||
      contactNames[phone] ||
      contactNames["91" + phone] ||
      phone;

    // Keep CSV/contact name mapping updated when WhatsApp provides a profile name
    if (name && name !== phone) {
      contactNames[phone] = name;
      try {
        fs.writeFileSync(
          __dirname + "/data/contacts.json",
          JSON.stringify(contactNames, null, 2),
          "utf8"
        );
      } catch (e) {
        console.error("[CONTACT NAME SAVE]", e.message);
      }
    }

    console.log("[INCOMING]", phone, "=>", name, "|", text);

    logMsg(phone, text, intId, msg.type, name);
    await handle(phone, text, intId, msg);
  } catch(e) { console.error("Webhook err:", e.message); }
});

// ── Admin ──
const ADMIN_PASS = "EmkayTrendz@2026";
app.post("/admin/login", (req,res) => {
  const {password} = req.body || {};
  if (password === ADMIN_PASS) return res.json({ok:true});
  return res.json({ok:false});
});

app.use("/admin", (req,res,next) => {
  // Allow token in query string
  if (req.query.token === ADMIN_PASS) return next();
  // Allow session cookie
  const cookie = req.headers.cookie || "";
  if (cookie.includes("adminauth=" + ADMIN_PASS)) return next();
  // Show login page for browser requests to /admin (not API calls)
  if (req.path === "/" || req.path === "") {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Emkay Admin Login</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;background:#0b1624;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{background:#112236;border:1px solid rgba(200,151,58,.2);border-radius:12px;padding:40px;width:100%;max-width:360px}.logo{font-size:22px;font-weight:700;color:#e0b96a;margin-bottom:6px}.sub{font-size:13px;color:rgba(255,255,255,.4);margin-bottom:32px}label{font-size:12px;color:rgba(255,255,255,.5);display:block;margin-bottom:6px}input{width:100%;padding:11px 14px;background:#0b1624;border:1.5px solid rgba(255,255,255,.1);border-radius:7px;color:#fff;font-size:14px;margin-bottom:20px;outline:none}input:focus{border-color:#c8973a}button{width:100%;padding:13px;background:#c8973a;color:#0b1624;border:none;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer}.err{color:#f87171;font-size:13px;margin-top:12px;display:none}</style></head><body><div class="box"><div class="logo">🧵 Emkay Bot</div><div class="sub">Admin Dashboard</div><label>Password</label><input type="password" id="pw" placeholder="Enter password" onkeydown="if(event.key==='Enter')login()"/><button onclick="login()">Login →</button><div class="err" id="err">Wrong password</div></div><script>function login(){const pw=document.getElementById('pw').value;fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})}).then(r=>r.json()).then(d=>{if(d.ok){window.location.href='/admin/dashboard?token=EmkayTrendz%402026'}else{document.getElementById('err').style.display='block'}}).catch(()=>{document.getElementById('err').style.display='block'})}</script></body></html>`);
  }
  return res.status(401).json({error:"Unauthorized"});
});

app.get("/admin/logout", (req,res) => { res.set("WWW-Authenticate","Basic realm=\"Emkay Admin\""); res.status(401).send("Logged out"); });
// Broadcast status API

// ── WhatsApp media proxy for Admin Chat ──
app.get("/admin/media/:mediaId", async (req,res) => {
  try {
    const mediaId=req.params.mediaId;

    if(!mediaId){
      return res.status(400).send("Missing media ID");
    }

    const meta=await axios.get(
      "https://graph.facebook.com/v19.0/"+mediaId,
      {
        headers:{
          Authorization:"Bearer "+TOKEN
        }
      }
    );

    const mediaUrl=meta.data?.url;

    if(!mediaUrl){
      return res.status(404).send("Media URL not found");
    }

    const media=await axios.get(mediaUrl,{
      responseType:"stream",
      headers:{
        Authorization:"Bearer "+TOKEN
      }
    });

    res.setHeader(
      "Content-Type",
      media.headers["content-type"] || "application/octet-stream"
    );

    if(media.headers["content-length"]){
      res.setHeader(
        "Content-Length",
        media.headers["content-length"]
      );
    }

    media.data.pipe(res);

  }catch(e){
    console.error(
      "[ADMIN MEDIA PROXY]",
      e.response?.data || e.message
    );

    if(!res.headersSent){
      res.status(404).send("Media unavailable");
    }
  }
});

// Resolve template header media on the server. Never expose template handles to clients.
const emkayFs = require('fs');
const emkayPath = require('path');
const EMKAY_WABA_ID = process.env.WABA_ID || '1496462321888059';
const EMKAY_PHONE_ID = process.env.PHONE_ID || '1082548208284300';
const EMKAY_MEDIA_DB = emkayPath.join(__dirname,'data','template-media.json');
const emkayMediaPending = new Map();
function emkayReadMediaDb(){try{return JSON.parse(emkayFs.readFileSync(EMKAY_MEDIA_DB,'utf8'))}catch(_){return {}}}
function emkaySaveMediaDb(db){
  const temp=EMKAY_MEDIA_DB+'.tmp-'+process.pid;
  emkayFs.writeFileSync(temp,JSON.stringify(db,null,2),{mode:0o600});
  emkayFs.renameSync(temp,EMKAY_MEDIA_DB);
}
function emkaySafeName(name){return /^[a-z0-9_]{1,512}$/.test(name)}
async function emkayResolveMedia(name,language){
  const graph='https://graph.facebook.com/v19.0/';
  let next=graph+EMKAY_WABA_ID+'/message_templates?fields=name,status,language,components&limit=100';
  let template;
  for(let page=0;next&&page<30;page++){
    const response=await axios.get(next,{headers:{Authorization:'Bearer '+TOKEN},timeout:20000});
    template=(response.data.data||[]).find(t=>t.name===name&&t.language===language&&t.status==='APPROVED');
    if(template)break;
    next=response.data.paging?.next||null;
    if(next&&!next.startsWith(graph))throw Error('Invalid Meta pagination URL');
  }
  if(!template)throw Error('Approved template not found in Meta');
  const header=(template.components||[]).find(c=>c.type==='HEADER');
  const format=header?.format;
  if(!['DOCUMENT','IMAGE','VIDEO'].includes(format))throw Error('Template has no supported media header');
  const handle=header.example?.header_handle?.[0];
  if(!handle)throw Error('Meta template has no downloadable header handle');
  const parsed=new URL(handle);
  if(parsed.protocol!=='https:'||parsed.hostname!=='scontent.whatsapp.net'&&!parsed.hostname.endsWith('.scontent.whatsapp.net'))throw Error('Untrusted template media host');
  const key=name+'|'+language;
  const db=emkayReadMediaDb();
  const fingerprint=require('crypto').createHash('sha256').update(handle).digest('hex');
  if(db[key]?.fingerprint===fingerprint&&db[key]?.id&&db[key]?.format===format)return {id:db[key].id,format,filename:db[key].filename,cached:true};
  const max={'DOCUMENT':100*1024*1024,'IMAGE':5*1024*1024,'VIDEO':16*1024*1024}[format];
  const media=await axios.get(handle,{responseType:'arraybuffer',timeout:60000,maxContentLength:max,maxBodyLength:max,headers:{Accept:'*/*'}});
  const bytes=Buffer.from(media.data);
  if(!bytes.length||bytes.length>max)throw Error('Template media exceeds permitted size');
  const mime=String(media.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  const allowed={DOCUMENT:['application/pdf'],IMAGE:['image/jpeg','image/png'],VIDEO:['video/mp4','video/3gpp']}[format];
  if(!allowed.includes(mime))throw Error('Unsupported template media MIME type: '+mime);
  if(format==='DOCUMENT'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Document is not a PDF');
  const filename=name+({DOCUMENT:'.pdf',IMAGE:mime==='image/png'?'.png':'.jpg',VIDEO:mime==='video/3gpp'?'.3gp':'.mp4'}[format]);
  const form=new FormData();
  form.append('messaging_product','whatsapp');
  form.append('type',mime);
  form.append('file',new Blob([bytes],{type:mime}),filename);
  const upload=await fetch(graph+EMKAY_PHONE_ID+'/media',{method:'POST',headers:{Authorization:'Bearer '+TOKEN},body:form});
  const result=await upload.json();
  if(!upload.ok||!result.id)throw Error('Meta media registration failed: '+(result.error?.message||upload.status));
  const fresh=emkayReadMediaDb();
  fresh[key]={id:String(result.id),format,filename,fingerprint,updatedAt:new Date().toISOString()};
  emkaySaveMediaDb(fresh);
  return {id:String(result.id),format,filename,cached:false};
}
app.post('/admin/template-media/resolve',async(req,res)=>{
  const name=String(req.body?.name||'');
  const language=String(req.body?.language||'en');
  if(!emkaySafeName(name)||!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language))return res.status(400).json({error:'Invalid template name or language'});
  const key=name+'|'+language;
  try{
    if(!emkayMediaPending.has(key))emkayMediaPending.set(key,emkayResolveMedia(name,language).finally(()=>emkayMediaPending.delete(key)));
    return res.json(await emkayMediaPending.get(key));
  }catch(e){console.error('[TEMPLATE MEDIA]',name,e.message);return res.status(502).json({error:e.message})}
});

app.get("/admin/logs", (req,res) => res.json({ messages: msgStore }));
app.get("/admin/replies", (req,res) => res.json({ replies: replyStore }));
app.get("/admin/contacts", (req,res) => res.json({ contacts: contactNames }));
app.post("/admin/sent", (req,res) => {
  const {phone, text} = req.body || {};
  if(!phone || !text) return res.status(400).json({error:"Missing fields"});
  const entry = {id:Date.now()+'', phone, text, type:'sent', ts:Math.floor(Date.now()/1000)};
  replyStore.unshift(entry);
  if(replyStore.length>500) replyStore.pop();
  const fs=require('fs');
  try{ fs.writeFileSync('./data/replies.json', JSON.stringify(replyStore)); }catch(e){}
  res.json({ok:true});
});
app.get("/admin/list-csv", (req,res) => { const fs=require("fs");
// ── BROADCAST STATUS STORAGE ──

function loadBroadcastStatus(){
  try{
    if(!fs.existsSync(BROADCAST_STATUS_FILE)) return {};
    return JSON.parse(fs.readFileSync(BROADCAST_STATUS_FILE,"utf8") || "{}");
  }catch(e){
    console.error("Broadcast status load:",e.message);
    return {};
  }
}

let broadcastStatus = loadBroadcastStatus();

function saveBroadcastStatus(){
  try{
    fs.mkdirSync(__dirname + "/data",{recursive:true});
    fs.writeFileSync(
      BROADCAST_STATUS_FILE,
      JSON.stringify(broadcastStatus,null,2)
    );
  }catch(e){
    console.error("Broadcast status save:",e.message);
  }
}

function updateBroadcastStatus(messageId,data){
  if(!messageId) return;

  if(!broadcastStatus[messageId]){
    broadcastStatus[messageId]={
      message_id:messageId,
      created_at:Date.now()
    };
  }

  Object.assign(broadcastStatus[messageId],data);
  broadcastStatus[messageId].updated_at=Date.now();

  saveBroadcastStatus();
}

 try{ const files=fs.readdirSync(__dirname+"/uploads/csv/").filter(f=>f.endsWith(".csv")); res.json({files}); }catch(e){res.json({files:[]});} });
app.get("/admin/get-csv/:name", (req,res) => { res.sendFile(__dirname+"/uploads/csv/"+req.params.name); });
app.post("/admin/save-csv", (req,res) => {
  const multer = require("multer");
  const upload = multer({dest:"uploads/csv/"}).single("file");
  upload(req,res,err=>{ if(err) return res.status(500).json({error:err.message}); const fs=require("fs"); const name=(req.body.name||"audience_"+Date.now())+".csv"; const dest=__dirname+"/uploads/csv/"+name; fs.renameSync(req.file.path,dest); res.json({success:true,name}); });
});
app.get("/admin", (req,res) => res.sendFile(__dirname+"/admin.html"));
app.get("/admin/dashboard", (req,res) => {
  const cookie = req.headers.cookie || "";
  if (cookie.includes("adminauth="+ADMIN_PASS) || req.query.token === ADMIN_PASS) {
    return res.sendFile(__dirname+"/admin.html");
  }
  res.redirect("/admin");
});
app.get("/", (req,res) => res.send(BRAND+" Bot running!"));

app.listen(3001, async () => {
  console.log(BRAND+" bot starting...");
  await loadFolders();
  console.log("Ready!");
});
