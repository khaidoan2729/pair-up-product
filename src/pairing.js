export const levels = ['Beginner', 'Intermediate', 'Advanced'];
export const intensities = ['Light', 'Medium', 'Hard'];
// Classes with this many eligible members or fewer start on an empty board:
// the coach pairs by hand and asks for suggestions when wanted.
export const SMALL_CLASS_MAX = 8;

const label = p => p.name || 'A member';
const peopleIn = (group, members) => group.map(id => members.find(p => p.id === id)).filter(Boolean);

// Hard conflicts. type 'repeat' costs less than safety and coach-note conflicts.
export function conflicts(group, members, previous = []) {
  const people = peopleIn(group, members);
  const result = [];
  if (people.length < 2) { result.push({ type: 'alone', text: 'Needs a partner' }); return result; }
  if (Math.max(...people.map(p => p.level)) - Math.min(...people.map(p => p.level)) > 1) result.push({ type: 'level', text: 'Level gap: Beginner + Advanced' });
  if (Math.max(...people.map(p => p.intensity)) - Math.min(...people.map(p => p.intensity)) > 1) result.push({ type: 'intensity', text: 'Intensity clash: Light + Hard' });
  for (const p of people) {
    if (p.needsLevel && people.some(q => q.id !== p.id && q.level !== p.needsLevel)) {
      result.push({ type: 'note', text: `Coach note: ${label(p)} needs a ${levels[p.needsLevel - 1]} partner` });
    }
  }
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j];
    if (a.apart?.includes(b.id) || b.apart?.includes(a.id)) result.push({ type: 'note', text: `Coach note: keep ${label(a)} and ${label(b)} apart` });
  }
  if (previous.some(g => g.filter(id => group.includes(id)).length > 1)) result.push({ type: 'repeat', text: 'Partners in Round 1' });
  return result;
}

export function warnings(group, members, previous = []) {
  return conflicts(group, members, previous).map(c => c.text);
}

// Soft "worth a look" lines. These never block confirming.
export function checks(group, members) {
  const people = peopleIn(group, members);
  const result = [];
  for (const p of people) {
    const others = people.filter(q => q.id !== p.id);
    if (!others.length) continue;
    if (p.preference === 'same' && others.some(q => q.level !== p.level)) result.push(`${label(p)} prefers a partner at the same level`);
    if (p.preference === 'above' && others.some(q => q.level !== Math.min(3, p.level + 1))) result.push(`${label(p)} prefers a partner a bit above`);
  }
  return result;
}

// Short plain-language reason shown beside each pair.
export function reason(group, members) {
  const people = peopleIn(group, members);
  if (people.length < 2) return '';
  const lv = people.map(p => p.level), it = people.map(p => p.intensity);
  const levelGap = Math.max(...lv) - Math.min(...lv), intensityGap = Math.max(...it) - Math.min(...it);
  const parts = [levelGap === 0 ? 'Same level' : levelGap === 1 ? '1 level apart' : 'Level gap'];
  parts.push(intensityGap === 0 ? 'same intensity' : intensityGap === 1 ? 'close intensity' : 'intensity clash');
  if (people.some(p => p.preference && p.preference !== 'any')) parts.push(checks(group, members).length ? 'preference not fully met' : 'preferences met');
  if (people.some(p => p.needsLevel) && !conflicts(group, members).some(c => c.type === 'note')) parts.push('coach note respected');
  return parts.join(' · ');
}

function cost(group, members, previous) {
  const people = group.map(id => members.find(p => p.id === id));
  let total = conflicts(group, members, previous).reduce((s, c) => s + (c.type === 'repeat' ? 1000 : 10000), 0);
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j];
    total += Math.abs(a.level - b.level) * 2 + Math.abs(a.intensity - b.intensity) * 3;
    for (const [p, q] of [[a, b], [b, a]]) {
      if (p.preference === 'same' && p.level !== q.level) total += 4;
      if (p.preference === 'above' && q.level !== Math.min(3, p.level + 1)) total += 4;
    }
  }
  return total;
}

// Multi-start local search. Safety and coach-note conflicts dominate repeat partners and soft preferences.
// `fixed` holds groups the coach already placed by hand: they are kept exactly as they are
// and only the remaining members are paired.
// This is a heuristic, not a claim of a globally optimal or medically safe match.
export function suggest(members, previous = [], seed = 1, fixed = []) {
  if (members.length < 2) throw new Error('At least two members are needed to pair.');
  let x = seed || 1;
  const rand = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const score = groups => groups.reduce((s, g) => s + cost(g, members, previous), 0);

  const pinned = fixed.map(g => [...g]);
  const pinnedIds = new Set(pinned.flat());
  const rest = members.map(p => p.id).filter(id => !pinnedIds.has(id));
  const pinnedTrios = pinned.filter(g => g.length === 3).length;
  if (pinnedTrios > members.length % 2) throw new Error(`This class needs ${members.length % 2 ? 'only one' : 'no'} group of three. Remove someone from a hand-placed trio first.`);
  if (!rest.length) return pinned;
  if (rest.length === 1) {
    if (pinnedTrios || !pinned.length) throw new Error('One member would be left over. Move someone out of a hand-placed group so the rest can be paired.');
    let bi = 0, bc = Infinity;
    pinned.forEach((g, i) => { const c = cost([...g, rest[0]], members, previous); if (c < bc) { bc = c; bi = i; } });
    pinned[bi].push(rest[0]);
    return pinned;
  }

  let best, bestCost = Infinity;
  for (let attempt = 0; attempt < 32; attempt++) {
    const ids = [...rest];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const groups = [];
    if (ids.length % 2) groups.push(ids.splice(0, 3));
    while (ids.length) {
      const a = ids.shift();
      let bi = 0, bc = Infinity;
      ids.forEach((b, i) => { const c = cost([a, b], members, previous); if (c < bc) { bc = c; bi = i; } });
      groups.push([a, ...ids.splice(bi, 1)]);
    }
    // Local swaps only touch the free groups, never the hand-placed ones.
    for (let pass = 0; pass < 8; pass++) {
      let improved = false;
      for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
        for (let i = 0; i < groups[a].length; i++) for (let j = 0; j < groups[b].length; j++) {
          const before = cost(groups[a], members, previous) + cost(groups[b], members, previous);
          [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
          const after = cost(groups[a], members, previous) + cost(groups[b], members, previous);
          if (after < before) improved = true;
          else [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
        }
      }
      if (!improved) break;
    }
    const c = score(groups);
    if (c < bestCost) { bestCost = c; best = [...pinned.map(g => [...g]), ...groups.map(g => [...g])]; }
  }
  return best;
}

export function validateGroups(groups, members) {
  if (!Array.isArray(groups) || groups.some(g => !Array.isArray(g) || ![2, 3].includes(g.length))) return false;
  const ids = groups.flat();
  return ids.length === members.length && new Set(ids).size === ids.length &&
    members.every(p => ids.includes(p.id)) && groups.filter(g => g.length === 3).length === members.length % 2;
}

export function newRoom() {
  return { title: 'Boxing club training', revision: 0, round: 1, stage: 'open', roster: [], groups: [], firstGroups: [], undo: [], source: 'automatic', createdAt: new Date().toISOString() };
}

export function demoRoom() {
  const room = newRoom();
  room.title = 'Sunday · 2–4 pm';
  room.demo = true;
  room.roster = [
    ['Priya',3,3], ['Arjun',3,2], ['Ethan',3,2], ['Daniel',1,2],
    ['Natalie',1,1], ['Chloe',1,1], ['Maya',2,2], ['Leo',2,2],
    ['Sam',2,3], ['Marcus',2,3], ['Omar',1,1]
  ].map(([name,level,intensity],i)=>({id:`demo-${i}`,name,level,intensity,preference:'same',skip:i===10,present:true}));
  return room;
}
export const fixedDemoPairs = [['demo-0','demo-1'],['demo-2','demo-3'],['demo-4','demo-5'],['demo-6','demo-7'],['demo-8','demo-9']];