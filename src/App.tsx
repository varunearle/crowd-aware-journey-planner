import { useEffect, useMemo, useState } from 'react';
import MapView from './MapView';
import { STOPS, STOP_BY_ID } from './data';
import { LEVELS, SEATS, CAP, dayProfile, fmt, leaveLaterHint, levelOf, networkNow, patternOf, plan } from './model';
import type { Journey, Leg, Prefs } from './model';

type Tab = 'plan' | 'network' | 'about';

const sortedStops = [...STOPS].sort((a, b) => a.name.localeCompare(b.name));
const name = (id: string) => STOP_BY_ID[id].name;
const toInput = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;

const COMFORT = [
  { v: 0, label: 'Fastest' },
  { v: 1, label: 'Balanced' },
  { v: 2.2, label: 'Least crowded' },
];

function Meter({ level }: { level: number }) {
  return (
    <span className="meter" title={LEVELS[level].label} aria-label={LEVELS[level].label}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ background: i <= level ? LEVELS[level].color : '#dde2e6' }} />
      ))}
    </span>
  );
}

function CrowdStrip({ j }: { j: Journey }) {
  const total = j.arrive - j.depart;
  const parts: { w: number; c: string; key: string }[] = [];
  let prevEnd = j.depart;
  j.legs.forEach((leg, li) => {
    if (leg.board > prevEnd) parts.push({ w: leg.board - prevEnd, c: '#eef1f3', key: `g${li}` });
    for (let k = leg.i; k < leg.j; k++) {
      parts.push({ w: leg.trip.times[k + 1] - leg.trip.times[k], c: LEVELS[levelOf(leg.trip.loads[k])].color, key: `${li}-${k}` });
    }
    prevEnd = leg.alight;
  });
  return (
    <div className="strip">
      {parts.map((p) => (
        <span key={p.key} style={{ flexGrow: p.w / total, background: p.c }} />
      ))}
    </div>
  );
}

function legNote(leg: Leg): string {
  if (leg.mayBeFull) return `Likely full when it reaches ${name(leg.from)}; you may have to wait for the next one.`;
  if (leg.seatAtBoard) return 'Seat likely when you board.';
  if (leg.seatFrom) return `Standing at first, seat likely from ${name(leg.seatFrom)}.`;
  return `Standing for about ${Math.round(leg.standMin)} min.`;
}

function JourneyCard({ j, active, onClick }: { j: Journey; active: boolean; onClick: () => void }) {
  return (
    <button className={`card ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="card-top">
        <div className="tags">
          {j.tags.map((t) => (
            <span key={t} className={`tag tag-${t.split(' ')[0].toLowerCase()}`}>
              {t}
            </span>
          ))}
        </div>
        <Meter level={j.peakLevel} />
      </div>
      <div className="card-time">
        <strong>
          {fmt(j.depart)} to {fmt(j.arrive)}
        </strong>
        <span>{Math.round(j.duration)} min</span>
      </div>
      <div className="card-routes">
        {j.legs.map((l, i) => (
          <span key={i} className="route-chip" style={{ borderColor: l.trip.route.color, color: l.trip.route.color }}>
            {l.trip.route.id}
          </span>
        ))}
        <span className="muted">
          {j.transfers === 0 ? 'Direct' : `${j.transfers} change`}
          {j.walk ? `, ${j.walk.minutes} min walk` : ''}
          {j.wait > 0.5 ? `, wait ${Math.round(j.wait)} min` : ''}
        </span>
      </div>
      <CrowdStrip j={j} />
      <div className="card-foot">
        {LEVELS[j.peakLevel].label} at worst
        {j.standMin > 1 ? `, about ${Math.round(j.standMin)} min standing` : ', seated most of the way'}
      </div>
    </button>
  );
}

function DayChart({ leg }: { leg: Leg }) {
  const p = patternOf(leg.trip);
  const data = dayProfile(p, leg.from);
  const max = 80;
  const boardHour = Math.floor(leg.board / 60);
  return (
    <div className="daychart">
      <div className="daychart-title">
        Typical load on {leg.trip.route.id} leaving {name(leg.from)}, by hour
      </div>
      <div className="bars">
        {data.map((d) => (
          <div key={d.hour} className="bar-col" title={`${d.hour}:00, about ${Math.round(d.load)} on board`}>
            <div
              className="bar"
              style={{
                height: `${Math.max(2, (d.load / max) * 100)}%`,
                background: LEVELS[levelOf(d.load)].color,
                outline: d.hour === boardHour ? '2px solid #1b1f23' : 'none',
              }}
            />
            <span>{d.hour % 3 === 0 ? (d.hour > 12 ? d.hour - 12 : d.hour) : ''}</span>
          </div>
        ))}
      </div>
      <div className="lines">
        <span>Seats ({SEATS})</span>
        <span>Capacity ({CAP})</span>
      </div>
    </div>
  );
}

function Detail({ j }: { j: Journey }) {
  return (
    <div className="detail">
      <h3>Trip details</h3>
      {j.legs.map((leg, idx) => (
        <div key={idx} className="leg">
          {idx === 1 && j.walk && (
            <div className="walk">
              Walk {j.walk.minutes} min from {name(j.walk.from)} to {name(j.walk.to)}
            </div>
          )}
          {idx === 1 && !j.walk && <div className="walk">Change at {name(leg.from)}</div>}
          <div className="leg-head">
            <span className="route-chip solid" style={{ background: leg.trip.route.color }}>
              {leg.trip.route.id}
            </span>
            <div>
              <div className="leg-name">{leg.trip.route.name}</div>
              <div className="muted small">
                {leg.trip.route.bus}
                {leg.trip.route.express ? ', limited stops' : ''}
              </div>
            </div>
          </div>
          <ol className="stops">
            {leg.trip.stops.slice(leg.i, leg.j + 1).map((s, k) => {
              const at = leg.i + k;
              const last = at === leg.j;
              const lv = last ? null : levelOf(leg.trip.loads[at]);
              return (
                <li key={s}>
                  <span className="dot" style={{ borderColor: lv === null ? '#1b1f23' : LEVELS[lv].color }} />
                  <span className="stop-time">{fmt(leg.trip.times[at])}</span>
                  <span className="stop-name">{name(s)}</span>
                  {lv !== null && (
                    <span className="stop-load" style={{ color: LEVELS[lv].color }}>
                      {LEVELS[lv].short}, ~{Math.round(leg.trip.loads[at])}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="note">{legNote(leg)}</div>
          {leg.followGap !== null && leg.followLevel !== null && leg.followGap <= 8 && leg.followLevel < leg.peakLevel && (
            <div className="note tip">
              Bus bunching: the next {leg.trip.route.id} is only {Math.round(leg.followGap)} min behind and expected to be{' '}
              {LEVELS[leg.followLevel].label.toLowerCase()} for this stretch.
            </div>
          )}
          {idx === 0 && <DayChart leg={leg} />}
        </div>
      ))}
    </div>
  );
}

function NetworkPanel({ time }: { time: number }) {
  const n = useMemo(() => networkNow(time), [time]);
  return (
    <div className="panel-body">
      <h2>Network in the next hour</h2>
      <p className="muted">
        For operators: where buses will run over capacity from {fmt(time)}, from the same crowd model the planner uses.
      </p>
      <div className="stats">
        <div>
          <strong>{n.busesOut}</strong>
          <span>buses in service</span>
        </div>
        <div>
          <strong>{n.denied}</strong>
          <span>riders likely left behind at stops</span>
        </div>
      </div>
      <h3>Most crowded links</h3>
      <ul className="hotspots">
        {n.hotspots.map((h) => {
          const lv = levelOf(h.avgLoad);
          return (
            <li key={h.route.id + h.from + h.to}>
              <span className="route-chip solid" style={{ background: h.route.color }}>
                {h.route.id}
              </span>
              <div>
                <div>
                  {name(h.from)} to {name(h.to)}
                </div>
                <div className="muted small">
                  {h.trips} trips, average {Math.round(h.avgLoad)} on board ({Math.round((h.avgLoad / CAP) * 100)}% of capacity)
                </div>
              </div>
              <Meter level={lv} />
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        Suggested action: add short-turn trips on the top links, and hold the bus behind a bunched pair so loads even out.
      </p>
    </div>
  );
}

function About() {
  return (
    <div className="panel-body about">
      <h2>What this is</h2>
      <p>
        Seatwise is a journey planner that ranks bus trips by how crowded they will be, not only by how fast they are. Riders see, for each
        option, whether they will get a seat, how long they will stand and which stretches will be packed, and can trade a few minutes for
        a calmer ride.
      </p>
      <h3>How it works</h3>
      <ol>
        <li>
          <strong>Crowd model.</strong> Every trip is simulated stop by stop. Boardings depend on the stop, the time of day and the gap
          since the previous bus; alightings follow where people are heading (homes in the morning, offices in the evening). Dispatch
          jitter creates bunching, so a late bus fills up and the one behind it runs light, as in real life.
        </li>
        <li>
          <strong>Search.</strong> Direct trips and one-change trips (including short walks between nearby stops) are enumerated for the
          next departures.
        </li>
        <li>
          <strong>Ranking.</strong> Each option gets a generalised cost: travel time plus extra weight for minutes spent in crowded
          conditions (1.2x standing, 1.55x crowded, 2.1x packed, in line with crowding-penalty values used in transport appraisal), plus a
          penalty for changes and for buses likely to be full. Options worse on every count are removed (Pareto filter).
        </li>
        <li>
          <strong>Nudges.</strong> If leaving a few minutes later gives a much emptier bus, the planner says so. If the next bus on the
          same route is close behind and emptier, it says that too.
        </li>
      </ol>
      <h3>Data</h3>
      <p>
        This prototype runs on a sample network of 8 routes and 37 stops modelled on real Delhi corridors. Stop locations are approximate
        and route IDs are illustrative. Crowd levels come from the demand model above, not from live passenger counts. The engine is built
        to swap in GTFS schedules, GTFS-Realtime vehicle positions and ticketing or passenger-counter data, which would replace the
        simulated loads with measured ones.
      </p>
      <h3 id="privacy">Privacy policy</h3>
      <p>
        Seatwise runs entirely in your browser. It does not ask for an account, does not collect your location and does not store or
        send the trips you search. Map tiles are loaded from CARTO and OpenStreetMap, which receive standard web request data such as
        your IP address.
      </p>
      <h3 id="terms">Terms of use</h3>
      <p>
        This is a hackathon prototype provided as is, for demonstration only. Timings and crowd levels are simulated estimates and must
        not be relied on for real travel. Map data is from OpenStreetMap contributors under the ODbL.
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('plan');
  const [origin, setOrigin] = useState('JP');
  const [dest, setDest] = useState('CS');
  const [time, setTime] = useState(8 * 60 + 40);
  const [comfort, setComfort] = useState(1);
  const [needSeat, setNeedSeat] = useState(false);
  const [sel, setSel] = useState(0);
  const [showLive, setShowLive] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [pickNext, setPickNext] = useState<'from' | 'to'>('from');

  const prefs: Prefs = useMemo(() => ({ comfort, needSeat }), [comfort, needSeat]);
  const results = useMemo(() => plan(origin, dest, time, prefs), [origin, dest, time, prefs]);
  const later = useMemo(() => leaveLaterHint(origin, dest, time, prefs, results[0]), [origin, dest, time, prefs, results]);
  const current = results[Math.min(sel, results.length - 1)] || null;

  useEffect(() => setSel(0), [origin, dest, comfort, needSeat]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTime((t) => (t >= 23 * 60 ? 6 * 60 : t + 1)), 350);
    return () => clearInterval(id);
  }, [playing]);

  const onStopClick = (id: string) => {
    if (pickNext === 'from') {
      setOrigin(id);
      setPickNext('to');
    } else {
      setDest(id);
      setPickNext('from');
    }
    setTab('plan');
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <div>
            <div className="brand-name">Seatwise</div>
            <div className="brand-sub">Crowdedness-aware journey planner</div>
          </div>
        </div>
        <nav>
          <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>
            Plan a trip
          </button>
          <button className={tab === 'network' ? 'on' : ''} onClick={() => setTab('network')}>
            Network now
          </button>
          <button className={tab === 'about' ? 'on' : ''} onClick={() => setTab('about')}>
            How it works
          </button>
        </nav>
      </header>

      <main>
        <aside className="panel">
          {tab === 'plan' && (
            <div className="panel-body">
              <div className="od">
                <label>
                  From
                  <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                    {sortedStops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="swap"
                  title="Swap"
                  onClick={() => {
                    setOrigin(dest);
                    setDest(origin);
                  }}
                >
                  Swap
                </button>
                <label>
                  To
                  <select value={dest} onChange={(e) => setDest(e.target.value)}>
                    {sortedStops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row">
                <label className="time">
                  Leaving at
                  <input
                    type="time"
                    value={toInput(time)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      if (!Number.isNaN(h)) setTime(h * 60 + m);
                    }}
                  />
                </label>
                <div className="presets">
                  <button onClick={() => setTime(8 * 60 + 40)}>Morning peak</button>
                  <button onClick={() => setTime(13 * 60)}>Midday</button>
                  <button onClick={() => setTime(18 * 60 + 15)}>Evening peak</button>
                </div>
              </div>
              <div className="row">
                <div className="seg" role="radiogroup" aria-label="Priority">
                  {COMFORT.map((c) => (
                    <button key={c.label} className={comfort === c.v ? 'on' : ''} onClick={() => setComfort(c.v)}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <label className="check">
                  <input type="checkbox" checked={needSeat} onChange={(e) => setNeedSeat(e.target.checked)} />I need a seat
                </label>
              </div>
              <p className="hint">Tip: click stops on the map to set From, then To.</p>

              {later && (
                <button className="later" onClick={() => setTime(time + later.offset)}>
                  <strong>Leave {later.offset} min later for a calmer ride.</strong> The {fmt(later.journey.depart)} bus is expected to be{' '}
                  {LEVELS[later.journey.peakLevel].label.toLowerCase()} at worst, arriving {fmt(later.journey.arrive)} (
                  {Math.round(later.journey.arrive - later.base.arrive) > 0
                    ? `${Math.round(later.journey.arrive - later.base.arrive)} min later`
                    : 'same time'}
                  ). Tap to switch.
                </button>
              )}

              {results.length === 0 && <p className="muted">No bus connection found within one change. Try another pair of stops.</p>}
              <div className="results">
                {results.map((j, i) => (
                  <JourneyCard key={j.key} j={j} active={i === sel} onClick={() => setSel(i)} />
                ))}
              </div>
              {current && <Detail j={current} />}
            </div>
          )}
          {tab === 'network' && <NetworkPanel time={time} />}
          {tab === 'about' && <About />}
          <footer>
            Prototype on a simulated network modelled on Delhi corridors. Crowd levels are model estimates.{' '}
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                setTab('about');
                setTimeout(() => document.getElementById('privacy')?.scrollIntoView(), 50);
              }}
            >
              Privacy
            </a>{' '}
            <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                setTab('about');
                setTimeout(() => document.getElementById('terms')?.scrollIntoView(), 50);
              }}
            >
              Terms
            </a>
          </footer>
        </aside>

        <section className="mapwrap">
          <MapView origin={origin} dest={dest} journey={tab === 'plan' ? current : null} time={time} showLive={showLive} onStopClick={onStopClick} />
          <div className="mapbar">
            <span className="clock">{fmt(time)}</span>
            <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play day'}</button>
            <label className="check">
              <input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} />
              Live buses (simulated)
            </label>
          </div>
          <div className="legend">
            {LEVELS.map((l) => (
              <span key={l.label}>
                <i style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
