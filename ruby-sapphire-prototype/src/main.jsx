import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Clock,
  Users,
  Flag,
  Camera,
  Check,
  Lock,
  MessageCircle,
  Trophy,
  Compass,
  Send,
  X,
  Sparkles,
} from "lucide-react";
import "./style.css";
import Auth from "./Auth";
import {api, config, savedSession, signOut, uploadPhoto, photoUrl} from "./api";
function formatGame(g) {
  return {...g,time:new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(g.starts_at))};
}
function App() {
  const [page,setPage]=useState('discover'),[game,setGame]=useState(null),[games,setGames]=useState([]),
    [tab,setTab]=useState('tasks'),[message,setMessage]=useState(''),[notice,setNotice]=useState(''),
    [preview,setPreview]=useState(null),[session,setSession]=useState(savedSession),[authOpen,setAuthOpen]=useState(false),
    [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[syncError,setSyncError]=useState('');
  const currentGame=useRef(null); currentGame.current=game?.id;
  const tasks=game?.tasks||[],chat=game?.messages||[],team=game?.team;
  const started=game?.started||false,winner=game?.winner;
  const photos=Object.fromEntries((game?.completions||[]).map(c=>[c.task_id,c.photo_path]));
  const completed=Object.keys(photos).length, total=game?.task_count||0;
  const user=session?.user,name=user?.user_metadata?.name||'Player';
  const notify=s=>{setNotice(s);setTimeout(()=>setNotice(''),5000)};
  useEffect(()=>{const change=()=>setSession(savedSession());window.addEventListener('sessionchange',change);window.addEventListener('storage',change);return()=>{window.removeEventListener('sessionchange',change);window.removeEventListener('storage',change)}},[]);
  useEffect(()=>{let active=true;setLoading(true);setGame(null);setPage('discover');
    async function refresh(){try{await config();const data=await api('/games');if(active){setGames(data.map(formatGame));setLoadError('');setLoading(false);}}catch(e){if(active){setLoadError(e.message);setLoading(false)}}}
    refresh();const id=setInterval(refresh,15000);return()=>{active=false;clearInterval(id)};
  },[user?.id]);
  useEffect(()=>{if(!game?.id)return;let active=true;const id=game.id;
    async function refresh(){try{const data=await api('/games/'+id);if(active){setGame(formatGame(data));setSyncError('')}}catch(e){if(active)setSyncError(e.message)}}
    const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer)};
  },[game?.id,user?.id]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  async function join(g){if(!user){setAuthOpen(true);return;}setBusy(true);try{if(!g.team)await api('/games/'+g.id+'/join',{});const state=await api('/games/'+g.id);setGame(formatGame(state));setPage('game');setTab('tasks');setGames((await api('/games')).map(formatGame));}catch(e){notify(e.message)}finally{setBusy(false)}}
  async function upload(e,id){const file=e.target.files?.[0];e.target.value='';if(!file)return;const gameId=game.id;setBusy(true);try{const state=await uploadPhoto(gameId,id,file);if(currentGame.current===gameId){setGame(formatGame(state));notify('Photo saved. Task complete!')}}catch(e){notify(e.message)}finally{setBusy(false)}}
  async function showPhoto(path){try{setPreview(await photoUrl(path))}catch(e){notify(e.message)}}
  async function sendMessage(e){e.preventDefault();if(!message.trim()||busy)return;const gameId=game.id;setBusy(true);try{await api('/games/'+gameId+'/messages',{body:message.trim()});setMessage('');const state=await api('/games/'+gameId);if(currentGame.current===gameId)setGame(formatGame(state));}catch(e){notify(e.message)}finally{setBusy(false)}}
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("discover");
          }}
        >
          <span className="brand-shapes">
            ◆<b>◆</b>
          </span>
          <span className="wordmark">RUBY <em>vs</em><br/>SAPPHIRE</span><span className="beta">THE OUTSIDE GAME</span>
        </a>
        <nav>
          <button
            className={page === "discover" ? "active" : ""}
            onClick={() => setPage("discover")}
          >
            Find a game
          </button>
          <button
            className={page === "game" ? "active" : ""}
            onClick={() =>
              game ? setPage("game") : games.some(g=>g.team) ? join(games.find(g=>g.team)) : notify("Join a game to meet your team.")
            }
          >
            My game{game && <i />}
          </button>
        </nav>
        <div className="profile">
          {user ? <><span>{name[0]?.toUpperCase()}</span><div>{name}<small><button onClick={()=>signOut()}>Sign out</button></small></div></> : <button className="join" onClick={()=>setAuthOpen(true)}>Sign in</button>}
        </div>
      </header>
      <main id="main">
        {page === "discover" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow"><span className="live-dot"/> REAL-WORLD SCAVENGER HUNTS</span>
                <h1>GO OUT.<br/><span>GO ALL IN.</span></h1>
                <div className="hero-bottom"><p>Two teams. One city. A race to find the unexpected.<br/>Meet your crew, chase the clues, get the photo.</p>
                <a className="primary" href="#games">Find a game <ArrowUpRight size={22}/></a></div>
              </div>
              <div className="match-poster" role="img" aria-label="Ruby versus Sapphire: two teams racing to the finish">
                <div className="poster-top"><span>R / S — FIELD SERIES</span><span>EVERYONE PLAYS.</span></div>
                <svg className="race-art" viewBox="0 0 440 400" aria-hidden="true">
                  <defs><pattern id="finish" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#eae8e0"/><rect x="10" y="10" width="10" height="10" fill="#eae8e0"/></pattern></defs>
                  <path d="M-40 320 L260 20 Q330 -50 400 20 Q470 90 400 160 L140 420" fill="none" stroke="#41434c" strokeWidth="1"/>
                  <path d="M-10 350 L290 50 Q330 10 370 50 Q410 90 370 130 L110 390" fill="none" stroke="#41434c" strokeWidth="1"/>
                  <path d="M20 380 L320 80 Q330 70 340 80 Q350 90 340 100 L80 360" fill="none" stroke="#41434c" strokeWidth="1"/>
                  <g className="ruby-emblem" transform="translate(119 141) rotate(-12)"><path d="M0 -109 L101 -35 L62 85 L-62 85 L-101 -35Z" fill="#ed3a30"/><path d="M-72 -28 H72 M0 -109 L-32 -28 L0 85 L32 -28Z M-101 -35 L0 85 L101 -35" fill="none" stroke="#fcafa2" strokeWidth="1"/><text textAnchor="middle" y="26" fill="#fff9ed" fontSize="88" fontFamily="Impact, sans-serif">R</text></g>
                  <g className="sapphire-emblem" transform="translate(300 258) rotate(10)"><path d="M-72 -90 H72 L106 0 L50 94 H-50 L-106 0Z" fill="#244cde"/><path d="M-72 -90 L-48 0 L-50 94 M72 -90 L48 0 L50 94 M-106 0 H106 M-72 -90 L0 -45 L72 -90 M-50 94 L0 40 L50 94" fill="none" stroke="#92a9fc" strokeWidth="1"/><text textAnchor="middle" y="32" fill="#fff9ed" fontSize="88" fontFamily="Impact, sans-serif">S</text></g>
                  <circle cx="220" cy="194" r="33" fill="#171719"/><text x="220" y="201" textAnchor="middle" fill="#fff9ed" fontSize="19" fontWeight="bold" fontFamily="monospace">VS</text>
                  <rect x="16" y="349" width="80" height="40" fill="url(#finish)"/>
                  <path d="M352 30 H409 V87 M409 30 L355 84" fill="none" stroke="#eae8e0" strokeWidth="3"/>
                </svg>
                <div className="poster-bottom"><span>GOOD PEOPLE.<br/>HEALTHY COMPETITION.</span><span className="poster-seal">TAKE IT<br/>OUTSIDE ↗</span></div>
              </div>
            </section>
            <div className="match-strip"><span><b className="ruby-label">TEAM RUBY</b> <i>vs</i> <b className="sapphire-label">TEAM SAPPHIRE</b></span><span>SHOW UP SOLO. LEAVE WITH A CREW.</span><ArrowRight size={22}/></div>
            <section id="games" className="games">
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    01 / FIND YOUR NEXT GAME
                  </span>
                  <h2>THE STARTING LINE.</h2>
                </div>
                <span className="location">
                  <MapPin size={15} /> New York, NY
                </span>
              </div>
              <div className="game-list">
                <div className="table-head">
                  <span>LOCATION</span>
                  <span>WHEN</span>
                  <span>ROSTER</span>
                  <span />
                </div>
                {loading && <p className="empty-state">Loading adventures…</p>}
                {loadError && <p className="empty-state form-error" role="alert">{loadError}</p>}
                {!loading && !loadError && !games.length && <p className="empty-state">No games scheduled yet. Check back soon.</p>}
                {games.map((g, i) => (
                  <div className="game-row" key={g.id}>
                    <div className="place">
                      <span className={"place-icon place-" + i}>
                        <span>{String(i+1).padStart(2,"0")}</span>
                      </span>
                      <div>
                        <h3>{g.place}</h3>
                        <small>{g.area}</small>
                      </div>
                    </div>
                    <div className="when">
                      <Clock size={15} />
                      {g.time}
                    </div>
                    <div className="capacity">
                      <span>
                        <Users size={15} />
                        {g.players}
                        <small>/ {g.team_capacity*2} players</small>
                      </span>
                      <div>
                        <i style={{ width: (g.players / (g.team_capacity*2)) * 100 + "%" }} />
                      </div>
                    </div>
                    <button
                      disabled={busy || (!g.team && (g.players >= g.team_capacity*2 || !!g.winner || new Date(g.starts_at)<=new Date()))}
                      className="join"
                      onClick={() => join(g)}
                    >
                      {g.team ? 'Open game' : g.winner ? 'Finished' : new Date(g.starts_at)<=new Date() ? 'Started' : g.players >= g.team_capacity*2 ? 'Game full' : 'Join game'}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="game-foot">
                <span>
                  Two teams. Up to 10 players each. Everyone’s welcome.
                </span>
                <span>
                  <Sparkles size={14} /> Bring your phone. We’ll handle the teams.
                </span>
              </div>
            </section>
            <section className="steps">
              {[
                [
                  "01",
                  "PICK YOUR GROUND.",
                  "Choose a place and time. We’ll put you on a balanced team. No crew required.",
                ],
                [
                  "02",
                  "CHASE THE CLUES.",
                  "The clock starts. Tasks unlock. Get out there and upload the proof.",
                ],
                [
                  "03",
                  "CLAIM THE BRAGGING RIGHTS.",
                  "First team to finish takes the win. Both teams meet up afterward.",
                ],
              ].map(([n, t, d]) => (
                <div key={n}>
                  <span>{n}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </section>
          </>
        ) : (
          <>
            <div className="backline">
              <button onClick={() => setPage("discover")}>
                ← All adventures
              </button>
              <span className={"status " + (winner ? "finished" : "")}>
                {winner
                  ? "GAME COMPLETE"
                  : started
                    ? "● GAME ON"
                    : "PRE-GAME"}
              </span>
            </div>
            <section className={"game-heading team-"+team?.toLowerCase()}>
              <div>
                <span className="eyebrow">{game.area}</span>
                <h1>{game.place}</h1>
                <p>
                  <Clock size={16} />
                  {game.time}
                  <span>·</span>
                  <Users size={16} /> {game.players} players
                </p>
              </div>
              <div className={"team-badge " + team?.toLowerCase()}>
                ◆
                <div>
                  YOU’RE ON TEAM<h3>{team}</h3>
                  <small>Automatically assigned · balanced teams</small>
                </div>
              </div>
            </section>
            {winner && (
              <section className="win" role="alert">
                <Trophy size={34} />
                <div>
                  <h2>Team {winner} takes the win!</h2>
                  <p>
                    The game is complete. Both teams, meet at{" "}
                    <strong>{game.meeting}</strong> to celebrate and share your
                    stories.
                  </p>
                </div>
                <span>✦</span>
              </section>
            )}
            <div className="game-layout">
              <section>
                <div className="tabs">
                  <button
                    className={tab === "tasks" ? "selected" : ""}
                    onClick={() => setTab("tasks")}
                  >
                    <Flag size={17} /> Your tasks{" "}
                    {started && (
                      <b>
                        {completed}/{total}
                      </b>
                    )}
                  </button>
                  <button
                    className={tab === "chat" ? "selected" : ""}
                    onClick={() => setTab("chat")}
                  >
                    <MessageCircle size={17} /> Team chat <b>{chat.length}</b>
                  </button>
                </div>
                {tab === "tasks" ? (
                  !started ? (
                    <div className="waiting">
                      <div className="lock-icon">
                        <Lock size={30} />
                      </div>
                      <span className="eyebrow">
                        THE BRIEFING IS UNDER WRAPS
                      </span>
                      <h2>HOLD THE STARTING LINE.</h2>
                      <p>
                        Your tasks unlock at {game.time}. Get to
                        the park, meet your {team} teammates, and get ready to
                        explore.
                      </p>
                      <div>
                        <MapPin size={18} />
                        <span>
                          Start & finish meetup<strong>{game.meeting}</strong>
                        </span>
                      </div>
                      <small>Your team chat is open. Go say hello!</small>
                    </div>
                  ) : (
                    <div className="task-list">
                      <div className="task-intro">
                        <p>YOUR MISSION LIST.</p>
                        <small>Upload a photo to complete each task.</small>
                      </div>
                      {tasks.map((t, i) => (
                        <article
                          key={t.id}
                          className={"task " + (photos[t.id] ? "done" : "")}
                        >
                          <div className="task-symbol">
                            {photos[t.id] ? <Check /> : '✳'}
                          </div>
                          <div className="task-content">
                            <span className="eyebrow">
                              {t.kind} · TASK 0{i + 1}
                            </span>
                            <h3>{t.title}</h3>
                            <p>{t.description}</p>
                            {photos[t.id] ? (
                              <button
                                className="evidence"
                                onClick={() => showPhoto(photos[t.id])}
                              >
                                <Camera size={20}/>
                                Proof submitted · View photo{" "}
                                <Check size={14} />
                              </button>
                            ) : (
                              <label
                                className={
                                  "upload " + (winner ? "disabled" : "")
                                }
                              >
                                <Camera size={16} />
                                {winner ? "Game ended" : busy ? "Please wait…" : "Add photo"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={!!winner || busy}
                                  onChange={(e) => upload(e, t.id)}
                                />
                              </label>
                            )}
                          </div>
                          <span className="task-number">
                            {photos[t.id] ? "DONE" : `0${i + 1}`}
                          </span>
                        </article>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="chat">
                    <div className="chat-heading">
                      <span className="ruby-dot" />
                      <div>
                        <h3>The {team} crew</h3>
                        <small>Private team chat · updates every 5 seconds</small>
                      </div>
                    </div>
                    <div className="messages" aria-live="polite">
                      {!chat.length && <div className="chat-empty"><MessageCircle size={32}/><h3>First one here?</h3><p>Say hello. This conversation is just for your team.</p></div>}
                      {chat.map((m, i) => (
                        <div
                          key={i}
                          className={
                            "message " + (m.user_id === user?.id ? "mine" : "")
                          }
                        >
                          <span>{m.name[0]}</span>
                          <div>
                            <small>{m.name}</small>
                            <p>{m.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={sendMessage}>
                      <input
                        aria-label="Message your team"
                        placeholder="Say something to your team…"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={500}
                      />
                      <button className="primary" aria-label="Send message" disabled={busy || !message.trim()}>
                        <Send size={18} />
                      </button>
                    </form>
                  </div>
                )}
              </section>
              <aside>
                <div className="leaderboard">
                  <span className="eyebrow">
                    <Trophy size={16} /> THE MATCH
                  </span>
                  <h2>SCOREBOARD.</h2>
                  <p>First team to finish every task wins.</p>
                  {[
                    ["Ruby", game.scores.Ruby, "ruby"],
                    ["Sapphire", game.scores.Sapphire, "sapphire"],
                  ]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, n, color], i) => (
                      <div className={"score " + color} key={name}>
                        <div>
                          <span className="rank">0{i + 1}</span>
                          <strong>{name.toUpperCase()}</strong>
                          {name === team && <small>YOU</small>}
                        </div>
                        <div className="score-digits"><span>{String(n).padStart(2,'0')}</span><small>/ {String(total).padStart(2,'0')}</small></div>
                        <div className="bar">
                          <i style={{ width: (total ? n / total : 0) * 100 + "%" }} />
                        </div>
                        <p>
                          <strong>{n} / {total} completed</strong>
                          <span>{total - n} left</span>
                        </p>
                      </div>
                    ))}
                  <small className="leader-note">
                    {started
                      ? "Shared scores · updates every 5 seconds"
                      : "The race begins when tasks unlock."}
                  </small>
                </div>
                <div className="meetup">
                  <Compass size={25} />
                  <h3>THE RENDEZVOUS.</h3>
                  <p>
                    When the first team finishes, everyone gets the meetup
                    alert. Meet here to settle the bragging rights.
                  </p>
                  <span>
                    <MapPin size={15} />
                    {game.meeting}
                  </span>
                </div>
              </aside>
            </div>
            {syncError && <p className="sync-error" role="alert">Updates paused: {syncError} Retrying automatically.</p>}
            <p className="game-help">Your registration, messages, and photo evidence are saved. Keep this page open for the game-end alert.</p>
          </>
        )}
        <footer>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("discover");
            }}
          >
            RUBY <em>vs</em> SAPPHIRE
          </a>
          <span>LESS SCROLL. MORE SIDE QUEST.</span>
          <a className="back-top" href="#">BACK TO TOP ↑</a>
        </footer>
      </main>
      {authOpen && <Auth onClose={()=>setAuthOpen(false)} onSuccess={()=>{setAuthOpen(false);notify('Signed in. Pick a game to join your crew.')}}/>}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {preview && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Photo evidence"
          onClick={() => setPreview(null)}
        >
          <button aria-label="Close photo" autoFocus>
            <X />
          </button>
          <img src={preview} alt="Uploaded task evidence" />
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
