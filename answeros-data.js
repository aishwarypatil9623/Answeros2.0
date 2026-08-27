/* AnswerOS shared data layer
   Google Sheet -> Apps Script -> local cache -> every page.
*/
(function () {
  'use strict';
  const STORAGE={config:'answeros_config_v1',answers:'answeros_answers_v1',hash:'answeros_answers_hash_v1',syncedAt:'answeros_last_sync_v1'};
  const DEFAULTS={syncUrl:'https://script.google.com/macros/s/AKfycbyUFgUono_7Ce9XRuBND1sZXxcwfbiNw_yWn0GCHlsiAzmUiIpYb-_n6545Bv1PyUD3/exec',syncToken:'',autoSyncEnabled:false,syncIntervalMinutes:30};
  function readJSON(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch(_){return fallback;}}
  function getConfig(){return Object.assign({},DEFAULTS,readJSON(STORAGE.config,{}));}
  function saveConfig(patch){const next=Object.assign({},getConfig(),patch||{});localStorage.setItem(STORAGE.config,JSON.stringify(next));return next;}
  function normalizePaper(value){return String(value==null?'':value).trim().replace(/\s+/g,'').toUpperCase();}
  function toNumber(value){if(value===''||value==null)return null;const n=Number(String(value).replace(/,/g,'').replace('%',''));return Number.isFinite(n)?n:null;}
  function toDateString(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,10);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function parseList(value){if(!value)return [];return String(value).split(/\r?\n+/).map(s=>s.trim()).map(s=>s.replace(/^(?:[-•*]|[✓✕❌🔼❎❗])\s*/u,'').trim()).filter(Boolean);}
  function parseDemand(value){if(!value)return [];return String(value).split(/\r?\n+/).map(s=>s.trim()).filter(Boolean).map(text=>{const m=text.match(/^([✓❌✕🔼!])\s*(.*)$/u);const marker=m?m[1]:'';const clean=(m?m[2]:text).trim();let status='partial';if(marker==='✓')status='done';else if(marker==='❌'||marker==='✕')status='missing';return {status,text:clean};});}
  function parseImprovements(value){return parseList(value).map(text=>{const parts=text.split(/\s*→\s*/);return parts.length>1?{issue:parts[0].trim(),fix:parts.slice(1).join(' → ').trim()}:{issue:text,fix:text};});}
  function parseOverallFeedback(value){
    const text=String(value||'').trim();
    if(!text)return {strength:'',gap:'',fix:''};
    const clean=s=>String(s||'').trim().replace(/^[-–—:]+\s*/,'').trim();
    const strength=text.match(/(?:^|\n)\s*(?:Strength|Strengths)\s*:\s*(.*?)(?=\n\s*(?:Gap|Gaps|Fix|Improvements?)\s*:|$)/is);
    const gap=text.match(/(?:^|\n)\s*(?:Gap|Gaps|Improvements?)\s*:\s*(.*?)(?=\n\s*(?:Strength|Strengths|Fix)\s*:|$)/is);
    const fix=text.match(/(?:^|\n)\s*Fix\s*:\s*(.*?)(?=\n\s*(?:Strength|Strengths|Gap|Gaps|Improvements?)\s*:|$)/is);
    return {strength:clean(strength?strength[1]:''),gap:clean(gap?gap[1]:''),fix:clean(fix?fix[1]:'')};
  }
  function deriveGapCategory(row){const text=[row['Missing / Extra Improvements'],row['Overall Feedback'],row['My One Learning']].filter(Boolean).join(' ').toLowerCase();if(/example|data|quantif|statistic/.test(text))return 'Examples & Data';if(/judgment|article|constitutional|legal|statut/.test(text))return 'Legal/Institutional Backing';if(/analysis|analytical|critical|depth|causal/.test(text))return 'Critical Analysis';if(/directive|demand/.test(text))return 'Demand/Directive';if(/intro/.test(text))return 'Introduction';if(/conclusion/.test(text))return 'Conclusion';if(/technical|scientific|mechanism/.test(text))return 'Technical Precision';return 'Content/Depth';}
  function normalizeRow(row,index){
    row=row||{};
    const date=toDateString(row['Question Date']);
    const marks=toNumber(row['Marks']);
    const max=toNumber(row['Max Marks']);
    const demandPctRaw=toNumber(row['% of Demand Addressed']);
    const demandPct=demandPctRaw==null?null:Math.round((demandPctRaw<=1?demandPctRaw*100:demandPctRaw)*10)/10;
    const demandItems=parseDemand(row['Demand of the Question']);
    const improvements=parseImprovements(row['Missing / Extra Improvements']);
    const parsedFeedback=parseOverallFeedback(row['Overall Feedback']);
    return Object.assign({},row,{
      id:String(row['PDF ID']||`${date}-${normalizePaper(row.Paper)}-${index}`),
      date,
      paper:normalizePaper(row.Paper),
      subject:String(row.Subject||'').trim(),
      subtopic:String(row.Subtopic||'').trim(),
      directive:String(row.Directive||'').trim(),
      marks,
      max,
      demandPct,
      wordCount:toNumber(row['Word Count']),
      question:String(row.Question||'').trim(),
      status:String(row.Status||'').trim(),
      gapCategory:deriveGapCategory(row),
      demand:demandItems,
      bestIntro:String(row['Best Introduction']||'').trim(),
      idealSubheadings:parseList(row['Ideal Subheadings']),
      mustHavePoints:parseList(row['Must-Have Points']),
      valueAdditions:parseList(row['Value Additions']),
      keywords:parseList(row['Essential Keywords']),
      examples:parseList(row['Examples/Data']),
      bestConclusion:String(row['Best Conclusion']||'').trim(),
      improvements,
      topperEdge:String(row['Topper Edge']||'').trim(),
      learning:String(row['My One Learning']||'').trim(),
      pdfLink:String(row['PDF Link']||'').trim(),
      pdfId:String(row['PDF ID']||'').trim(),
      pdfDate:date,
      feedback:{
        strength:parsedFeedback.strength || String(row['Overall Feedback']||'').trim(),
        gap:parsedFeedback.gap || String(row['Missing / Extra Improvements']||'').trim(),
        fix:parsedFeedback.fix || String(row['My One Learning']||'').trim()
      }
    });
  }
  function normalizeRows(rows){return (Array.isArray(rows)?rows:[]).map(normalizeRow).filter(r=>r.date||r.question||r.subject).sort((a,b)=>(b.date||'').localeCompare(a.date||''));}
  function stableHash(value){const text=JSON.stringify(value);let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
  function getAnswers(){const cached=readJSON(STORAGE.answers,null);if(Array.isArray(cached))return cached;if(Array.isArray(window.AnswerOSInitialData))return normalizeRows(window.AnswerOSInitialData);return [];}
  function getLastSync(){return localStorage.getItem(STORAGE.syncedAt)||'';}
  function buildUrl(config){if(!config.syncUrl)return '';const url=new URL(config.syncUrl);if(config.syncToken)url.searchParams.set('token',config.syncToken);url.searchParams.set('_ts',Date.now());return url.toString();}
  async function sync(options){const opts=Object.assign({reloadOnChange:false},options||{});const config=getConfig();if(!config.syncUrl)throw new Error('No Apps Script Web App URL configured.');const response=await fetch(buildUrl(config),{method:'GET',mode:'cors',cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json();if(!payload||payload.ok!==true||!Array.isArray(payload.rows))throw new Error(payload&&payload.error?payload.error:'Invalid AnswerOS API response.');const rows=normalizeRows(payload.rows);const nextHash=stableHash(rows);const previousHash=localStorage.getItem(STORAGE.hash)||'';const changed=nextHash!==previousHash;localStorage.setItem(STORAGE.answers,JSON.stringify(rows));localStorage.setItem(STORAGE.hash,nextHash);localStorage.setItem(STORAGE.syncedAt,new Date().toISOString());if(changed&&opts.reloadOnChange){const reloadKey=`answeros_reload_${nextHash}`;if(!sessionStorage.getItem(reloadKey)){sessionStorage.setItem(reloadKey,'1');setTimeout(()=>location.reload(),40);}}window.dispatchEvent(new CustomEvent('answeros:data-updated',{detail:{answers:rows,changed,count:rows.length,syncedAt:getLastSync()}}));return {rows,changed,count:rows.length,syncedAt:getLastSync()};}
  function today(){return new Date();}
  function formatDate(value){const d=value instanceof Date?value:new Date(value);return toDateString(d);}
  function initPage(options){const opts=Object.assign({reloadOnChange:true},options||{});const config=getConfig();sync(opts).catch(error=>{console.warn('[AnswerOS] Sync failed; using cached data.',error);window.dispatchEvent(new CustomEvent('answeros:sync-error',{detail:{error}}));});if(config.autoSyncEnabled){const ms=Math.max(5,Number(config.syncIntervalMinutes)||30)*60*1000;window.setInterval(()=>{sync(opts).catch(error=>console.warn('[AnswerOS] Auto-sync failed.',error));},ms);}}
  window.AnswerOSData={STORAGE,DEFAULTS,getConfig,saveConfig,getAnswers,getLastSync,normalizeRows,sync,initPage,today,formatDate};
})();
