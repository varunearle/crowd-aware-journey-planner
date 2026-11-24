# Seatwise: crowdedness-aware journey planner

**Transport Stack Hackathon 2026, prototype submission. Problem statement: Crowdedness-aware journey planner.**
Team TOKITO.

Most journey planners answer one question: what is the fastest way? On city buses at peak hour, the fastest bus is often the one you cannot board, or the one you stand in for 70 minutes. Seatwise ranks bus journeys by **how crowded they will be** as well as how long they take, so riders can choose a seat over a few saved minutes, and operators can see where the network is running over capacity.

## What the prototype does

**For riders (Plan a trip)**
- Plans direct and one-change bus journeys, including short walks between nearby stops.
- Shows the expected crowd level for every stretch of every option: Seats available, Standing room, Crowded, Packed. The level is colour coded on the map and in a strip on each result.
- Tells you whether you will get a seat when you board, how many minutes you will stand, and where a seat is likely to free up.
- Lets you pick a priority (Fastest, Balanced, Least crowded) and tick **I need a seat** (for elderly riders, pregnant riders, people with luggage or children).
- **Leave-later nudge.** If leaving 5 to 30 minutes later gives a much emptier bus for a small delay, it says so in one line.
- **Bunching tip.** If the next bus on the same route is only a few minutes behind and emptier, it tells you to wait for it.
- **Day profile.** Shows the typical load on your route at your stop for each hour, so you can see when it is calm.
- Flags buses likely to be full on arrival, meaning riders may be left behind.

**For operators (Network now)**
- Buses in service, riders likely to be left behind at stops in the next hour, and the most crowded route links ranked by load as a share of capacity.
- Suggested action for the worst links: add short-turn trips, or hold a bunched bus.

**Map**
- Every route, every stop (click to set From and To) and simulated live buses coloured by load. **Play day** runs the clock so you can watch crowding build up in the morning and evening peaks.

## How it works

```
 demand model ──> per-trip load simulation ──> journey search ──> crowd-weighted ranking ──> nudges
 (stops, time      (boardings, alightings,     (direct + 1 change,   (generalised cost,       (leave later,
  of day, gaps)     capacity, left-behind)      walk transfers)       Pareto filter)           next bus)
```

1. **Crowd model** (`src/model.ts`). Every scheduled trip is simulated stop by stop.
   - Boardings depend on the stop type (residential, jobs, interchange), the time of day (morning and evening peaks), the **gap since the previous bus**, and how many routes share the stop.
   - Alightings follow where people are heading: offices in the morning, homes in the evening.
   - Buses have 36 seats and a capacity of 70. Above crush load (80), riders are left behind and counted.
   - Dispatch jitter creates **bus bunching**: a late bus collects a longer gap of riders and fills up, while the one right behind it runs light. This is the effect riders can exploit.
   - Travel speed drops in the peaks.
2. **Search.** For the departure time, it takes the next departures on every route pattern serving the origin. It then builds direct journeys and one-change journeys, either at the same stop or via a walk of up to 450 m with a minimum transfer time.
3. **Ranking.** Each journey gets a generalised cost:

   `cost = total time + Σ segment minutes × (crowd multiplier − 1) × comfort weight + 5 min per change + full-bus risk + (standing minutes × 1.5 if a seat is needed)`

   The crowd multipliers are 1.0 for seated, 1.2 standing, 1.55 crowded and 2.1 packed. They follow the in-vehicle time multipliers used in crowding valuation studies for transport appraisal. Journeys that are worse on arrival time, crowded minutes, standing minutes and changes all at once are removed (Pareto filter). The rest are labelled Recommended, Fastest and Least crowded.
4. **Nudges.** The search is re-run for later departures to find a calmer option within an 18-minute delay. The following trip on the same pattern is checked for the bunching tip.

## Data

The prototype runs on a **sample network of 8 routes and 37 stops modelled on real Delhi corridors**, including Kashmere Gate, ITO, Connaught Place, AIIMS, Nehru Place, Janakpuri and Anand Vihar. Stop coordinates are approximate and route IDs are illustrative (not DTC route numbers). **Crowd levels come from the demand model, not from live passenger counts.** This is stated in the app.

## Roadmap for the build sprint

- Replace the sample network with **GTFS static** data and live vehicle positions from **GTFS-Realtime**, following the Transport Stack journey-planner and ETA calculator data models.
- Calibrate the demand model with **ticketing (ETM) and automatic passenger counter data** per trip and stop, and learn hour-of-week load profiles per stop.
- Add crowd reports from riders as a lightweight live signal.
- Extend the search to multi-change trips and metro plus bus, using a multi-criteria RAPTOR search.
- Publish an operator API for crowd forecasts per trip.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

The stack is React, TypeScript, Vite and Leaflet, with OpenStreetMap and CARTO tiles. There is no backend: everything runs in the browser and nothing about the user is stored or sent.

## Project structure

```
src/data.ts      sample network: stops (type, demand weight) and routes (headways, bus type)
src/model.ts     crowd simulation, journey search, ranking, nudges, network hotspots
src/MapView.tsx  Leaflet map: routes, stops, selected journey by crowd level, live buses
src/App.tsx      planner UI, operator view, how-it-works, privacy and terms
```

## License

MIT
