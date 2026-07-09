'use strict';

const input = require('fs').readFileSync(0, 'utf8');
const tokens = input.split(/\s+/).filter(s => s.length > 0);
let p = 0;
const take = () => tokens[p++];
const takeInt = () => parseInt(tokens[p++], 10);

const N = takeInt(), D = takeInt(), H = takeInt();

const users = [];
for (let i = 0; i < N; i++) {
    const name = take();
    const budget = takeInt();
    const energy = takeInt();
    const k = takeInt();
    const tags = new Set();
    for (let j = 0; j < k; j++) tags.add(take());
    users.push({ name, budget, energy, tags });
}

const A = takeInt();
const activities = [];
for (let i = 0; i < A; i++) {
    const id = takeInt();
    const name = take();
    const cost = takeInt();
    const duration = takeInt();
    const energy = takeInt();
    const tag = take();
    activities.push({ id, name, cost, duration, energy, tag });
}

const E = takeInt();
const eventLines = [];
const events = [];
for (let i = 0; i < E; i++) {
    const etype = take();
    let line, ev;
    if (etype === 'DROP') {
        const day = takeInt(), user = take();
        line = `DROP ${day} ${user}`;
        ev = { type: 'DROP', day, user };
    } else if (etype === 'WEATHER') {
        const day = takeInt(), tag = take();
        line = `WEATHER ${day} ${tag}`;
        ev = { type: 'WEATHER', day, tag };
    } else if (etype === 'FATIGUE') {
        const day = takeInt(), user = take(), ne = takeInt();
        line = `FATIGUE ${day} ${user} ${ne}`;
        ev = { type: 'FATIGUE', day, user, ne };
    } else if (etype === 'BUDGET') {
        const day = takeInt(), user = take(), nb = takeInt();
        line = `BUDGET ${day} ${user} ${nb}`;
        ev = { type: 'BUDGET', day, user, nb };
    }
    eventLines.push(line);
    events.push(ev);
}

function fmtDay(day, ids, cost, sat) {
    if (!ids || ids.length === 0) {
        return `Day ${day}: REST | cost=0 satisfaction=0`;
    }
    return `Day ${day}: ${ids.join(' ')} | cost=${cost} satisfaction=${sat}`;
}

function computeUserState(d, applied) {
    const state = users.map(u => ({
        name: u.name,
        budget: u.budget,
        energy: u.energy,
        tags: u.tags,
        active: true,
    }));
    for (const ev of applied) {
        if (ev.day > d) continue;
        const u = state.find(s => s.name === ev.user);
        if (ev.type === 'DROP' && u) u.active = false;
        else if (ev.type === 'FATIGUE' && u) u.energy = ev.ne;
        else if (ev.type === 'BUDGET' && u) u.budget = ev.nb;
    }
    return state;
}

function computeWeather(d, applied) {
    const blocks = new Set();
    for (const ev of applied) {
        if (ev.type === 'WEATHER' && ev.day === d) blocks.add(ev.tag);
    }
    return blocks;
}

function bestSubset(eligible, activeUsers, H) {
    let minBudget = Infinity, minEnergy = Infinity;
    for (const u of activeUsers) {
        if (u.budget < minBudget) minBudget = u.budget;
        if (u.energy < minEnergy) minEnergy = u.energy;
    }
    const n = eligible.length;

    // Precompute per-activity satisfaction contribution
    const satA = new Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (const u of activeUsers) if (u.tags.has(eligible[i].tag)) s++;
        satA[i] = s;
    }

    // Default = REST (empty subset)
    let bestSat = 0, bestCost = 0, bestIds = [];

    const total = 1 << n;
    for (let mask = 1; mask < total; mask++) {
        let cost = 0, en = 0, du = 0, sat = 0;
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) {
                cost += eligible[i].cost;
                en   += eligible[i].energy;
                du   += eligible[i].duration;
                sat  += satA[i];
            }
        }
        if (cost > minBudget || en > minEnergy || du > H) continue;

        // Lexicographical key: (-sat, cost, sortedIds) -> smallest wins
        let take = false;
        if (sat > bestSat) take = true;
        else if (sat === bestSat) {
            if (cost < bestCost) take = true;
            else if (cost === bestCost) {
                const ids = [];
                for (let i = 0; i < n; i++) if (mask & (1 << i)) ids.push(eligible[i].id);
                ids.sort((a, b) => a - b);
                let cmp = 0;
                const m = Math.min(ids.length, bestIds.length);
                for (let i = 0; i < m; i++) {
                    if (ids[i] !== bestIds[i]) { cmp = ids[i] < bestIds[i] ? -1 : 1; break; }
                }
                if (cmp === 0) cmp = ids.length - bestIds.length;
                if (cmp < 0) { bestIds = ids; }
                continue;
            }
        }
        if (take) {
            const ids = [];
            for (let i = 0; i < n; i++) if (mask & (1 << i)) ids.push(eligible[i].id);
            ids.sort((a, b) => a - b);
            bestSat = sat; bestCost = cost; bestIds = ids;
        }
    }

    return { sat: bestSat, cost: bestCost, ids: bestIds };
}

function replanFromDay(startDay, plan, applied) {
    const consumed = new Set();
    for (let i = 0; i < startDay - 1; i++) {
        if (plan[i] && plan[i].ids) for (const id of plan[i].ids) consumed.add(id);
    }
    for (let d = startDay; d <= D; d++) {
        const us = computeUserState(d, applied);
        const active = us.filter(u => u.active);
        const weather = computeWeather(d, applied);

        const eligible = [];
        for (const a of activities) {
            if (consumed.has(a.id)) continue;
            if (weather.has(a.tag)) continue;
            eligible.push(a);
        }

        const r = bestSubset(eligible, active, H);
        plan[d - 1] = r;
        for (const id of r.ids) consumed.add(id);
    }
}

const plan = new Array(D);
const applied = [];
replanFromDay(1, plan, applied);

const out = ['=== PLAN ==='];
for (let d = 1; d <= D; d++) {
    out.push(fmtDay(d, plan[d-1].ids, plan[d-1].cost, plan[d-1].sat));
}
for (let i = 0; i < events.length; i++) {
    applied.push(events[i]);
    replanFromDay(events[i].day, plan, applied);
    out.push(`=== EVENT ${i+1}: ${eventLines[i]} ===`);
    for (let d = events[i].day; d <= D; d++) {
        out.push(fmtDay(d, plan[d-1].ids, plan[d-1].cost, plan[d-1].sat));
    }
}

process.stdout.write(out.join('\n') + '\n');
