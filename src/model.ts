import { ROUTES, STOPS, STOP_BY_ID } from './data';
import type { Route, Stop } from './data';

// ---------- geometry ----------
export function distKm(a: Stop, b: Stop): number {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// deterministic pseudo-random in [0,1)
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const g = (t: number, mu: number, sd: number) => Math.exp(-((t - mu) ** 2) / (2 * sd * sd));

// time-of-day components (t in minutes from midnight)
function tod(t: number) {
  const am = g(t, 9 * 60, 65);
  const pm = g(t, 18.5 * 60, 75);
  const mid = t > 7 * 60 && t < 21.5 * 60 ? 0.35 : 0.1;
  return { am, pm, mid };
}

export function isPeak(t: number) {
  return (t >= 8 * 60 && t < 11 * 60) || (t >= 17 * 60 && t < 21 * 60);
}

// passengers generated per minute at a stop
function boardRate(s: Stop, t: number): number {
  const { am, pm, mid } = tod(t);
  let f: number;
  if (s.kind === 'res') f = 0.12 + 1.0 * am + 0.3 * pm + mid;
  else if (s.kind === 'job') f = 0.12 + 0.25 * am + 1.0 * pm + mid;
  else f = 0.15 + 0.7 * am + 0.7 * pm + mid;
  return 2.2 * s.w * f;
}

// relative attractiveness as a destination
function attraction(s: Stop, t: number): number {
  const { am, pm, mid } = tod(t);
  let f: number;
  if (s.kind === 'res') f = 0.12 + 0.25 * am + 1.0 * pm + mid;
  else if (s.kind === 'job') f = 0.12 + 1.0 * am + 0.3 * pm + mid;
  else f = 0.15 + 0.7 * am + 0.7 * pm + mid;
  return s.w * f;
}

function speedKmh(t: number, express?: boolean): number {
  const { am, pm } = tod(t);
  const v = 27 - 10 * Math.max(am, pm);
  return express ? v * 1.2 : v;
}

// ---------- crowd levels ----------
export const SEATS = 36;
export const CAP = 70; // seated + standing, standard 12 m city bus
export const CRUSH = 80;

export const LEVELS = [
  { label: 'Seats available', short: 'Seats', color: '#2e7d32', mult: 1.0 },
  { label: 'Standing room', short: 'Standing', color: '#c79100', mult: 1.2 },
  { label: 'Crowded', short: 'Crowded', color: '#e65100', mult: 1.55 },
  { label: 'Packed', short: 'Packed', color: '#b71c1c', mult: 2.1 },
];

export function levelOf(load: number): number {
  if (load <= SEATS - 2) return 0;
  if (load <= SEATS + (CAP - SEATS) * 0.5) return 1;
  if (load <= CAP) return 2;
  return 3;
}

// ---------- trip simulation ----------
export interface Trip {
  id: string;
  route: Route;
  dir: 0 | 1;
  stops: string[];
  times: number[]; // arrival time at stop i (min)
  loads: number[]; // on-board load departing stop i
  arrLoads: number[]; // on-board load arriving at stop i
  denied: number[]; // riders left behind at stop i
  gap: number;
}

export interface Pattern {
  key: string;
  route: Route;
  dir: 0 | 1;
  stops: string[];
  idx: Record<string, number>;
  trips: Trip[]; // sorted by departure
}

const routesAtStop: Record<string, number> = {};
for (const r of ROUTES) for (const s of r.stops) routesAtStop[s] = (routesAtStop[s] || 0) + 1;

function simulatePattern(route: Route, dir: 0 | 1): Pattern {
  const stops = dir === 0 ? route.stops.slice() : route.stops.slice().reverse();
  const idx: Record<string, number> = {};
  stops.forEach((s, i) => (idx[s] = i));
  const n = stops.length;
  const trips: Trip[] = [];

  // scheduled dispatches 05:45 to 23:00
  const sched: number[] = [];
  let t = 5 * 60 + 45 + Math.floor(hash01(route.id + dir) * 6);
  while (t <= 23 * 60) {
    sched.push(t);
    t += isPeak(t) ? route.peakHw : route.offHw;
  }
  // real-world dispatch jitter, which creates bunching
  const actual = sched.map((s, i) => {
    const hw = isPeak(s) ? route.peakHw : route.offHw;
    return s + (hash01(`${route.id}-${dir}-${i}`) - 0.5) * 0.7 * hw;
  });
  actual.sort((a, b) => a - b);

  actual.forEach((dep, k) => {
    const prev = k === 0 ? dep - route.offHw : actual[k - 1];
    const gap = Math.max(1.5, dep - prev);
    const times: number[] = new Array(n);
    const loads: number[] = new Array(n);
    const arrLoads: number[] = new Array(n);
    const denied: number[] = new Array(n).fill(0);
    let cur = dep;
    let load = 0;
    for (let i = 0; i < n; i++) {
      const s = STOP_BY_ID[stops[i]];
      times[i] = cur;
      arrLoads[i] = load;
      // alighting: share of remaining attraction
      let rem = 0;
      for (let j = i; j < n; j++) rem += attraction(STOP_BY_ID[stops[j]], cur);
      const alight = i === n - 1 ? load : (load * attraction(s, cur)) / rem;
      load -= alight;
      if (i < n - 1) {
        const downstream = (n - 1 - i) / (n - 1);
        const share = 1 / Math.pow(routesAtStop[s.id], 0.7);
        const noise = 0.85 + 0.3 * hash01(`${route.id}${dir}${k}${i}`);
        let board = boardRate(s, cur) * gap * share * Math.pow(downstream, 0.6) * route.demand * noise;
        if (load + board > CRUSH) {
          denied[i] = load + board - CRUSH;
          board = CRUSH - load;
        }
        load += board;
        const next = STOP_BY_ID[stops[i + 1]];
        const travel = ((distKm(s, next) * 1.3) / speedKmh(cur, route.express)) * 60;
        const dwell = 0.4 + board * 0.02;
        cur = cur + dwell + travel;
      }
      loads[i] = Math.max(0, load);
    }
    trips.push({ id: `${route.id}-${dir}-${k}`, route, dir, stops, times, loads, arrLoads, denied, gap });
  });

  return { key: `${route.id}:${dir}`, route, dir, stops, idx, trips };
}

export const PATTERNS: Pattern[] = ROUTES.flatMap((r) => [simulatePattern(r, 0), simulatePattern(r, 1)]);

// ---------- live positions ----------
export interface LiveBus {
  trip: Trip;
  lat: number;
  lon: number;
  load: number;
  nextStop: string;
}

export function liveBuses(t: number): LiveBus[] {
  const out: LiveBus[] = [];
  for (const p of PATTERNS) {
    for (const trip of p.trips) {
      const n = trip.times.length;
      if (t < trip.times[0] || t > trip.times[n - 1]) continue;
      let i = 0;
      while (i < n - 1 && trip.times[i + 1] < t) i++;
      if (i >= n - 1) continue;
      const a = STOP_BY_ID[trip.stops[i]];
      const b = STOP_BY_ID[trip.stops[i + 1]];
      const f = (t - trip.times[i]) / Math.max(0.1, trip.times[i + 1] - trip.times[i]);
      out.push({ trip, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, load: trip.loads[i], nextStop: b.name });
    }
  }
  return out;
}

// ---------- journey planning ----------
export interface Leg {
  trip: Trip;
  from: string;
  to: string;
  i: number;
  j: number;
  board: number;
  alight: number;
  boardLoad: number;
  peakLevel: number;
  segLevels: number[];
  crowdMin: number; // minutes at Crowded or Packed
  standMin: number; // expected minutes without a seat
  seatAtBoard: boolean;
  seatFrom: string | null; // stop where a seat likely frees up
  mayBeFull: boolean;
  followGap: number | null; // minutes to next bus on same pattern
  followLevel: number | null;
}

export interface Walk {
  from: string;
  to: string;
  minutes: number;
}

export interface Journey {
  key: string;
  legs: Leg[];
  walk: Walk | null;
  depart: number; // leave the origin stop (first boarding)
  arrive: number;
  wait: number;
  duration: number; // from query time to arrival
  transfers: number;
  peakLevel: number;
  crowdMin: number;
  standMin: number;
  cost: number;
  tags: string[];
}

export interface Prefs {
  comfort: number; // 0 = fastest only, 1 = balanced, 2 = strongly avoid crowds
  needSeat: boolean;
}

function nextTrips(p: Pattern, stopIdx: number, t: number, k: number): Trip[] {
  const res: Trip[] = [];
  for (const trip of p.trips) {
    if (trip.times[stopIdx] >= t - 0.01) {
      res.push(trip);
      if (res.length >= k) break;
    }
  }
  return res;
}

function makeLeg(p: Pattern, trip: Trip, i: number, j: number): Leg {
  const segLevels: number[] = [];
  let crowdMin = 0;
  let standMin = 0;
  let seated = trip.loads[i] <= SEATS;
  let seatFrom: string | null = null;
  for (let k = i; k < j; k++) {
    const lv = levelOf(trip.loads[k]);
    segLevels.push(lv);
    const dur = trip.times[k + 1] - trip.times[k];
    if (lv >= 2) crowdMin += dur;
    if (!seated && k > i && trip.loads[k] < SEATS - 3) {
      seated = true;
      seatFrom = trip.stops[k];
    }
    if (!seated) standMin += dur;
  }
  const idxInPattern = p.trips.indexOf(trip);
  const follow = p.trips[idxInPattern + 1];
  return {
    trip,
    from: trip.stops[i],
    to: trip.stops[j],
    i,
    j,
    board: trip.times[i],
    alight: trip.times[j],
    boardLoad: trip.loads[i],
    peakLevel: Math.max(...segLevels),
    segLevels,
    crowdMin,
    standMin,
    seatAtBoard: trip.loads[i] <= SEATS,
    seatFrom,
    mayBeFull: trip.denied[i] > 0.5,
    followGap: follow ? follow.times[i] - trip.times[i] : null,
    followLevel: follow ? Math.max(...follow.loads.slice(i, j).map(levelOf)) : null,
  };
}

function cost(j: Journey, prefs: Prefs, t0: number): number {
  let c = j.arrive - t0;
  for (const leg of j.legs) {
    for (let k = leg.i; k < leg.j; k++) {
      const dur = leg.trip.times[k + 1] - leg.trip.times[k];
      c += dur * (LEVELS[levelOf(leg.trip.loads[k])].mult - 1) * prefs.comfort;
    }
    if (leg.mayBeFull) c += 6 * (0.5 + prefs.comfort);
  }
  c += j.transfers * 5;
  if (j.walk) c += j.walk.minutes * 0.5;
  if (prefs.needSeat) c += j.standMin * 1.5;
  return c;
}

const TRANSFER_RADIUS_KM = 0.45;
const nearby: Record<string, { id: string; km: number }[]> = {};
for (const a of STOPS) {
  nearby[a.id] = STOPS.map((b) => ({ id: b.id, km: a.id === b.id ? 0 : distKm(a, b) })).filter((x) => x.km <= TRANSFER_RADIUS_KM);
}

function finalize(legs: Leg[], walk: Walk | null, t0: number, prefs: Prefs): Journey {
  const arrive = legs[legs.length - 1].alight;
  const j: Journey = {
    key: legs.map((l) => l.trip.id + l.from + l.to).join('|'),
    legs,
    walk,
    depart: legs[0].board,
    arrive,
    wait: legs[0].board - t0,
    duration: arrive - t0,
    transfers: legs.length - 1,
    peakLevel: Math.max(...legs.map((l) => l.peakLevel)),
    crowdMin: legs.reduce((s, l) => s + l.crowdMin, 0),
    standMin: legs.reduce((s, l) => s + l.standMin, 0),
    cost: 0,
    tags: [],
  };
  j.cost = cost(j, prefs, t0);
  return j;
}

export function plan(origin: string, dest: string, t0: number, prefs: Prefs): Journey[] {
  if (origin === dest) return [];
  const all: Journey[] = [];

  // direct
  for (const p of PATTERNS) {
    const i = p.idx[origin];
    const j = p.idx[dest];
    if (i === undefined || j === undefined || i >= j) continue;
    for (const trip of nextTrips(p, i, t0, 4)) all.push(finalize([makeLeg(p, trip, i, j)], null, t0, prefs));
  }

  // one transfer (same stop or short walk)
  for (const pa of PATTERNS) {
    const i = pa.idx[origin];
    if (i === undefined) continue;
    const di = pa.idx[dest];
    if (di !== undefined && di > i) continue; // this bus already goes there directly
    const firstTrips = nextTrips(pa, i, t0, 3);
    for (let x = i + 1; x < pa.stops.length; x++) {
      const X = pa.stops[x];
      if (X === dest) continue;
      for (const nb of nearby[X]) {
        const walkMin = nb.km === 0 ? 0 : Math.ceil(((nb.km * 1.3) / 4.8) * 60);
        for (const pb of PATTERNS) {
          if (pb.route.id === pa.route.id) continue;
          const p = pb.idx[nb.id];
          const q = pb.idx[dest];
          if (p === undefined || q === undefined || p >= q) continue;
          for (const ta of firstTrips) {
            const ready = ta.times[x] + (walkMin === 0 ? 2 : walkMin + 1);
            for (const tb of nextTrips(pb, p, ready, 2)) {
              const legA = makeLeg(pa, ta, i, x);
              const legB = makeLeg(pb, tb, p, q);
              const walk = walkMin === 0 ? null : { from: X, to: nb.id, minutes: walkMin };
              all.push(finalize([legA, legB], walk, t0, prefs));
            }
          }
        }
      }
    }
  }

  // drop journeys over 2.5x the fastest, dedupe
  if (!all.length) return [];
  const fastest = Math.min(...all.map((j) => j.arrive));
  const seen = new Set<string>();
  let cands = all.filter((j) => {
    if (j.arrive - t0 > (fastest - t0) * 2.2 + 10) return false;
    if (seen.has(j.key)) return false;
    seen.add(j.key);
    return true;
  });

  // Pareto filter on (arrival, crowd exposure, standing, transfers)
  cands = cands.filter(
    (a) =>
      !cands.some(
        (b) =>
          b !== a &&
          b.arrive <= a.arrive + 0.01 &&
          b.crowdMin <= a.crowdMin + 0.01 &&
          b.standMin <= a.standMin + 0.01 &&
          b.transfers <= a.transfers &&
          (b.arrive < a.arrive - 0.01 || b.crowdMin < a.crowdMin - 0.01 || b.standMin < a.standMin - 0.01 || b.transfers < a.transfers),
      ),
  );

  cands.sort((a, b) => a.cost - b.cost);
  const top = cands.slice(0, 5);
  if (top.length < 3) {
    const rest = [...seen].length ? all.filter((j) => !top.includes(j) && j.arrive - t0 <= (fastest - t0) * 2.2 + 10) : [];
    const keys = new Set(top.map((j) => j.key));
    for (const j of rest.sort((a, b) => a.cost - b.cost)) {
      if (top.length >= 3) break;
      if (keys.has(j.key)) continue;
      keys.add(j.key);
      top.push(j);
    }
    top.sort((a, b) => a.cost - b.cost);
  }
  const fast = top.reduce((m, j) => (j.arrive < m.arrive ? j : m), top[0]);
  const calm = top.reduce((m, j) => (j.crowdMin + j.standMin * 0.3 < m.crowdMin + m.standMin * 0.3 ? j : m), top[0]);
  top[0].tags.push('Recommended');
  fast.tags.push('Fastest');
  if (calm !== fast) calm.tags.push('Least crowded');
  return top;
}

// Should the rider leave a little later for a much calmer ride?
export interface LeaveLater {
  offset: number;
  journey: Journey;
  base: Journey;
}

export function leaveLaterHint(origin: string, dest: string, t0: number, prefs: Prefs, best: Journey | undefined): LeaveLater | null {
  if (!best || (best.peakLevel < 2 && best.standMin < 5)) return null;
  let pick: LeaveLater | null = null;
  for (const off of [5, 10, 15, 20, 25, 30]) {
    const r = plan(origin, dest, t0 + off, prefs);
    const cand = r.slice().sort((a, b) => a.crowdMin + a.standMin * 0.5 - (b.crowdMin + b.standMin * 0.5))[0];
    if (!cand) continue;
    const delay = cand.arrive - best.arrive;
    const better = cand.peakLevel < best.peakLevel || cand.crowdMin + 5 < best.crowdMin;
    if (better && delay <= 18) {
      pick = { offset: off, journey: cand, base: best };
      break;
    }
  }
  return pick;
}

// expected crowd level by hour for a pattern at a stop (for the day profile chart)
export function dayProfile(p: Pattern, stopId: string): { hour: number; load: number }[] {
  const i = p.idx[stopId];
  const out: { hour: number; load: number }[] = [];
  for (let h = 6; h <= 22; h++) {
    const trips = p.trips.filter((tr) => tr.times[i] >= h * 60 && tr.times[i] < (h + 1) * 60);
    const avg = trips.length ? trips.reduce((s, tr) => s + tr.loads[i], 0) / trips.length : 0;
    out.push({ hour: h, load: avg });
  }
  return out;
}

export function patternOf(trip: Trip): Pattern {
  return PATTERNS.find((p) => p.route.id === trip.route.id && p.dir === trip.dir)!;
}

// network-level view for operators: most crowded links and riders left behind in the next hour
export interface Hotspot {
  route: Route;
  from: string;
  to: string;
  avgLoad: number;
  trips: number;
}

export function networkNow(t: number) {
  const linkMap = new Map<string, Hotspot>();
  let denied = 0;
  let busesOut = 0;
  for (const p of PATTERNS) {
    for (const tr of p.trips) {
      const n = tr.times.length;
      if (tr.times[0] <= t + 30 && tr.times[n - 1] >= t - 30) busesOut++;
      for (let k = 0; k < n - 1; k++) {
        if (tr.times[k] < t || tr.times[k] >= t + 60) continue;
        denied += tr.denied[k];
        const key = `${p.route.id}|${tr.stops[k]}|${tr.stops[k + 1]}`;
        const h = linkMap.get(key) || { route: p.route, from: tr.stops[k], to: tr.stops[k + 1], avgLoad: 0, trips: 0 };
        h.avgLoad = (h.avgLoad * h.trips + tr.loads[k]) / (h.trips + 1);
        h.trips++;
        linkMap.set(key, h);
      }
    }
  }
  const hotspots = [...linkMap.values()].sort((a, b) => b.avgLoad - a.avgLoad).slice(0, 6);
  return { hotspots, denied: Math.round(denied), busesOut };
}

export function fmt(t: number): string {
  const m = Math.round(t);
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${ap}`;
}
