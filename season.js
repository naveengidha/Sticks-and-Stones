/* season.js — shared season integration helpers */
/* Loaded by all game pages to enable "Add to Season" at round end */

const SEASON_TEAM_GAMES = new Set(['scramble','foursomes','vegas']);
const SEASON_BASE_PTS = [3, 2, 1];

function _seasonLoadSeasons(){
  try{ return JSON.parse(localStorage.getItem('seasons')||'[]'); }catch(e){ return []; }
}
function _seasonSaveSeasons(arr){ localStorage.setItem('seasons', JSON.stringify(arr)); }

/* ── Derive finishing positions from a gameHistory record ── */
function derivePositions(r){
  switch(r.game){
    case 'f1':
    case 'stableford':
    case 'wolf':
      return _rankByTotals(r.players, r.playerTotals, 'desc');
    case 'stroke':
      return _rankByTotals(r.players, r.playerTotals, 'asc');
    case 'banker':
      return _rankByTotals(r.players, r.playerNetTotals, 'desc');
    case 'scramble':{
      if(!r.teamScores || r.teamScores.length < 2) return [];
      let aWins = r.teamScores[0] < r.teamScores[1];
      let tie   = r.teamScores[0] === r.teamScores[1];
      let out = [];
      (r.playerNames||[]).forEach((team,ti)=>{
        team.forEach(name=>{
          if(name) out.push({name, position: (tie||ti===0&&aWins||ti===1&&!aWins) ? 1 : 2});
        });
      });
      if(tie) out.forEach(p=>p.position=1);
      return out;
    }
    case 'foursomes':{
      let ms = r.matchStatus||0;
      return (r.players||[]).map((name,i)=>({
        name,
        position: ms===0 ? 1 : (ms>0 ? (i<2?1:2) : (i<2?2:1))
      }));
    }
    case 'vegas':{
      if(!r.unitTotals || r.unitTotals.length < 2) return [];
      let bWins = r.unitTotals[0] > r.unitTotals[1];
      let tie   = r.unitTotals[0] === r.unitTotals[1];
      return (r.players||[]).map((name,i)=>({
        name,
        position: tie ? 1 : (bWins ? (i<2?1:2) : (i<2?2:1))
      }));
    }
    case 'matchplay':{
      // one entry per match; each match produces a win/loss/halve
      let out = {};
      (r.matchResults||[]).forEach(m=>{
        let p1 = r.players[m.p1], p2 = r.players[m.p2];
        if(!p1||!p2) return;
        if(m.status==='p1wins'){ out[p1]=(out[p1]||[]).concat(1); out[p2]=(out[p2]||[]).concat(2); }
        else if(m.status==='p2wins'){ out[p2]=(out[p2]||[]).concat(1); out[p1]=(out[p1]||[]).concat(2); }
        else { out[p1]=(out[p1]||[]).concat(1); out[p2]=(out[p2]||[]).concat(1); }
      });
      // aggregate: avg position across all matches, then rank
      return Object.entries(out).map(([name,positions])=>{
        let avg = positions.reduce((a,b)=>a+b,0)/positions.length;
        return {name, _avg: avg};
      }).sort((a,b)=>a._avg-b._avg).map((p,i,arr)=>{
        // give same position to tied averages
        let pos = 1;
        if(i>0 && arr[i-1]._avg===p._avg) pos = arr[i-1]._pos;
        else pos = i+1;
        p._pos = pos;
        return {name:p.name, position:pos};
      });
    }
    default: return [];
  }
}

function _rankByTotals(players, totals, dir){
  let pairs = players.map((name,i)=>({name, val:totals[i]||0}));
  pairs.sort((a,b)=> dir==='desc' ? b.val-a.val : a.val-b.val);
  let out = [], rank=1;
  for(let i=0;i<pairs.length;i++){
    if(i>0 && pairs[i].val!==pairs[i-1].val) rank=i+1;
    out.push({name:pairs[i].name, position:rank});
  }
  return out;
}

/* ── calcPoints (mirrors season.html logic) ── */
function seasonCalcPoints(positions, game, season){
  if(SEASON_TEAM_GAMES.has(game)){
    return positions.map(p=>({
      playerIdx: p.playerIdx,
      position: p.position,
      points: p.position===1 ? SEASON_BASE_PTS[0] : 0
    }));
  }
  let playing = positions.filter(p=>p.position!==null);
  let byPos = {};
  playing.forEach(p=>{ (byPos[p.position]=byPos[p.position]||[]).push(p.playerIdx); });
  let result = positions.map(p=>({playerIdx:p.playerIdx, position:p.position, points:0}));
  let sortedPos = Object.keys(byPos).map(Number).sort((a,b)=>a-b);
  let rank=0;
  sortedPos.forEach(pos=>{
    let tied=byPos[pos], slots=tied.length;
    let total=0;
    for(let i=0;i<slots;i++) total+=SEASON_BASE_PTS[rank+i]||0;
    let share=total/slots;
    tied.forEach(idx=>{ let r=result.find(x=>x.playerIdx===idx); if(r) r.points=share; });
    rank+=slots;
  });
  return result;
}

/* ── UI helpers ── */
function _fmtPts(v){ return v===0?'0': v%1===0?String(v):v.toFixed(1); }
function _ord(n){ return n===1?'1st':n===2?'2nd':n===3?'3rd':n+'th'; }
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Main entry point ── */
function promptAddToSeason(gameRecord){
  if(!gameRecord) return;
  let seasons = _seasonLoadSeasons().filter(s=>
    s.status==='active' && s.allowedGames && s.allowedGames.includes(gameRecord.game)
  );
  if(!seasons.length) return;

  // Remove any existing overlay
  let existing = document.getElementById('_seasonPrompt');
  if(existing) existing.remove();

  let positions = derivePositions(gameRecord);

  let overlay = document.createElement('div');
  overlay.id = '_seasonPrompt';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;align-items:flex-end;justify-content:center;z-index:9999;padding:0 0 env(safe-area-inset-bottom,0);';

  let sheet = document.createElement('div');
  sheet.style.cssText = 'background:#0e1a12;border:2px solid #8B6914;border-bottom:none;border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 28px;font-family:Arial,Helvetica,sans-serif;box-shadow:0 -4px 24px rgba(0,0,0,0.7);';

  let seasonOpts = seasons.map(s=>`<option value="${s.id}">${_esc(s.name)}</option>`).join('');

  let posRows = positions.map(p=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,212,71,0.08);font-size:13px;">
      <span style="color:rgba(255,255,255,0.75);">${_esc(p.name)}</span>
      <span style="color:rgba(255,212,71,0.7);font-family:'Courier New',monospace;">${_ord(p.position)}</span>
    </div>`).join('');

  sheet.innerHTML = `
    <div style="color:#ffd447;font-size:16px;font-weight:bold;margin-bottom:14px;letter-spacing:.5px;">🏆 Add to Season?</div>
    <select id="_seasonSelect" style="width:100%;padding:10px;border-radius:6px;border:1px solid rgba(184,150,46,0.4);border-bottom:2px solid rgba(184,150,46,0.6);color:white;font-size:15px;background:rgba(0,0,0,0.4);margin-bottom:14px;-webkit-appearance:none;">${seasonOpts}</select>
    <div style="background:rgba(0,0,0,0.25);border-radius:8px;padding:8px 10px;margin-bottom:14px;">${posRows}</div>
    <div id="_seasonWarn" style="display:none;color:#ff6b6b;font-size:12px;margin-bottom:10px;line-height:1.5;"></div>
    <button id="_seasonConfirm" style="width:100%;padding:13px;border:none;border-radius:8px;font-size:15px;font-weight:bold;background:linear-gradient(135deg,#8B6914,#ffd447,#8B6914);color:#0a0a00;cursor:pointer;margin-bottom:8px;letter-spacing:.5px;">Add to Season</button>
    <button id="_seasonSkip" style="width:100%;padding:10px;border-radius:8px;font-size:14px;font-weight:bold;background:transparent;border:1px solid rgba(255,212,71,0.25);color:rgba(255,212,71,0.6);cursor:pointer;letter-spacing:.5px;">Skip</button>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  function dismiss(){ overlay.remove(); }

  overlay.addEventListener('click', e=>{ if(e.target===overlay) dismiss(); });
  document.getElementById('_seasonSkip').addEventListener('click', dismiss);

  document.getElementById('_seasonConfirm').addEventListener('click', ()=>{
    let seasonId = parseInt(document.getElementById('_seasonSelect').value);
    let warn = document.getElementById('_seasonWarn');
    let err = _addRoundToSeason(seasonId, gameRecord, positions);
    if(err){
      warn.textContent = err;
      warn.style.display = 'block';
      return;
    }
    dismiss();
    _showSeasonToast('Added to season ✓');
  });
}

function _addRoundToSeason(seasonId, gameRecord, positions){
  let seasons = _seasonLoadSeasons();
  let season = seasons.find(s=>s.id===seasonId);
  if(!season) return 'Season not found.';

  // Validate all names match season players (case-insensitive)
  let seasonNames = season.players.map(p=>p.name.trim().toLowerCase());
  let unmatched = positions.map(p=>p.name).filter(n=> !seasonNames.includes(n.trim().toLowerCase()));
  if(unmatched.length){
    return 'Name mismatch — not in season: ' + unmatched.map(_esc).join(', ') + '. Fix names in the game or season settings to match exactly.';
  }

  // Build positions array with playerIdx
  let positionsWithIdx = positions.map(p=>{
    let idx = season.players.findIndex(sp=>sp.name.trim().toLowerCase()===p.name.trim().toLowerCase());
    return {playerIdx:idx, position:p.position};
  });

  let playerFinishes = seasonCalcPoints(positionsWithIdx, gameRecord.game, season);

  let round = {
    id: Date.now(),
    game: gameRecord.game,
    date: gameRecord.date,
    course: gameRecord.course||'',
    playerFinishes,
    notes: '',
    sourceGameId: gameRecord.id
  };

  season.rounds.push(round);
  if(season.seasonLength !== null && season.rounds.length >= season.seasonLength) season.status = 'complete';
  _seasonSaveSeasons(seasons);
  return null; // success
}

function _updateSeasonRound(seasonId, sourceGameId, newGameRecord){
  let seasons = _seasonLoadSeasons();
  let season = seasons.find(s=>s.id===seasonId);
  if(!season) return 'Season not found.';
  let roundIdx = season.rounds.findIndex(r=>r.sourceGameId===sourceGameId);
  if(roundIdx === -1) return 'Round not found in season.';

  let positions = derivePositions(newGameRecord);
  let positionsWithIdx = positions.map(p=>{
    let idx = season.players.findIndex(sp=>sp.name.trim().toLowerCase()===p.name.trim().toLowerCase());
    return {playerIdx:idx, position:p.position};
  });
  let playerFinishes = seasonCalcPoints(positionsWithIdx, newGameRecord.game, season);

  season.rounds[roundIdx].playerFinishes = playerFinishes;
  season.rounds[roundIdx].date = newGameRecord.date;
  season.rounds[roundIdx].course = newGameRecord.course||'';
  _seasonSaveSeasons(seasons);
  return null;
}

function _showSeasonToast(msg){
  let t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a2e1a;border:1px solid #8B6914;color:#ffd447;font-size:13px;font-weight:bold;padding:10px 20px;border-radius:20px;z-index:9999;pointer-events:none;font-family:Arial,Helvetica,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.6);';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2800);
}
