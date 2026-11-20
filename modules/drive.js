const axios = require("axios");
const DRIVE_KEY = "AIzaSyC8fVk7WYy5d3LuMrrgNRl_NWHVCHy7mFQ";
const FOLDER_ID = "16NQj0E4lDsOgKqCcylnf9xS1pn2jljps";

let folderCache = {}, driveFolders = {};

async function loadFolders() {
  try {
    let all = [], pt = "";
    do {
      const r = await axios.get("https://www.googleapis.com/drive/v3/files?q='" + FOLDER_ID + "'+in+parents+and+mimeType='application/vnd.google-apps.folder'&key=" + DRIVE_KEY + "&fields=files(id,name),nextPageToken&pageSize=100" + (pt?"&pageToken="+pt:""));
      all = all.concat(r.data.files||[]);
      pt = r.data.nextPageToken||"";
    } while(pt);
    all.forEach(f => { driveFolders[f.name.toUpperCase().trim()] = f.id; });
    console.log("Loaded " + all.length + " drive folders");
  } catch(e) { console.error("Drive load:", e.message); }
}

async function getImages(folderId) {
  if (folderCache[folderId]) return folderCache[folderId];
  try {
    const r = await axios.get("https://www.googleapis.com/drive/v3/files?q='" + folderId + "'+in+parents+and+mimeType+contains+'image'&key=" + DRIVE_KEY + "&fields=files(id,name)&pageSize=100");
    folderCache[folderId] = r.data.files||[];
    return folderCache[folderId];
  } catch(e) { return []; }
}

function getFolderId(name) { return driveFolders[name.toUpperCase().trim()] || null; }

module.exports = { loadFolders, getImages, getFolderId };
