// Sample network modelled on real Delhi corridors.
// Stop coordinates are approximate. Route IDs are illustrative, not DTC route numbers.

export type StopKind = 'res' | 'job' | 'hub' | 'mix';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: StopKind; // residential, employment, interchange hub, mixed
  w: number; // relative demand weight
}

export interface Route {
  id: string;
  name: string;
  stops: string[];
  peakHw: number; // scheduled headway in peak (min)
  offHw: number; // scheduled headway off-peak (min)
  bus: 'Electric AC' | 'Standard';
  express?: boolean;
  demand: number; // route popularity multiplier
  color: string;
}

export const STOPS: Stop[] = [
  { id: 'DU', name: 'Delhi University', lat: 28.688, lon: 77.21, kind: 'mix', w: 1.0 },
  { id: 'CL', name: 'Civil Lines', lat: 28.68, lon: 77.225, kind: 'res', w: 0.7 },
  { id: 'KG', name: 'Kashmere Gate ISBT', lat: 28.6676, lon: 77.228, kind: 'hub', w: 1.6 },
  { id: 'RF', name: 'Red Fort', lat: 28.6562, lon: 77.241, kind: 'mix', w: 0.8 },
  { id: 'DG', name: 'Delhi Gate', lat: 28.64, lon: 77.241, kind: 'mix', w: 0.7 },
  { id: 'ITO', name: 'ITO', lat: 28.6289, lon: 77.241, kind: 'job', w: 1.4 },
  { id: 'PM', name: 'Pragati Maidan', lat: 28.618, lon: 77.244, kind: 'job', w: 0.8 },
  { id: 'IG', name: 'India Gate', lat: 28.6129, lon: 77.2295, kind: 'job', w: 0.7 },
  { id: 'CP', name: 'Connaught Place', lat: 28.6315, lon: 77.2167, kind: 'job', w: 1.8 },
  { id: 'PC', name: 'Patel Chowk', lat: 28.6227, lon: 77.214, kind: 'job', w: 0.9 },
  { id: 'CS', name: 'Central Secretariat', lat: 28.615, lon: 77.212, kind: 'job', w: 1.3 },
  { id: 'LR', name: 'Lodhi Road', lat: 28.59, lon: 77.227, kind: 'job', w: 0.8 },
  { id: 'AIIMS', name: 'AIIMS', lat: 28.5672, lon: 77.21, kind: 'hub', w: 1.6 },
  { id: 'HK', name: 'Hauz Khas', lat: 28.5433, lon: 77.2066, kind: 'mix', w: 1.0 },
  { id: 'IIT', name: 'IIT Delhi Gate', lat: 28.545, lon: 77.1926, kind: 'mix', w: 0.9 },
  { id: 'MUN', name: 'Munirka', lat: 28.556, lon: 77.174, kind: 'res', w: 1.2 },
  { id: 'VV', name: 'Vasant Vihar', lat: 28.557, lon: 77.16, kind: 'res', w: 0.8 },
  { id: 'MB', name: 'Moti Bagh', lat: 28.58, lon: 77.175, kind: 'res', w: 0.8 },
  { id: 'DK', name: 'Dhaula Kuan', lat: 28.5918, lon: 77.1615, kind: 'hub', w: 1.2 },
  { id: 'RG', name: 'Rajouri Garden', lat: 28.649, lon: 77.122, kind: 'res', w: 1.4 },
  { id: 'PB', name: 'Punjabi Bagh', lat: 28.668, lon: 77.131, kind: 'res', w: 1.1 },
  { id: 'KB', name: 'Karol Bagh', lat: 28.6519, lon: 77.1909, kind: 'mix', w: 1.3 },
  { id: 'JW', name: 'Jhandewalan', lat: 28.644, lon: 77.2, kind: 'job', w: 0.8 },
  { id: 'JP', name: 'Janakpuri', lat: 28.629, lon: 77.081, kind: 'res', w: 1.5 },
  { id: 'MC', name: 'Moolchand', lat: 28.564, lon: 77.234, kind: 'mix', w: 0.8 },
  { id: 'LN', name: 'Lajpat Nagar', lat: 28.5677, lon: 77.2433, kind: 'mix', w: 1.3 },
  { id: 'AS', name: 'Ashram', lat: 28.571, lon: 77.258, kind: 'mix', w: 0.9 },
  { id: 'SKK', name: 'Sarai Kale Khan', lat: 28.589, lon: 77.258, kind: 'hub', w: 1.1 },
  { id: 'NP', name: 'Nehru Place', lat: 28.549, lon: 77.252, kind: 'job', w: 1.5 },
  { id: 'KJ', name: 'Kalkaji', lat: 28.539, lon: 77.259, kind: 'res', w: 1.0 },
  { id: 'OK', name: 'Okhla Phase 1', lat: 28.53, lon: 77.271, kind: 'job', w: 1.2 },
  { id: 'SK', name: 'Saket', lat: 28.5244, lon: 77.2066, kind: 'mix', w: 1.2 },
  { id: 'MN', name: 'Malviya Nagar', lat: 28.533, lon: 77.211, kind: 'res', w: 1.0 },
  { id: 'MEH', name: 'Mehrauli', lat: 28.517, lon: 77.18, kind: 'res', w: 0.9 },
  { id: 'LX', name: 'Laxmi Nagar', lat: 28.6304, lon: 77.2773, kind: 'res', w: 1.5 },
  { id: 'AV', name: 'Anand Vihar ISBT', lat: 28.6469, lon: 77.316, kind: 'hub', w: 1.5 },
  { id: 'MV', name: 'Mayur Vihar Phase 1', lat: 28.604, lon: 77.289, kind: 'res', w: 1.3 },
];

export const ROUTES: Route[] = [
  { id: 'C-01', name: 'Kashmere Gate to Saket', stops: ['KG', 'RF', 'DG', 'ITO', 'PM', 'IG', 'LR', 'AIIMS', 'HK', 'MN', 'SK'], peakHw: 8, offHw: 14, bus: 'Standard', demand: 1.25, color: '#1f6f8b' },
  { id: 'C-02', name: 'Anand Vihar to Dhaula Kuan', stops: ['AV', 'LX', 'ITO', 'CP', 'PC', 'CS', 'MB', 'DK'], peakHw: 7, offHw: 12, bus: 'Electric AC', demand: 1.3, color: '#b5651d' },
  { id: 'C-03', name: 'Janakpuri to Central Secretariat', stops: ['JP', 'RG', 'KB', 'JW', 'CP', 'PC', 'CS'], peakHw: 6, offHw: 12, bus: 'Standard', demand: 1.35, color: '#2e7d32' },
  { id: 'C-04', name: 'Ring Road South', stops: ['DK', 'MB', 'AIIMS', 'MC', 'LN', 'AS', 'SKK', 'MV'], peakHw: 9, offHw: 15, bus: 'Electric AC', demand: 1.1, color: '#6d4c41' },
  { id: 'C-05', name: 'Vasant Vihar to Okhla', stops: ['VV', 'MUN', 'IIT', 'HK', 'MN', 'NP', 'KJ', 'OK'], peakHw: 10, offHw: 16, bus: 'Standard', demand: 1.0, color: '#00838f' },
  { id: 'C-06', name: 'University to Nehru Place', stops: ['DU', 'CL', 'KG', 'DG', 'ITO', 'PM', 'SKK', 'AS', 'LN', 'NP'], peakHw: 12, offHw: 18, bus: 'Electric AC', demand: 0.8, color: '#5c6bc0' },
  { id: 'X-07', name: 'Express Kashmere Gate to Nehru Place', stops: ['KG', 'ITO', 'IG', 'MC', 'LN', 'NP'], peakHw: 15, offHw: 25, bus: 'Electric AC', express: true, demand: 0.7, color: '#c62828' },
  { id: 'C-08', name: 'Punjabi Bagh to Saket', stops: ['PB', 'RG', 'DK', 'MB', 'MUN', 'IIT', 'MEH', 'SK'], peakHw: 10, offHw: 16, bus: 'Standard', demand: 1.0, color: '#827717' },
];

export const STOP_BY_ID: Record<string, Stop> = Object.fromEntries(STOPS.map((s) => [s.id, s]));
