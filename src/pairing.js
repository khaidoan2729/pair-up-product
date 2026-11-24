export const levels = ['Beginner', 'Intermediate', 'Advanced'];
export const intensities = ['Light', 'Medium', 'Hard'];

export function warnings(group, members, previous = []) {
  const people = group.map(id => members.find(p => p.id === id)).filter(Boolean);
  const result = [];
  if (people.length < 2) result.push('Needs a partner');
  if (Math.max(...people.map(p => p.level)) - Math.min(...people.map(p => p.level)) > 1) result.push('Level gap: Beginner + Advanced');
  if (Math.max(...people.map(p => p.intensity)) - Math.min(...people.map(p => p.intensity)) > 1) result.push('Intensity clash: Light + Hard');
  if (previous.some(g => g.filter(id => group.includes(id)).length > 1)) result.push('Partners in Round 1');
  return result;
}

function cost(group, members, previous) {
  const people = group.map(id => members.find(p => p.id === id));
  let total = warnings(group, members, previous).reduce((s, w) => s + (w === 'Partners in Round 1' ? 1000 : 10000), 0);
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

// Multi-start local search. Safety conflicts dominate repeat partners and soft preferences.
// This is a heuristic, not a claim of a globally optimal or medically safe match.
export function suggest(members, previous = [], seed = 1) {
  if (members.length < 2) throw new Error('At least two members are needed to pair.');
  let x = seed || 1;
  const rand = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const score = groups => groups.reduce((s, g) => s + cost(g, members, previous), 0);
  let best, bestCost = Infinity;
  for (let attempt = 0; attempt < 32; attempt++) {
    const ids = members.map(p => p.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const groups = [];
    if (ids.length % 2) groups.push(ids.splice(0, 3));
    while (ids.length) {
      const a = ids.shift();
      let bi = 0, bc = Infinity;
      ids.forEach((b, i) => { const c = cost([a, b], members, previous); if (c < bc) { bc = c; bi = i; } });
      groups.push([a, ...ids.splice(bi, 1)]);
    }
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
    if (c < bestCost) { bestCost = c; best = groups.map(g => [...g]); }
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
