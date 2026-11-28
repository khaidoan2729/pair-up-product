const $ = s => document.querySelector(s);
const app = $('#app'), dialog = $('#dialog');
const S = {user:null,storage:'sqlite',door:false,view:'login',mode:sessionStorage.getItem('pair-up-mode')||'live',room:null,selected:null,pick:[],source:'automatic',status:null,doorPerson:null,doorCode:'',busy:false,edit:false};
const levels=['Beginner','Intermediate','Advanced'],intensities=['Light','Medium','Hard'],preferences={same:'Same level',above:'A bit above',any:'No preference'};
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(text,action,cls='',attrs='')=>`<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const brand=()=>`<a class="brand" href="/" aria-label="Pair Up home"><span class="brand-icon" aria-hidden="true">✧</span>Pair Up</a>`;
function ball(chips=['Beginner','Light','Medium','Same level','Any partner'],shaking=false){return `<div class="ball-wrap ${shaking?'shaking':''}" aria-hidden="true"><div class="ball-glow"></div><div class="ball"><span class="sparkle">✦</span>${chips.slice(0,5).map(c=>`<span class="ball-chip">${esc(c)}</span>`).join('')}</div><div class="ball-base"></div></div>`;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(S.toastTimer);S.toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
async function api(path,body){const response=await fetch(path,{credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Could not complete this action.'),{status:response.status});return data;}
function error(message){const target=dialog.open?dialog.querySelector('.error'):app.querySelector('.error');if(target){target.textContent=message;target.scrollIntoView({block:'nearest'});}else toast(message);}
function modal(html){dialog.innerHTML=`${btn('×','close-modal','ghost dialog-close','aria-label="Close dialog"')}<div class="error" role="alert"></div>${html}`;dialog.showModal();}
function closeModal(){dialog.close();dialog.innerHTML='';}
const privacy=()=>`<div class="privacy"><span class="lock" aria-hidden="true">♙</span><span>Only coaches see your skill and preferences. Other members see partner names only.</span></div>`;
function resetDoorIdle(){clearTimeout(S.doorIdle);if(S.view==='door-profile')S.doorIdle=setTimeout(()=>{S.doorPerson=null;S.doorCode='';S.edit=false;setView('door');toast('Check-in cleared after inactivity. Please start again.');},90000);}
function setView(view){S.view=view;S.selected=null;S.pick=[];resetDoorIdle();render();window.scrollTo(0,0);const h=app.querySelector('h1');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
document.addEventListener('pointerdown',resetDoorIdle,{passive:true});
document.addEventListener('keydown',resetDoorIdle);

// Coach-only helpers: member names, coach notes and the tappable person tile.
const nameOf=id=>S.room?.roster.find(p=>p.id===id)?.name||'Member';
const apartWith=(p,roster)=>(p.apart?.[0]&&roster.find(m=>m.id===p.apart[0]))||roster.find(m=>m.apart?.includes(p.id))||null;
function noteParts(p,roster){const out=[];if(p.note)out.push(p.note);if(p.needsLevel)out.push(`needs a ${levels[p.needsLevel-1]} partner`);const other=apartWith(p,roster);if(other)out.push(`keep apart from ${other.name}`);return out;}
const tile=(p,action,selected,label)=>`<button class="person ${selected?'selected':''}" data-action="${action}" data-id="${esc(p.id)}" aria-pressed="${selected}" aria-label="${esc(label)}">${esc(p.name)}<small>${levels[p.level-1]} · ${intensities[p.intensity-1]}</small>${noteParts(p,S.room.roster).length?'<small class="note-badge">Coach note</small>':''}</button>`;

function shell(content,narrow=false){const coach=S.user?.role==='coach';return `<div class="shell"><aside class="sidebar">${brand()}<div class="club-label">UBC Boxing Club</div><nav aria-label="Main navigation">${coach?`<button class="nav-item ${S.view==='coach'||S.view==='shaking'?'active':''}" data-action="coach"><span class="nav-symbol" aria-hidden="true">▦</span>Class & pairing</button>`:''}<button class="nav-item ${['member','success'].includes(S.view)?'active':''}" data-action="member"><span class="nav-symbol" aria-hidden="true">✓</span>My check-in</button>${coach?`<button class="nav-item" data-action="open-door"><span class="nav-symbol" aria-hidden="true">▯</span>Door check-in</button>`:''}<button class="nav-item" data-action="account"><span class="nav-symbol" aria-hidden="true">♙</span>My account</button></nav><div class="side-bottom"><div class="identity"><span class="avatar">${esc(S.user?.name?.slice(0,2).toUpperCase())}</span><div><div class="name">${esc(S.user?.name)}</div><small>${coach?'Coach':'Member'}</small></div></div>${btn('Sign out','logout','ghost small full')}<div class="footnote">Built for better training.</div></div></aside><div class="workspace"><header class="topbar">${brand()}<span class="topbar-label">UBC Boxing Club <span aria-hidden="true">/</span> ${coach?'Coach space':'Member space'}</span><div class="header-actions"><span class="pill neutral"><span class="status-dot"></span>${S.storage==='memory'?'Temporary session':'Connected'}</span><div class="mobile-nav">${coach?btn('Coach','coach','ghost small'):''}${btn('Account','account','ghost small')}</div></div></header><main id="main" class="content ${narrow?'narrow':''}">${S.storage==='memory'?'<div class="setup-note">Local test mode · accounts and classes reset when the server restarts.</div>':''}<div class="error" role="alert"></div>${content}</main></div></div>`;}
function auth(){const signup=S.view==='signup';return `<div class="auth-shell"><section class="auth-main">${brand()}<main id="main" class="auth-form"><div class="eyebrow">UBC Boxing Club</div><h1>${signup?'A better session<br>starts here.':'Welcome back.'}</h1><p class="subtitle">${signup?'Make your profile once. Check in in seconds.':'Check in, find your partner, and get training.'}</p><div class="error" role="alert"></div><form id="auth-form" class="form">${signup?'<label class="field">Your name<input name="name" autocomplete="name" maxlength="60" placeholder="How should we call you?" required></label>':''}<label class="field">Email address<input name="email" type="email" autocomplete="username" placeholder="you@example.com" required maxlength="180"></label><label class="field">Password<input name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" placeholder="${signup?'At least 10 characters':'Your password'}" minlength="${signup?10:1}" maxlength="128" required></label>${signup?`<label class="field">Joining as<select name="role" id="role"><option value="member">Club member</option><option value="coach">Coach (invitation required)</option></select></label><label class="field hide" id="invite-field">Coach invitation code<input name="invite" autocomplete="off" placeholder="Code from your club administrator"></label>`:''}<button class="btn primary full" type="submit">${signup?'Create account':'Sign in'} <span aria-hidden="true">→</span></button></form><div class="auth-links">${signup?'Already a member?':'New to Pair Up?'}<button class="text-btn" data-action="${signup?'login':'signup'}">${signup?'Sign in':'Create an account'}</button></div><div class="divider">at the club?</div>${btn('Open shared door check-in','door','full')}<p class="footnote">${signup?'No email verification or password-reset email is enabled in this prototype.':'Your training preferences stay between you and your coaches.'}</p></main><div class="auth-footer">Pair Up · CPEN 441 · Group 2</div></section><aside class="auth-art"><div class="eyebrow">Good partners. Better training.</div>${ball(['Priya','Arjun','Natalie','Chloe','Maya'])}<h2>A little magic.<br>A coach’s final say.</h2><p>Thoughtful partner suggestions, built around your skill, intensity, and how you want to train.</p></aside></div>`;}
function choice(name,values,current,descs=[]){return `<div class="choices">${values.map(([value,label],i)=>`<label class="choice"><input type="radio" name="${name}" value="${value}" ${String(value)===String(current)?'checked':''} required><span>${label}</span>${descs[i]?`<small>${descs[i]}</small>`:''}</label>`).join('')}</div>`;}
function profileForm(p,returning=false,door=false){return `<form id="profile-form" class="form">${!returning?`<div><fieldset><legend>1. Skill level</legend>${choice('level',levels.map((l,i)=>[i+1,l]),p?.level,['&lt; 6 months','6 months–2 years','2+ years'])}</fieldset><fieldset><legend>2. Preferred intensity</legend>${choice('intensity',intensities.map((l,i)=>[i+1,l]),p?.intensity,['Technique focus','Steady work','Full power'])}</fieldset><fieldset><legend>3. Preferred partner</legend>${choice('preference',Object.entries(preferences),p?.preference)}</fieldset></div>`:`<div class="saved"><div class="row between"><small>Your saved chips</small><button type="button" class="text-btn" data-action="edit-profile">Edit</button></div><div class="chips"><span class="chip">${levels[p.level-1]}</span><span class="chip">${intensities[p.intensity-1]}</span><span class="chip">${preferences[p.preference]}</span></div></div><input type="hidden" name="level" value="${p.level}"><input type="hidden" name="preference" value="${p.preference}"><fieldset><legend>Today’s preferred intensity <span class="muted">(optional)</span></legend>${choice('intensity',intensities.map((l,i)=>[i+1,l]),p.intensity,['Technique focus','Steady work','Full power'])}</fieldset>`}<label class="check-row"><input type="checkbox" name="skip"><span>Skip pairing today<small>I’ll find my own partner. No reason needed.</small></span></label>${privacy()}<button class="btn primary full" type="submit">Check in <span aria-hidden="true">→</span></button></form>`;}
function member(){const p=S.user.profile,returning=!!p&&!S.edit;return shell(`<div class="eyebrow">Your training, your pace</div><div class="page-head"><div><h1>${returning?`Welcome back, ${esc(S.user.name.split(' ')[0])}`:`Hi ${esc(S.user.name.split(' ')[0])}! 3 quick taps<br>for partner pairing`}</h1><p class="subtitle">${returning?'One optional tap, then you’re in.':'First visit only. Next time it’s one optional tap.'}</p></div></div>${profileForm(p,returning)}`,true);}
function success(door=false){const name=door?S.checkin?.name:S.user?.name;const skip=door?S.checkin?.skip:S.status?.skip;const partners=S.status?.partners||[];const content=`<section class="success">${ball()}<span class="pill green">✓ Checked in</span><h1>You’re in, ${esc(name?.split(' ')[0])}.</h1><p>${skip?'You’re checked in and pairing on your own today.':"Your chips are in the magic ball. Your coach will call partners at the water break."}</p>${!door&&partners.length?`<div class="partner-card"><small>YOUR ROUND ${S.status.round} ${partners.length>1?'PARTNERS':'PARTNER'}</small><strong>${partners.map(esc).join(' & ')}</strong><p>Time to train together.</p></div>`:''}${!door&&!partners.length&&!skip?'<div class="partner-card"><span class="status-dot"></span><small>Waiting for your coach to confirm partners</small></div>':''}${door?`<div class="card"><small>Your code for your next visit</small><span class="code">${esc(S.checkin.memberCode)}</span><small>Keep this private. It opens your check-in preferences.</small></div><div class="actions">${btn('Next member','door-next','full primary')}</div><p class="footnote">This screen clears automatically after 30 seconds.</p>`:`<div class="actions">${btn('My account & member code','account','full')}</div>${!S.status?.confirmed?btn('Update today’s check-in','edit-checkin','ghost full'):''}`}</section>`;return door?doorShell(content):shell(content,true);}
function doorShell(content){return `<header class="door-header">${brand()}<span class="pill neutral">Door check-in</span></header><main id="main" class="door-main"><div class="error" role="alert"></div>${content}<p class="door-help">Need a hand? Your coach can help.</p></main>`;}
function door(){if(!S.door)return doorShell(`<div class="eyebrow">Shared club device</div><h1>Let’s open the door.</h1><p class="subtitle">A coach needs to sign in and enable door check-in on this device first.</p><div class="actions">${btn('Coach sign in','login','primary full')}</div>`);if(S.view==='door-profile'){const p=S.doorPerson?.profile;return doorShell(`<div class="eyebrow">UBC Boxing Club · Check-in</div><h1>${p&&!S.edit?'Welcome back,':'Hi'} ${esc(S.doorPerson.name)}.</h1><p class="subtitle">${p&&!S.edit?'One optional tap, then you’re in.':'3 quick choices for partner pairing.'}</p><div class="divider"></div>${profileForm(p,!!p&&!S.edit,true)}${btn('Cancel · next member','door-next','ghost full')}`);}return doorShell(`<div class="eyebrow">Welcome to training</div><h1>Step in. Pair up.</h1><p class="subtitle">Already checked in before? Use your private member code.</p><div class="card stack"><h2>Returning member</h2><form id="door-lookup" class="form"><label class="field">Member code<input name="code" placeholder="Your 12-character code" autocomplete="off" autocapitalize="characters" maxlength="18" required></label><button class="btn primary full">Continue →</button></form></div><div class="divider">first time here?</div><div class="card stack"><h2>First visit</h2><p>Make a quick door profile. No password needed.</p><form id="door-first" class="form"><label class="field">Your name<input name="name" placeholder="What should your coach call you?" autocomplete="off" maxlength="60" required></label><button class="btn full">Set up my chips →</button></form></div><p class="footnote">Have an account? Find your member code under My account on your own phone.</p>${btn('Close door check-in','close-door','ghost full small')}`);}
function modeBar(){return `<div class="mode-bar"><div class="segmented" aria-label="Class data"><button data-action="mode-live" class="${S.mode==='live'?'active':''}">Live class</button><button data-action="mode-demo" class="${S.mode==='demo'?'active':''}">Demo class</button></div><span class="sync-status"><span class="status-dot"></span>${S.mode==='demo'?'Fictional members · private to you':'Live check-ins · refreshes automatically'}</span></div>`;}

// One roster row. In Hour 2 the whole row is a button: tap to mark the member as left, tap again to bring them back.
function memberRow(p,r){
  const tap=true,notes=noteParts(p,r.roster);
  const info=`<span class="avatar">${esc(p.name.slice(0,2).toUpperCase())}</span><span class="member-name">${esc(p.name)}<span class="meta">${p.present?(p.skip?'Pairs on own':`${levels[p.level-1]} · ${intensities[p.intensity-1]}`):(tap?'Left the class · tap to bring back':'Left the class')}</span>${notes.length?`<span class="note-line">Coach note: ${notes.map(esc).join(' · ')}</span>`:''}</span>`;
  return `<div class="member-row ${!p.present?'absent':''}">${tap?`<button type="button" class="member-main" data-action="toggle-present" data-id="${esc(p.id)}" aria-label="${esc(p.name)}: ${p.present?'still here. Tap to mark as left':'left. Tap to bring back'}">${info}</button>`:`<div class="member-main">${info}</div>`}<button class="icon-button" data-action="edit-member" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">···</button></div>`;
}

function coach(){const r=S.room;if(!r)return shell('<div class="loading"><div class="spinner"></div></div>');const eligible=r.roster.filter(p=>p.present&&!p.skip),present=r.roster.filter(p=>p.present);let body='';
  const head=(title,sub)=>`<div class="eyebrow">${esc(r.title)}</div><div class="page-head"><div><h1>${title}</h1><p class="subtitle">${sub}</p></div><span class="pill">Round ${r.round}</span></div>`;
  if(r.stage==='open'){
    const fixedDemo=r.demo&&r.round===1&&S.source==='fixed',count=eligible.length,small=count<=r.smallClassMax&&!fixedDemo,can=count>=2;
    body=head(r.round===2?'Who’s staying for Hour 2?':'Checked in',r.round===2?'Update attendance, then find new partners.':'Your class is coming together. You make the final call.');
    body+=`<div class="summary"><div class="stat"><strong>${present.length}</strong><span>checked in</span></div><div class="stat"><strong>${eligible.length}</strong><span>ready to pair</span></div><div class="stat"><strong>${present.length-eligible.length}</strong><span>pairing on own</span></div></div>`;
    if(r.roster.length)body+=`<div class="roster-head"><small>${r.round===2?'Tap a member to mark them as left. Tap again to bring them back. Use ··· for skill and coach notes.':'Tap ··· to review skill, attendance or add a coach note.'}</small>${btn('Refresh','refresh','ghost small')}</div><div class="card list">${r.roster.map(p=>memberRow(p,r)).join('')}</div>`;
    else body+=`<div class="card empty"><div class="empty-icon" aria-hidden="true">♧</div><h2>Room for everyone.</h2><p>When members check in on their phones or at the door, they’ll appear here.</p>${btn('Open door check-in','open-door','primary')}${btn('Try a demo class','mode-demo','ghost full')}</div>`;
    if(r.demo&&r.round===1)body+=`<div class="card"><label class="field">Pairing source<select id="pair-source"><option value="automatic" ${S.source==='automatic'?'selected':''}>Automatic · match this roster</option><option value="fixed" ${S.source==='fixed'?'selected':''}>Figma demo · fixed suggested pairs</option></select></label><p class="subtitle">The fixed demo includes a level-gap warning, as shown in Figma.</p></div>`;
    if(eligible.length%2&&eligible.length>=3)body+=`<p class="subtitle">Odd number today: one group of three will be created.</p>`;
    if(can&&!fixedDemo)body+=`<p class="subtitle">${small?'Small class: you start with an empty board and pair by hand. Suggestions are optional.':'Tip: add coach notes with ···, place special cases first, then let the magic ball pair the rest.'}</p>`;
    const primary=small?btn(`Pair by hand (${count})`,'manual','primary full',can?'':'disabled'):btn(`✧ &nbsp; ${r.round===2?'Find new partners':'Shake for pairs'} (${count})`,'suggest','primary full',can?'':'disabled');
    const secondary=fixedDemo?'':small?btn(`✧ &nbsp; Suggest pairs (${count})`,'suggest','full',can?'':'disabled'):btn('Place special cases first','manual','full',can?'':'disabled');
    body+=`${secondary?`<div class="actions tight">${secondary}</div>`:''}<div class="sticky-actions"><div class="actions">${primary}</div></div><div class="row between">${btn(r.demo?'Reset demo':'New class','reset','ghost small')}${!r.demo?btn('Open door check-in','open-door','ghost small'):''}</div>`;
  } else if(r.stage==='draft'){
    const unp=(r.unassigned||[]).map(id=>r.roster.find(p=>p.id===id)).filter(Boolean);
    const n=r.groups.filter(g=>g.warnings.length).length,trios=r.groups.filter(g=>g.ids.length===3).length,wantTrios=eligible.length%2;
    const byHand=r.source==='manual'||r.source==='mixed';
    body=head(r.round===2?'Hour 2 pairs':byHand?'Pair your class':'Suggested pairs',`${eligible.length} members · ${r.groups.length} groups · ${unp.length?`${unp.length} not paired yet`:n?`${n} to review`:'ready for your review'}`);
    if(S.swapNotice)body+=`<div class="notice ${n?'':'info'}"><div class="row between"><span>${esc(S.swapNotice)}</span>${btn('↶ Undo','undo','ghost small')}</div></div>`;
    const how=r.source==='fixed'?'These are fixed fictional pairs from the demo workflow. They include an intentional level-gap warning.':`Skill and intensity compatibility and your coach notes come first. Preferences are softer suggestions. In Round 2, previous partners are avoided when possible. ${r.source==='manual'?'You are placing groups by hand, so suggestions only appear when you ask for them. ':r.source==='mixed'?'Groups you placed were kept and the rest were suggested. ':''}The line under each pair says why it fits. This is a heuristic; it may not find the best possible arrangement.`;
    body+=`<details class="explanation"><summary>ⓘ &nbsp; How pairs are suggested</summary><p>${how} You know your class best—review any flags before confirming.</p></details>`;
    if(unp.length){
      const hint=S.selected?'Tap someone here to swap them in for the selected person.':'Tap names to select two (or three for a trio), then tap Pair selected.';
      body+=`<section class="card unpaired"><h2>Not paired yet <span class="muted">(${unp.length})</span></h2><p class="subtitle">${hint}</p><div class="pick-grid">${unp.map(p=>tile(p,'pick-person',S.pick.includes(p.id),`Select ${p.name} to pair`)).join('')}</div><div class="actions tight">${btn(`Pair selected (${S.pick.length})`,'pair-selected','',S.pick.length<2?'disabled':'')}${btn('✧ Auto-pair the rest','auto-rest','primary')}</div></section>`;
    }
    if(!unp.length&&trios>wantTrios)body+=`<div class="notice">This class needs ${wantTrios?'only one':'no'} group of three. Use Remove on a trio member to fix this.</div>`;
    body+=`<div class="pairs">${r.groups.map((g,i)=>{
      const trio=g.ids.length===3,people=g.ids.map(id=>r.roster.find(p=>p.id===id)),noted=people.filter(p=>noteParts(p,r.roster).length);
      const tools=[btn('Break up','break-group','ghost small',`data-id="${esc(g.ids[0])}"`)];
      if(trio)people.forEach(p=>tools.push(btn(`Remove ${esc(p.name)}`,'remove-from-trio','ghost small',`data-id="${esc(p.id)}"`)));
      else if(S.pick.length===1)tools.push(btn(`+ Add ${esc(nameOf(S.pick[0]))} as third`,'add-to-group','ghost small',`data-id="${esc(g.ids[0])}"`));
      return `<article class="pair ${g.warnings.length?'flagged':''}"><div class="pair-heading">${trio?'Trio':'Pair'} ${i+1}</div><div class="pair-members">${people.map(p=>tile(p,'select-person',S.selected===p.id,`Select ${p.name} to swap`)).join('')}</div>${trio?`<p class="trio-why">Why a trio? ${wantTrios?`${eligible.length} members is an odd number, so one group of three keeps everyone paired.`:'An even class normally pairs up with no group of three.'} Remove a member to set them aside, then add them to a pair to move the trio.</p>`:''}${g.warnings.map(w=>`<div class="flag">⚠ ${esc(w)}</div>`).join('')}${(g.checks||[]).map(c=>`<div class="check">ⓘ Check: ${esc(c)}</div>`).join('')}${!g.warnings.length&&!(g.checks||[]).length?`<div class="fit">✓ Compatible${r.round===2?' · new partners':''}</div>`:''}${g.reason?`<div class="why">Why: ${esc(g.reason)}</div>`:''}${noted.map(p=>`<div class="coach-note">Coach note · ${esc(p.name)}: ${noteParts(p,r.roster).map(esc).join(' · ')}</div>`).join('')}<div class="pair-tools">${tools.join('')}</div></article>`;}).join('')}</div><p class="${S.selected?'selected-note':'subtitle'}">${S.selected?'Choose someone in another group to swap, or someone not paired yet to replace them. Tap the selected person to cancel.':'⇄ Tap two names to swap. Changes that create a poor match get flagged.'}</p><div class="privacy"><span aria-hidden="true">ⓘ</span><span>Suggestions only. You make the final call.</span></div><div class="sticky-actions"><div class="actions">${btn('Reshake all','suggest')}${btn(r.round===2?'Confirm Hour 2':'Confirm pairs','confirm','primary',unp.length?'disabled':'')}</div></div><div class="row between">${btn('← Back to roster','roster','ghost small')}${btn('↶ Undo','undo','ghost small',!r.canUndo?'disabled':'')}</div>`;
  }else{
    body=head(`Round ${r.round} partners`,'Read these out. No levels or notes on this screen.');
    body+=`<ol class="callout">${r.groups.map((g,i)=>`<li><span class="number">${i+1}</span><strong>${g.ids.map(id=>esc(r.roster.find(p=>p.id===id).name)).join(' & ')}</strong></li>`).join('')}</ol>`;
    const solo=r.roster.filter(p=>p.present&&p.skip);if(solo.length)body+=`<p class="subtitle">${solo.map(p=>esc(p.name)).join(', ')}: pairing on their own today.</p>`;
    body+=`<div class="privacy"><span aria-hidden="true">◉</span><span>${r.demo?'Demo only. Live members are not notified.':'Partners are now visible on members’ own phones.'}</span></div><div class="sticky-actions"><div class="actions">${r.round===1?btn('Re-pair for Hour 2','next-round','primary full'):btn('Finish · start a new class','reset','primary full')}</div></div>`;
  }
  return shell(modeBar()+body);
}
function shaking(){return shell(`<div class="eyebrow">${esc(S.room.title)}</div><div class="page-head"><div><h1>Shaking the ball…</h1><p class="subtitle">${S.room.roster.filter(p=>p.present&&!p.skip).length} chips in. Suggestions appear in a moment.</p></div><span class="pill">Round ${S.room.round}</span></div><div class="success">${ball(S.room.roster.filter(p=>p.present&&!p.skip).map(p=>p.name),true)}<p>Suggestions only. You make the final call.</p></div><div class="actions">${btn('Show pairs now','skip-animation','full')}</div>`,true);}
function account(){return shell(`<div class="eyebrow">Your space</div><h1>My account</h1><p class="subtitle">${esc(S.user.name)} · ${esc(S.user.role)}</p><div class="divider"></div><div class="card"><h2>My door check-in code</h2><p class="subtitle">Use this on the club’s shared device to bring up your saved preferences.</p><span class="code">${esc(S.user.memberCode)}</span><small>Keep this private. It grants access to your check-in profile.</small></div><div class="card"><h3>${esc(S.user.email||'Door profile')}</h3><p class="subtitle">Skill and intensity are visible only to coaches. This prototype does not send password-reset emails.</p></div><div class="actions">${btn('My check-in','member','primary')}${S.user.role==='coach'?btn('Coach space','coach'):''}</div>${S.user.role==='coach'?btn('Open shared door check-in','open-door','full ghost'):''}${btn('Sign out','logout','full ghost')}`,true);}
function render(){app.innerHTML=['login','signup'].includes(S.view)?auth():S.view==='member'?member():S.view==='success'?success():S.view==='door-success'?success(true):S.view.startsWith('door')?door():S.view==='shaking'?shaking():S.view==='account'?account():coach();}
async function loadCoach(){S.room=await api(`/api/coach/room?mode=${S.mode}`);S.swapNotice='';setView('coach');}
async function postRoom(action,body={}){const result=await api(`/api/coach/${action}?mode=${S.mode}`,{revision:S.room.revision,...body});S.room=result;return result;}
async function loadMember(){S.status=await api('/api/member/status');S.edit=false;setView(S.status.checkedIn?'success':'member');}
function profileData(form){const f=new FormData(form);return {level:Number(f.get('level')),intensity:Number(f.get('intensity')),preference:f.get('preference'),skip:f.has('skip')};}

document.addEventListener('change',e=>{if(e.target.id==='role'){$('#invite-field').classList.toggle('hide',e.target.value!=='coach');$('#invite-field input').required=e.target.value==='coach';}if(e.target.id==='pair-source')S.source=e.target.value;});
document.addEventListener('submit',async e=>{
  e.preventDefault();if(S.busy)return;S.busy=true;
  const form=e.target,submit=form.querySelector('[type="submit"],button:not([type])');if(submit)submit.disabled=true;
  try{
    if(form.id==='auth-form'){
      const body=Object.fromEntries(new FormData(form));S.user=(await api(S.view==='signup'?'/api/register':'/api/login',body)).user;
      if(S.user.role==='coach')await loadCoach();else await loadMember();
    }else if(form.id==='profile-form'){
      const p=profileData(form);
      if(S.view==='door-profile'){
        S.checkin=await api('/api/door/checkin',{...p,code:S.doorCode||undefined,name:S.doorPerson.name});S.doorPerson=null;S.doorCode='';setView('door-success');
        clearTimeout(S.doorTimer);S.doorTimer=setTimeout(()=>{if(S.view==='door-success')setView('door');},30000);
      }else{await api('/api/checkin',p);S.user.profile={level:p.level,intensity:p.intensity,preference:p.preference};await loadMember();}
    }else if(form.id==='door-lookup'){
      S.doorCode=new FormData(form).get('code');S.doorPerson=await api('/api/door/lookup',{code:S.doorCode});S.edit=false;setView('door-profile');
    }else if(form.id==='door-first'){
      S.doorPerson={name:new FormData(form).get('name'),profile:null};S.doorCode='';S.edit=false;setView('door-profile');
    }else if(form.id==='member-edit'){
      const f=new FormData(form);await postRoom('member',{id:form.dataset.id,level:Number(f.get('level')),present:f.has('present'),skip:f.has('skip'),note:f.get('note')||'',needsLevel:Number(f.get('needsLevel')||0),apart:f.get('apart')||''});closeModal();render();toast('Member updated for this class.');
    }else if(form.id==='reset-form'){
      const f=new FormData(form);await postRoom('reset',{confirm:f.get('confirm'),title:f.get('title')});closeModal();S.source='automatic';S.swapNotice='';render();toast('A fresh class is ready.');
    }
  }catch(err){error(err.message);if(err.status===409&&S.view==='coach'){const fresh=await api(`/api/coach/room?mode=${S.mode}`);S.room=fresh;}}
  finally{S.busy=false;if(submit?.isConnected)submit.disabled=false;}
});

document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action;
  if(action==='close-modal'){closeModal();return;}
  if(S.busy&&action!=='skip-animation')return;
  try{
    if(action==='login'||action==='signup'){setView(action);return;}
    if(action==='logout'){await api('/api/logout',{});S.user=null;S.room=null;setView('login');return;}
    if(action==='account'){setView('account');return;}
    if(action==='member'){await loadMember();return;}
    if(action==='coach'||action==='refresh'){await loadCoach();return;}
    if(action==='edit-checkin'){S.edit=false;setView('member');return;}
    if(action==='edit-profile'){S.edit=true;render();return;}
    if(action==='door'){const m=await api('/api/me');S.door=m.door;setView('door');return;}
    if(action==='door-next'){clearTimeout(S.doorTimer);S.doorPerson=null;S.doorCode='';S.checkin=null;S.edit=false;setView('door');return;}
    if(action==='close-door'){await api('/api/door/close',{});S.door=false;setView('login');return;}
    if(action==='open-door'){
      modal(`<h2 class="modal-title">Open shared door check-in?</h2><p class="modal-copy">This device will sign out of coach mode and become a member check-in station. Members can enter a private code or make a first-visit profile. Coach controls stay locked.</p><div class="actions">${btn('Cancel','close-modal')}${btn('Open door mode','confirm-door','primary')}</div>`);return;
    }
    if(action==='confirm-door'){await api('/api/door/open',{});S.user=null;S.door=true;S.room=null;closeModal();setView('door');return;}
    if(action.startsWith('mode-')){S.mode=action==='mode-demo'?'demo':'live';sessionStorage.setItem('pair-up-mode',S.mode);S.source='automatic';await loadCoach();return;}
    if(action==='toggle-present'){
      // Hour 2: tap a member row to mark them as left; tap again to bring them back.
      const p=S.room.roster.find(p=>p.id===el.dataset.id);
      S.busy=true;await postRoom('member',{id:p.id,present:!p.present});render();
      toast(p.present?`${p.name} is marked as left. Tap again to undo.`:`${p.name} is back in the class.`);return;
    }
    if(action==='edit-member'){
      const p=S.room.roster.find(p=>p.id===el.dataset.id),other=apartWith(p,S.room.roster);
      modal(`<h2 class="modal-title">${esc(p.name)}: level & coach notes</h2><p class="modal-copy">Change this if the warm-up shows otherwise. Only coaches see levels and notes. Changes apply to today’s pairing.</p><form class="form" id="member-edit" data-id="${esc(p.id)}"><fieldset><legend>Skill level</legend>${choice('level',levels.map((l,i)=>[i+1,l]),p.level,['&lt; 6 months','6 months–2 years','2+ years'])}</fieldset><label class="check-row"><input type="checkbox" name="present" ${p.present?'checked':''}><span>Still here for this round</span></label><label class="check-row"><input type="checkbox" name="skip" ${p.skip?'checked':''}><span>Pairing on their own</span></label><label class="field">Coach note (optional)<input name="note" maxlength="80" value="${esc(p.note||'')}" placeholder="e.g. Returning from injury"></label><label class="field">Needs a partner who is<select name="needsLevel"><option value="0">Any level</option>${levels.map((l,i)=>`<option value="${i+1}" ${p.needsLevel===i+1?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Keep apart from<select name="apart"><option value="">No one</option>${S.room.roster.filter(m=>m.id!==p.id).map(m=>`<option value="${esc(m.id)}" ${other?.id===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><div class="privacy"><span aria-hidden="true">ⓘ</span><span>Notes are visible to coaches only. Please avoid sensitive health details.</span></div><button class="btn primary full" type="submit">Save changes</button></form>`);return;
    }
    if(action==='manual'){
      // Open the pairing board with nobody placed: special cases first, suggestions only on request.
      S.busy=true;S.selected=null;S.pick=[];S.swapNotice='';await postRoom('suggest',{source:'manual'});setView('coach');return;
    }
    if(action==='suggest'||action==='auto-rest'){
      S.busy=true;S.selected=null;S.pick=[];S.swapNotice='';setView('shaking');
      const delay=new Promise(resolve=>{S.finishAnimation=resolve;S.animationTimer=setTimeout(resolve,1500);});
      const payload=action==='auto-rest'?{source:'automatic',keep:true}:{source:S.mode==='demo'&&S.room.round===1?S.source:'automatic'};
      try{await Promise.all([postRoom('suggest',payload),delay]);setView('coach');}
      catch(err){setView('coach');throw err;}finally{S.busy=false;S.finishAnimation=null;clearTimeout(S.animationTimer);}return;
    }
    if(action==='skip-animation'){S.finishAnimation?.();return;}
    if(action==='pick-person'){
      const id=el.dataset.id;
      if(S.selected){
        const outId=S.selected,names=[nameOf(id),nameOf(outId)];
        S.busy=true;await postRoom('swap',{a:outId,b:id});S.selected=null;S.swapNotice=`${names[0]} joined the group. ${names[1]} is now not paired.`;render();return;
      }
      if(S.pick.includes(id)){S.pick=S.pick.filter(x=>x!==id);render();return;}
      if(S.pick.length>=3){toast('A group has at most three members.');return;}
      S.pick=[...S.pick,id];render();return;
    }
    if(action==='pair-selected'){
      S.busy=true;await postRoom('arrange',{op:'pair',ids:S.pick});S.pick=[];S.swapNotice='';render();return;
    }
    if(action==='add-to-group'){
      const name=nameOf(S.pick[0]);S.busy=true;await postRoom('arrange',{op:'add',ids:[S.pick[0],el.dataset.id]});S.pick=[];S.swapNotice=`${name} was added as the third member.`;render();return;
    }
    if(action==='break-group'){
      S.busy=true;await postRoom('arrange',{op:'break',ids:[el.dataset.id]});S.selected=null;S.pick=[];S.swapNotice='Group broken up. Its members are not paired yet.';render();return;
    }
    if(action==='remove-from-trio'){
      const name=nameOf(el.dataset.id);S.busy=true;await postRoom('arrange',{op:'remove',ids:[el.dataset.id]});S.selected=null;S.pick=[];S.swapNotice=`${name} was removed from the trio. Pair them with someone, or add them to another pair.`;render();return;
    }
    if(action==='select-person'){
      const id=el.dataset.id;
      if(S.pick.length===1){
        const inId=S.pick[0],names=[nameOf(inId),nameOf(id)];
        S.busy=true;await postRoom('swap',{a:id,b:inId});S.pick=[];S.selected=null;S.swapNotice=`${names[0]} replaced ${names[1]}. ${names[1]} is now not paired.`;render();return;
      }
      if(S.pick.length>1){toast('Pair the selected members first, or tap them again to clear.');return;}
      if(!S.selected){S.selected=id;render();return;}
      if(S.selected===id){S.selected=null;render();return;}
      if(S.room.groups.some(g=>g.ids.includes(id)&&g.ids.includes(S.selected))){toast('Choose a member in another group.');return;}
      const names=[S.selected,id].map(nameOf);
      S.busy=true;await postRoom('swap',{a:S.selected,b:id});S.selected=null;const n=S.room.groups.filter(g=>g.warnings.length).length;
      S.swapNotice=`Swapped ${names.join(' and ')}.${n?` ${n} ${n===1?'group needs':'groups need'} review.`:''}`;render();return;
    }
    if(action==='undo'){S.busy=true;await postRoom('undo');S.selected=null;S.pick=[];S.swapNotice='';render();toast('Last pairing action undone.');return;}
    if(action==='confirm'){
      const flagged=S.room.groups.filter(g=>g.warnings.length);
      if(flagged.length){modal(`<h2 class="modal-title">Review flagged pairs</h2><p class="modal-copy">${flagged.length} ${flagged.length===1?'group has':'groups have'} a compatibility, coach-note or repeat-partner flag. You can go back to swap, or confirm if you’ve reviewed the situation.</p><div class="notice">${flagged.map(g=>`${g.ids.map(id=>esc(nameOf(id))).join(' & ')}: ${g.warnings.map(esc).join('; ')}`).join('<br><br>')}</div><div class="actions">${btn('Review again','close-modal')}${btn('Confirm anyway','confirm-reviewed','primary')}</div>`);return;}
      S.busy=true;await postRoom('confirm');render();return;
    }
    if(action==='confirm-reviewed'){S.busy=true;await postRoom('confirm',{acceptWarnings:true});closeModal();render();return;}
    if(action==='next-round'){S.busy=true;await postRoom('next-round');S.source='automatic';S.swapNotice='';render();toast('Update who’s still here before pairing again.');return;}
    if(action==='roster'){
      // Return to the roster in one step; the server clears the draft and undo history.
      S.busy=true;await postRoom('roster');S.selected=null;S.pick=[];S.swapNotice='';render();return;
    }
    if(action==='reset'){
      modal(`<h2 class="modal-title">${S.room.demo?'Reset the demo?':'Start a new class?'}</h2><p class="modal-copy">${S.room.demo?'Restore the fictional Figma roster and clear its pairings.':'Clear today’s attendance, pairings and coach notes. Member accounts and saved preferences remain. This app does not keep an attendance archive.'}</p><form id="reset-form" class="form"><label class="field">Class name<input name="title" value="${esc(S.room.title)}" maxlength="60" required></label><label class="field">Type NEW CLASS to confirm<input name="confirm" autocomplete="off" required pattern="NEW CLASS"></label><button type="submit" class="btn primary">Start fresh</button></form>`);return;
    }
  }catch(err){error(err.message);if(err.status===409&&S.user?.role==='coach'){S.room=await api(`/api/coach/room?mode=${S.mode}`);if(!dialog.open)render();toast(err.message);}}
  finally{if(action!=='skip-animation')S.busy=false;}
});

async function boot(){try{const me=await api('/api/me');Object.assign(S,me);if(S.user){if(S.user.role==='coach')await loadCoach();else await loadMember();}else setView(S.door?'door':'login');}catch(err){app.innerHTML=`<main id="main" class="loading"><h1>Can’t reach Pair Up</h1><p>${esc(err.message)}</p>${btn('Try again','reload','primary')}</main>`;app.querySelector('button').onclick=()=>location.reload();}}
await boot();
setInterval(async()=>{
  if(S.busy||dialog.open||document.hidden)return;
  try{
    if(S.user?.role==='coach'&&S.view==='coach'){
      const r=await api(`/api/coach/room?mode=${S.mode}`);if(r.revision!==S.room?.revision){S.room=r;S.selected=null;S.pick=[];S.swapNotice='';render();toast('Class updated.');}
    }else if(S.user&&S.view==='success'){
      const status=await api('/api/member/status');if(JSON.stringify(status)!==JSON.stringify(S.status)){S.status=status;if(!status.checkedIn)setView('member');else render();}
    }
  }catch(err){if(err.status===401){S.user=null;setView('login');toast('Session expired. Please sign in again.');}}
},5000);