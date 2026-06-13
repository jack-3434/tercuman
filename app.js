/* ERSA Çin Ofisi Takip — PWA mantığı
   Veri kaynağı: Google Sheet (Apps Script Web App, config.js → API_URL) */

const LIST = {
  talepTuru: ["Makine Talebi","Yedek Parça","Numune Talebi","Servis / Teknik","Sevkiyat / Lojistik","Diğer"],
  durum: ["Yeni Talep","Teklif Hazırlanıyor","Teklif Gönderildi","Pazarlık / Görüşme","Onaylandı - Sipariş","Üretimde","Sevkiyat / Yolda","Teslim Edildi","İptal / Kayıp"],
  oncelik: ["Yüksek","Orta","Düşük"],
  sorumlu: ["Ertuğrul","Çin Ofisi","Satış","Teknik","Lojistik"],
  incoterm: ["","EXW","FCA","FOB","CFR","CIF","CPT","CIP","DAP","DDP"],
  liman: ["","Shanghai","Ningbo","Shenzhen","Qingdao","Guangzhou","Tianjin","Xiamen","Dalian"]
};
const ORDER_DURUMLAR = ["Onaylandı - Sipariş","Üretimde","Sevkiyat / Yolda"];
const KAPALI = ["Teslim Edildi","İptal / Kayıp"];

let DATA = { talepler: [], musteriler: [] };
let curFilter = "hepsi";
let editing = null; // null = yeni, yoksa düzenlenen talep

/* ---------- yardımcılar ---------- */
const $ = s => document.querySelector(s);
const today0 = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
function parseDate(v){ if(!v) return null; const d=new Date(v); return isNaN(d)?null:(d.setHours(0,0,0,0),d); }
function fmt(d){ const x=parseDate(d); if(!x) return ""; return String(x.getDate()).padStart(2,"0")+"."+String(x.getMonth()+1).padStart(2,"0")+"."+x.getFullYear(); }
function toISO(v){ const d=parseDate(v); return d? d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0") : ""; }
function days(d){ return Math.round((parseDate(d)-today0())/86400000); }
function esc(s){ return (s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* ---------- durum hesapları (Excel ile aynı mantık) ---------- */
function takipChip(t){
  if(KAPALI.includes(t.durum)) return {cls:"c-grn",txt:"✓ Kapandı"};
  if(!t.sonrakiTakip) return {cls:"c-grey",txt:"Takip tarihi yok"};
  const n=days(t.sonrakiTakip);
  if(n<0) return {cls:"c-red",txt:`⚠ Gecikti (${-n} gün)`};
  if(n===0) return {cls:"c-org",txt:"● Bugün takip et"};
  if(n<=3) return {cls:"c-yel",txt:`○ ${n} gün kaldı`};
  return {cls:"c-blue",txt:`${n} gün kaldı`};
}
function teslimChip(t){
  if(t.durum==="Teslim Edildi") return {cls:"c-grn",txt:"✓ Teslim edildi"};
  if(t.durum==="İptal / Kayıp") return null;
  if(!ORDER_DURUMLAR.includes(t.durum)) return null;
  if(!t.sozTeslim) return {cls:"c-grey",txt:"Termin yok"};
  const n=days(t.sozTeslim);
  if(n<0) return {cls:"c-red",txt:`⚠ Termin geçti (${-n} gün)`};
  if(n===0) return {cls:"c-org",txt:"● Bugün teslim"};
  if(n<=7) return {cls:"c-yel",txt:`○ Teslim ${n} gün`};
  return {cls:"c-blue",txt:`Teslim ${n} gün`};
}
const isAktif = t => t.musteri && !KAPALI.includes(t.durum);

/* ---------- veri çek ---------- */
async function load(){
  if(!window.API_URL || API_URL.includes("YAPISTIRIN")){
    banner("Kurulum gerekli: config.js içine Apps Script adresinizi yazın (README Adım 2).");
    renderAll(); return;
  }
  banner("");
  try{
    const r = await fetch(API_URL, {method:"GET"});
    const j = await r.json();
    DATA.talepler = (j.talepler||[]).filter(t=>t.musteri);
    DATA.musteriler = (j.musteriler||[]).filter(m=>m.musteri);
    renderAll();
  }catch(e){
    banner("Bağlantı kurulamadı. İnternet ve Apps Script adresini kontrol edin.");
    $("#panelBody").innerHTML = '<div class="empty"><div class="big">⚠</div><p>Veri alınamadı.</p></div>';
  }
}
function banner(msg){ const b=$("#banner"); b.textContent=msg; b.classList.toggle("show",!!msg); }

/* ---------- render: panel ---------- */
function renderPanel(){
  const T = DATA.talepler, t0=today0();
  const aktif = T.filter(isAktif);
  const gecikenTakip = aktif.filter(t=>t.sonrakiTakip && days(t.sonrakiTakip)<0).length;
  const bugun3 = aktif.filter(t=>{const n=t.sonrakiTakip?days(t.sonrakiTakip):null;return n!==null&&n>=0&&n<=3;}).length;
  const acikSip = T.filter(t=>ORDER_DURUMLAR.includes(t.durum)).length;
  const gecikenTes = T.filter(t=>ORDER_DURUMLAR.includes(t.durum)&&t.sozTeslim&&days(t.sozTeslim)<0).length;
  const buHafta = T.filter(t=>{if(!ORDER_DURUMLAR.includes(t.durum)||!t.sozTeslim)return false;const n=days(t.sozTeslim);return n>=0&&n<=7;}).length;
  const yeni = T.filter(t=>t.durum==="Yeni Talep").length;
  const teklif = T.filter(t=>t.durum==="Teklif Gönderildi"||t.durum==="Pazarlık / Görüşme").length;

  const k=(lab,val,cap,cls="")=>`<div class="kpi ${cls}"><div class="lab">${lab}</div><div class="val">${val}</div><div class="cap">${cap}</div></div>`;
  let html = `<div class="sechead"><h2>Talep & Takip</h2><span>genel durum</span></div><div class="kpis">`
    + k("TOPLAM TALEP",T.length,"tüm kayıt")
    + k("AKTİF TALEP",aktif.length,"kapanmamış")
    + k("GECİKEN TAKİP",gecikenTakip,"tarihi geçti",gecikenTakip?"alert":"")
    + k("BUGÜN / 3 GÜN",bugun3,"yaklaşan takip",bugun3?"warn":"")
    + k("YENİ TALEP",yeni,"henüz işlenmedi")
    + k("TEKLİF AŞAMASI",teklif,"teklif/pazarlık")
    + `</div>`;
  html += `<div class="sechead"><h2>Sipariş & Teslimat</h2><span>termin durumu</span></div><div class="kpis">`
    + k("AÇIK SİPARİŞ",acikSip,"üretim/sevk")
    + k("GECİKEN TESLİMAT",gecikenTes,"termin geçti",gecikenTes?"alert":"")
    + k("BU HAFTA TESLİM",buHafta,"7 gün içinde",buHafta?"warn":"")
    + `</div>`;

  // yaklaşan/geciken işler listesi
  const urgent = aktif.filter(t=>t.sonrakiTakip && days(t.sonrakiTakip)<=3)
    .sort((a,b)=>days(a.sonrakiTakip)-days(b.sonrakiTakip));
  html += `<div class="sechead"><h2>Hemen ilgilen</h2><span>${urgent.length} kayıt</span></div>`;
  if(urgent.length){ html += urgent.map(cardHTML).join(""); }
  else html += `<div class="dist"><div class="r"><span>Bekleyen acil takip yok 👍</span></div></div>`;

  // duruma göre dağılım
  html += `<div class="sechead"><h2>Duruma göre dağılım</h2><span></span></div><div class="dist">`;
  LIST.durum.forEach(d=>{ const c=T.filter(t=>t.durum===d).length;
    html += `<div class="r"><span>${d}</span><b>${c}</b></div>`; });
  html += `</div>`;
  $("#panelBody").innerHTML = html;
  bindCards("#panelBody");
}

/* ---------- render: talep listesi ---------- */
function cardHTML(t){
  const tc=takipChip(t), sc=teslimChip(t);
  const chips=[`<span class="chip c-blue">${esc(t.durum||"—")}</span>`,
    `<span class="chip ${tc.cls}">${tc.txt}</span>`];
  if(sc) chips.push(`<span class="chip ${sc.cls}">${sc.txt}</span>`);
  return `<div class="card" data-no="${esc(t.talepNo)}" data-row="${t._row}">
    <div class="top"><span class="cust">${esc(t.musteri)}</span><span class="no">${esc(t.talepNo||"")}</span></div>
    <div class="prod">${esc(t.urun||"")}${t.adet?` · ${esc(t.adet)} adet`:""}</div>
    <div class="meta">${esc(t.ulkeSehir||"")}${t.sorumlu?` · ${esc(t.sorumlu)}`:""}${t.sonrakiTakip?` · Takip: ${fmt(t.sonrakiTakip)}`:""}</div>
    <div class="chips">${chips.join("")}</div></div>`;
}
function renderTalep(){
  const q=$("#search").value.trim().toLowerCase();
  let arr=DATA.talepler.slice();
  arr=arr.filter(t=>{
    if(curFilter==="geciken") return isAktif(t)&&t.sonrakiTakip&&days(t.sonrakiTakip)<0;
    if(curFilter==="bugun"){const n=t.sonrakiTakip?days(t.sonrakiTakip):null;return isAktif(t)&&n!==null&&n>=0&&n<=3;}
    if(curFilter==="siparis") return ORDER_DURUMLAR.includes(t.durum);
    if(curFilter==="teslim"){if(!ORDER_DURUMLAR.includes(t.durum)||!t.sozTeslim)return false;const n=days(t.sozTeslim);return n<=7;}
    return true;
  });
  if(q) arr=arr.filter(t=>[t.musteri,t.urun,t.talepNo,t.aciklama].some(x=>(x||"").toLowerCase().includes(q)));
  // sıralama: aktif + en acil önce
  arr.sort((a,b)=>{
    const av=isAktif(a)?0:1, bv=isAktif(b)?0:1; if(av!==bv)return av-bv;
    const an=a.sonrakiTakip?days(a.sonrakiTakip):9999, bn=b.sonrakiTakip?days(b.sonrakiTakip):9999;
    return an-bn;
  });
  const el=$("#talepList");
  el.innerHTML = arr.length ? arr.map(cardHTML).join("")
    : `<div class="empty"><div class="big">▤</div><p>Kayıt bulunamadı.</p><p>Sağ alttaki <b>＋ Yeni</b> ile talep ekleyin.</p></div>`;
  bindCards("#talepList");
}

/* ---------- render: müşteriler ---------- */
function renderMust(){
  const q=$("#searchM").value.trim().toLowerCase();
  let arr=DATA.musteriler.slice();
  if(q) arr=arr.filter(m=>[m.musteri,m.ulkeSehir,m.iletisim].some(x=>(x||"").toLowerCase().includes(q)));
  const el=$("#mustList");
  el.innerHTML = arr.length ? arr.map(m=>`<div class="card" data-mrow="${m._row}">
      <div class="top"><span class="cust">${esc(m.musteri)}</span></div>
      <div class="meta">${esc(m.ulkeSehir||"")}${m.iletisim?` · ${esc(m.iletisim)}`:""}</div>
      ${(m.telefon||m.eposta)?`<div class="prod">${esc(m.telefon||"")}${m.eposta?` · ${esc(m.eposta)}`:""}</div>`:""}
    </div>`).join("")
    : `<div class="empty"><div class="big">☺</div><p>Müşteri yok.</p><p>Sağ alttaki <b>＋ Yeni</b> ile ekleyin.</p></div>`;
  el.querySelectorAll(".card").forEach(c=>c.onclick=()=>openMust(DATA.musteriler.find(m=>String(m._row)===c.dataset.mrow)));
}

function renderAll(){ renderPanel(); renderTalep(); renderMust(); }
function bindCards(sel){
  document.querySelectorAll(sel+" .card[data-row]").forEach(c=>{
    c.onclick=()=>openTalep(DATA.talepler.find(t=>String(t._row)===c.dataset.row));
  });
}

/* ---------- formlar ---------- */
function sel(name,label,val,opts){
  return `<div class="field"><label>${label}</label><select name="${name}">`
    + opts.map(o=>`<option ${o===val?"selected":""}>${esc(o)}</option>`).join("")
    + `</select></div>`;
}
function inp(name,label,val,type="text",ph=""){
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(val||"")}" placeholder="${ph}"></div>`;
}
function txt(name,label,val){
  return `<div class="field"><label>${label}</label><textarea name="${name}">${esc(val||"")}</textarea></div>`;
}
function nextTalepNo(){
  let mx=0; DATA.talepler.forEach(t=>{const m=/(\d+)\s*$/.exec(t.talepNo||"");if(m)mx=Math.max(mx,+m[1]);});
  return "ERSA-CN-"+String(mx+1).padStart(3,"0");
}

function openTalep(t){
  editing=t||null;
  $("#sheetTitle").textContent = t ? `${t.talepNo||"Talep"} · düzenle` : "Yeni Talep";
  const v=t||{};
  const customers=[...new Set(DATA.musteriler.map(m=>m.musteri))];
  $("#sheetBody").innerHTML =
     inp("talepNo","Talep No", v.talepNo||(t?"":nextTalepNo()))
   + `<div class="field"><label>Müşteri</label><input name="musteri" list="custlist" value="${esc(v.musteri||"")}"></div>`
   + `<datalist id="custlist">${customers.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>`
   + `<div class="row2">`+inp("ulkeSehir","Ülke / Şehir",v.ulkeSehir)+inp("iletisim","İletişim Kişisi",v.iletisim)+`</div>`
   + sel("talepTuru","Talep Türü",v.talepTuru||"Makine Talebi",LIST.talepTuru)
   + inp("urun","Makine / Ürün",v.urun)
   + `<div class="row2">`+inp("adet","Adet",v.adet,"number")+sel("oncelik","Öncelik",v.oncelik||"Orta",LIST.oncelik)+`</div>`
   + txt("aciklama","Açıklama / Detay",v.aciklama)
   + sel("durum","Durum",v.durum||"Yeni Talep",LIST.durum)
   + sel("sorumlu","Sorumlu",v.sorumlu||"Çin Ofisi",LIST.sorumlu)
   + `<div class="row2">`+inp("sonrakiTakip","Sonraki Takip",toISO(v.sonrakiTakip),"date")+inp("sozTeslim","Söz Verilen Teslim",toISO(v.sozTeslim),"date")+`</div>`
   + `<div class="row2">`+sel("incoterm","Incoterm",v.incoterm||"",LIST.incoterm)+sel("yuklemeLimani","Yükleme Limanı",v.yuklemeLimani||"",LIST.liman)+`</div>`
   + `<div class="row2">`+inp("varisLimani","Varış Limanı",v.varisLimani)+inp("konteyner","Konteyner / Takip No",v.konteyner)+`</div>`
   + txt("notlar","Notlar",v.notlar)
   + `<button class="save" id="saveBtn">${t?"Değişiklikleri kaydet":"Talebi ekle"}</button>`;
  $("#saveBtn").onclick=saveTalep;
  openSheet();
}
function openMust(m){
  editing=m||null;
  $("#sheetTitle").textContent = m ? `${m.musteri} · düzenle` : "Yeni Müşteri";
  const v=m||{};
  $("#sheetBody").innerHTML =
     inp("musteri","Müşteri / Şirket",v.musteri)
   + inp("ulkeSehir","Ülke / Şehir",v.ulkeSehir)
   + inp("iletisim","İletişim Kişisi",v.iletisim)
   + `<div class="row2">`+inp("telefon","Telefon / WeChat",v.telefon)+inp("eposta","E-posta",v.eposta)+`</div>`
   + `<button class="save" id="saveBtnM">${m?"Kaydet":"Müşteriyi ekle"}</button>`;
  $("#saveBtnM").onclick=saveMust;
  openSheet();
}
function collect(){
  const o={}; $("#sheetBody").querySelectorAll("[name]").forEach(e=>o[e.name]=e.value.trim()); return o;
}
async function post(payload,btn){
  if(!window.API_URL||API_URL.includes("YAPISTIRIN")){ toast("Önce config.js → API_URL ayarlayın",true); return false; }
  if(btn){btn.disabled=true;btn.textContent="Kaydediliyor…";}
  try{
    const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
    const j=await r.json();
    if(j.ok===false) throw new Error(j.error||"Hata");
    return j;
  }catch(e){ toast("Kaydedilemedi: "+e.message,true); return false; }
  finally{ if(btn){btn.disabled=false;} }
}
async function saveTalep(){
  const d=collect();
  if(!d.musteri){ toast("Müşteri zorunlu",true); return; }
  const payload={action: editing?"updateTalep":"addTalep", row: editing?editing._row:null, data:d};
  const j=await post(payload,$("#saveBtn"));
  if(j){ toast(editing?"Güncellendi":"Talep eklendi"); closeSheet(); await load(); }
}
async function saveMust(){
  const d=collect();
  if(!d.musteri){ toast("Müşteri adı zorunlu",true); return; }
  const payload={action: editing?"updateMusteri":"addMusteri", row: editing?editing._row:null, data:d};
  const j=await post(payload,$("#saveBtnM"));
  if(j){ toast(editing?"Güncellendi":"Müşteri eklendi"); closeSheet(); await load(); }
}

/* ---------- sheet aç/kapat, nav, toast ---------- */
function openSheet(){ $("#scrim").classList.add("open"); $("#sheet").classList.add("open"); }
function closeSheet(){ $("#scrim").classList.remove("open"); $("#sheet").classList.remove("open"); }
$("#scrim").onclick=closeSheet; $("#sheetClose").onclick=closeSheet;
$("#fab").onclick=()=>{ const v=document.querySelector(".nav button.on").dataset.v; v==="must"?openMust(null):openTalep(null); };

document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("on"));
  b.classList.add("on");
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $("#view-"+b.dataset.v).classList.add("active");
  $("#fab").style.display="flex";
});
$("#filters").querySelectorAll("button").forEach(b=>b.onclick=()=>{
  $("#filters").querySelectorAll("button").forEach(x=>x.classList.remove("on"));
  b.classList.add("on"); curFilter=b.dataset.f; renderTalep();
});
$("#search").oninput=renderTalep; $("#searchM").oninput=renderMust;
$("#btnRefresh").onclick=load;
let tT; function toast(msg,err){ const t=$("#toast"); t.textContent=msg; t.className="toast show"+(err?" err":"");
  clearTimeout(tT); tT=setTimeout(()=>t.className="toast",2600); }

/* ---------- service worker ---------- */
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }

load();
