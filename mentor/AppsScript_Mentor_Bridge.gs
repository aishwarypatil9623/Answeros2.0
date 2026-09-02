/**
 * AnswerOS Mentor Bridge v1
 *
 * DROP-IN MODULE for the Apps Script project that currently serves
 * the AnswerOS Google Sheet API.
 *
 * Required Script Properties:
 *   GEMINI_API_KEY   = Gemini API key
 *   MENTOR_AGENT_ID  = optional named managed-agent ID; if blank,
 *                      uses the Antigravity preview base agent.
 *
 * Required sheets:
 *   MENTOR_STATE
 *   MENTOR_LOG
 *   MENTOR_QUEUE
 *
 * The module deliberately keeps Google Sheets as the source of truth.
 * The browser never receives the Gemini key.
 */

const MENTOR_CFG = {
  answersSheet: 'Mains Tracker',
  stateSheet: 'MENTOR_STATE',
  logSheet: 'MENTOR_LOG',
  queueSheet: 'MENTOR_QUEUE',
  apiBase: 'https://generativelanguage.googleapis.com/v1beta',
  baseAgent: 'antigravity-preview-05-2026'
};

function mentorGet_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || '';
}

function mentorJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Add this branch inside your existing doGet(e). */
function mentorDoGet_(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').trim();
  if (action !== 'mentor_state') return null;
  const state = mentorReadState_();
  return mentorJson_({ok:true, state:state});
}

function mentorReadState_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(MENTOR_CFG.stateSheet);
  if (!sh || sh.getLastRow() < 2) return {status:'not_ready'};
  const values = sh.getRange(1,1,sh.getLastRow(),Math.max(2,sh.getLastColumn())).getValues();
  const headers = values[0].map(String);
  const out = {};
  for (let r=1;r<values.length;r++) {
    const key = String(values[r][0] || '').trim();
    if (!key) continue;
    out[key] = values[r][1];
  }
  if (out.state_json) {
    try { return JSON.parse(out.state_json); } catch (_) {}
  }
  return out;
}

function mentorEnsureSheets_() {
  const ss = SpreadsheetApp.getActive();
  const state = ss.getSheetByName(MENTOR_CFG.stateSheet) || ss.insertSheet(MENTOR_CFG.stateSheet);
  const log = ss.getSheetByName(MENTOR_CFG.logSheet) || ss.insertSheet(MENTOR_CFG.logSheet);
  const queue = ss.getSheetByName(MENTOR_CFG.queueSheet) || ss.insertSheet(MENTOR_CFG.queueSheet);
  if (state.getLastRow() === 0) state.getRange(1,1,1,2).setValues([['key','value']]);
  if (log.getLastRow() === 0) log.getRange(1,1,1,5).setValues([['timestamp','event','answer_id','interaction_id','state_json']]);
  if (queue.getLastRow() === 0) queue.getRange(1,1,1,5).setValues([['timestamp','answer_id','status','interaction_id','attempts']]);
}

/** Call this from the same evaluation/update flow that writes a completed answer. */
function mentorEnqueueAnswer_(answerId) {
  mentorEnsureSheets_();
  const sh = SpreadsheetApp.getActive().getSheetByName(MENTOR_CFG.queueSheet);
  sh.appendRow([new Date(), String(answerId), 'queued', '', 0]);
}

function mentorBuildSnapshot_(answerId) {
  const sh = SpreadsheetApp.getActive().getSheetByName(MENTOR_CFG.answersSheet);
  if (!sh) throw new Error('Missing answers sheet: ' + MENTOR_CFG.answersSheet);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error('No answer rows available.');
  const headers = data[0].map(String);
  const rows = data.slice(1).map(row => {
    const o={}; headers.forEach((h,i)=>o[h]=row[i]); return o;
  }).filter(o => Object.keys(o).some(k => String(o[k]||'').trim()));
  const id = String(answerId||'');
  const current = rows.find(o => String(o['PDF ID']||'')===id) || rows[rows.length-1];
  const recent = rows.slice(-12).reverse();
  const state = mentorReadState_();
  return {
    version:'1.0', generated_at:new Date().toISOString(), answer_id:id,
    new_answer:current,
    recent_answers:recent,
    mentor_state:state,
    instructions:{
      do_not_recompute_deterministic_dashboard_metrics:'Use supplied answer fields and trends; do not invent missing measurements.',
      evidence_rule:'Every diagnosis must cite concrete evidence from the supplied history.',
      intervention_rule:'Prefer one primary intervention. Do not create a new intervention for an isolated error.',
      longitudinal_rule:'Look for repeated patterns, trend direction and whether the previous intervention worked.'
    }
  };
}

function mentorStartInteraction_(snapshot) {
  const key = mentorGet_('GEMINI_API_KEY');
  if (!key) throw new Error('Missing Script Property GEMINI_API_KEY');
  const named = mentorGet_('MENTOR_AGENT_ID');
  const agent = named || MENTOR_CFG.baseAgent;
  const instruction = [
    'You are the AnswerOS Mentor for one UPSC CSE 2027 aspirant.',
    'Use only the supplied data unless web research is genuinely necessary.',
    'Diagnose longitudinal performance, not just the latest answer.',
    'Prioritize expected marks impact × frequency × fixability.',
    'Distinguish content gaps from demand/structure/analysis/expression problems.',
    'If answer density is already adequate, do not recommend adding more content.',
    'You may explicitly tell the student what to STOP doing.',
    'Return ONLY valid JSON matching the AnswerOS mentor output schema.',
    JSON.stringify(snapshot)
  ].join('\n\n');
  const payload = {
    agent: agent,
    input: instruction,
    background: true,
    store: true,
    agent_config: {type:'antigravity', model:'gemini-3.7-flash'}
  };
  const res = UrlFetchApp.fetch(MENTOR_CFG.apiBase + '/interactions', {
    method:'post', contentType:'application/json', muteHttpExceptions:true,
    headers:{'x-goog-api-key':key}, payload:JSON.stringify(payload)
  });
  const code=res.getResponseCode(); const body=res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Gemini interaction start failed ('+code+'): '+body);
  return JSON.parse(body);
}

function mentorPollInteraction_(interactionId) {
  const key=mentorGet_('GEMINI_API_KEY');
  const res=UrlFetchApp.fetch(MENTOR_CFG.apiBase + '/interactions/' + encodeURIComponent(interactionId), {
    method:'get', muteHttpExceptions:true, headers:{'x-goog-api-key':key}
  });
  const code=res.getResponseCode(); const body=res.getContentText();
  if(code<200||code>=300) throw new Error('Gemini interaction poll failed ('+code+'): '+body);
  return JSON.parse(body);
}

function mentorExtractJson_(text) {
  const raw=String(text||'').trim();
  try{return JSON.parse(raw);}catch(_){ }
  const match=raw.match(/\{[\s\S]*\}/);
  if(!match) throw new Error('Mentor did not return JSON.');
  return JSON.parse(match[0]);
}

function mentorWriteState_(state) {
  mentorEnsureSheets_();
  const sh=SpreadsheetApp.getActive().getSheetByName(MENTOR_CFG.stateSheet);
  const rows=[['key','value'],['state_json',JSON.stringify(state)]];
  sh.clearContents(); sh.getRange(1,1,rows.length,2).setValues(rows);
}

function mentorLog_(event,answerId,interactionId,state) {
  mentorEnsureSheets_();
  SpreadsheetApp.getActive().getSheetByName(MENTOR_CFG.logSheet)
    .appendRow([new Date(),event,String(answerId||''),String(interactionId||''),JSON.stringify(state||{})]);
}

/** Time-driven worker: start queued jobs, then poll outstanding jobs. */
function mentorProcessQueue() {
  mentorEnsureSheets_();
  const sh=SpreadsheetApp.getActive().getSheetByName(MENTOR_CFG.queueSheet);
  const values=sh.getDataRange().getValues();
  if(values.length<2)return;
  for(let r=1;r<values.length;r++){
    const status=String(values[r][2]||'');
    const answerId=String(values[r][1]||'');
    const interactionId=String(values[r][3]||'');
    try{
      if(status==='queued'){
        const snap=mentorBuildSnapshot_(answerId);
        const interaction=mentorStartInteraction_(snap);
        sh.getRange(r+1,3,1,3).setValues([['running',interaction.id,Number(values[r][4]||0)+1]]);
        mentorLog_('interaction_started',answerId,interaction.id,null);
      } else if(status==='running' && interactionId){
        const result=mentorPollInteraction_(interactionId);
        if(result.status==='completed'){
          const state=mentorExtractJson_(result.output_text || result.outputText || '');
          mentorWriteState_(state);
          mentorLog_('interaction_completed',answerId,interactionId,state);
          sh.getRange(r+1,3).setValue('completed');
        } else if(result.status==='failed'){
          mentorLog_('interaction_failed',answerId,interactionId,{error:result.error||'unknown'});
          sh.getRange(r+1,3).setValue('failed');
        }
      }
    }catch(err){
      sh.getRange(r+1,3).setValue('error');
      mentorLog_('worker_error',answerId,interactionId,{error:String(err)});
    }
  }
}

/** Run once manually to create the worker trigger. */
function installMentorTrigger() {
  const exists=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='mentorProcessQueue');
  if(!exists) ScriptApp.newTrigger('mentorProcessQueue').timeBased().everyMinutes(5).create();
}
