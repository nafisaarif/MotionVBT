"use client";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { supabase } from "./supabase-client";
type Rep = {
  mean: number;
  peak: number;
  duration: number;
  rom: number;
  power: number;
  peakPower: number;
  startTime?: number;
  peakTime?: number;
  endTime?: number;
  timeToTakeoff?: number;
  rsiMod?: number;
  rsiCondition?: string;
};
type Point = { t: number; y: number };
type Template = { data: Float32Array; size: number };
type PrimaryMetric = "meanVelocity" | "peakVelocity" | "meanPower" | "peakPower";
type PageKey = "home" | "analysis" | "history" | "athletes" | "settings";
type ChartMetric = "mean" | "peak" | "power" | "peakPower" | "rom";
type TrendMetric = "meanVelocity" | "peakVelocity" | "meanPower" | "volume" | "e1rm";
type AuthUser = { displayName: string; email: string; fullName: string | null };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallState = "checking" | "available" | "installed" | "manual";
type AnalysisMode = "video" | "sensor" | "sprint";
type SensorAxis = "auto" | "x" | "y" | "z";
type SensorTestMode = "vbt" | "verticalJump" | "cmj";
type HistorySet = {
  id: string;
  date: string;
  exercise: string;
  athlete: string;
  athleteId?: string;
  loadKg: number;
  reps: Rep[];
};
type AthleteProfile = { id: string; name: string; weight: number; note: string };
const EXERCISE_GROUPS = [
  ["Squat", ["Back Squat", "Front Squat", "Box Squat", "Pause Squat", "Safety Bar Squat", "Split Squat", "Bulgarian Split Squat", "Jump Squat"]],
  ["Hinge & Olympic Lift", ["Deadlift", "Romanian Deadlift", "Trap Bar Deadlift", "Hip Thrust", "Power Clean", "Hang Power Clean", "Clean Pull", "Snatch", "Hang Snatch", "High Pull"]],
  ["Upper Body Push", ["Bench Press", "Incline Bench Press", "Close-Grip Bench Press", "Push Press", "Shoulder Press", "Floor Press"]],
  ["Upper Body Pull", ["Bench Pull", "Barbell Row", "Pendlay Row", "Weighted Pull-Up"]],
  ["Power & Ballistic", ["Loaded Jump", "Trap Bar Jump", "Bench Throw", "Medicine Ball Chest Throw", "Medicine Ball Overhead Throw"]],
] as const;
function ExerciseOptions() {
  return <>{EXERCISE_GROUPS.map(([group, items]) => <optgroup key={group} label={group}>{items.map((item) => <option key={item}>{item}</option>)}</optgroup>)}</>;
}
type SavedSettings = {
  configured?: boolean;
  barType?: string;
  focus?: string;
  plate?: number;
  loadKg?: number;
  athlete?: string;
  exercise?: string;
  activePage?: PageKey;
  precisionMode?: boolean;
  activeAthleteId?: string;
};
const ENGINE_VERSION = "50";
type NavIconKey = "home" | "athlete" | "training" | "history" | "settings";
const NAV_ITEMS: Array<[PageKey, NavIconKey, string]> = [
  ["home", "home", "Beranda"],
  ["athletes", "athlete", "Atlet"],
  ["analysis", "training", "Latihan"],
  ["history", "history", "Riwayat"],
  ["settings", "settings", "Pengaturan"],
];
function NavIcon({ icon }: { icon: NavIconKey }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (icon === "home") return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></svg>;
  if (icon === "athlete") return <svg {...common}><circle cx="12" cy="7" r="3"/><path d="M5 21c.5-5 2.8-8 7-8s6.5 3 7 8"/><path d="M8.5 16.5h7"/></svg>;
  if (icon === "training") return <svg {...common}><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>;
  if (icon === "history") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/><path d="M8 14h3M14 14h2M8 17h2M13 17h3"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
}
function initialInstallState(): InstallState {
  if (typeof window === "undefined") return "checking";
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    ? "installed"
    : "manual";
}
function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Data tetap tersedia selama sesi jika storage WebView diblokir.
  }
}

function SensorVelocityChart({ points }: { points: Array<{ t: number; v: number }> }) {
  const width = 720, height = 210, pad = 30;
  if (points.length < 2) return <div className="sensor-chart-empty">Grafik velocity akan bergerak setelah pengukuran dimulai.</div>;
  const visible = points.slice(-360);
  const minT = visible[0].t, maxT = Math.max(minT + 0.1, visible[visible.length - 1].t);
  const maxV = Math.max(0.5, ...visible.map((point) => Math.abs(point.v))) * 1.15;
  const x = (t: number) => pad + ((t - minT) / (maxT - minT)) * (width - pad * 2);
  const y = (v: number) => height / 2 - (v / maxV) * (height / 2 - pad);
  const positive = visible.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)},${y(Math.max(0, point.v)).toFixed(1)}`).join(" ");
  const negative = visible.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)},${y(Math.min(0, point.v)).toFixed(1)}`).join(" ");
  return (
    <div className="sensor-chart">
      <div><span>VELOCITY–TIME</span><small>Merah: naik • Hijau: kembali/turun</small></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik velocity sensor HP terhadap waktu">
        <line x1={pad} y1={height / 2} x2={width - pad} y2={height / 2} className="sensor-zero" />
        <path d={positive} className="sensor-line sensor-up-line" />
        <path d={negative} className="sensor-line sensor-down-line" />
        <text x={pad} y={height / 2 - 7}>0 m/s</text>
      </svg>
    </div>
  );
}

function SensorSpeedometer({
  liveVelocity,
  lastVelocity,
  running,
  repCount,
  targetMin,
  targetMax,
  targetEnabled,
}: {
  liveVelocity: number;
  lastVelocity: number;
  running: boolean;
  repCount: number;
  targetMin: number;
  targetMax: number;
  targetEnabled: boolean;
}) {
  const isMoving = running && Math.abs(liveVelocity) > 0.03;
  const displayed = isMoving ? Math.abs(liveVelocity) : lastVelocity;
  const maxVelocity = 1.6;
  const normalized = Math.max(0, Math.min(1, displayed / maxVelocity));
  const needleAngle = -90 + normalized * 180;
  const zone = velocityZone(displayed);
  const hasResult = repCount > 0 && !isMoving;
  const targetStatus = !hasResult ? "TARGET AKTIF" : displayed < targetMin ? "DI BAWAH TARGET" : displayed > targetMax ? "DI ATAS TARGET" : "DALAM TARGET";
  const targetStart = Math.max(0, Math.min(100, (targetMin / maxVelocity) * 100));
  const targetEnd = Math.max(targetStart, Math.min(100, (targetMax / maxVelocity) * 100));
  const targetSpan = Math.max(0.8, targetEnd - targetStart);
  const targetMarker = (value: number) => {
    const angle = (-180 + (Math.max(0, Math.min(maxVelocity, value)) / maxVelocity) * 180) * Math.PI / 180;
    return {
      x1: 180 + Math.cos(angle) * 126,
      y1: 180 + Math.sin(angle) * 126,
      x2: 180 + Math.cos(angle) * 153,
      y2: 180 + Math.sin(angle) * 153,
      tx: 180 + Math.cos(angle) * 171,
      ty: 180 + Math.sin(angle) * 171,
    };
  };
  const minMarker = targetMarker(targetMin);
  const maxMarker = targetMarker(targetMax);
  const status = isMoving
    ? liveVelocity > 0 ? "MENGUKUR FASE NAIK" : "FASE TURUN"
    : repCount > 0 ? `HASIL REP ${repCount}` : running ? "SIAP MENERIMA REP" : "SENSOR SIAP";
  return (
    <section className={`sensor-speedometer zone-${zone.key}`} aria-label={`Speedometer velocity ${displayed.toFixed(2)} meter per detik`}>
      <div className="speedometer-title">
        <div><small>GYMAWARE STYLE DISPLAY</small><strong>{isMoving ? "LIVE VELOCITY" : "LAST REP VELOCITY"}</strong></div>
        <span>{status}</span>
      </div>
      <div className="speedometer-dial">
        <svg viewBox="0 0 360 215" role="img" aria-hidden="true">
          <path className="speed-zone speed-zone-red" pathLength="100" strokeDasharray="31 69" d="M40 180 A140 140 0 0 1 320 180" />
          <path className="speed-zone speed-zone-amber" pathLength="100" strokeDasharray="16 84" strokeDashoffset="-31" d="M40 180 A140 140 0 0 1 320 180" />
          <path className="speed-zone speed-zone-green" pathLength="100" strokeDasharray="16 84" strokeDashoffset="-47" d="M40 180 A140 140 0 0 1 320 180" />
          <path className="speed-zone speed-zone-blue" pathLength="100" strokeDasharray="37 63" strokeDashoffset="-63" d="M40 180 A140 140 0 0 1 320 180" />
          {targetEnabled && <>
            <path className="velocity-target-arc" pathLength="100" strokeDasharray={`${targetSpan} ${100 - targetSpan}`} strokeDashoffset={`${-targetStart}`} d="M40 180 A140 140 0 0 1 320 180" />
            <line className="velocity-target-marker" x1={minMarker.x1} y1={minMarker.y1} x2={minMarker.x2} y2={minMarker.y2} />
            <line className="velocity-target-marker" x1={maxMarker.x1} y1={maxMarker.y1} x2={maxMarker.x2} y2={maxMarker.y2} />
            <text className="velocity-target-label" x={minMarker.tx} y={minMarker.ty} textAnchor="middle">MIN</text>
            <text className="velocity-target-label" x={maxMarker.tx} y={maxMarker.ty} textAnchor="middle">MAX</text>
          </>}
          {[0, .4, .8, 1.2, 1.6].map((value) => {
            const angle = (-180 + (value / maxVelocity) * 180) * Math.PI / 180;
            const x = 180 + Math.cos(angle) * 158;
            const y = 180 + Math.sin(angle) * 158;
            return <text key={value} x={x} y={y + 5} textAnchor="middle">{value.toFixed(1)}</text>;
          })}
          <g className="speed-needle" style={{ transform: `rotate(${needleAngle}deg)` }}>
            <line x1="180" y1="180" x2="180" y2="59" />
          </g>
          <circle className="speed-hub" cx="180" cy="180" r="13" />
        </svg>
        <div className="speedometer-reading">
          <strong>{displayed.toFixed(2).replace(".", ",")}</strong>
          <b>m/s</b>
          <span>{zone.label}</span>
        </div>
      </div>
      <div className="speedometer-legend">
        <span><i className="red" />0–0,49</span>
        <span><i className="amber" />0,50–0,74</span>
        <span><i className="green" />0,75–0,99</span>
        <span><i className="blue" />≥1,00 m/s</span>
      </div>
      {targetEnabled && <div className={`velocity-target-strip ${hasResult ? (displayed >= targetMin && displayed <= targetMax ? "target-hit" : "target-miss") : ""}`}>
        <span>TARGET LATIHAN</span><strong>{targetMin.toFixed(2).replace(".", ",")}–{targetMax.toFixed(2).replace(".", ",")} m/s</strong><b>{targetStatus}</b>
      </div>}
    </section>
  );
}

function VelocityTargetInput({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(2).replace(".", ","));
  useEffect(() => setDraft(value.toFixed(2).replace(".", ",")), [value]);
  const listId = `velocity-${label.toLowerCase()}-options`;
  const commit = () => {
    const parsed = Number(draft.replace(",", "."));
    const next = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : value;
    onCommit(Math.round(next * 100) / 100);
    setDraft((Math.round(next * 100) / 100).toFixed(2).replace(".", ","));
  };
  return <span className="velocity-combo">
    <input aria-label={`Target velocity ${label.toLowerCase()}`} inputMode="decimal" list={listId} value={draft} onChange={(event) => setDraft(event.target.value.replace(/[^0-9.,]/g, ""))} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    <datalist id={listId}>{Array.from({ length: 40 }, (_, index) => ((index + 1) * .05).toFixed(2)).map((option) => <option key={option} value={option.replace(".", ",")} />)}</datalist>
    <b>{label} m/s</b>
  </span>;
}

function PhoneSensorAnalysis({
  loadKg,
  exercise,
  athleteName,
  athletes,
  activeAthleteId,
  onAthleteChange,
  onExerciseChange,
  onLoadChange,
  onSave,
}: {
  loadKg: number;
  exercise: string;
  athleteName: string;
  athletes: AthleteProfile[];
  activeAthleteId: string;
  onAthleteChange: (athleteId: string) => void;
  onExerciseChange: (value: string) => void;
  onLoadChange: (value: number) => void;
  onSave: (reps: Rep[]) => void;
}) {
  const [sensorState, setSensorState] = useState<"idle" | "calibrating" | "ready" | "running" | "error">("idle");
  const [axis, setAxis] = useState<SensorAxis>("auto");
  const [liveVelocity, setLiveVelocity] = useState(0);
  const [liveAcceleration, setLiveAcceleration] = useState(0);
  const [sensorRate, setSensorRate] = useState(0);
  const [message, setMessage] = useState("Aktifkan sensor lalu letakkan HP dalam keadaan diam.");
  const [sensorReps, setSensorReps] = useState<Rep[]>([]);
  const [trace, setTrace] = useState<Array<{ t: number; v: number }>>([]);
  const [countdown, setCountdown] = useState(0);
  const [velocityLossLimit, setVelocityLossLimit] = useState(() => readStorage("hirocross-velocity-loss-limit", 20));
  const [targetMin, setTargetMin] = useState(() => readStorage("hirocross-velocity-target-min", 0.7));
  const [targetMax, setTargetMax] = useState(() => readStorage("hirocross-velocity-target-max", 1));
  const [targetEnabled, setTargetEnabled] = useState(() => readStorage("hirocross-velocity-target-enabled", false));
  const [soundEnabled, setSoundEnabled] = useState(() => readStorage("hirocross-velocity-loss-sound", true));
  const [vibrationEnabled, setVibrationEnabled] = useState(() => readStorage("hirocross-velocity-loss-vibration", true));
  const stateRef = useRef(sensorState);
  const axisRef = useRef(axis);
  const velocityLossLimitRef = useRef(velocityLossLimit);
  const targetMinRef = useRef(targetMin);
  const targetMaxRef = useRef(targetMax);
  const targetEnabledRef = useRef(targetEnabled);
  const soundEnabledRef = useRef(soundEnabled);
  const vibrationEnabledRef = useRef(vibrationEnabled);
  const lossAlertedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const baseline = useRef({ x: 0, y: 0, z: 0, noiseX: 0, noiseY: 0, noiseZ: 0, samples: 0 });
  const runtime = useRef({
    lastTime: 0,
    startedAt: 0,
    velocity: 0,
    displacement: 0,
    positiveDistance: 0,
    positiveTime: 0,
    peak: 0,
    repStartedAt: 0,
    repActive: false,
    armed: true,
    stationarySince: 0,
    sign: 0,
    selectedAxis: "" as "" | "x" | "y" | "z",
    filteredX: 0,
    filteredY: 0,
    filteredZ: 0,
    filteredAcceleration: 0,
    previousAcceleration: 0,
    movementFrames: 0,
    quietFrames: 0,
    topFrames: 0,
    lastRepAt: 0,
    accelerationBias: 0,
    eventCount: 0,
    rateStartedAt: 0,
  });
  useEffect(() => { stateRef.current = sensorState; }, [sensorState]);
  useEffect(() => { axisRef.current = axis; }, [axis]);
  useEffect(() => {
    velocityLossLimitRef.current = velocityLossLimit;
    writeStorage("hirocross-velocity-loss-limit", velocityLossLimit);
  }, [velocityLossLimit]);
  useEffect(() => { targetMinRef.current = targetMin; }, [targetMin]);
  useEffect(() => { targetMaxRef.current = targetMax; }, [targetMax]);
  useEffect(() => { targetEnabledRef.current = targetEnabled; writeStorage("hirocross-velocity-target-enabled", targetEnabled); }, [targetEnabled]);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    writeStorage("hirocross-velocity-loss-sound", soundEnabled);
  }, [soundEnabled]);
  useEffect(() => {
    vibrationEnabledRef.current = vibrationEnabled;
    writeStorage("hirocross-velocity-loss-vibration", vibrationEnabled);
  }, [vibrationEnabled]);
  useEffect(() => {
    const syncSensorAlertSettings = () => {
      setVelocityLossLimit(readStorage("hirocross-velocity-loss-limit", 20));
      setTargetMin(readStorage("hirocross-velocity-target-min", 0.7));
      setTargetMax(readStorage("hirocross-velocity-target-max", 1));
      setTargetEnabled(readStorage("hirocross-velocity-target-enabled", false));
      setSoundEnabled(readStorage("hirocross-velocity-loss-sound", true));
      setVibrationEnabled(readStorage("hirocross-velocity-loss-vibration", true));
    };
    window.addEventListener("hirocross-sensor-settings", syncSensorAlertSettings);
    return () => window.removeEventListener("hirocross-sensor-settings", syncSensorAlertSettings);
  }, []);

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    void context.resume();
    return context;
  }

  function playTone(kind: "rep" | "loss" | "countdown" | "start") {
    try {
      if (soundEnabledRef.current) {
        const context = getAudioContext();
        if (context) {
          const start = context.currentTime + 0.015;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = kind === "loss" ? "sawtooth" : "sine";
          const frequency = kind === "loss" ? 310 : kind === "start" ? 1180 : kind === "countdown" ? 760 : 1040;
          const duration = kind === "loss" ? 0.72 : kind === "start" ? 0.22 : kind === "countdown" ? 0.12 : 0.16;
          oscillator.frequency.setValueAtTime(frequency, start);
          if (kind === "loss") oscillator.frequency.exponentialRampToValueAtTime(210, start + duration);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(kind === "loss" ? 0.3 : 0.2, start + 0.012);
          gain.gain.setValueAtTime(kind === "loss" ? 0.3 : 0.2, start + Math.max(0.03, duration - 0.05));
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + duration + 0.02);
        }
      }
      if (vibrationEnabledRef.current && "vibrate" in navigator) {
        if (kind === "loss") navigator.vibrate([320, 100, 320]);
        else if (kind === "rep") navigator.vibrate(70);
        else if (kind === "start") navigator.vibrate(120);
      }
    } catch {
      // Pengukuran tetap berjalan bila browser memblokir audio atau getaran.
    }
  }

  useEffect(() => {
    const handleMotion = (event: DeviceMotionEvent) => {
      const now = performance.now() / 1000;
      const raw = event.accelerationIncludingGravity;
      const linear = event.acceleration;
      if (!raw && !linear) return;
      if (stateRef.current === "calibrating") {
        if (raw) {
          baseline.current.x += raw.x ?? 0;
          baseline.current.y += raw.y ?? 0;
          baseline.current.z += raw.z ?? 0;
        }
        baseline.current.noiseX += Math.abs(linear?.x ?? 0);
        baseline.current.noiseY += Math.abs(linear?.y ?? 0);
        baseline.current.noiseZ += Math.abs(linear?.z ?? 0);
        baseline.current.samples += 1;
        return;
      }
      if (stateRef.current !== "running") return;
      const base = baseline.current;
      const divisor = Math.max(1, base.samples);
      const components = linear
        ? { x: linear.x ?? 0, y: linear.y ?? 0, z: linear.z ?? 0 }
        : {
            x: (raw?.x ?? 0) - base.x / divisor,
            y: (raw?.y ?? 0) - base.y / divisor,
            z: (raw?.z ?? 0) - base.z / divisor,
          };
      const r = runtime.current;
      if (!r.lastTime) {
        r.lastTime = now;
        r.startedAt = now;
        r.rateStartedAt = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.005, now - r.lastTime));
      r.lastTime = now;
      r.eventCount += 1;
      if (now - r.rateStartedAt >= 1) {
        setSensorRate(Math.round(r.eventCount / (now - r.rateStartedAt)));
        r.eventCount = 0;
        r.rateStartedAt = now;
      }
      r.filteredX = r.filteredX * 0.72 + components.x * 0.28;
      r.filteredY = r.filteredY * 0.72 + components.y * 0.28;
      r.filteredZ = r.filteredZ * 0.72 + components.z * 0.28;
      if (axisRef.current !== "auto") r.selectedAxis = axisRef.current;
      if (!r.selectedAxis) {
        const candidates = [
          { axis: "x" as const, value: r.filteredX },
          { axis: "y" as const, value: r.filteredY },
          { axis: "z" as const, value: r.filteredZ },
        ];
        const dominant = candidates.reduce((best, item) => Math.abs(item.value) > Math.abs(best.value) ? item : best);
        const noise = (base[`noise${dominant.axis.toUpperCase() as "X" | "Y" | "Z"}`] ?? 0) / divisor;
        if (Math.abs(dominant.value) > Math.max(0.08, noise * 3.2)) r.selectedAxis = dominant.axis;
      }
      const chosen = r.selectedAxis ? { x: r.filteredX, y: r.filteredY, z: r.filteredZ }[r.selectedAxis] : 0;
      const axisNoise = r.selectedAxis
        ? (base[`noise${r.selectedAxis.toUpperCase() as "X" | "Y" | "Z"}`] ?? 0) / divisor
        : Math.max(base.noiseX, base.noiseY, base.noiseZ) / divisor;
      const movementThreshold = Math.min(0.16, Math.max(0.045, axisNoise * 2.5));
      const stationaryThreshold = Math.min(0.1, Math.max(0.028, axisNoise * 1.55));
      r.filteredAcceleration = r.filteredAcceleration * 0.72 + chosen * 0.28;
      if (!r.sign && Math.abs(r.filteredAcceleration) > movementThreshold) r.sign = r.filteredAcceleration >= 0 ? 1 : -1;
      const orientedAcceleration = r.filteredAcceleration * (r.sign || 1);
      if (!r.repActive && Math.abs(orientedAcceleration) < stationaryThreshold) {
        r.accelerationBias = r.accelerationBias * 0.985 + orientedAcceleration * 0.015;
      }
      const signedAcceleration = orientedAcceleration - r.accelerationBias;
      const stationary = Math.abs(signedAcceleration) < stationaryThreshold;
      if (Math.abs(signedAcceleration) >= movementThreshold) r.movementFrames += 1;
      else r.movementFrames = Math.max(0, r.movementFrames - 1);
      if (stationary) {
        if (!r.stationarySince) r.stationarySince = now;
        r.quietFrames += 1;
        if (now - r.stationarySince > 0.3 && !r.repActive) {
          r.velocity *= 0.7;
          if (Math.abs(r.velocity) < 0.012) r.velocity = 0;
          if (!r.repActive) {
            r.displacement = 0;
            r.positiveDistance = 0;
            r.positiveTime = 0;
            r.peak = 0;
          }
          if (now - r.stationarySince > 0.32) r.armed = true;
          if (now - r.stationarySince > 0.42) {
            r.selectedAxis = axisRef.current === "auto" ? "" : axisRef.current;
            r.sign = 0;
          }
        }
      } else {
        r.stationarySince = 0;
        r.quietFrames = 0;
      }
      r.velocity += ((r.previousAcceleration + signedAcceleration) / 2) * dt;
      r.previousAcceleration = signedAcceleration;
      r.velocity *= Math.pow(0.997, dt * 60);
      if (stationary && r.quietFrames >= 3) {
        const correction = r.repActive ? 0.84 : 0.62;
        r.velocity *= Math.pow(correction, dt * 60);
      }
      if (stationary && !r.repActive && now - r.stationarySince > 0.12) r.velocity *= 0.55;
      if (Math.abs(r.velocity) < 0.006 && stationary && !r.repActive) r.velocity = 0;
      r.displacement += r.velocity * dt;
      if (r.repActive && r.velocity > 0) {
        r.positiveDistance += r.velocity * dt;
        r.positiveTime += dt;
      }
      const startVelocity = Math.min(0.025, Math.max(0.01, movementThreshold * 0.18));
      if (r.armed && !r.repActive && now - r.lastRepAt > 0.28 && r.velocity > startVelocity && r.movementFrames >= 2) {
        r.repActive = true;
        r.armed = false;
        r.repStartedAt = now;
        r.positiveDistance = 0;
        r.positiveTime = 0;
        r.topFrames = 0;
        r.peak = r.velocity;
        setMessage("Fase naik terdeteksi • velocity sedang dihitung");
      }
      if (r.repActive) {
        r.peak = Math.max(r.peak, r.velocity);
        const duration = now - r.repStartedAt;
        const topCandidate = r.velocity <= Math.max(0.014, startVelocity * 0.8)
          && (r.quietFrames >= 1 || signedAcceleration < -stationaryThreshold);
        r.topFrames = topCandidate ? r.topFrames + 1 : 0;
        const minimumRom = r.peak < 0.12 ? 0.009 : 0.012;
        const reachedTop = duration > 0.13 && r.topFrames >= 2 && r.positiveDistance >= minimumRom;
        if (reachedTop) {
          const concentricTime = Math.max(0.08, r.positiveTime);
          const mean = r.positiveDistance / concentricTime;
          const rep: Rep = {
            mean: Math.min(4, Math.max(0, mean)),
            peak: Math.min(5, Math.max(mean, r.peak)),
            duration: concentricTime,
            rom: r.positiveDistance,
            power: loadKg * 9.81 * mean,
            peakPower: loadKg * 9.81 * Math.max(mean, r.peak),
            startTime: r.repStartedAt - r.startedAt,
            peakTime: now - r.startedAt,
            endTime: now - r.startedAt,
          };
          setSensorReps((current) => {
            const updated = [...current, rep];
            const bestMean = Math.max(...updated.map((item) => item.mean));
            const currentLoss = updated.length > 1
              ? Math.max(0, ((bestMean - rep.mean) / Math.max(0.01, bestMean)) * 100)
              : 0;
            const belowTarget = targetEnabledRef.current && rep.mean < targetMinRef.current;
            const aboveTarget = targetEnabledRef.current && rep.mean > targetMaxRef.current;
            if (currentLoss >= velocityLossLimitRef.current) {
              playTone("loss");
              setMessage(`PERINGATAN • Velocity loss ${currentLoss.toFixed(1)}% mencapai batas ${velocityLossLimitRef.current}%`);
            } else if (belowTarget || aboveTarget) {
              playTone("loss");
              setMessage(`${belowTarget ? "TERLALU LAMBAT" : "TERLALU CEPAT"} • ${rep.mean.toFixed(2)} m/s di luar target ${targetMinRef.current.toFixed(2)}–${targetMaxRef.current.toFixed(2)} m/s`);
            } else {
              playTone("rep");
              setMessage(`TARGET TERCAPAI • Mean Velocity ${mean.toFixed(2)} m/s`);
            }
            return updated;
          });
          r.repActive = false;
          r.lastRepAt = now;
          r.velocity = 0;
          r.displacement = 0;
          r.positiveDistance = 0;
          r.positiveTime = 0;
          r.peak = 0;
          r.topFrames = 0;
        } else if (duration > 15 || (duration > 2.2 && r.positiveDistance < 0.008)) {
          r.repActive = false;
          r.velocity = 0;
          r.positiveDistance = 0;
          r.positiveTime = 0;
          r.topFrames = 0;
          setMessage("Gerakan kecil ditolak • menunggu angkatan valid");
        }
      }
      const shownVelocity = Math.abs(r.velocity) < 0.006 ? 0 : r.velocity;
      setLiveVelocity(shownVelocity);
      setLiveAcceleration(signedAcceleration);
      setTrace((current) => [...current.slice(-599), { t: now - r.startedAt, v: shownVelocity }]);
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [loadKg]);

  async function activateSensor() {
    try {
      if (soundEnabled) {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = audioContextRef.current ?? new AudioContextClass();
          void audioContextRef.current.resume();
        }
      }
      const motionConstructor = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof motionConstructor.requestPermission === "function") {
        const permission = await motionConstructor.requestPermission();
        if (permission !== "granted") throw new Error("Izin sensor ditolak");
      }
      runtime.current = { lastTime: 0, startedAt: 0, velocity: 0, displacement: 0, positiveDistance: 0, positiveTime: 0, peak: 0, repStartedAt: 0, repActive: false, armed: true, stationarySince: 0, sign: 0, selectedAxis: axis === "auto" ? "" : axis, filteredX: 0, filteredY: 0, filteredZ: 0, filteredAcceleration: 0, previousAcceleration: 0, movementFrames: 0, quietFrames: 0, topFrames: 0, lastRepAt: 0, accelerationBias: 0, eventCount: 0, rateStartedAt: 0 };
      lossAlertedRef.current = false;
      setSensorReps([]);
      setTrace([]);
      setLiveVelocity(0);
      baseline.current = { x: 0, y: 0, z: 0, noiseX: 0, noiseY: 0, noiseZ: 0, samples: 0 };
      setSensorState("calibrating");
      setCountdown(3);
      playTone("countdown");
      setMessage("Kalibrasi otomatis 3 detik • jangan gerakkan HP");
      window.setTimeout(() => { setCountdown(2); playTone("countdown"); }, 1000);
      window.setTimeout(() => { setCountdown(1); playTone("countdown"); }, 2000);
      window.setTimeout(() => {
        setCountdown(0);
        if (baseline.current.samples < 3) {
          setSensorState("error");
          setMessage("Sensor gerak tidak mengirim data. Buka melalui Chrome/Safari dan izinkan Motion Sensor.");
          return;
        }
        setSensorState("running");
        setMessage("Kalibrasi selesai • pengukuran aktif, mulai lakukan repetisi");
        playTone("start");
      }, 3000);
    } catch (error) {
      setSensorState("error");
      setMessage(error instanceof Error ? error.message : "Sensor gerak tidak dapat diakses");
    }
  }
  function stopSensor() {
    setSensorState("idle");
    setLiveVelocity(0);
    if (sensorReps.length) {
      onSave(sensorReps);
      setMessage(`${sensorReps.length} repetisi disimpan ke riwayat ${athleteName}`);
    } else setMessage("Pengukuran dihentikan • belum ada repetisi valid");
  }
  const lastRep = sensorReps[sensorReps.length - 1];
  const bestRepMean = sensorReps.length ? Math.max(...sensorReps.map((rep) => rep.mean)) : 0;
  const velocityLoss = lastRep && sensorReps.length > 1
    ? Math.max(0, ((bestRepMean - lastRep.mean) / Math.max(0.01, bestRepMean)) * 100)
    : 0;
  const velocityLossExceeded = velocityLoss >= velocityLossLimit;
  const displayedVelocity = sensorState === "running" && Math.abs(liveVelocity) > 0.03
    ? Math.abs(liveVelocity)
    : lastRep?.mean ?? 0;
  const displayedZone = velocityZone(displayedVelocity).key;
  return (
    <section className="sensor-workspace sensor-train-screen">
      <div className="sensor-intro">
        <div><small>HP SEBAGAI DEVICE VBT</small><h2>SENSOR GERAK LANGSUNG</h2><p>Pasang HP dengan holder yang kuat pada bar, beban, atau sabuk atlet. Sensor accelerometer membaca gerakan tanpa kamera.</p></div>
        <span className={`sensor-state state-${sensorState}`}>● {sensorState === "running" ? "MENGUKUR" : sensorState === "ready" ? "SIAP" : sensorState === "calibrating" ? "KALIBRASI" : sensorState === "error" ? "PERIKSA SENSOR" : "BELUM AKTIF"}</span>
      </div>
      <label className="sensor-mobile-athlete">PILIH ATLET<select value={activeAthleteId} onChange={(event) => onAthleteChange(event.target.value)} disabled={sensorState === "running"}>{athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label>
      <div className="sensor-mobile-fields">
        <label><span>Bentuk Latihan</span><select value={exercise} onChange={(event) => onExerciseChange(event.target.value)} disabled={sensorState === "running"}><ExerciseOptions /></select></label>
        <label><span>Load (kg)</span><input type="number" min="1" max="500" step="0.5" value={loadKg} onChange={(event) => onLoadChange(Math.max(1, +event.target.value))} disabled={sensorState === "running"} /></label>
      </div>
      <section className={`training-target-control ${targetEnabled ? "enabled" : ""}`}>
        <div><strong>Target Velocity</strong><small>Aktifkan untuk menampilkan rentang target pada speedometer dan alarm di luar target.</small></div>
        <label className="target-toggle"><input type="checkbox" checked={targetEnabled} onChange={(event) => setTargetEnabled(event.target.checked)} disabled={sensorState === "running"} /><span>{targetEnabled ? "AKTIF" : "NONAKTIF"}</span></label>
        {targetEnabled && <div className="target-range-fields"><VelocityTargetInput label="MIN" value={targetMin} min={0.05} max={targetMax - 0.05} onCommit={(value) => { setTargetMin(value); writeStorage("hirocross-velocity-target-min", value); }} /><em>–</em><VelocityTargetInput label="MAX" value={targetMax} min={targetMin + 0.05} max={5} onCommit={(value) => { setTargetMax(value); writeStorage("hirocross-velocity-target-max", value); }} /></div>}
      </section>
      <div className="sensor-controls">
        <label>SUMBU GERAK<select value={axis} onChange={(event) => setAxis(event.target.value as SensorAxis)} disabled={sensorState === "running"}><option value="auto">Otomatis</option><option value="x">Sumbu X</option><option value="y">Sumbu Y</option><option value="z">Sumbu Z</option></select></label>
        <article><small>EXERCISE</small><strong>{exercise}</strong></article>
        <article><small>BEBAN</small><strong>{loadKg} kg</strong></article>
        {sensorState === "idle" || sensorState === "error" ? <button type="button" onClick={() => void activateSensor()}>▶ MULAI LATIHAN</button> : sensorState === "running" ? <button type="button" className="sensor-stop" onClick={stopSensor}>■ SELESAI & SIMPAN</button> : <button type="button" disabled>○ KALIBRASI OTOMATIS</button>}
      </div>
      {(countdown > 0 || sensorState === "running") && <div className="sensor-countdown">{countdown > 0 ? `Countdown aktif: ${countdown} detik` : "Sensor aktif • lakukan repetisi"}</div>}
      <div className="sensor-message">◎ {message}</div>
      <div className={`sensor-unified-card zone-${displayedZone} ${velocityLossExceeded ? "velocity-loss-warning" : ""}`}>
        <SensorSpeedometer
          liveVelocity={liveVelocity}
          lastVelocity={lastRep?.mean ?? 0}
          running={sensorState === "running"}
          repCount={sensorReps.length}
          targetMin={targetMin}
          targetMax={targetMax}
          targetEnabled={targetEnabled}
        />
        <div className="sensor-result-card">
          <div className="sensor-result-head"><div><h2>{exercise}</h2><p>{athleteName}</p></div><span>● SENSOR</span></div>
          <div className="sensor-result-primary"><small>HASIL REP {sensorReps.length || 1}</small><strong>{lastRep ? lastRep.mean.toFixed(2).replace(".", ",") : "—"} <b>m/s</b></strong></div>
          <div className="sensor-result-stats">
            <div><small>Load</small><strong>{loadKg}<b> kg</b></strong></div>
            <div><small>Reps</small><strong>{sensorReps.length}</strong></div>
            <div><small>V. Loss / Limit</small><strong>{velocityLoss.toFixed(1)}<b>% / {velocityLossLimit}%</b></strong></div>
            <div><small>Power</small><strong>{lastRep ? lastRep.power.toFixed(0) : "0"}<b> W</b></strong></div>
          </div>
          {targetEnabled && <div className="sensor-target-summary"><span>Target Velocity</span><strong>{targetMin.toFixed(2).replace(".", ",")}–{targetMax.toFixed(2).replace(".", ",")} m/s</strong></div>}
        </div>
      </div>
      <div className="sensor-live-grid">
        <article className="sensor-main-value"><small>LIVE VELOCITY</small><strong>{liveVelocity.toFixed(2).replace(".", ",")}</strong><b>m/s</b><span>{liveVelocity > 0.03 ? "NAIK" : liveVelocity < -0.03 ? "TURUN" : "DIAM"}</span></article>
        <article><small>MEAN REP TERAKHIR</small><strong>{lastRep ? lastRep.mean.toFixed(2) : "0,00"}</strong><b>m/s</b></article>
        <article><small>PEAK REP TERAKHIR</small><strong>{lastRep ? lastRep.peak.toFixed(2) : "0,00"}</strong><b>m/s</b></article>
        <article><small>REPETISI</small><strong>{sensorReps.length}</strong><b>rep</b></article>
        <article><small>AKSELERASI</small><strong>{liveAcceleration.toFixed(2)}</strong><b>m/s²</b></article>
        <article><small>SAMPLE RATE</small><strong>{sensorRate || "—"}</strong><b>{sensorRate ? "Hz" : ""}</b></article>
      </div>
      <SensorVelocityChart points={trace} />
      {sensorReps.length > 0 && <div className="sensor-reps">{sensorReps.map((rep, index) => <article key={index}><small>REP {index + 1}</small><strong>{rep.mean.toFixed(2)}</strong><b>m/s</b><span>{velocityZone(rep.mean).label}</span><p>Peak {rep.peak.toFixed(2)} m/s • ROM {(rep.rom * 100).toFixed(0)} cm</p></article>)}</div>}
      <div className="sensor-safety"><strong>PENEMPATAN AMAN</strong><span>Gunakan holder/strap yang terkunci. Jangan menggenggam HP, jangan memasang HP longgar pada plate, dan lakukan kalibrasi ulang bila posisi HP berubah.</span></div>
    </section>
  );
}

function SensorAlertSettings() {
  const [velocityLossLimit, setVelocityLossLimit] = useState(() => readStorage("hirocross-velocity-loss-limit", 20));
  const [soundEnabled, setSoundEnabled] = useState(() => readStorage("hirocross-velocity-loss-sound", true));
  const [vibrationEnabled, setVibrationEnabled] = useState(() => readStorage("hirocross-velocity-loss-vibration", true));
  function save(key: string, value: number | boolean) {
    writeStorage(key, value);
    window.dispatchEvent(new Event("hirocross-sensor-settings"));
  }
  return (
    <>
      <label><div><strong>Bunyi peringatan</strong><small>Alarm berbunyi ketika velocity loss mencapai batas yang ditentukan.</small></div><input type="checkbox" checked={soundEnabled} onChange={(event) => { setSoundEnabled(event.target.checked); save("hirocross-velocity-loss-sound", event.target.checked); }} /></label>
      <label><div><strong>Getaran peringatan</strong><small>HP bergetar ketika velocity loss mencapai batas yang ditentukan.</small></div><input type="checkbox" checked={vibrationEnabled} onChange={(event) => { setVibrationEnabled(event.target.checked); save("hirocross-velocity-loss-vibration", event.target.checked); }} /></label>
      <label><div><strong>Batas velocity loss</strong><small>Alarm dan getaran aktif saat penurunan velocity mencapai persentase ini.</small></div><div className="settings-number-field"><input type="number" min="1" max="60" step="1" value={velocityLossLimit} onChange={(event) => { const value = Math.min(60, Math.max(1, +event.target.value || 1)); setVelocityLossLimit(value); save("hirocross-velocity-loss-limit", value); }} /><b>%</b></div></label>
    </>
  );
}

function VerticalJumpSensorAnalysis({
  athleteName,
  onSave,
  mode,
}: {
  athleteName: string;
  onSave: (reps: Rep[], exerciseOverride?: string, loadOverride?: number) => void;
  mode: "verticalJump" | "cmj";
}) {
  const [sensorState, setSensorState] = useState<"idle" | "calibrating" | "ready" | "running" | "error">("idle");
  const [message, setMessage] = useState("Pasang HP erat di pinggang, lalu aktifkan dan kalibrasi sensor.");
  const [phase, setPhase] = useState("DIAM");
  const [jumps, setJumps] = useState<Rep[]>([]);
  const [liveG, setLiveG] = useState(1);
  const [sensorRate, setSensorRate] = useState(0);
  const stateRef = useRef(sensorState);
  const jumpsRef = useRef<Rep[]>([]);
  const calibration = useRef({ magnitude: 0, samples: 0 });
  const runtime = useRef({
    phase: "idle" as "idle" | "ready" | "countermovement" | "takeoff" | "flight" | "landing",
    startedAt: 0,
    lastTime: 0,
    flightStartedAt: 0,
    movementStartedAt: 0,
    firstLowGAt: 0,
    firstLandingAt: 0,
    takeoffImpulseAt: 0,
    counterFrames: 0,
    takeoffFrames: 0,
    lowGFrames: 0,
    lowGDropouts: 0,
    landingFrames: 0,
    stableFrames: 0,
    eventCount: 0,
    rateStartedAt: 0,
    filteredG: 1,
    peakLandingG: 0,
  });
  useEffect(() => { stateRef.current = sensorState; }, [sensorState]);
  useEffect(() => { jumpsRef.current = jumps; }, [jumps]);

  useEffect(() => {
    const handleMotion = (event: DeviceMotionEvent) => {
      const raw = event.accelerationIncludingGravity;
      if (!raw) return;
      const now = performance.now() / 1000;
      const magnitude = Math.sqrt((raw.x ?? 0) ** 2 + (raw.y ?? 0) ** 2 + (raw.z ?? 0) ** 2);
      if (stateRef.current === "calibrating") {
        calibration.current.magnitude += magnitude;
        calibration.current.samples += 1;
        return;
      }
      if (stateRef.current !== "running") return;
      const r = runtime.current;
      const baseG = calibration.current.magnitude / Math.max(1, calibration.current.samples);
      const normalizedG = magnitude / Math.max(7, baseG);
      r.filteredG = r.filteredG * 0.68 + normalizedG * 0.32;
      setLiveG(r.filteredG);
      if (!r.lastTime) {
        r.lastTime = now;
        r.startedAt = now;
        r.rateStartedAt = now;
        return;
      }
      r.lastTime = now;
      r.eventCount += 1;
      if (now - r.rateStartedAt >= 1) {
        setSensorRate(Math.round(r.eventCount / (now - r.rateStartedAt)));
        r.eventCount = 0;
        r.rateStartedAt = now;
      }

      const deviation = Math.abs(r.filteredG - 1);
      if (r.phase === "ready") {
        if (r.filteredG < 0.94) r.counterFrames += 1;
        else r.counterFrames = Math.max(0, r.counterFrames - 1);
        if (r.counterFrames >= 2) {
          r.movementStartedAt = now;
          r.phase = "countermovement";
          r.takeoffFrames = 0;
          r.lowGFrames = 0;
          setPhase("TURUN / COUNTERMOVEMENT");
          setMessage("Countermovement terdeteksi • lanjutkan tolakan maksimal");
        }
      } else if (r.phase === "countermovement" || r.phase === "takeoff") {
        if (r.phase === "countermovement" && r.filteredG > 1.06) r.takeoffFrames += 1;
        else if (r.phase === "countermovement") r.takeoffFrames = Math.max(0, r.takeoffFrames - 1);
        if (r.phase === "countermovement" && r.takeoffFrames >= 1) {
          r.phase = "takeoff";
          r.takeoffImpulseAt = now;
          r.lowGFrames = 0;
          setPhase("TOLAKAN");
          setMessage("Tolakan terdeteksi • menunggu kaki benar-benar lepas dari lantai");
        }
        if (r.phase === "takeoff" && r.filteredG < 0.62) {
          if (r.lowGFrames === 0) r.firstLowGAt = now;
          r.lowGFrames += 1;
          r.lowGDropouts = 0;
        } else if (r.phase === "takeoff") {
          r.lowGDropouts += 1;
          if (r.lowGDropouts > 2) {
            r.lowGFrames = 0;
            r.lowGDropouts = 0;
            r.firstLowGAt = 0;
          }
        }
        if (r.phase === "takeoff" && r.lowGFrames >= 2 && now - r.takeoffImpulseAt <= 0.85) {
          r.phase = "flight";
          r.flightStartedAt = r.firstLowGAt;
          r.peakLandingG = 0;
          r.landingFrames = 0;
          r.firstLandingAt = 0;
          setPhase("MELAYANG");
          setMessage("Fase melayang terdeteksi • bersiap mendarat stabil");
        } else if (now - r.movementStartedAt > 2.2) {
          r.phase = "ready";
          r.counterFrames = 0;
          r.takeoffFrames = 0;
          r.lowGFrames = 0;
          r.firstLowGAt = 0;
          setPhase("DIAM");
          setMessage("Gerakan tidak menghasilkan fase melayang • percobaan ditolak");
        }
      } else if (r.phase === "flight") {
        r.peakLandingG = Math.max(r.peakLandingG, r.filteredG);
        if (r.filteredG > 1.08 || (now - r.flightStartedAt > 0.16 && r.filteredG > 0.9)) {
          if (r.landingFrames === 0) r.firstLandingAt = now;
          r.landingFrames += 1;
        } else {
          r.landingFrames = Math.max(0, r.landingFrames - 1);
          if (r.landingFrames === 0) r.firstLandingAt = 0;
        }
        if (r.landingFrames >= 1) {
          const landingAt = r.firstLandingAt || now;
          const flightTime = landingAt - r.flightStartedAt;
          if (flightTime >= 0.12 && flightTime <= 1.2) {
            const height = (9.80665 * flightTime * flightTime) / 8;
            const takeoffVelocity = (9.80665 * flightTime) / 2;
            const timeToTakeoff = r.flightStartedAt - r.movementStartedAt;
            const rsiMod = timeToTakeoff > 0 ? height / timeToTakeoff : 0;
            const rsiCondition = rsiMod >= 0.7 ? "SANGAT BAIK" : rsiMod >= 0.5 ? "BAIK" : rsiMod >= 0.3 ? "PERLU DITINGKATKAN" : "RENDAH";
            const jump: Rep = {
              mean: takeoffVelocity,
              peak: Math.max(takeoffVelocity, r.peakLandingG),
              duration: flightTime,
              rom: height,
              power: 0,
              peakPower: 0,
              startTime: r.movementStartedAt - r.startedAt,
              peakTime: r.flightStartedAt - r.startedAt,
              endTime: landingAt - r.startedAt,
              timeToTakeoff,
              rsiMod,
              rsiCondition,
            };
            setJumps((current) => [...current, jump]);
            setMessage(mode === "cmj" ? `CMJ tersimpan • ${(height * 100).toFixed(1)} cm • RSImod ${rsiMod.toFixed(2)} m/s` : `Lompatan tersimpan • ${(height * 100).toFixed(1)} cm • flight time ${(flightTime * 1000).toFixed(0)} ms`);
          } else {
            setMessage("Flight time di luar rentang valid • lompatan ditolak");
          }
          r.phase = "landing";
          r.stableFrames = 0;
          setPhase("MENDARAT");
        }
      } else if (r.phase === "landing") {
        if (deviation < 0.14) r.stableFrames += 1;
        else r.stableFrames = Math.max(0, r.stableFrames - 1);
        if (r.stableFrames >= 5) {
          r.phase = "ready";
          r.counterFrames = 0;
          r.takeoffFrames = 0;
          r.lowGFrames = 0;
          r.landingFrames = 0;
          r.firstLowGAt = 0;
          r.firstLandingAt = 0;
          setPhase("SIAP LOMPAT");
          setMessage("Posisi kembali stabil • siap untuk lompatan berikutnya");
        }
      }
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [mode]);

  async function activateSensor() {
    try {
      const motionConstructor = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof motionConstructor.requestPermission === "function") {
        const permission = await motionConstructor.requestPermission();
        if (permission !== "granted") throw new Error("Izin sensor ditolak");
      }
      calibration.current = { magnitude: 0, samples: 0 };
      setSensorState("calibrating");
      setMessage("Kalibrasi 2 detik • berdiri tegak dan jangan bergerak");
      window.setTimeout(() => {
        if (calibration.current.samples < 3) {
          setSensorState("error");
          setMessage("Sensor gerak tidak mengirim data. Gunakan Chrome/Safari dan izinkan Motion Sensor.");
          return;
        }
        setSensorState("ready");
        setPhase("SIAP");
        setMessage("Kalibrasi selesai • tekan mulai lalu berdiri diam sebelum melompat");
      }, 2000);
    } catch (error) {
      setSensorState("error");
      setMessage(error instanceof Error ? error.message : "Sensor gerak tidak dapat diakses");
    }
  }
  function startMeasurement() {
    runtime.current = { phase: "ready", startedAt: 0, lastTime: 0, flightStartedAt: 0, movementStartedAt: 0, firstLowGAt: 0, firstLandingAt: 0, takeoffImpulseAt: 0, counterFrames: 0, takeoffFrames: 0, lowGFrames: 0, lowGDropouts: 0, landingFrames: 0, stableFrames: 0, eventCount: 0, rateStartedAt: 0, filteredG: 1, peakLandingG: 0 };
    setJumps([]);
    setLiveG(1);
    setSensorState("running");
    setPhase("SIAP LOMPAT");
    setMessage("Mengukur • berdiri diam, turun, lakukan tolakan, melayang, lalu mendarat stabil");
  }
  function stopMeasurement() {
    setSensorState("ready");
    setPhase("SELESAI");
    if (jumpsRef.current.length) {
      onSave(jumpsRef.current, mode === "cmj" ? "CMJ + RSImod" : "Vertical Jump", 0);
      setMessage(`${jumpsRef.current.length} lompatan disimpan ke riwayat ${athleteName}`);
    } else setMessage("Pengukuran dihentikan • belum ada lompatan valid");
  }
  const lastJump = jumps[jumps.length - 1];
  const best = jumps.length ? Math.max(...jumps.map((jump) => jump.rom)) : 0;
  const average = jumps.length ? jumps.reduce((sum, jump) => sum + jump.rom, 0) / jumps.length : 0;
  const lastRsi = lastJump?.rsiMod ?? 0;
  const bestRsi = jumps.length ? Math.max(...jumps.map((jump) => jump.rsiMod ?? 0)) : 0;
  return (
    <section className="sensor-workspace vertical-jump-workspace">
      <div className="sensor-intro">
        <div><small>HP SEBAGAI SENSOR LOMPATAN</small><h2>{mode === "cmj" ? "CMJ + RSImod ANALYZER" : "VERTICAL JUMP ANALYZER"}</h2><p>Pasang HP erat di pinggang dengan sabuk/holder. Sistem membaca urutan countermovement, tolakan, fase melayang, pendaratan, dan posisi stabil.</p></div>
        <span className={`sensor-state state-${sensorState}`}>● {sensorState === "running" ? "MENGUKUR" : sensorState === "ready" ? "SIAP" : sensorState === "calibrating" ? "KALIBRASI" : sensorState === "error" ? "PERIKSA SENSOR" : "BELUM AKTIF"}</span>
      </div>
      <div className="sensor-controls vj-controls">
        <article><small>ATLET</small><strong>{athleteName}</strong></article>
        <article><small>METODE</small><strong>{mode === "cmj" ? "CMJ Sensor" : "Flight Time"}</strong></article>
        <article><small>SAMPLE RATE</small><strong>{sensorRate || "—"} {sensorRate ? "Hz" : ""}</strong></article>
        {sensorState === "idle" || sensorState === "error" ? <button type="button" onClick={() => void activateSensor()}>◎ AKTIFKAN & KALIBRASI</button> : sensorState === "ready" ? <button type="button" onClick={startMeasurement}>▶ MULAI PENGUKURAN</button> : sensorState === "running" ? <button type="button" className="sensor-stop" onClick={stopMeasurement}>■ SELESAI & SIMPAN</button> : <button type="button" disabled>○ JANGAN BERGERAK</button>}
      </div>
      <div className="sensor-message">◎ {message}</div>
      <div className="vj-phase"><small>FASE GERAK</small><strong>{phase}</strong><span>Resultan sensor {liveG.toFixed(2)} g</span></div>
      <div className="sensor-live-grid vj-live-grid">
        <article className="sensor-main-value"><small>TINGGI LOMPATAN TERAKHIR</small><strong>{lastJump ? (lastJump.rom * 100).toFixed(1).replace(".", ",") : "0,0"}</strong><b>cm</b><span>{lastJump ? "HASIL TERSIMPAN" : "MENUNGGU LOMPATAN"}</span></article>
        <article><small>FLIGHT TIME</small><strong>{lastJump ? Math.round(lastJump.duration * 1000) : "0"}</strong><b>ms</b></article>
        <article><small>TAKE-OFF VELOCITY</small><strong>{lastJump ? lastJump.mean.toFixed(2) : "0,00"}</strong><b>m/s</b></article>
        <article><small>JUMLAH LOMPATAN</small><strong>{jumps.length}</strong><b>jump</b></article>
        <article><small>TERBAIK</small><strong>{(best * 100).toFixed(1)}</strong><b>cm</b></article>
        <article><small>RATA-RATA</small><strong>{(average * 100).toFixed(1)}</strong><b>cm</b></article>
        {mode === "cmj" && <article className={`rsi-condition rsi-${lastJump?.rsiCondition?.toLowerCase().replaceAll(" ", "-") ?? "waiting"}`}><small>RSImod TERAKHIR</small><strong>{lastJump ? lastRsi.toFixed(2).replace(".", ",") : "0,00"}</strong><b>m/s</b><span>{lastJump?.rsiCondition ?? "MENUNGGU CMJ"}</span></article>}
        {mode === "cmj" && <article><small>TIME TO TAKE-OFF</small><strong>{lastJump?.timeToTakeoff ? Math.round(lastJump.timeToTakeoff * 1000) : "0"}</strong><b>ms</b><span>Terbaik RSImod {bestRsi.toFixed(2)}</span></article>}
      </div>
      {jumps.length > 0 && <div className="sensor-reps">{jumps.map((jump, index) => <article key={index}><small>{mode === "cmj" ? "CMJ" : "JUMP"} {index + 1}</small><strong>{(jump.rom * 100).toFixed(1)}</strong><b>cm</b><span>{Math.round(jump.duration * 1000)} ms</span><p>{mode === "cmj" ? `RSImod ${(jump.rsiMod ?? 0).toFixed(2)} m/s • ${jump.rsiCondition}` : `Take-off velocity ${jump.mean.toFixed(2)} m/s`}</p></article>)}</div>}
      {mode === "cmj" && <div className="rsi-guide"><strong>KONDISI RSImod</strong><span>Rendah &lt;0,30 • Perlu ditingkatkan 0,30–0,49 • Baik 0,50–0,69 • Sangat baik ≥0,70 m/s</span><small>Gunakan sebagai zona pemantauan internal. Bandingkan atlet dengan protokol, posisi HP, dan kondisi tes yang sama.</small></div>}
      <div className="sensor-safety"><strong>PENEMPATAN WAJIB</strong><span>HP harus terpasang kaku di pinggang, bukan digenggam. Gunakan matras dan area aman. Kalibrasi ulang jika posisi atau orientasi HP berubah.</span></div>
    </section>
  );
}

function PhoneSensorWorkspace(props: {
  loadKg: number;
  exercise: string;
  athleteName: string;
  athletes: AthleteProfile[];
  activeAthleteId: string;
  onAthleteChange: (athleteId: string) => void;
  onExerciseChange: (value: string) => void;
  onLoadChange: (value: number) => void;
  onSave: (reps: Rep[], exerciseOverride?: string, loadOverride?: number) => void;
}) {
  const [testMode, setTestMode] = useState<SensorTestMode>("vbt");
  return (
    <>
      <div className="sensor-mobile-heading">
        <h1>TRAIN</h1>
        <p>Pilih atlet, mode pengukuran, lalu mulai</p>
      </div>
      <div className="sensor-test-switch" role="group" aria-label="Pilih jenis pengukuran sensor HP">
        <button type="button" className={testMode === "vbt" ? "active" : ""} onClick={() => setTestMode("vbt")}>⌁ VELOCITY / VBT</button>
        <button type="button" className={testMode === "verticalJump" ? "active" : ""} onClick={() => setTestMode("verticalJump")}>↥ VERTICAL JUMP</button>
        <button type="button" className={testMode === "cmj" ? "active" : ""} onClick={() => setTestMode("cmj")}>↥ CMJ + RSImod</button>
        <span>{testMode === "vbt" ? "HP dipasang pada beban atau tubuh untuk membaca velocity" : testMode === "cmj" ? "HP di pinggang mengukur tinggi, time to take-off, RSImod, dan kondisi" : "HP dipasang di pinggang untuk mengukur tinggi lompatan"}</span>
      </div>
      {testMode === "vbt"
        ? <PhoneSensorAnalysis {...props} />
        : <VerticalJumpSensorAnalysis athleteName={props.athleteName} onSave={props.onSave} mode={testMode} />}
    </>
  );
}

type SprintPhase = "idle" | "camera" | "countdown" | "waiting-start" | "running" | "finished" | "error";

function SprintCameraWorkspace({ athleteName }: { athleteName: string }) {
  const cameraRef = useRef<HTMLVideoElement>(null);
  const sampleRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const phaseRef = useRef<SprintPhase>("idle");
  const timersRef = useRef<number[]>([]);
  const previousFrame = useRef<Uint8ClampedArray | null>(null);
  const lastMotionAt = useRef(0);
  const leftGateAfterStart = useRef(false);
  const startAt = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const [phase, setPhase] = useState<SprintPhase>("idle");
  const [distance, setDistance] = useState(10);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [motion, setMotion] = useState(0);
  const [message, setMessage] = useState("Letakkan HP di tripod, kamera menghadap garis start/finish dari samping.");
  const updatePhase = (next: SprintPhase) => { phaseRef.current = next; setPhase(next); };

  const tone = (frequency = 740, duration = .12) => {
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const context = audioRef.current ?? new AudioCtor();
      audioRef.current = context;
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.22, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch { /* Bunyi bukan syarat pengukuran. */ }
  };

  const stopCamera = () => {
    window.cancelAnimationFrame(frameRef.current);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const finishRun = (now: number) => {
    const seconds = Math.max(.01, (now - startAt.current) / 1000);
    setElapsed(seconds);
    updatePhase("finished");
    setMessage("Finish terdeteksi • hasil pengukuran siap.");
    tone(1040, .3);
    navigator.vibrate?.([120, 60, 180]);
  };

  const analyzeFrame = () => {
    const videoElement = cameraRef.current;
    const canvasElement = sampleRef.current;
    if (!videoElement || !canvasElement || videoElement.readyState < 2) {
      frameRef.current = window.requestAnimationFrame(analyzeFrame);
      return;
    }
    const context = canvasElement.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const width = 96, height = 72;
    canvasElement.width = width; canvasElement.height = height;
    context.drawImage(videoElement, 0, 0, width, height);
    const pixels = context.getImageData(36, 0, 24, height).data;
    const prior = previousFrame.current;
    let changed = 0;
    if (prior?.length === pixels.length) {
      for (let index = 0; index < pixels.length; index += 4) {
        const delta = Math.abs(pixels[index] - prior[index]) + Math.abs(pixels[index + 1] - prior[index + 1]) + Math.abs(pixels[index + 2] - prior[index + 2]);
        if (delta > 76) changed += 1;
      }
    }
    previousFrame.current = new Uint8ClampedArray(pixels);
    const score = prior ? changed / (pixels.length / 4) : 0;
    setMotion(score);
    const now = performance.now();
    if (score > .12) lastMotionAt.current = now;
    if (phaseRef.current === "waiting-start" && score > .16) {
      startAt.current = now;
      leftGateAfterStart.current = false;
      setElapsed(0);
      updatePhase("running");
      setMessage("Start terdeteksi • menunggu atlet kembali ke garis.");
      tone(880, .16);
    } else if (phaseRef.current === "running") {
      setElapsed((now - startAt.current) / 1000);
      if (!leftGateAfterStart.current && now - lastMotionAt.current > 650 && now - startAt.current > 900) {
        leftGateAfterStart.current = true;
        setMessage("Atlet meninggalkan garis • finish sudah aktif.");
      } else if (leftGateAfterStart.current && score > .17 && now - startAt.current > 1600) {
        finishRun(now);
        return;
      }
    }
    frameRef.current = window.requestAnimationFrame(analyzeFrame);
  };

  const begin = async () => {
    try {
      tone(520, .08);
      stopCamera();
      setElapsed(0); setCountdown(3); updatePhase("camera");
      setMessage("Membuka kamera belakang…");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        await cameraRef.current.play();
      }
      previousFrame.current = null;
      updatePhase("countdown");
      setMessage("Berdiri siap di garis. Mulai berlari setelah bunyi panjang.");
      [3, 2, 1].forEach((value, index) => timersRef.current.push(window.setTimeout(() => { setCountdown(value); tone(620, .09); }, index * 1000)));
      timersRef.current.push(window.setTimeout(() => {
        setCountdown(0);
        updatePhase("waiting-start");
        setMessage("MULAI! Sistem menunggu gerakan atlet meninggalkan garis.");
        tone(980, .45);
      }, 3000));
      frameRef.current = window.requestAnimationFrame(analyzeFrame);
    } catch {
      updatePhase("error");
      setMessage("Kamera tidak dapat dibuka. Izinkan akses kamera lalu coba kembali.");
    }
  };

  useEffect(() => () => stopCamera(), []);
  const totalDistance = distance * 2;
  const averageSpeed = elapsed > 0 ? totalDistance / elapsed : 0;
  const kmh = averageSpeed * 3.6;
  const pace = averageSpeed > 0 ? 1000 / averageSpeed : 0;
  const paceMinutes = Math.floor(pace / 60);
  const paceSeconds = Math.round(pace % 60);
  const active = phase === "camera" || phase === "countdown" || phase === "waiting-start" || phase === "running";

  return (
    <section className="sprint-workspace">
      <div className="sprint-heading"><div><small>PENGUKURAN SATU KAMERA</small><h2>SPRINT PERGI–KEMBALI</h2></div><span>START = FINISH</span></div>
      <div className="sprint-setup">
        <label><span>ATLET</span><strong>{athleteName}</strong></label>
        <label><span>JARAK SATU ARAH</span><div><input type="number" min="2" max="100" step="1" value={distance} disabled={active} onChange={(event) => setDistance(Math.max(2, Math.min(100, Number(event.target.value) || 2)))} /><b>m</b></div></label>
        <article><span>TOTAL JARAK</span><strong>{totalDistance} m</strong><small>{distance} m pergi + {distance} m kembali</small></article>
      </div>
      <div className="sprint-camera">
        <video ref={cameraRef} muted playsInline />
        <canvas ref={sampleRef} aria-hidden="true" />
        <div className="sprint-gate"><span>GARIS START / FINISH</span></div>
        {(phase === "idle" || phase === "error") && <div className="sprint-placeholder"><strong>1 KAMERA • 1 GARIS</strong><p>Pasang HP ±3–5 meter dari garis, setinggi pinggang, dan arahkan dari samping.</p></div>}
        {phase === "countdown" && <div className="sprint-countdown">{countdown}</div>}
        <div className="sprint-motion"><i style={{ width: `${Math.min(100, motion * 400)}%` }} />DETEKSI GERAK</div>
      </div>
      {!active ? <button type="button" className="sprint-primary" onClick={() => void begin()}>{phase === "finished" ? "↻ UKUR LAGI" : "MULAI"}</button> : <button type="button" className="sprint-primary sprint-stop" onClick={() => { stopCamera(); updatePhase("idle"); setMessage("Pengukuran dibatalkan. Kamera siap diaktifkan kembali."); }}>■ BATAL / SELESAI</button>}
      <div className={`sprint-status phase-${phase}`}><span>● {phase === "running" ? "TIMER AKTIF" : phase === "finished" ? "SELESAI" : "SIAP"}</span><strong>{elapsed.toFixed(2).replace(".", ",")} s</strong><p>{message}</p></div>
      {phase === "finished" && <div className="sprint-results">
        <article><small>WAKTU TOTAL</small><strong>{elapsed.toFixed(2).replace(".", ",")}</strong><b>detik</b></article>
        <article><small>KECEPATAN RATA-RATA</small><strong>{averageSpeed.toFixed(2).replace(".", ",")}</strong><b>m/s</b></article>
        <article><small>KECEPATAN</small><strong>{kmh.toFixed(1).replace(".", ",")}</strong><b>km/jam</b></article>
        <article><small>PACE</small><strong>{paceMinutes}:{String(paceSeconds).padStart(2, "0")}</strong><b>min/km</b></article>
      </div>}
      <div className="sprint-guide"><strong>CARA PENEMPATAN</strong><ol><li>Pasang HP pada tripod dari samping garis.</li><li>Pastikan tubuh atlet melintasi garis merah di tengah layar.</li><li>Tekan Mulai, berdiri siap, lalu bergerak setelah bunyi panjang.</li><li>Sistem berhenti saat atlet kembali melewati garis yang sama.</li></ol></div>
    </section>
  );
}

type DualSprintSession = { code: string; distance: number; athlete: string; status: "waiting" | "armed" | "running" | "finished"; finishConnected: number | boolean; startAt: number | null; finishAt: number | null };

function sprintJoinCodeFromUrl() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  if (params.get("sprint") !== "dual" || params.get("role") !== "finish") return "";
  return (params.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function TwoPhoneSprintWorkspace({ athleteName }: { athleteName: string }) {
  const cameraRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const previousRef = useRef<Uint8ClampedArray | null>(null);
  const sentRef = useRef(false);
  const sessionRef = useRef<DualSprintSession | null>(null);
  const initialJoinCode = sprintJoinCodeFromUrl();
  const roleRef = useRef<"start" | "finish">(initialJoinCode ? "finish" : "start");
  const [role, setRoleState] = useState<"start" | "finish">(initialJoinCode ? "finish" : "start");
  const setRole = (next: "start" | "finish") => { roleRef.current = next; setRoleState(next); };
  const [distance, setDistance] = useState(20);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [session, setSessionState] = useState<DualSprintSession | null>(null);
  const setSession = (next: DualSprintSession | null) => { sessionRef.current = next; setSessionState(next); };
  const [cameraActive, setCameraActive] = useState(false);
  const [motion, setMotion] = useState(0);
  const [message, setMessage] = useState("Pilih fungsi HP ini sebagai kamera start atau kamera finish.");
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const autoJoinAttempted = useRef(false);

  const post = async (action: string, codeValue = sessionRef.current?.code) => {
    const response = await fetch("/api/sprint-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code: codeValue, distance, athlete: athleteName }) });
    const data = await response.json() as { session?: DualSprintSession; code?: string; error?: string };
    if (!response.ok) throw new Error(data.error || "Sesi tidak dapat diproses.");
    if (data.session) setSession(data.session);
    return data;
  };

  const createSession = async () => {
    try { const data = await post("create", ""); if (data.code) { setSession({ code: data.code, distance, athlete: athleteName, status: "waiting", finishConnected: false, startAt: null, finishAt: null }); setMessage("Bagikan kode ini ke HP Finish."); } } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal membuat sesi."); }
  };
  const joinSession = async () => {
    try { const data = await post("join", joinCode); if (data.session) { setSession(data.session); setMessage("Terhubung ke HP Start. Aktifkan kamera finish."); } } catch (error) { setMessage(error instanceof Error ? error.message : "Kode sesi tidak ditemukan."); }
  };

  useEffect(() => {
    if (!session?.code || role !== "start") return;
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("sprint", "dual");
    url.searchParams.set("role", "finish");
    url.searchParams.set("code", session.code);
    const nextShareUrl = url.toString();
    setShareUrl(nextShareUrl);
    void QRCode.toDataURL(nextShareUrl, { width: 320, margin: 2, color: { dark: "#090b0c", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [session?.code, role]);

  useEffect(() => {
    if (autoJoinAttempted.current) return;
    const code = sprintJoinCodeFromUrl();
    if (code.length !== 6) return;
    autoJoinAttempted.current = true;
    const timer = window.setTimeout(() => {
      setMessage("Menghubungkan HP Finish secara otomatis…");
      void post("join", code)
        .then((data) => { if (data.session) { setSession(data.session); setMessage("QR berhasil dipindai • HP Finish sudah terhubung."); } })
        .catch((error) => setMessage(error instanceof Error ? error.message : "Sesi dari QR tidak ditemukan."));
    }, 0);
    return () => window.clearTimeout(timer);
    // Tautan QR hanya diproses sekali ketika workspace Finish dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.code) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/sprint-session?code=${session.code}`, { cache: "no-store" });
        const data = await response.json() as { session?: DualSprintSession };
        if (data.session) setSession(data.session);
      } catch { /* koneksi berikutnya mencoba kembali */ }
    }, 300);
    return () => window.clearInterval(timer);
  }, [session?.code]);

  useEffect(() => {
    if (session?.status === "armed") { sentRef.current = false; setMessage(role === "start" ? "Siap • atlet melintasi garis start untuk memulai." : "Siap • menunggu sinyal start dari HP pertama."); }
    if (session?.status === "running") { if (role === "finish") setMessage("Timer aktif • tunggu atlet melintasi garis finish."); if (session.startAt) setLiveElapsed((Date.now() - session.startAt) / 1000); }
    if (session?.status === "finished") setMessage("Finish terdeteksi • hasil tersinkron pada kedua HP.");
  }, [session?.status, session?.startAt, role]);

  useEffect(() => {
    if (session?.status !== "running" || !session.startAt) return;
    const timer = window.setInterval(() => setLiveElapsed((Date.now() - session.startAt!) / 1000), 50);
    return () => window.clearInterval(timer);
  }, [session?.status, session?.startAt]);

  const analyze = () => {
    const video = cameraRef.current, canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) { frameRef.current = requestAnimationFrame(analyze); return; }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    canvas.width = 96; canvas.height = 72; context.drawImage(video, 0, 0, 96, 72);
    const pixels = context.getImageData(36, 0, 24, 72).data;
    let changed = 0;
    if (previousRef.current?.length === pixels.length) for (let index = 0; index < pixels.length; index += 4) {
      const delta = Math.abs(pixels[index] - previousRef.current[index]) + Math.abs(pixels[index + 1] - previousRef.current[index + 1]) + Math.abs(pixels[index + 2] - previousRef.current[index + 2]);
      if (delta > 76) changed++;
    }
    previousRef.current = new Uint8ClampedArray(pixels);
    const score = changed / (pixels.length / 4); setMotion(score);
    const current = sessionRef.current;
    const canTrigger = roleRef.current === "start" ? current?.status === "armed" : current?.status === "running";
    if (canTrigger && score > .17 && !sentRef.current) { sentRef.current = true; void post(roleRef.current === "start" ? "start" : "finish"); navigator.vibrate?.(120); }
    frameRef.current = requestAnimationFrame(analyze);
  };

  const activateCamera = async () => {
    try {
      streamRef.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream; if (cameraRef.current) { cameraRef.current.srcObject = stream; await cameraRef.current.play(); }
      previousRef.current = null; setCameraActive(true); setMessage(role === "start" ? "Kamera start aktif. Hubungkan HP Finish lalu tekan Siapkan Tes." : "Kamera finish aktif. Menunggu HP Start menyiapkan tes.");
      frameRef.current = requestAnimationFrame(analyze);
    } catch { setMessage("Kamera tidak dapat dibuka. Izinkan akses kamera lalu coba kembali."); }
  };
  useEffect(() => () => { cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach(track => track.stop()); }, []);

  const resultSeconds = session?.startAt && session.finishAt ? Math.max(.001, (session.finishAt - session.startAt) / 1000) : session?.status === "running" ? liveElapsed : 0;
  const speed = resultSeconds > 0 ? (session?.distance || distance) / resultSeconds : 0;
  return <section className="sprint-workspace dual-sprint">
    <div className="sprint-heading"><div><small>PENGUKURAN DUA KAMERA</small><h2>SPRINT START–FINISH</h2></div><span>2 HP TERHUBUNG</span></div>
    {!session && <div className="dual-role-switch" role="group" aria-label="Pilih fungsi HP"><button className={role === "start" ? "active" : ""} onClick={() => setRole("start")}>HP INI • START</button><button className={role === "finish" ? "active" : ""} onClick={() => setRole("finish")}>HP INI • FINISH</button></div>}
    {!session && role === "start" && <div className="dual-connect-card"><span>JARAK START–FINISH</span><label><input type="number" min="2" max="400" value={distance} onChange={event => setDistance(Math.max(2, Math.min(400, Number(event.target.value) || 2)))} /><b>meter</b></label><button onClick={() => void createSession()}>BUAT KODE SESI</button></div>}
    {!session && role === "finish" && <div className="dual-connect-card"><span>MASUKKAN KODE DARI HP START</span><label><input className="session-code-input" maxLength={6} value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ABC123" /></label><button disabled={joinCode.length !== 6} onClick={() => void joinSession()}>HUBUNGKAN HP FINISH</button></div>}
    {session && <div className="dual-session-bar"><div><small>KODE SESI</small><strong>{session.code}</strong></div><div><small>HP FINISH</small><b className={session.finishConnected ? "connected" : ""}>{session.finishConnected ? "● TERHUBUNG" : "○ MENUNGGU"}</b></div><div><small>JARAK</small><strong>{session.distance} m</strong></div></div>}
    {session && role === "start" && !session.finishConnected && <div className="dual-qr-card">
      <div><span>SAMBUNGKAN HP FINISH</span><strong>SCAN QR</strong><p>Buka kamera bawaan HP Finish, arahkan ke QR, lalu ketuk tautan yang muncul.</p></div>
      {qrDataUrl ? <Image src={qrDataUrl} alt={`QR untuk menghubungkan HP Finish ke sesi ${session.code}`} width={320} height={320} unoptimized /> : <div className="dual-qr-loading">MEMBUAT QR…</div>}
      <div className="dual-qr-actions"><small>ATAU MASUKKAN KODE</small><b>{session.code}</b><button type="button" onClick={() => void navigator.clipboard?.writeText(shareUrl).then(() => setMessage("Tautan sesi berhasil disalin."))}>SALIN TAUTAN</button></div>
    </div>}
    {session && <div className="sprint-camera"><video ref={cameraRef} muted playsInline /><canvas ref={canvasRef} aria-hidden="true"/><div className="sprint-gate"><span>GARIS {role.toUpperCase()}</span></div>{!cameraActive && <div className="sprint-placeholder"><strong>HP {role.toUpperCase()}</strong><p>Pasang kamera dari samping garis {role}, lalu tekan Mulai.</p></div>}<div className="sprint-motion"><i style={{ width: `${Math.min(100, motion * 400)}%` }}/>DETEKSI GERAK</div></div>}
    {session && !cameraActive && <button className="sprint-primary" onClick={() => void activateCamera()}>MULAI</button>}
    {session && cameraActive && role === "start" && session.status !== "running" && <button className="sprint-primary" disabled={!session.finishConnected} onClick={() => void post(session.status === "finished" ? "reset" : "arm")}>{session.finishConnected ? (session.status === "finished" ? "↻ UKUR LAGI" : "▶ SIAPKAN TES") : "MENUNGGU HP FINISH…"}</button>}
    {session && <div className={`sprint-status phase-${session.status}`}><span>● {session.status === "running" ? "TIMER AKTIF" : session.status === "finished" ? "SELESAI" : session.status === "armed" ? "SIAP" : "MENGHUBUNGKAN"}</span><strong>{resultSeconds.toFixed(2).replace(".", ",")} s</strong><p>{message}</p></div>}
    {session?.status === "finished" && <div className="sprint-results"><article><small>WAKTU</small><strong>{resultSeconds.toFixed(2).replace(".", ",")}</strong><b>detik</b></article><article><small>KECEPATAN RATA-RATA</small><strong>{speed.toFixed(2).replace(".", ",")}</strong><b>m/s</b></article><article><small>KECEPATAN</small><strong>{(speed * 3.6).toFixed(1).replace(".", ",")}</strong><b>km/jam</b></article><article><small>JARAK</small><strong>{session.distance}</strong><b>meter</b></article></div>}
    {session && <div className="sprint-guide"><strong>CARA 2 HP</strong><ol><li>HP Start membuat sesi lalu menampilkan QR.</li><li>Scan QR dengan kamera bawaan HP Finish; aplikasi terbuka dan tersambung otomatis.</li><li>Jika QR sulit dipindai, masukkan kode 6 karakter atau kirim tautan sesi.</li><li>Aktifkan kamera pada kedua HP, lalu tekan Siapkan Tes di HP Start.</li><li>Timer mulai dan berhenti otomatis ketika atlet melintasi masing-masing garis merah.</li></ol></div>}
  </section>;
}

function SprintWorkspace({ athleteName }: { athleteName: string }) {
  const [mode, setMode] = useState<"single" | "dual">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sprint") === "dual" ? "dual" : "single");
  return <><div className="sprint-mode-tabs" role="tablist" aria-label="Metode pengukuran kecepatan lari"><button type="button" role="tab" aria-selected={mode === "single"} className={mode === "single" ? "active" : ""} onClick={() => setMode("single")}><strong>1 HP</strong><span>Pergi–pulang</span></button><button type="button" role="tab" aria-selected={mode === "dual"} className={mode === "dual" ? "active" : ""} onClick={() => setMode("dual")}><strong>2 HP</strong><span>Start–finish</span></button></div>{mode === "single" ? <SprintCameraWorkspace athleteName={athleteName}/> : <TwoPhoneSprintWorkspace athleteName={athleteName}/>}</>;
}

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-logo${compact ? " compact" : ""}`}>
      <Image src="/brand/hirocross-logo-192.png" alt="Logo HiroCross" width={58} height={58} priority unoptimized />
      <div><strong>HIROCROSS</strong><span>MOTION VBT</span></div>
    </div>
  );
}

function WelcomeHome({ user, onEnter, onInstall, installState, showInstallGuide, onCloseInstallGuide }: { user: AuthUser | null; onEnter: () => void; onInstall: () => void; installState: InstallState; showInstallGuide: boolean; onCloseInstallGuide: () => void }) {
  return (
    <main className="welcome-home">
      <nav className="welcome-nav">
        <BrandLogo />
        <div className="welcome-nav-actions">
          <a href="#fitur">FITUR</a><a href="#cara-kerja">CARA KERJA</a>
          <button type="button" className="nav-install" onClick={onInstall}>{installState === "installed" ? "✓ TERINSTAL" : "⇩ INSTAL"}</button>
          <button type="button" onClick={onEnter}>{user ? "BUKA DASHBOARD" : "BUKA APLIKASI"}</button>
        </div>
      </nav>
      <section className="welcome-hero">
        <div className="welcome-copy">
          <span className="welcome-eyebrow">● COMPUTER VISION • VELOCITY BASED TRAINING</span>
          <h1>UKUR KECEPATAN.<br/><em>KENDALIKAN BEBAN.</em><br/>TINGKATKAN PERFORMA.</h1>
          <p>Analisis kecepatan bar dan plate melalui video atau sensor gerak HP. Pantau setiap repetisi, velocity loss, power, estimasi 1RM, dan perkembangan seluruh atlet dalam satu aplikasi.</p>
          {user ? (
            <div className="welcome-session"><div><small>MASUK SEBAGAI</small><strong>{user.fullName ?? user.displayName}</strong><span>{user.email}</span></div><button type="button" onClick={onEnter}>BUKA DASHBOARD VBT <b>→</b></button></div>
          ) : (
            <div className="welcome-auth"><button type="button" onClick={onEnter}>BUKA APLIKASI <b>→</b></button><small>Daftar atau masuk dengan email melalui halaman Pengaturan</small></div>
          )}
          <button className="hero-install" type="button" onClick={onInstall}>{installState === "installed" ? "✓ APLIKASI SUDAH TERINSTAL" : "⇩ INSTAL HIROCROSS DI HP"}<span>{installState === "available" ? "Siap dipasang langsung" : "Android & iPhone"}</span></button>
          <div className="welcome-proof"><span><strong>REAL-TIME</strong> ANALYSIS</span><span><strong>MULTI</strong> ATHLETE</span><span><strong>SMART</strong> REP DETECTION</span></div>
        </div>
        <div className="welcome-visual" aria-label="Contoh dashboard analisis velocity">
          <div className="visual-orbit"><span>DEADLIFT</span><strong>0,75</strong><b>MEAN VELOCITY • M/S</b><i>STRENGTH–SPEED / POWER</i></div>
          <div className="visual-stat stat-one"><small>VELOCITY LOSS</small><strong>8,4%</strong><span>AMAN • LANJUTKAN SET</span></div>
          <div className="visual-stat stat-two"><small>ESTIMASI 1RM</small><strong>142,5 <b>kg</b></strong><span>LOAD–VELOCITY PROFILE</span></div>
          <div className="visual-chart"><small>VELOCITY / REP</small><div className="mini-bars"><i/><i/><i/><i/><i/></div><span>R1&nbsp;&nbsp; R2&nbsp;&nbsp; R3&nbsp;&nbsp; R4&nbsp;&nbsp; R5</span></div>
        </div>
      </section>
      <section className="welcome-features" id="fitur">
        <article><b>01</b><h2>VIDEO & SENSOR HP</h2><p>Pilih tracking plate melalui kamera atau jadikan HP sebagai device accelerometer yang dipasang pada beban.</p></article>
        <article><b>02</b><h2>DATA SET LENGKAP</h2><p>Mean dan peak velocity, ROM, power, velocity loss, serta ulasan zona latihan setiap repetisi.</p></article>
        <article><b>03</b><h2>DASHBOARD ATLET</h2><p>Riwayat multi-atlet, grafik perkembangan, profil load–velocity, dan estimasi 1RM dari waktu ke waktu.</p></article>
      </section>
      <section className="welcome-steps" id="cara-kerja"><small>CARA KERJA</small><strong>UNGGAH VIDEO</strong><i>→</i><strong>KUNCI PLATE</strong><i>→</i><strong>ANALISIS SET</strong><i>→</i><strong>PANTAU PROGRES</strong></section>
      {showInstallGuide && <section className="install-guide" role="dialog" aria-modal="true" aria-label="Cara instal HiroCross Motion VBT"><button type="button" className="install-close" onClick={onCloseInstallGuide}>×</button><span>INSTAL DI HP</span><h2>TAMBAHKAN HIROCROSS KE LAYAR UTAMA</h2><div><article><b>ANDROID • CHROME</b><ol><li>Tekan menu <strong>⋮</strong> di kanan atas Chrome.</li><li>Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li><li>Tekan <strong>Instal</strong>.</li></ol></article><article><b>IPHONE • SAFARI</b><ol><li>Tekan tombol <strong>Bagikan</strong>.</li><li>Pilih <strong>Add to Home Screen</strong>.</li><li>Tekan <strong>Add</strong>.</li></ol></article></div><small>Setelah terpasang, HiroCross dapat dibuka dari ikon aplikasi seperti aplikasi HP lainnya.</small></section>}
      <footer className="welcome-footer"><BrandLogo /><p>Sport Science Technology • Engine {ENGINE_VERSION}</p></footer>
    </main>
  );
}

function AccountSettings({ user, onUserChange }: { user: AuthUser | null; onUserChange: (user: AuthUser | null) => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?app=1` });
        if (error) throw error;
        setMessage("Tautan pengaturan ulang kata sandi sudah dikirim. Periksa email Anda.");
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Kata sandi minimal 8 karakter.");
        if (password !== confirmPassword) throw new Error("Konfirmasi kata sandi belum sama.");
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/?app=1` } });
        if (error) throw error;
        if (data.session && data.user?.email) onUserChange({ email: data.user.email, displayName: data.user.email.split("@")[0], fullName: null });
        setMessage(data.session ? "Akun berhasil dibuat dan sudah masuk." : "Pendaftaran berhasil. Buka email verifikasi sebelum masuk.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user.email) onUserChange({ email: data.user.email, displayName: data.user.email.split("@")[0], fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null });
        setMessage("Berhasil masuk ke akun.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permintaan belum berhasil. Silakan coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) return setMessage(error.message);
    onUserChange(null);
    setPassword("");
    setMessage("Anda sudah keluar dari akun.");
  }

  if (user) return <section className="account-card account-signed-in"><div><span>AKUN HIROCROSS</span><h3>SUDAH MASUK</h3><p>Data sesi akun terhubung dengan email berikut.</p></div><div className="account-identity"><b>{user.email.slice(0, 1).toUpperCase()}</b><div><small>EMAIL TERDAFTAR</small><strong>{user.email}</strong></div></div><button type="button" className="account-signout" disabled={busy} onClick={() => void signOut()}>{busy ? "MEMPROSES…" : "KELUAR AKUN"}</button>{message && <p className="account-message">{message}</p>}</section>;

  return <section className="account-card"><div><span>AKUN HIROCROSS</span><h3>{mode === "signup" ? "DAFTAR AKUN" : mode === "reset" ? "LUPA KATA SANDI" : "MASUK AKUN"}</h3><p>Gunakan email yang Anda daftarkan. Tidak memakai Google, ChatGPT, atau Claude.</p></div>{mode !== "reset" && <div className="account-tabs"><button type="button" className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setMessage(""); }}>MASUK</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>DAFTAR</button></div>}<form onSubmit={(event) => void submit(event)}><label>EMAIL<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" /></label>{mode !== "reset" && <label>KATA SANDI<input type="password" minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /></label>}{mode === "signup" && <label>KONFIRMASI KATA SANDI<input type="password" minLength={8} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Ketik ulang kata sandi" /></label>}<button className="account-submit" disabled={busy}>{busy ? "MEMPROSES…" : mode === "signup" ? "DAFTAR DENGAN EMAIL" : mode === "reset" ? "KIRIM TAUTAN RESET" : "MASUK DENGAN EMAIL"}</button></form>{mode === "signin" && <button type="button" className="account-forgot" onClick={() => { setMode("reset"); setMessage(""); }}>Lupa kata sandi?</button>}{mode === "reset" && <button type="button" className="account-forgot" onClick={() => { setMode("signin"); setMessage(""); }}>← Kembali ke masuk</button>}{message && <p className="account-message" role="status">{message}</p>}<small className="account-note">Akun baru harus memverifikasi alamat email sebelum dapat masuk.</small></section>;
}
function savedPrimaryMetric(): PrimaryMetric {
  if (typeof window === "undefined") return "meanVelocity";
  try {
    const saved = window.localStorage.getItem("hirocross-primary-metric");
    if (
      saved === "meanVelocity" ||
      saved === "peakVelocity" ||
      saved === "meanPower" ||
      saved === "peakPower"
    )
      return saved;
  } catch {
    // Sebagian WebView memblokir storage; gunakan pilihan bawaan dengan aman.
  }
  return "meanVelocity";
}
function descriptor(
  frame: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  size: number,
) {
  const raw: number[] = [];
  for (let gy = 0; gy < 16; gy++)
    for (let gx = 0; gx < 16; gx++) {
      const dx = gx - 7.5,
        dy = gy - 7.5;
      // Ambil pola di dalam lingkaran plate saja. Sudut kotak berisi tubuh
      // atau latar dan sebelumnya membuat target berpindah saat plate naik.
      if (dx * dx + dy * dy > 49) continue;
      const x = Math.max(
          0,
          Math.min(w - 1, Math.round(cx - size / 2 + ((gx + 0.5) * size) / 16)),
        ),
        y = Math.max(
          0,
          Math.min(h - 1, Math.round(cy - size / 2 + ((gy + 0.5) * size) / 16)),
        ),
        i = (y * w + x) * 4;
      raw.push((frame[i] * 3 + frame[i + 1] * 6 + frame[i + 2]) / 10);
    }
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length,
    std =
      Math.sqrt(raw.reduce((a, b) => a + (b - mean) ** 2, 0) / raw.length) || 1;
  return new Float32Array(raw.map((v) => (v - mean) / std));
}
function refinePlateSelection(
  frame: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  diameter: number,
) {
  const gray = (x: number, y: number) => {
    const px = Math.max(0, Math.min(w - 1, Math.round(x))),
      py = Math.max(0, Math.min(h - 1, Math.round(y))),
      i = (py * w + px) * 4;
    return (frame[i] * 3 + frame[i + 1] * 6 + frame[i + 2]) / 10;
  };
  let best = { x: cx, y: cy, diameter, score: -Infinity };
  const centerStep = Math.max(2, Math.round(diameter * 0.025)),
    centerRange = Math.max(4, diameter * 0.075);
  for (let y = cy - centerRange; y <= cy + centerRange; y += centerStep)
    for (let x = cx - centerRange; x <= cx + centerRange; x += centerStep)
      for (let scale = 0.88; scale <= 1.121; scale += 0.04) {
        const d = diameter * scale,
          innerRadius = d * 0.43,
          outerRadius = d * 0.53;
        let inner = 0,
          outer = 0;
        for (let n = 0; n < 48; n++) {
          const angle = (n / 48) * Math.PI * 2,
            cos = Math.cos(angle),
            sin = Math.sin(angle);
          inner += gray(x + cos * innerRadius, y + sin * innerRadius);
          outer += gray(x + cos * outerRadius, y + sin * outerRadius);
        }
        const score = Math.abs(outer / 48 - inner / 48);
        if (score > best.score) best = { x, y, diameter: d, score };
      }
  return {
    ...best,
    confidence: Math.max(0, Math.min(99, Math.round(best.score * 2.2))),
  };
}
function RepChart({ reps }: { reps: Rep[] }) {
  const [metric, setMetric] = useState<ChartMetric>("mean");
  const definition =
    metric === "peak"
      ? { label: "Peak Velocity", unit: "m/s", value: (r: Rep) => r.peak }
      : metric === "power"
        ? { label: "Mean Power", unit: "W", value: (r: Rep) => r.power }
        : metric === "peakPower"
          ? { label: "Peak Power", unit: "W", value: (r: Rep) => r.peakPower }
          : metric === "rom"
            ? { label: "ROM", unit: "cm", value: (r: Rep) => r.rom * 100 }
            : { label: "Mean Velocity", unit: "m/s", value: (r: Rep) => r.mean };
  const values = reps.map(definition.value),
    minimumScale =
      definition.unit === "W" ? 100 : definition.unit === "cm" ? 10 : 0.1,
    max = Math.max(...values, minimumScale) * 1.12,
    left = 52,
    right = 610,
    top = 24,
    bottom = 205,
    x = (i: number) =>
      reps.length === 1
        ? (left + right) / 2
        : left + (i / (reps.length - 1)) * (right - left),
    y = (value: number) => bottom - (value / max) * (bottom - top),
    path = values.map((value, i) => `${x(i)},${y(value)}`).join(" ");
  return (
    <section className="rep-chart">
      <div className="chart-heading">
        <div>
          <h3>GRAFIK SET</h3>
          <small>REP 1 — REP {reps.length}</small>
        </div>
        <select
          aria-label="Pilih data grafik repetisi"
          value={metric}
          onChange={(event) => setMetric(event.target.value as ChartMetric)}
        >
          <option value="mean">Mean Velocity</option>
          <option value="peak">Peak Velocity</option>
          <option value="power">Mean Power</option>
          <option value="peakPower">Peak Power</option>
          <option value="rom">ROM</option>
        </select>
      </div>
      <svg
        viewBox="0 0 640 245"
        role="img"
        aria-label={`${definition.label} dari repetisi 1 sampai ${reps.length}`}
      >
        <title>{definition.label} per repetisi</title>
        <desc>
          Grafik garis {definition.label} dari repetisi pertama hingga terakhir.
        </desc>
        {[0, 0.5, 1].map((portion) => {
          const value = max * portion,
            lineY = y(value);
          return (
            <g key={portion}>
              <line x1={left} y1={lineY} x2={right} y2={lineY} />
              <text x={left - 8} y={lineY + 4} textAnchor="end">
                {value.toFixed(definition.unit === "W" ? 0 : 1)}
              </text>
            </g>
          );
        })}
        <polyline className="chart-line" points={path} />
        {values.map((value, i) => (
          <g key={i}>
            <circle className="chart-dot" cx={x(i)} cy={y(value)} r="6">
              <title>
                Rep {i + 1}: {value.toFixed(definition.unit === "W" ? 0 : 2)}{" "}
                {definition.unit}
              </title>
            </circle>
            <text className="chart-value" x={x(i)} y={y(value) - 13} textAnchor="middle">
              {value.toFixed(definition.unit === "W" ? 0 : 2)}
            </text>
            <text x={x(i)} y={bottom + 24} textAnchor="middle">
              R{i + 1}
            </text>
          </g>
        ))}
        <text className="chart-unit" x={right} y={top} textAnchor="end">
          {definition.unit}
        </text>
      </svg>
    </section>
  );
}
function motionCycles(points: Point[], ratio: number) {
  if (points.length < 8) return [];
  const baseline = Math.max(...points.map((point) => point.y));
  const raw = points.map((point) => ({ t: point.t, cm: (baseline - point.y) * ratio * 100 }));
  const smooth = raw.map((point, index) => {
    const section = raw.slice(Math.max(0, index - 2), Math.min(raw.length, index + 3));
    return { t: point.t, cm: section.reduce((sum, item) => sum + item.cm, 0) / section.length };
  });
  const cycles: Array<{ start: number; peak: number; end: number; height: number }> = [];
  let active: { start: number; peak: number; height: number } | null = null;
  for (let index = 3; index < smooth.length; index++) {
    const point = smooth[index];
    if (!active && point.cm > 5 && point.cm > smooth[index - 3].cm + 1.5) {
      active = { start: smooth[Math.max(0, index - 3)].t, peak: point.t, height: point.cm };
      continue;
    }
    if (!active) continue;
    if (point.cm > active.height) active = { ...active, peak: point.t, height: point.cm };
    if (active.height >= 10 && point.t - active.peak > 0.1 && point.cm < Math.max(4, active.height * 0.38)) {
      cycles.push({ ...active, end: point.t });
      active = null;
    }
  }
  return cycles;
}
function LiveMotionChart({ points, ratio, running }: { points: Point[]; ratio: number; running: boolean }) {
  const width = 680, height = 280, left = 46, right = 662, top = 30, bottom = 230;
  if (points.length < 2)
    return <section className="live-motion-chart empty-chart"><h3>GRAFIK VELOCITY</h3><p>Grafik velocity mulai bergerak saat analisis dijalankan.</p></section>;
  const raw = points.map((point, index) => {
      if (!index) return { t: point.t, velocity: 0 };
      const previous = points[index - 1], dt = point.t - previous.t;
      return { t: point.t, velocity: dt > 0 ? Math.max(-4, Math.min(4, ((previous.y - point.y) * ratio) / dt)) : 0 };
    }),
    data = raw.map((point, index) => {
      const section = raw.slice(Math.max(0, index - 2), Math.min(raw.length, index + 3));
      return { t: point.t, velocity: section.reduce((sum, item) => sum + item.velocity, 0) / section.length };
    });
  const startTime = data[0].t, endTime = data[data.length - 1].t;
  const maxVelocity = Math.max(0.5, ...data.map((point) => Math.abs(point.velocity))) * 1.12;
  const x = (time: number) => left + ((time - startTime) / Math.max(0.01, endTime - startTime)) * (right - left);
  const y = (value: number) => top + ((maxVelocity - value) / (maxVelocity * 2)) * (bottom - top);
  const cycles = motionCycles(points, ratio);
  return (
    <section className="live-motion-chart">
      <div className="motion-heading"><div><h3>GRAFIK VELOCITY</h3><small>{running ? "● LIVE • VELOCITY / WAKTU" : `${cycles.length} REP TERBACA`}</small></div><div className="motion-legend"><span><i className="up"/>NAIK +</span><span><i className="down"/>TURUN −</span></div></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik velocity plate dan interval antar repetisi">
        <title>Velocity plate terhadap waktu</title><desc>Velocity positif berwarna merah menunjukkan plate naik. Velocity negatif berwarna hijau menunjukkan plate turun.</desc>
        {[maxVelocity, 0, -maxVelocity].map((value) => <g key={value}><line className={value === 0 ? "velocity-zero" : "motion-grid"} x1={left} y1={y(value)} x2={right} y2={y(value)}/><text x={left - 8} y={y(value) + 4} textAnchor="end">{value.toFixed(1)}</text></g>)}
        {data.slice(1).map((point, index) => { const previous = data[index]; return <line key={index} className={point.velocity >= 0 ? "motion-up" : "motion-down"} x1={x(previous.t)} y1={y(previous.velocity)} x2={x(point.t)} y2={y(point.velocity)}/>; })}
        {cycles.map((cycle, index) => <g key={cycle.peak}><line className="rep-marker" x1={x(cycle.peak)} y1={top} x2={x(cycle.peak)} y2={bottom}/><text className="rep-label" x={x(cycle.peak)} y={top - 8} textAnchor="middle">REP {index + 1}</text>{index > 0 && <><line className="interval-line" x1={x(cycles[index - 1].peak)} y1={bottom + 26} x2={x(cycle.peak)} y2={bottom + 26}/><text className="interval-label" x={(x(cycles[index - 1].peak) + x(cycle.peak)) / 2} y={bottom + 44} textAnchor="middle">Δ {(cycle.peak - cycles[index - 1].peak).toFixed(2)}s</text></>}</g>)}
        <text className="axis-label" x="8" y="18">VELOCITY (m/s)</text><text className="axis-label" x={right} y={height - 4} textAnchor="end">WAKTU {(endTime - startTime).toFixed(1)}s</text>
      </svg>
    </section>
  );
}
function meanVelocityOfSet(set: HistorySet) {
  return set.reps.reduce((sum, rep) => sum + rep.mean, 0) / Math.max(1, set.reps.length);
}
function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
function estimateOneRm(sets: HistorySet[], exercise: string) {
  const exerciseSets = sets.filter((set) => set.exercise === exercise && set.reps.length),
    loadPoints = exerciseSets.map((set) => ({ load: set.loadKg, velocity: meanVelocityOfSet(set) })),
    distinctLoads = new Set(loadPoints.map((point) => point.load)).size;
  if (distinctLoads >= 2) {
    const meanLoad = loadPoints.reduce((sum, point) => sum + point.load, 0) / loadPoints.length,
      meanVelocity = loadPoints.reduce((sum, point) => sum + point.velocity, 0) / loadPoints.length,
      covariance = loadPoints.reduce((sum, point) => sum + (point.load - meanLoad) * (point.velocity - meanVelocity), 0),
      variance = loadPoints.reduce((sum, point) => sum + (point.load - meanLoad) ** 2, 0),
      slope = variance ? covariance / variance : 0,
      intercept = meanVelocity - slope * meanLoad,
      minimalVelocity = exercise === "Back Squat" ? 0.3 : 0.17,
      regressionEstimate = slope < -0.001 ? (minimalVelocity - intercept) / slope : 0,
      highestLoad = Math.max(...loadPoints.map((point) => point.load));
    if (regressionEstimate >= highestLoad * 0.9 && regressionEstimate <= highestLoad * 1.8)
      return { value: regressionEstimate, method: "PROFIL LOAD–VELOCITY" };
  }
  if (!exerciseSets.length) return { value: 0, method: "BUTUH DATA" };
  const fallback = Math.max(...exerciseSets.map((set) => set.loadKg * (1 + Math.min(12, set.reps.length) / 30)));
  return { value: fallback, method: "ESTIMASI REP–LOAD" };
}

function AthleteProgressDashboard({ sets, exercise, athlete }: { sets: HistorySet[]; exercise: string; athlete: string }) {
  const [metric, setMetric] = useState<TrendMetric>("meanVelocity");
  const orderedSets = [...sets]
    .filter((set) => set.exercise === exercise && set.reps.length)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    visibleSets = orderedSets.slice(-16),
    definition = metric === "peakVelocity"
      ? { label: "Peak Velocity", unit: "m/s", digits: 2, value: (set: HistorySet) => Math.max(...set.reps.map((rep) => rep.peak)) }
      : metric === "meanPower"
        ? { label: "Mean Power", unit: "W", digits: 0, value: (set: HistorySet) => average(set.reps.map((rep) => rep.power)) }
        : metric === "volume"
          ? { label: "Volume Angkatan", unit: "kg", digits: 0, value: (set: HistorySet) => set.loadKg * set.reps.length }
          : metric === "e1rm"
            ? { label: "Estimasi 1RM", unit: "kg", digits: 1, value: (set: HistorySet) => estimateOneRm(orderedSets.slice(0, orderedSets.indexOf(set) + 1), exercise).value }
            : { label: "Mean Velocity", unit: "m/s", digits: 2, value: (set: HistorySet) => meanVelocityOfSet(set) };
  const values = visibleSets.map((set, index) => definition.value(set, index)),
    latest = values.at(-1) ?? 0,
    first = values[0] ?? 0,
    change = first ? ((latest - first) / first) * 100 : 0,
    bestVelocity = orderedSets.length ? Math.max(...orderedSets.map(meanVelocityOfSet)) : 0,
    totalVolume = orderedSets.reduce((sum, set) => sum + set.loadKg * set.reps.length, 0),
    oneRm = estimateOneRm(orderedSets, exercise),
    width = 760,
    height = 300,
    left = 58,
    right = 728,
    top = 34,
    bottom = 238,
    maxValue = Math.max(...values, metric.includes("Velocity") ? 0.2 : 10) * 1.12,
    minObserved = Math.min(...values, 0),
    minValue = metric.includes("Velocity") && values.length ? Math.max(0, minObserved * 0.85) : 0,
    x = (index: number) => values.length <= 1 ? (left + right) / 2 : left + (index / (values.length - 1)) * (right - left),
    y = (value: number) => bottom - ((value - minValue) / Math.max(0.01, maxValue - minValue)) * (bottom - top),
    path = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");

  return (
    <section className="progress-dashboard">
      <div className="progress-heading">
        <div><small>PERKEMBANGAN ATLET</small><h3>{athlete.toUpperCase()}</h3><p>{exercise} • {orderedSets.length} set tersimpan</p></div>
        <select aria-label="Pilih metrik perkembangan atlet" value={metric} onChange={(event) => setMetric(event.target.value as TrendMetric)}>
          <option value="meanVelocity">Mean Velocity</option>
          <option value="peakVelocity">Peak Velocity</option>
          <option value="meanPower">Mean Power</option>
          <option value="volume">Volume Angkatan</option>
          <option value="e1rm">Estimasi 1RM</option>
        </select>
      </div>
      <div className="progress-kpis">
        <article><small>SET LATIHAN</small><strong>{orderedSets.length}</strong><b>set</b></article>
        <article><small>BEST MEAN VELOCITY</small><strong>{bestVelocity ? bestVelocity.toFixed(2) : "—"}</strong><b>{bestVelocity ? "m/s" : ""}</b></article>
        <article><small>TOTAL VOLUME</small><strong>{totalVolume.toLocaleString("id-ID")}</strong><b>kg</b></article>
        <article className="progress-e1rm"><small>ESTIMASI 1RM</small><strong>{oneRm.value ? oneRm.value.toFixed(1) : "—"}</strong><b>{oneRm.value ? "kg" : ""}</b></article>
      </div>
      {visibleSets.length ? (
        <div className="progress-chart-wrap">
          <div className="progress-chart-summary"><span>{definition.label.toUpperCase()}</span><strong>{latest.toFixed(definition.digits)} <b>{definition.unit}</b></strong><em className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% dari data awal</em></div>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grafik perkembangan ${definition.label} ${athlete}`}>
            <title>Perkembangan {definition.label} {athlete}</title><desc>Perubahan hasil {definition.label} pada setiap set {exercise} dari waktu ke waktu.</desc>
            {[0, .5, 1].map((portion) => { const value = minValue + (maxValue - minValue) * portion; return <g key={portion}><line x1={left} y1={y(value)} x2={right} y2={y(value)} /><text x={left - 9} y={y(value) + 4} textAnchor="end">{value.toFixed(definition.digits)}</text></g>; })}
            {values.length > 1 && <polyline className="progress-line" points={path} />}
            {values.map((value, index) => <g key={visibleSets[index].id}><circle className="progress-dot" cx={x(index)} cy={y(value)} r="6"><title>{new Date(visibleSets[index].date).toLocaleDateString("id-ID")}: {value.toFixed(definition.digits)} {definition.unit}</title></circle>{(values.length <= 8 || index === 0 || index === values.length - 1 || index % Math.ceil(values.length / 6) === 0) && <text className="progress-date" x={x(index)} y={bottom + 24} textAnchor="middle">{new Date(visibleSets[index].date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</text>}</g>)}
            <text className="axis-label" x="10" y="18">{definition.unit}</text>
          </svg>
        </div>
      ) : <div className="progress-empty"><strong>BELUM ADA DATA {exercise.toUpperCase()}</strong><p>Selesaikan satu analisis untuk mulai membentuk grafik perkembangan.</p></div>}
    </section>
  );
}

function HistorySetSummary({ set, setNumber, onOpen }: { set: HistorySet; setNumber: number; onOpen: () => void }) {
  const meanVelocity = meanVelocityOfSet(set),
    peakVelocity = Math.max(...set.reps.map((rep) => rep.peak)),
    meanRom = average(set.reps.map((rep) => rep.rom * 100)),
    meanPower = average(set.reps.map((rep) => rep.power)),
    peakPower = Math.max(...set.reps.map((rep) => rep.peakPower));
  return (
    <details className="history-set-card">
      <summary>
        <div><small>{new Date(set.date).toLocaleString("id-ID")}</small><strong>SET {setNumber} • {set.exercise}</strong><span>{set.loadKg} kg × {set.reps.length} rep</span></div>
        <div className="set-summary-metrics"><span><small>MEAN</small><b>{meanVelocity.toFixed(2)} m/s</b></span><span><small>PEAK</small><b>{peakVelocity.toFixed(2)} m/s</b></span><span><small>POWER</small><b>{meanPower.toFixed(0)} W</b></span></div>
        <i>⌄</i>
      </summary>
      <div className="history-table-scroll">
        <table className="history-rep-table">
          <thead><tr><th>REP</th><th>MEAN VELOCITY</th><th>PEAK VELOCITY</th><th>ROM</th><th>MEAN POWER</th><th>PEAK POWER</th><th>ULASAN</th></tr></thead>
          <tbody>{set.reps.map((rep, index) => <tr key={index}><td>REP {String(index + 1).padStart(2, "0")}</td><td>{rep.mean.toFixed(2)} <small>m/s</small></td><td>{rep.peak.toFixed(2)} <small>m/s</small></td><td>{(rep.rom * 100).toFixed(1)} <small>cm</small></td><td>{rep.power.toFixed(0)} <small>W</small></td><td>{rep.peakPower.toFixed(0)} <small>W</small></td><td><span className={`velocity-review zone-${velocityZone(rep.mean).key}`}>{velocityZone(rep.mean).label}</span></td></tr>)}</tbody>
          <tfoot><tr><td>RATA-RATA</td><td>{meanVelocity.toFixed(2)} <small>m/s</small></td><td>{average(set.reps.map((rep) => rep.peak)).toFixed(2)} <small>m/s</small></td><td>{meanRom.toFixed(1)} <small>cm</small></td><td>{meanPower.toFixed(0)} <small>W</small></td><td>{peakPower.toFixed(0)} <small>W</small></td><td><span className={`velocity-review zone-${velocityZone(meanVelocity).key}`}>{velocityZone(meanVelocity).label}</span></td></tr></tfoot>
        </table>
      </div>
      <div className="history-set-footer"><span>Volume set: <b>{(set.loadKg * set.reps.length).toLocaleString("id-ID")} kg</b></span><button type="button" onClick={onOpen}>BUKA HASIL LENGKAP</button></div>
    </details>
  );
}

function TrainingCalendar({ sets, athlete, onOpen }: { sets: HistorySet[]; athlete: string; onOpen: (set: HistorySet) => void }) {
  const newestDate = sets.length ? new Date(sets[0].date) : new Date();
  const [monthCursor, setMonthCursor] = useState(() => new Date(newestDate.getFullYear(), newestDate.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const year = monthCursor.getFullYear(), month = monthCursor.getMonth();
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const setsByDate = sets.reduce<Record<string, HistorySet[]>>((groups, set) => {
    const key = dateKey(new Date(set.date));
    (groups[key] ??= []).push(set);
    return groups;
  }, {});
  const leading = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const selectedSets = selectedDate ? setsByDate[selectedDate] ?? [] : [];
  const moveMonth = (offset: number) => { setMonthCursor(new Date(year, month + offset, 1)); setSelectedDate(null); };

  return (
    <section className="training-calendar">
      <div className="calendar-toolbar">
        <div><small>KALENDER LATIHAN</small><h3>{monthCursor.toLocaleDateString("id-ID", { month: "long", year: "numeric" }).toUpperCase()}</h3><p>{athlete} • pilih tanggal untuk membuka sesi</p></div>
        <div className="calendar-nav"><button type="button" onClick={() => moveMonth(-1)} aria-label="Bulan sebelumnya">‹</button><button type="button" onClick={() => { const today = new Date(); setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(null); }}>BULAN INI</button><button type="button" onClick={() => moveMonth(1)} aria-label="Bulan berikutnya">›</button></div>
      </div>
      <div className="calendar-weekdays">{["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) return <span className="calendar-day empty" key={`empty-${index}`} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const daySets = setsByDate[key] ?? [];
          const today = key === dateKey(new Date());
          return <button type="button" key={key} className={`calendar-day ${daySets.length ? "has-training" : ""} ${selectedDate === key ? "selected" : ""} ${today ? "today" : ""}`} onClick={() => daySets.length && setSelectedDate(key)} disabled={!daySets.length}><b>{day}</b>{daySets.length > 0 && <><i>{daySets.length}</i><span>{daySets[0].exercise}{daySets.length > 1 ? ` +${daySets.length - 1}` : ""}</span></>}</button>;
        })}
      </div>
      {selectedDate && <div className="calendar-day-detail">
        <div className="history-section-heading"><div><small>LATIHAN PADA TANGGAL</small><h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()}</h3></div><span>{selectedSets.length} SET LATIHAN</span></div>
        {selectedSets.map((item, index) => <HistorySetSummary key={item.id} set={item} setNumber={selectedSets.length - index} onOpen={() => onOpen(item)} />)}
      </div>}
      {!sets.length && <div className="page-empty"><h3>BELUM ADA JADWAL LATIHAN</h3><p>Set yang selesai dianalisis akan otomatis ditandai pada kalender.</p></div>}
    </section>
  );
}
function LoadVelocityProfile({ sets, exercise }: { sets: HistorySet[]; exercise: string }) {
  const points = sets.filter((set) => set.exercise === exercise && set.reps.length).map((set) => ({
    load: set.loadKg,
    velocity: meanVelocityOfSet(set),
    date: set.date,
  }));
  if (!points.length)
    return <section className="load-profile empty-profile"><div><h3>PROFIL LOAD–VELOCITY</h3><small>{exercise}</small></div><p>Analisis set dengan beban berbeda untuk membentuk profil kecepatan atlet.</p></section>;
  const width = 680, height = 270, left = 52, right = 650, top = 30, bottom = 215,
    minLoad = Math.max(0, Math.min(...points.map((point) => point.load)) * 0.85),
    maxLoad = Math.max(minLoad + 10, Math.max(...points.map((point) => point.load)) * 1.08),
    maxVelocity = Math.max(0.5, ...points.map((point) => point.velocity)) * 1.15,
    x = (load: number) => left + ((load - minLoad) / (maxLoad - minLoad)) * (right - left),
    y = (velocity: number) => bottom - (velocity / maxVelocity) * (bottom - top),
    ordered = [...points].sort((a, b) => a.load - b.load);
  return (
    <section className="load-profile">
      <div className="profile-heading"><div><h3>PROFIL LOAD–VELOCITY</h3><small>{exercise} • {points.length} SET</small></div><p>Semakin berat beban, kecepatan umumnya menurun.</p></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Profil hubungan beban dan mean velocity untuk ${exercise}`}>
        <title>Profil load–velocity {exercise}</title><desc>Grafik beban dalam kilogram dan mean velocity dalam meter per detik dari riwayat atlet aktif.</desc>
        {[0, .5, 1].map((portion) => <g key={portion}><line x1={left} y1={y(maxVelocity * portion)} x2={right} y2={y(maxVelocity * portion)}/><text x={left - 8} y={y(maxVelocity * portion) + 4} textAnchor="end">{(maxVelocity * portion).toFixed(2)}</text></g>)}
        {ordered.length > 1 && <polyline points={ordered.map((point) => `${x(point.load)},${y(point.velocity)}`).join(" ")} />}
        {points.map((point, index) => <g key={`${point.date}-${index}`}><circle cx={x(point.load)} cy={y(point.velocity)} r="7"><title>{point.load} kg • {point.velocity.toFixed(2)} m/s</title></circle><text className="load-label" x={x(point.load)} y={y(point.velocity) - 13} textAnchor="middle">{point.load}kg</text></g>)}
        <text className="axis-label" x="12" y="18">m/s</text><text className="axis-label" x={right} y={height - 16} textAnchor="end">BEBAN (kg)</text>
      </svg>
    </section>
  );
}
function velocityZone(velocity: number) {
  if (velocity < 0.05) return { label: "MENUNGGU ANGKATAN", key: "waiting" };
  if (velocity < 0.5) return { label: "KEKUATAN ABSOLUT", key: "absolute" };
  if (velocity < 0.75) return { label: "KEKUATAN AKSELERATIF", key: "accelerative" };
  if (velocity <= 1) return { label: "STRENGTH–SPEED / POWER", key: "strength-speed" };
  if (velocity < 1.3) return { label: "SPEED–STRENGTH", key: "speed-strength" };
  return { label: "STARTING STRENGTH", key: "starting" };
}
function forceVelocityMetrics(sets: HistorySet[], exercise: string) {
  const points = sets
      .filter((set) => set.exercise === exercise)
      .flatMap((set) => set.reps.map((rep) => ({ velocity: rep.mean, force: set.loadKg * 9.81, load: set.loadKg }))),
    distinctLoads = new Set(points.map((point) => point.load)).size;
  if (points.length < 2 || distinctLoads < 2)
    return { valid: false, points, f0: 0, v0: 0, pMax: 0, optimalLoad: 0, score: 0 };
  const meanV = points.reduce((sum, point) => sum + point.velocity, 0) / points.length,
    meanF = points.reduce((sum, point) => sum + point.force, 0) / points.length,
    covariance = points.reduce((sum, point) => sum + (point.velocity - meanV) * (point.force - meanF), 0),
    variance = points.reduce((sum, point) => sum + (point.velocity - meanV) ** 2, 0),
    slope = variance ? covariance / variance : 0,
    f0 = meanF - slope * meanV,
    v0 = slope < -0.001 ? -f0 / slope : 0,
    predicted = points.map((point) => f0 + slope * point.velocity),
    residual = points.reduce((sum, point, index) => sum + (point.force - predicted[index]) ** 2, 0),
    total = points.reduce((sum, point) => sum + (point.force - meanF) ** 2, 0),
    score = total ? Math.max(0, Math.min(100, (1 - residual / total) * 100)) : 0,
    valid = f0 > 0 && v0 > 0 && v0 < 5;
  return {
    valid,
    points,
    f0: valid ? f0 : 0,
    v0: valid ? v0 : 0,
    pMax: valid ? (f0 * v0) / 4 : 0,
    optimalLoad: valid ? f0 / 2 / 9.81 : 0,
    score: valid ? score : 0,
  };
}
function ForceVelocityCurve({ sets, exercise }: { sets: HistorySet[]; exercise: string }) {
  const metrics = forceVelocityMetrics(sets, exercise),
    oneRm = estimateOneRm(sets, exercise),
    width = 680, height = 300, left = 54, right = 650, top = 34, bottom = 235,
    observedMaxV = Math.max(1.5, ...metrics.points.map((point) => point.velocity)),
    observedMaxF = Math.max(500, ...metrics.points.map((point) => point.force)),
    maxV = Math.max(observedMaxV * 1.15, metrics.valid ? metrics.v0 * 1.05 : 0),
    maxF = Math.max(observedMaxF * 1.15, metrics.valid ? metrics.f0 * 1.05 : 0),
    x = (velocity: number) => left + (velocity / maxV) * (right - left),
    y = (force: number) => bottom - (force / maxF) * (bottom - top);
  return (
    <section className="force-velocity-card">
      <div className="profile-heading"><div><h3>FORCE–VELOCITY PROFILE</h3><small>{exercise} • ESTIMASI EKSTERNAL</small></div><p>Tambahkan minimal dua variasi beban untuk membentuk kurva.</p></div>
      <div className="force-profile-layout">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Kurva force velocity untuk ${exercise}`}>
          <title>Kurva force–velocity {exercise}</title><desc>Titik merupakan hasil repetisi atlet. Garis menunjukkan hubungan estimasi force eksternal dan mean velocity.</desc>
          {[0, .5, 1].map((portion) => <g key={portion}><line x1={left} y1={y(maxF * portion)} x2={right} y2={y(maxF * portion)}/><text x={left - 8} y={y(maxF * portion) + 4} textAnchor="end">{(maxF * portion).toFixed(0)}</text></g>)}
          {metrics.valid && <line className="fv-fit" x1={x(0)} y1={y(metrics.f0)} x2={x(metrics.v0)} y2={y(0)}/>}
          {metrics.points.map((point, index) => <circle key={index} cx={x(point.velocity)} cy={y(point.force)} r="6"><title>{point.velocity.toFixed(2)} m/s • {point.force.toFixed(0)} N • {point.load} kg</title></circle>)}
          <text className="axis-label" x="10" y="18">FORCE (N)</text><text className="axis-label" x={right} y={height - 16} textAnchor="end">VELOCITY (m/s)</text>
        </svg>
        <div className="fv-kpis">
          <article className="e1rm-kpi"><small>ESTIMASI 1RM</small><strong>{oneRm.value ? oneRm.value.toFixed(1) : "—"}</strong><b>{oneRm.value ? "kg" : ""}</b><em>{oneRm.method}</em></article>
          <article><small>F0 • FORCE AT V=0</small><strong>{metrics.valid ? metrics.f0.toFixed(0) : "—"}</strong><b>{metrics.valid ? "N" : ""}</b></article>
          <article><small>V0 • VELOCITY AT LOAD=0</small><strong>{metrics.valid ? metrics.v0.toFixed(2) : "—"}</strong><b>{metrics.valid ? "m/s" : ""}</b></article>
          <article><small>ESTIMASI MAX POWER</small><strong>{metrics.valid ? metrics.pMax.toFixed(0) : "—"}</strong><b>{metrics.valid ? "W" : ""}</b></article>
          <article><small>OPTIMAL POWER LOAD</small><strong>{metrics.valid ? metrics.optimalLoad.toFixed(1) : "—"}</strong><b>{metrics.valid ? "kg" : ""}</b></article>
          <article><small>PROFILE SCORE</small><strong>{metrics.valid ? metrics.score.toFixed(0) : "—"}</strong><b>{metrics.valid ? "%" : ""}</b></article>
        </div>
      </div>
      <div className="velocity-zones"><span>&lt;0.50 ABSOLUTE</span><span>0.50–0.75 ACCELERATIVE</span><span>0.75–1.00 STRENGTH–SPEED</span><span>1.00–1.30 SPEED–STRENGTH</span><span>&gt;1.30 STARTING</span></div>
    </section>
  );
}
function solveThreeByThree(rows: number[][]) {
  const matrix = rows.map((row) => [...row]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++)
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    if (Math.abs(matrix[column][column]) < 1e-9) return null;
    const divisor = matrix[column][column];
    for (let item = column; item < 4; item++) matrix[column][item] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let item = column; item < 4; item++) matrix[row][item] -= factor * matrix[column][item];
    }
  }
  return [matrix[0][3], matrix[1][3], matrix[2][3]];
}
function PowerLoadProfile({ sets, exercise }: { sets: HistorySet[]; exercise: string }) {
  const oneRm = estimateOneRm(sets, exercise),
    exerciseSets = sets.filter((set) => set.exercise === exercise && set.reps.length),
    points = exerciseSets.map((set) => ({
      percent: oneRm.value ? (set.loadKg / oneRm.value) * 100 : 0,
      power: set.reps.reduce((sum, rep) => sum + rep.power, 0) / set.reps.length,
      load: set.loadKg,
    })),
    distinctLoads = new Set(points.map((point) => point.load)).size;
  if (!points.length)
    return <section className="power-load-card empty-profile"><div><h3>POWER–LOAD PROFILE</h3><small>{exercise}</small></div><p>Data power akan muncul setelah set pertama selesai dianalisis.</p></section>;
  const sums = points.reduce((result, point) => {
      const x = point.percent, y = point.power;
      result.x += x; result.x2 += x ** 2; result.x3 += x ** 3; result.x4 += x ** 4;
      result.y += y; result.xy += x * y; result.x2y += x ** 2 * y;
      return result;
    }, { x: 0, x2: 0, x3: 0, x4: 0, y: 0, xy: 0, x2y: 0 }),
    coefficients = distinctLoads >= 3 ? solveThreeByThree([
      [sums.x4, sums.x3, sums.x2, sums.x2y],
      [sums.x3, sums.x2, sums.x, sums.xy],
      [sums.x2, sums.x, points.length, sums.y],
    ]) : null,
    curveValid = Boolean(coefficients && coefficients[0] < 0),
    observedBest = points.reduce((best, point) => point.power > best.power ? point : best, points[0]),
    fittedPercent = curveValid && coefficients ? Math.max(0, Math.min(110, -coefficients[1] / (2 * coefficients[0]))) : observedBest.percent,
    fittedPower = curveValid && coefficients ? Math.max(0, coefficients[0] * fittedPercent ** 2 + coefficients[1] * fittedPercent + coefficients[2]) : observedBest.power,
    optimalLoad = oneRm.value * fittedPercent / 100,
    curvePoints = curveValid && coefficients
      ? Array.from({ length: 56 }, (_, index) => {
          const percent = index * 2, power = Math.max(0, coefficients[0] * percent ** 2 + coefficients[1] * percent + coefficients[2]);
          return { percent, power };
        })
      : [...points].sort((a, b) => a.percent - b.percent),
    width = 680, height = 320, left = 55, right = 650, top = 30, bottom = 245,
    maxPower = Math.max(100, fittedPower, ...points.map((point) => point.power)) * 1.15,
    x = (percent: number) => left + (percent / 110) * (right - left),
    y = (power: number) => bottom - (power / maxPower) * (bottom - top);
  return (
    <section className="power-load-card">
      <div className="profile-heading"><div><h3>POWER–LOAD PROFILE</h3><small>{exercise} • POWER VS %1RM</small></div><p>{curveValid ? "Kurva kuadratik dari data atlet." : "Butuh 3 variasi beban untuk kurva penuh."}</p></div>
      <div className="power-load-layout">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Power load profile ${exercise}`}>
          <title>Power–Load Profile {exercise}</title><desc>Hubungan mean power dengan persentase estimasi satu repetisi maksimum.</desc>
          {[0, .5, 1].map((portion) => <g key={portion}><line className="power-grid" x1={left} y1={y(maxPower * portion)} x2={right} y2={y(maxPower * portion)}/><text x={left - 8} y={y(maxPower * portion) + 4} textAnchor="end">{(maxPower * portion).toFixed(0)}</text></g>)}
          {curvePoints.length > 1 && (
            <polyline
              className={curveValid ? "power-curve" : "power-curve pending"}
              points={curvePoints.map((point) => `${x(point.percent)},${y(point.power)}`).join(" ")}
            />
          )}
          {points.map((point, index) => <circle className="power-dot" key={index} cx={x(point.percent)} cy={y(point.power)} r="7"><title>{point.load} kg • {point.percent.toFixed(0)}% 1RM • {point.power.toFixed(0)} W</title></circle>)}
          <line className="max-power-marker" x1={x(fittedPercent)} y1={y(fittedPower)} x2={x(fittedPercent)} y2={bottom}/>
          <circle className="max-power-ring" cx={x(fittedPercent)} cy={y(fittedPower)} r="13"/>
          <text className="max-power-label" x={x(fittedPercent)} y={bottom + 30} textAnchor="middle">MAX {fittedPercent.toFixed(0)}% 1RM</text>
          <text className="axis-label" x="8" y="18">POWER (W)</text><text className="axis-label" x={right} y={height - 12} textAnchor="end">% ESTIMASI 1RM</text>
        </svg>
        <div className="power-load-kpis">
          <article><small>MAXIMUM POWER</small><strong>{fittedPower.toFixed(0)}</strong><b>W</b></article>
          <article><small>MAX POWER AT</small><strong>{fittedPercent.toFixed(0)}</strong><b>% 1RM</b></article>
          <article><small>OPTIMAL LOAD</small><strong>{optimalLoad.toFixed(1)}</strong><b>kg</b></article>
          <article><small>ESTIMASI 1RM</small><strong>{oneRm.value.toFixed(1)}</strong><b>kg</b><em>{oneRm.method}</em></article>
        </div>
      </div>
    </section>
  );
}
function VelocityGauge({ velocity, motionVelocity, loadKg, phase, exercise, repNumber }: { velocity: number; motionVelocity: number; loadKg: number; phase: "diam" | "naik" | "turun"; exercise: string; repNumber: number }) {
  const displayedVelocity = velocity,
    zone = velocityZone(displayedVelocity),
    radius = 108,
    circumference = 2 * Math.PI * radius,
    gaugeVelocity = phase === "naik" ? motionVelocity : displayedVelocity,
    progress = Math.max(0, Math.min(1, gaugeVelocity / 1.6)),
    phaseLabel = phase === "naik"
      ? `MENGUKUR REP ${repNumber + 1}`
      : repNumber > 0
        ? `REP ${repNumber} • MEAN TERSIMPAN`
        : "SIAP • BELUM ADA REP";
  return (
    <section className={`velocity-gauge zone-${zone.key} phase-${phase} ${repNumber > 0 ? "has-result" : "no-result"}`} aria-label={`${exercise}, ${phaseLabel}, mean velocity ${displayedVelocity.toFixed(2)} meter per detik`}>
      <svg viewBox="0 0 280 280" aria-hidden="true"><circle className="gauge-track" cx="140" cy="140" r={radius}/><circle className="gauge-progress" cx="140" cy="140" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}/></svg>
      <div className="gauge-content"><em>{exercise.toUpperCase()}</em><small>⚖ {loadKg} KG</small><strong>{displayedVelocity.toFixed(2).replace(".", ",")}</strong><b>MEAN VELOCITY • M/S</b><span>{phaseLabel}</span></div>
    </section>
  );
}
export default function Home() {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    points = useRef<Point[]>([]),
    raf = useRef(0);
  const calibrationPoints = useRef<{ x: number; y: number }[]>([]);
  const trackedTarget = useRef<{ x: number; y: number } | null>(null),
    trackingAnchorX = useRef<number | null>(null),
    targetTemplate = useRef<Template | null>(null),
    targetTrail = useRef<{ x: number; y: number }[]>([]),
    trackingMisses = useRef(0),
    lastTrackedVideoTime = useRef(-1),
    finishing = useRef(false),
    dragHandle = useRef<number | null>(null),
    livePeakRef = useRef(0),
    liveMinY = useRef(Infinity),
    liveMaxY = useRef(-Infinity),
    positiveVelocitySum = useRef(0),
    positiveVelocityCount = useRef(0),
    targetVelocityY = useRef(0),
    downwardFrameCount = useRef(0),
    liveRepStartY = useRef<number | null>(null),
    liveAscentDistance = useRef(0),
    liveIndicatorArmed = useRef(true),
    stationaryFrameCount = useRef(0);
  const [url, setUrl] = useState(""),
    [reps, setReps] = useState<Rep[]>([]),
    [running, setRunning] = useState(false),
    [status, setStatus] = useState("Siap kalibrasi");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("video");
  const [loadKg, setLoadKg] = useState(120);
  const [primaryMetric, setPrimaryMetric] =
    useState<PrimaryMetric>(savedPrimaryMetric);
  const [liveVelocity, setLiveVelocity] = useState(0),
    [liveMean, setLiveMean] = useState(0),
    [livePeak, setLivePeak] = useState(0),
    [liveRom, setLiveRom] = useState(0),
    [analysisRate, setAnalysisRate] = useState(1);
  const [livePhase, setLivePhase] = useState<"diam" | "naik" | "turun">("diam");
  const [liveRepNumber, setLiveRepNumber] = useState(0);
  const [cm, setCm] = useState(100),
    [px, setPx] = useState(420);
  const [barType, setBarType] = useState("Olympic Bar Pria • 20 kg"),
    [focus, setFocus] = useState("Plate yang bergerak"),
    [plate, setPlate] = useState(45),
    [configured, setConfigured] = useState(false);
  const [calibrated, setCalibrated] = useState(false),
    [selectionReady, setSelectionReady] = useState(false);
  const [hydrated, setHydrated] = useState(false),
    [activePage, setActivePage] = useState<PageKey>("analysis"),
    [exercise, setExercise] = useState("Deadlift"),
    [athleteName, setAthleteName] = useState("Rizky Pratama"),
    [athleteWeight, setAthleteWeight] = useState(75),
    [athleteNote, setAthleteNote] = useState(""),
    [history, setHistory] = useState<HistorySet[]>([]),
    [precisionMode, setPrecisionMode] = useState(true),
    [calibrationZoom, setCalibrationZoom] = useState(1),
    [videoDuration, setVideoDuration] = useState(0),
    [calibrationTime, setCalibrationTime] = useState(0),
    [lockQuality, setLockQuality] = useState(0);
  const [liveTrace, setLiveTrace] = useState<Point[]>([]),
    [athletes, setAthletes] = useState<AthleteProfile[]>([]),
    [activeAthleteId, setActiveAthleteId] = useState("");
  const [authStatus, setAuthStatus] = useState<"loading" | "ready">("loading"),
    [authUser, setAuthUser] = useState<AuthUser | null>(null),
    [showApplication, setShowApplication] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null),
    [installState, setInstallState] = useState<InstallState>(initialInstallState),
    [showInstallGuide, setShowInstallGuide] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sprint") !== "dual" || params.get("role") !== "finish" || !params.get("code")) return;
    const timer = window.setTimeout(() => {
      setShowApplication(true);
      setConfigured(true);
      setActivePage("analysis");
      setAnalysisMode("sprint");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const mean = reps.reduce((a, r) => a + r.mean, 0) / (reps.length || 1),
    bestMean = Math.max(0, ...reps.map((r) => r.mean)),
    peak = Math.max(0, ...reps.map((r) => r.peak)),
    meanRom = reps.reduce((a, r) => a + r.rom, 0) / (reps.length || 1),
    meanPower = reps.reduce((a, r) => a + r.power, 0) / (reps.length || 1),
    peakPower = Math.max(0, ...reps.map((r) => r.peakPower));
  const loss =
    reps.length > 1 && bestMean > 0
      ? Math.max(
          0,
          ((bestMean - reps[reps.length - 1].mean) / bestMean) * 100,
        )
      : 0;
  const primaryData =
    primaryMetric === "peakVelocity"
      ? {
          label: "PEAK VELOCITY",
          value: peak,
          digits: 2,
          unit: "m/s",
          secondaryLabel: "MEAN VELOCITY",
          secondaryValue: `${mean.toFixed(2)} m/s`,
        }
      : primaryMetric === "meanPower"
        ? {
            label: "MEAN POWER",
            value: meanPower,
            digits: 0,
            unit: "W",
            secondaryLabel: "PEAK POWER",
            secondaryValue: `${peakPower.toFixed(0)} W`,
          }
        : primaryMetric === "peakPower"
          ? {
              label: "PEAK POWER",
              value: peakPower,
              digits: 0,
              unit: "W",
              secondaryLabel: "MEAN POWER",
              secondaryValue: `${meanPower.toFixed(0)} W`,
            }
          : {
              label: "MEAN VELOCITY",
              value: mean,
              digits: 2,
              unit: "m/s",
              secondaryLabel: "PEAK VELOCITY",
              secondaryValue: `${peak.toFixed(2)} m/s`,
            };
  const athleteHistory = history.filter((item) =>
      item.athleteId ? item.athleteId === activeAthleteId : item.athlete === athleteName,
    ),
    athleteTotalReps = athleteHistory.reduce((sum, item) => sum + item.reps.length, 0),
    athleteTotalVolume = athleteHistory.reduce((sum, item) => sum + item.loadKg * item.reps.length, 0),
    oneRmEstimate = estimateOneRm(athleteHistory, exercise);
  useEffect(() => {
    let active = true;
    const mapUser = (email?: string, fullName?: string | null): AuthUser | null => email ? { email, displayName: email.split("@")[0], fullName: fullName ?? null } : null;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const sessionUser = data.session?.user;
      setAuthUser(mapUser(sessionUser?.email, sessionUser?.user_metadata?.full_name as string | undefined));
      setShowApplication(new URLSearchParams(window.location.search).get("app") === "1");
      setAuthStatus("ready");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthUser(mapUser(session?.user.email, session?.user.user_metadata?.full_name as string | undefined));
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register(`/sw.js?v=${ENGINE_VERSION}`, { updateViaCache: "none" }).then((registration) => registration.update()).catch(() => undefined);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstallState("available");
    };
    const markInstalled = () => {
      setInstallPrompt(null);
      setInstallState("installed");
      setShowInstallGuide(false);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const settings = readStorage<SavedSettings>("hirocross-settings", {}),
        lastSet = readStorage<{ date?: string; reps?: Rep[] }>(
          "hirocross-vbt",
          {},
        ),
        savedHistory = readStorage<HistorySet[]>("hirocross-history", []),
        savedAthlete = readStorage<{
          name?: string;
          weight?: number;
          note?: string;
        }>("hirocross-athlete", {});
      const storedAthletes = readStorage<AthleteProfile[]>("hirocross-athletes", []),
        fallbackAthlete: AthleteProfile = {
          id: "athlete-1",
          name: savedAthlete.name ?? settings.athlete ?? "Rizky Pratama",
          weight: savedAthlete.weight ?? 75,
          note: savedAthlete.note ?? "",
        },
        athleteProfiles = storedAthletes.length ? storedAthletes : [fallbackAthlete],
        activeProfile = athleteProfiles.find((item) => item.id === settings.activeAthleteId) ?? athleteProfiles[0];
      setAthletes(athleteProfiles);
      setActiveAthleteId(activeProfile.id);
      setAthleteName(activeProfile.name);
      setAthleteWeight(activeProfile.weight);
      setAthleteNote(activeProfile.note);
      if (!storedAthletes.length) writeStorage("hirocross-athletes", athleteProfiles);
      if (Array.isArray(lastSet.reps)) setReps(lastSet.reps);
      if (!savedHistory.length && lastSet.reps?.length) {
        const migrated: HistorySet = {
          id: "legacy-last-set",
          date: lastSet.date ?? new Date().toISOString(),
          exercise: settings.exercise ?? "Deadlift",
          athlete: settings.athlete ?? "Rizky Pratama",
          loadKg: settings.loadKg ?? 120,
          reps: lastSet.reps,
        };
        setHistory([migrated]);
        writeStorage("hirocross-history", [migrated]);
      } else setHistory(savedHistory);
      if (settings.configured !== undefined)
        setConfigured(settings.configured);
      if (settings.barType) setBarType(settings.barType);
      if (settings.focus) setFocus(settings.focus);
      if (settings.plate) {
        setPlate(settings.plate);
        setCm(settings.plate);
      }
      if (settings.loadKg) setLoadKg(settings.loadKg);
      if (settings.exercise) setExercise(settings.exercise);
      if (settings.activePage) setActivePage(settings.activePage);
      if (settings.precisionMode !== undefined)
        setPrecisionMode(settings.precisionMode);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    writeStorage("hirocross-settings", {
      configured,
      barType,
      focus,
      plate,
      loadKg,
      athlete: athleteName,
      exercise,
      activePage,
      precisionMode,
      activeAthleteId,
    } satisfies SavedSettings);
    writeStorage("hirocross-athlete", {
      name: athleteName,
      weight: athleteWeight,
      note: athleteNote,
    });
  }, [
    hydrated,
    configured,
    barType,
    focus,
    plate,
    loadKg,
    athleteName,
    exercise,
    athleteWeight,
    athleteNote,
    activePage,
    precisionMode,
    activeAthleteId,
  ]);
  function saveAthleteProfile(patch: Partial<Omit<AthleteProfile, "id">>) {
    const nextProfile: AthleteProfile = {
      id: activeAthleteId || `athlete-${Date.now()}`,
      name: patch.name ?? athleteName,
      weight: patch.weight ?? athleteWeight,
      note: patch.note ?? athleteNote,
    };
    setAthleteName(nextProfile.name);
    setAthleteWeight(nextProfile.weight);
    setAthleteNote(nextProfile.note);
    setAthletes((current) => {
      const next = current.some((item) => item.id === nextProfile.id)
        ? current.map((item) => item.id === nextProfile.id ? nextProfile : item)
        : [...current, nextProfile];
      writeStorage("hirocross-athletes", next);
      return next;
    });
  }
  async function installApplication() {
    if (installState === "installed") return;
    if (!installPrompt) {
      setShowInstallGuide(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setInstallState("installed");
    else setInstallState("manual");
  }
  function selectAthlete(profile: AthleteProfile) {
    setActiveAthleteId(profile.id);
    setAthleteName(profile.name);
    setAthleteWeight(profile.weight);
    setAthleteNote(profile.note);
    const latest = history.find((item) => item.athleteId ? item.athleteId === profile.id : item.athlete === profile.name);
    setReps(latest?.reps ?? []);
    if (latest) {
      setLoadKg(latest.loadKg);
      setExercise(latest.exercise);
    }
  }
  function addAthlete() {
    const profile: AthleteProfile = { id: `athlete-${Date.now()}`, name: `Atlet ${athletes.length + 1}`, weight: 70, note: "" };
    const next = [...athletes, profile];
    setAthletes(next);
    writeStorage("hirocross-athletes", next);
    selectAthlete(profile);
  }
  function saveSensorSet(sensorResults: Rep[], exerciseOverride?: string, loadOverride?: number) {
    const date = new Date().toISOString();
    const completedSet: HistorySet = {
      id: `${Date.now()}-sensor`,
      date,
      exercise: exerciseOverride ?? exercise,
      athlete: athleteName,
      athleteId: activeAthleteId,
      loadKg: loadOverride ?? loadKg,
      reps: sensorResults,
    };
    setReps(sensorResults);
    writeStorage("hirocross-vbt", { date, reps: sensorResults });
    setHistory((current) => {
      const next = [completedSet, ...current].slice(0, 500);
      writeStorage("hirocross-history", next);
      return next;
    });
  }
  useEffect(() => {
    const v = video.current,
      c = canvas.current;
    if (!url || !v || !c || calibrated) return;
    const locate = (event: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return {
        x: ((event.clientX - r.left) * c.width) / r.width,
        y: ((event.clientY - r.top) * c.height) / r.height,
      };
    };
    const draw = () => {
      const x = c.getContext("2d");
      if (!x) return;
      x.clearRect(0, 0, c.width, c.height);
      const p = calibrationPoints.current;
      x.strokeStyle = "#ff4a1c";
      x.fillStyle = "#ff4a1c";
      x.lineWidth = 5;
      if (p.length === 2) {
        const [a, b] = p,
          d = Math.hypot(b.x - a.x, b.y - a.y),
          mx = (a.x + b.x) / 2,
          my = (a.y + b.y) / 2;
        x.beginPath();
        x.arc(mx, my, d / 2, 0, Math.PI * 2);
        x.fillStyle = "#ff4a1c22";
        x.fill();
        x.stroke();
        x.beginPath();
        x.moveTo(a.x, a.y);
        x.lineTo(b.x, b.y);
        x.stroke();
        x.fillStyle = "#fff";
        x.font = "bold 16px Arial";
        x.fillText(`${plate} cm`, mx + 12, my - 12);
        setPx(Math.round(d));
        setSelectionReady(true);
      }
      p.forEach((q, i) => {
        x.fillStyle = "#ff4a1c";
        x.beginPath();
        x.arc(q.x, q.y, 16, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = "#fff";
        x.font = "bold 17px Arial";
        x.fillText(String(i + 1), q.x - 5, q.y + 6);
      });
    };
    const prepare = () => {
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 360;
      setVideoDuration(Number.isFinite(v.duration) ? v.duration : 0);
      setCalibrationTime(v.currentTime || 0);
      calibrationPoints.current = [];
      trackedTarget.current = null;
      trackingAnchorX.current = null;
      targetTemplate.current = null;
      targetTrail.current = [];
      trackingMisses.current = 0;
      targetVelocityY.current = 0;
      setCalibrated(false);
      setSelectionReady(false);
      setLockQuality(0);
      setStatus("Sentuh dua tepi plate, lalu geser titik agar lingkaran pas");
    };
    const metadata = () => {
      setVideoDuration(Number.isFinite(v.duration) ? v.duration : 0);
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      const q = locate(e),
        p = calibrationPoints.current;
      if (p.length < 2) {
        p.push(q);
        dragHandle.current = p.length - 1;
      } else {
        const distances = p.map((a) => Math.hypot(a.x - q.x, a.y - q.y)),
          nearest = distances[0] < distances[1] ? 0 : 1;
        if (distances[nearest] < 70) dragHandle.current = nearest;
      }
      draw();
      if (p.length === 2)
        setStatus("Geser titik 1 atau 2 hingga lingkaran tepat menutup plate");
    };
    const move = (e: PointerEvent) => {
      if (dragHandle.current === null) return;
      e.preventDefault();
      calibrationPoints.current[dragHandle.current] = locate(e);
      draw();
    };
    const up = () => {
      dragHandle.current = null;
    };
    v.addEventListener("loadeddata", prepare);
    v.addEventListener("loadedmetadata", metadata);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    if (v.readyState >= 2) prepare();
    return () => {
      v.removeEventListener("loadeddata", prepare);
      v.removeEventListener("loadedmetadata", metadata);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
    };
  }, [url, configured, plate, calibrated]);
  function resetCalibrationSelection(message = "Pilih kembali dua tepi plate") {
    calibrationPoints.current = [];
    setSelectionReady(false);
    setLockQuality(0);
    const context = canvas.current?.getContext("2d");
    if (context && canvas.current)
      context.clearRect(0, 0, canvas.current.width, canvas.current.height);
    setStatus(message);
  }
  function seekCalibration(nextTime: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = nextTime;
    setCalibrationTime(nextTime);
    resetCalibrationSelection("Frame dipindahkan • pilih dua tepi plate");
  }
  function lockTarget() {
    const v = video.current,
      p = calibrationPoints.current;
    if (!v || p.length !== 2) return;
    const [a, b] = p,
      manualSize = Math.max(
        32,
        Math.min(520, Math.hypot(b.x - a.x, b.y - a.y)),
      ),
      manualTarget = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      sample = document.createElement("canvas");
    sample.width = v.videoWidth;
    sample.height = v.videoHeight;
    const x = sample.getContext("2d", { willReadFrequently: true });
    if (!x) return;
    x.drawImage(v, 0, 0, sample.width, sample.height);
    const frame = x.getImageData(0, 0, sample.width, sample.height).data,
      refined = refinePlateSelection(
        frame,
        sample.width,
        sample.height,
        manualTarget.x,
        manualTarget.y,
        manualSize,
      ),
      useRefined = refined.confidence >= 18,
      target = useRefined
        ? { x: refined.x, y: refined.y }
        : manualTarget,
      size = useRefined ? refined.diameter : manualSize;
    trackedTarget.current = target;
    trackingAnchorX.current = target.x;
    targetTemplate.current = {
      data: descriptor(
        frame,
        sample.width,
        sample.height,
        target.x,
        target.y,
        size,
      ),
      size,
    };
    targetTrail.current = [];
    trackingMisses.current = 0;
    targetVelocityY.current = 0;
    setPx(Math.round(size));
    setCm(plate);
    setLockQuality(refined.confidence);
    setCalibrated(true);
    setStatus(
      `Plate dikunci • kualitas ${refined.confidence}% • ${Math.round(size)} px = ${plate} cm`,
    );
  }
  if (authStatus === "loading")
    return (
      <main className="auth-loading">
        <BrandLogo />
        <div className="auth-loader"/><p>MEMERIKSA SESI AMAN…</p>
      </main>
    );
  if (!showApplication)
    return <WelcomeHome user={authUser} onEnter={() => setShowApplication(true)} onInstall={() => void installApplication()} installState={installState} showInstallGuide={showInstallGuide} onCloseInstallGuide={() => setShowInstallGuide(false)} />;
  if (!hydrated)
    return (
      <main className="preflight">
        <section className="preflight-card loading-card">
          <div className="marker">•</div>
          <h1>MEMUAT DATA VBT</h1>
          <p>Memulihkan hasil, atlet, dan pengaturan terakhir…</p>
        </section>
      </main>
    );
  if (configured && url && !calibrated)
    return (
      <main className="calibration-screen">
        <section>
          <div className="step">PERSIAPAN • LANGKAH 2 DARI 2</div>
          <h1>SESUAIKAN AREA PLATE</h1>
          <p>
            Sentuh dua sisi plate. Tarik titik <b>1</b> atau <b>2</b> untuk
            memperpanjang, memperpendek, dan memindahkan diameter sampai
            lingkaran menutup plate dengan tepat.
          </p>
          <div className="calibration-video">
            <video
              ref={video}
              src={url}
              muted
              playsInline
              style={{
                transform: `scale(${calibrationZoom})`,
                transformOrigin: "50% 70%",
              }}
            />
            <canvas
              ref={canvas}
              style={{
                transform: `scale(${calibrationZoom})`,
                transformOrigin: "50% 70%",
              }}
            />
            <div className="status">◎ {status}</div>
          </div>
          <div className="calibration-controls">
            <label>
              <span>
                FRAME KALIBRASI
                <b>{calibrationTime.toFixed(1)}s</b>
              </span>
              <input
                type="range"
                min="0"
                max={Math.max(0.1, videoDuration)}
                step="0.1"
                value={calibrationTime}
                onChange={(event) => seekCalibration(+event.target.value)}
              />
            </label>
            <label>
              <span>
                ZOOM PRESISI
                <b>{calibrationZoom.toFixed(1)}×</b>
              </span>
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.1"
                value={calibrationZoom}
                onChange={(event) => setCalibrationZoom(+event.target.value)}
              />
            </label>
          </div>
          <div className="calibration-actions">
            <label className="upload">
              <input id="pick" type="file" accept="video/*" onChange={upload} />
              ↻ GANTI VIDEO
            </label>
            <button
              className="reset-target"
              type="button"
              onClick={() => resetCalibrationSelection()}
            >
              ↺ ULANGI TITIK
            </button>
            <button
              className="lock-target"
              disabled={!selectionReady}
              onClick={lockTarget}
            >
              {selectionReady ? "◎ KUNCI AREA PLATE" : "PILIH DUA TEPI PLATE"}
            </button>
          </div>
          <small>
            Setelah dua titik dipilih, sistem menyempurnakan pusat dan diameter
            berdasarkan tepi lingkaran plate. Gunakan zoom untuk koreksi akhir.
          </small>
        </section>
      </main>
    );
  if (!configured)
    return (
      <main className="preflight">
        <section className="preflight-card">
          <div className="brand">
            <BrandLogo />
          </div>
          <div className="step">PERSIAPAN • LANGKAH 1 DARI 2</div>
          <h1>TENTUKAN FOKUS ANALISIS</h1>
          <p>
            Pilih perlengkapan dan objek yang akan dilacak sebelum memasukkan
            video. Pengaturan ini menjadi dasar kalibrasi perpindahan bar.
          </p>
          <div className="setup-grid">
            <label>
              <span>01</span> Jenis bar
              <select
                value={barType}
                onChange={(e) => setBarType(e.target.value)}
              >
                <option>Olympic Bar Pria • 20 kg</option>
                <option>Olympic Bar Wanita • 15 kg</option>
                <option>Technique Bar • 5–10 kg</option>
                <option>Trap Bar</option>
                <option>Bar Custom</option>
              </select>
            </label>
            <label>
              <span>02</span> Fokus utama
              <select value={focus} onChange={(e) => setFocus(e.target.value)}>
                <option>Plate yang bergerak</option>
                <option>Ujung bar yang bergerak</option>
                <option>Pusat plate</option>
              </select>
            </label>
            <label>
              <span>03</span> Diameter/lebar plate
              <select value={plate} onChange={(e) => setPlate(+e.target.value)}>
                <option value="45">45 cm • Olympic standard</option>
                <option value="40">40 cm</option>
                <option value="35">35 cm</option>
                <option value="30">30 cm</option>
                <option value="25">25 cm</option>
                <option value="20">20 cm</option>
              </select>
            </label>
          </div>
          <div className="focus-guide">
            <div className="plate-visual">
              <i />
              <b>＋</b>
            </div>
            <div>
              <strong>FOKUS: {focus.toUpperCase()}</strong>
              <small>
                Setelah video diunggah, klik dua sisi plate. Sistem mengambil
                titik tengah dan pola visual plate sebagai target yang akan
                diikuti selama bergerak.
              </small>
            </div>
          </div>
          <button
            className="confirm-focus"
            onClick={() => {
              setCm(plate);
              setConfigured(true);
              setStatus(`${barType} • ${focus} • plate ${plate} cm`);
            }}
          >
            ✓ KONFIRMASI & LANJUTKAN
          </button>
          <small className="note">
            Ukuran plate {plate} cm otomatis digunakan sebagai referensi nyata
            pada kalibrasi.
          </small>
        </section>
      </main>
    );
  function upload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    calibrationPoints.current = [];
    trackedTarget.current = null;
    trackingAnchorX.current = null;
    targetTemplate.current = null;
    trackingMisses.current = 0;
    targetVelocityY.current = 0;
    setSelectionReady(false);
    setCalibrated(false);
    setUrl(URL.createObjectURL(f));
    setReps([]);
    setStatus("Video siap • sesuaikan area plate");
  }
  function track() {
    const v = video.current,
      c = canvas.current,
      target = trackedTarget.current,
      template = targetTemplate.current;
    if (!v || !c || v.paused || v.ended) return finish();
    if (!target || !template) {
      setStatus("Target plate belum dikunci");
      return;
    }
    if (v.currentTime <= lastTrackedVideoTime.current + 0.001) {
      raf.current = requestAnimationFrame(track);
      return;
    }
    const previousVideoTime = lastTrackedVideoTime.current,
      frameDt = previousVideoTime >= 0 ? Math.max(0, v.currentTime - previousVideoTime) : 0;
    lastTrackedVideoTime.current = v.currentTime;
    const w = v.videoWidth || 640,
      h = v.videoHeight || 360;
    c.width = w;
    c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return;
    x.drawImage(v, 0, 0, w, h);
    const frame = x.getImageData(0, 0, w, h).data,
      anchorX = trackingAnchorX.current ?? target.x,
      predictedY = Math.max(template.size / 2, Math.min(h - template.size / 2, target.y + targetVelocityY.current * frameDt)),
      predictedTravel = Math.abs(targetVelocityY.current) * Math.max(frameDt, 1 / 60),
      searchBoost = Math.min(4.2, 1 + trackingMisses.current * 0.16),
      searchX = Math.max(16, Math.min(80, template.size * 0.3 + trackingMisses.current * 4)),
      searchY = Math.max(
        42,
        Math.min(h * 0.46, (template.size * 0.5 + predictedTravel * 3.2) * searchBoost),
      ),
      step = Math.max(3, Math.floor(template.size / (trackingMisses.current ? 20 : 24)));
    let bestX = target.x,
      bestY = target.y,
      bestScore = Infinity,
      bestCandidate: Float32Array | null = null;
    const consider = (cx: number, cy: number) => {
      const candidate = descriptor(frame, w, h, cx, cy, template.size);
      let correlation = 0;
      for (let i = 0; i < candidate.length; i++)
        correlation += candidate[i] * template.data[i];
      correlation /= candidate.length;
      const appearanceScore = 1 - correlation,
        distancePenalty =
          (Math.abs(cx - target.x) / searchX) * 0.12 +
          (Math.abs(cy - predictedY) / searchY) * 0.03,
        score = appearanceScore + distancePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestX = cx;
        bestY = cy;
        bestCandidate = candidate;
      }
    };
    // Posisi terakhir selalu diuji tepat di pusat, bukan hanya titik grid.
    consider(
      Math.max(anchorX - searchX, Math.min(anchorX + searchX, target.x)),
      predictedY,
    );
    for (
      let cy = Math.max(template.size / 2, predictedY - searchY);
      cy < Math.min(h - template.size / 2, predictedY + searchY);
      cy += step
    )
      for (
        let cx = Math.max(template.size / 2, anchorX - searchX);
        cx < Math.min(w - template.size / 2, anchorX + searchX);
        cx += step
      ) {
        consider(cx, cy);
      }
    x.clearRect(0, 0, w, h);
    const acceptanceLimit = trackingMisses.current > 0 ? 0.86 : 0.78;
    if (bestScore < acceptanceLimit && bestCandidate) {
      trackingMisses.current = 0;
      if (frameDt > 0) {
        const observedVelocity = Math.max(-2600, Math.min(2600, (bestY - target.y) / frameDt));
        targetVelocityY.current = targetVelocityY.current * 0.52 + observedVelocity * 0.48;
      }
      if (bestScore < 0.42)
        for (let index = 0; index < template.data.length; index++)
          template.data[index] = template.data[index] * 0.94 + bestCandidate[index] * 0.06;
      trackedTarget.current = { x: bestX, y: bestY };
      targetTrail.current.push({ x: bestX, y: bestY });
      targetTrail.current = targetTrail.current.slice(-70);
      const previous = points.current[points.current.length - 1],
        meterPerPixel = cm / 100 / Math.max(1, px);
      points.current.push({ t: v.currentTime, y: bestY });
      if (points.current.length % 3 === 0) setLiveTrace(points.current.slice(-1800));
      liveMinY.current = Math.min(liveMinY.current, bestY);
      liveMaxY.current = Math.max(liveMaxY.current, bestY);
      const shouldUpdateTelemetry = points.current.length % 3 === 0;
      if (shouldUpdateTelemetry)
        setLiveRom((liveMaxY.current - liveMinY.current) * meterPerPixel);
      if (previous) {
        const dt = v.currentTime - previous.t,
          signedVelocity = dt > 0 ? ((previous.y - bestY) * meterPerPixel) / dt : 0,
          filteredVelocity = Math.max(-4, Math.min(4, signedVelocity)),
          movementThreshold = 0.04,
          validLiftDistance = Math.max(0.08, (plate / 100) * 0.22),
          validLiftPixels = validLiftDistance / meterPerPixel;
        if (
          !liveIndicatorArmed.current &&
          liveRepStartY.current !== null &&
          bestY >= liveRepStartY.current - validLiftPixels * 0.2
        ) {
          liveIndicatorArmed.current = true;
          liveRepStartY.current = null;
          liveAscentDistance.current = 0;
        }
        if (filteredVelocity > movementThreshold) {
          downwardFrameCount.current = 0;
          stationaryFrameCount.current = 0;
          if (liveIndicatorArmed.current) {
            if (liveRepStartY.current === null) liveRepStartY.current = previous.y;
            liveAscentDistance.current += filteredVelocity * dt;
            positiveVelocitySum.current += filteredVelocity;
            positiveVelocityCount.current += 1;
            livePeakRef.current = Math.max(livePeakRef.current, filteredVelocity);
          }
          if (shouldUpdateTelemetry) {
            setLivePhase("naik");
            setLiveVelocity(filteredVelocity);
            setLivePeak(livePeakRef.current);
          }
        } else if (filteredVelocity < -movementThreshold) {
          stationaryFrameCount.current = 0;
          downwardFrameCount.current += 1;
          if (downwardFrameCount.current === 2) {
            if (
              liveIndicatorArmed.current &&
              liveAscentDistance.current >= validLiftDistance &&
              positiveVelocityCount.current > 0
            ) {
              setLiveMean(positiveVelocitySum.current / positiveVelocityCount.current);
              setLiveRepNumber((current) => current + 1);
              liveIndicatorArmed.current = false;
            }
            positiveVelocitySum.current = 0;
            positiveVelocityCount.current = 0;
            livePeakRef.current = 0;
            if (liveIndicatorArmed.current) {
              liveRepStartY.current = null;
              liveAscentDistance.current = 0;
            }
          }
          if (shouldUpdateTelemetry && downwardFrameCount.current >= 2) {
            setLivePhase("turun");
            setLiveVelocity(0);
            setLivePeak(0);
          }
        } else {
          downwardFrameCount.current = 0;
          if (
            liveIndicatorArmed.current &&
            liveAscentDistance.current >= validLiftDistance &&
            positiveVelocityCount.current > 0
          ) {
            stationaryFrameCount.current += 1;
            if (stationaryFrameCount.current === 5) {
              setLiveMean(positiveVelocitySum.current / positiveVelocityCount.current);
              setLiveRepNumber((current) => current + 1);
              liveIndicatorArmed.current = false;
            }
          } else stationaryFrameCount.current = 0;
          if (shouldUpdateTelemetry) {
            setLivePhase("diam");
            setLiveVelocity(0);
          }
        }
      }
      const directionColor = bestY <= target.y ? "#ff3434" : "#21d66f";
      x.strokeStyle = directionColor;
      x.lineWidth = 5;
      x.beginPath();
      x.arc(bestX, bestY, template.size / 2, 0, Math.PI * 2);
      x.stroke();
      for (let i = 1; i < targetTrail.current.length; i++) {
        const from = targetTrail.current[i - 1],
          to = targetTrail.current[i];
        x.strokeStyle = to.y <= from.y ? "#ff3434" : "#21d66f";
        x.beginPath();
        x.moveTo(from.x, from.y);
        x.lineTo(to.x, to.y);
        x.stroke();
      }
      x.fillStyle = "#fff";
      x.beginPath();
      x.arc(bestX, bestY, 5, 0, Math.PI * 2);
      x.fill();
      if (shouldUpdateTelemetry)
        setStatus(
          `Plate terkunci • ${points.current.length} frame • kecocokan ${Math.max(0, (1 - bestScore) * 100).toFixed(0)}%`,
        );
    } else {
      trackingMisses.current += 1;
      setLivePhase("diam");
      setLiveVelocity(0);
      const predictedTarget = { x: target.x, y: predictedY };
      trackedTarget.current = predictedTarget;
      targetVelocityY.current *= 0.94;
      x.strokeStyle = "#ffb020";
      x.lineWidth = 4;
      x.setLineDash([10, 8]);
      x.beginPath();
      x.arc(predictedTarget.x, predictedTarget.y, template.size / 2, 0, Math.PI * 2);
      x.stroke();
      x.setLineDash([]);
      if (trackingMisses.current <= 18) {
        points.current.push({ t: v.currentTime, y: predictedTarget.y });
        if (points.current.length % 3 === 0) setLiveTrace(points.current.slice(-1800));
        setStatus("Prediksi gerak aktif • penguncian plate dipertahankan");
      } else {
        setStatus("Mencari kembali pola plate • area pencarian diperluas");
      }
    }
    raf.current = requestAnimationFrame(track);
  }
  async function start() {
    if (!url || !video.current) {
      document.getElementById("pick")?.click();
      return;
    }
    if (!calibrated) {
      setStatus(`Wajib klik dua titik kalibrasi pada ${focus.toLowerCase()}`);
      return;
    }
    points.current = [];
    finishing.current = false;
    trackingMisses.current = 0;
    targetVelocityY.current = 0;
    lastTrackedVideoTime.current = -1;
    livePeakRef.current = 0;
    liveMinY.current = Infinity;
    liveMaxY.current = -Infinity;
    positiveVelocitySum.current = 0;
    positiveVelocityCount.current = 0;
    downwardFrameCount.current = 0;
    liveRepStartY.current = null;
    liveAscentDistance.current = 0;
    liveIndicatorArmed.current = true;
    stationaryFrameCount.current = 0;
    setLiveTrace([]);
    setLiveVelocity(0);
    setLiveMean(0);
    setLivePhase("diam");
    setLiveRepNumber(0);
    setLivePeak(0);
    setLiveRom(0);
    setReps([]);
    setRunning(true);
    const precisionRate = precisionMode
      ? window.innerWidth <= 600
        ? 0.35
        : 0.6
      : 1;
    setAnalysisRate(precisionRate);
    setStatus(
      `Mode presisi ${Math.round(precisionRate * 100)}% • seluruh frame dipindai`,
    );
    video.current.currentTime = 0;
    video.current.playbackRate = precisionRate;
    await video.current.play();
    track();
  }
  function finish() {
    if (finishing.current) return;
    finishing.current = true;
    cancelAnimationFrame(raf.current);
    setRunning(false);
    setAnalysisRate(1);
    if (video.current) video.current.playbackRate = 1;
    const p = points.current;
    setLiveTrace(p.slice(-1800));
    if (p.length < 20) {
      setStatus("Data marker belum cukup");
      return;
    }
    const s = p.map((q, i) => {
        const z = p.slice(Math.max(0, i - 3), Math.min(p.length, i + 4));
        return { ...q, y: z.reduce((a, b) => a + b.y, 0) / z.length };
      }),
      ratio = cm / 100 / Math.max(1, px),
      liftThresholdPx = Math.max(8, Math.max(0.08, (plate / 100) * 0.22) / ratio),
      candidates: Rep[] = [];
    let repStart: number | null = null,
      topIndex = 0,
      peakConfirmed = false,
      validatedLift = false,
      aboveLiftFrames = 0,
      bottomStableFrames = 0,
      lastRepEndTime = -Infinity;
    const saveRep = (start: number, top: number, end = top, allowOpenEnd = false) => {
      const dt = s[top].t - s[start].t,
        descentDt = s[end].t - s[top].t,
        dist = (s[start].y - s[top].y) * ratio;
      if (
        dist < Math.max(0.08, (plate / 100) * 0.22) ||
        dt < 0.18 ||
        dt > 8 ||
        (!allowOpenEnd && (descentDt < 0.12 || s[end].t - s[start].t < 0.42))
      ) return;
      const velocities: number[] = [];
      let grossTravel = 0;
      for (let j = start + 1; j <= top; j++) {
        const frameDt = s[j].t - s[j - 1].t;
        grossTravel += Math.abs(s[j].y - s[j - 1].y) * ratio;
        if (frameDt > 0)
          velocities.push(
            Math.max(0, ((s[j - 1].y - s[j].y) * ratio) / frameDt),
          );
      }
      velocities.sort((a, b) => a - b);
      const repMean = dist / dt,
        observedPeak = velocities[Math.floor(velocities.length * 0.9)] || repMean,
        repPeak = Math.min(4, observedPeak),
        pathEfficiency = dist / Math.max(dist, grossTravel);
      if (pathEfficiency < 0.52 || observedPeak > 5) return;
      candidates.push({
        mean: repMean,
        peak: repPeak,
        duration: dt,
        rom: dist,
        power: loadKg * 9.81 * repMean,
        peakPower: loadKg * 9.81 * repPeak,
        startTime: s[start].t,
        peakTime: s[top].t,
        endTime: s[end].t,
      });
    };
    const startTriggerPx = Math.max(3, px * 0.025);
    for (let i = 4; i < s.length - 2; i++) {
      const movingUp = s[i].y < s[i - 4].y - startTriggerPx;
      if (repStart === null && movingUp && s[i].t - lastRepEndTime > 0.28) {
        const lookBack = Math.max(0, i - 14);
        repStart = lookBack;
        for (let j = lookBack; j <= i; j++)
          if (s[j].y > s[repStart].y) repStart = j;
        topIndex = i;
        peakConfirmed = false;
        validatedLift = false;
        aboveLiftFrames = 0;
        bottomStableFrames = 0;
      }
      if (repStart !== null) {
        if (s[i].y < s[topIndex].y) topIndex = i;
        const travel = s[repStart].y - s[topIndex].y,
          currentLift = s[repStart].y - s[i].y,
          candidateAge = s[i].t - s[repStart].t,
          reversalThreshold = Math.max(4, travel * 0.1),
          reversed =
            s[i].y > s[topIndex].y + reversalThreshold &&
            s[i + 2].y > s[topIndex].y + reversalThreshold,
          resetBand = Math.max(5, travel * 0.18);
        aboveLiftFrames = currentLift >= liftThresholdPx
          ? aboveLiftFrames + 1
          : Math.max(0, aboveLiftFrames - 1);
        if (aboveLiftFrames >= 3) validatedLift = true;
        if (reversed && validatedLift) peakConfirmed = true;
        bottomStableFrames = validatedLift && peakConfirmed && currentLift <= resetBand
          ? bottomStableFrames + 1
          : 0;
        if (
          candidateAge > 12 ||
          (candidateAge > 1.2 && !validatedLift && travel < liftThresholdPx * 0.35)
        ) {
          repStart = null;
          peakConfirmed = false;
          validatedLift = false;
          continue;
        }
        if (bottomStableFrames >= 3 && travel >= liftThresholdPx) {
          saveRep(repStart, topIndex, i);
          lastRepEndTime = s[i].t;
          repStart = null;
          peakConfirmed = false;
          validatedLift = false;
        }
      }
    }
    if (repStart !== null && validatedLift)
      saveRep(repStart, topIndex, s.length - 1, true);
    const out = candidates;
    setReps(out);
    setStatus(
      out.length
        ? `${out.length} repetisi berhasil dianalisis`
        : "Repetisi belum terbaca • sesuaikan kalibrasi",
    );
    if (out.length) {
      const date = new Date().toISOString(),
        completedSet: HistorySet = {
          id: `${Date.now()}`,
          date,
          exercise,
          athlete: athleteName,
          athleteId: activeAthleteId,
          loadKg,
          reps: out,
        };
      writeStorage("hirocross-vbt", { date, reps: out });
      setHistory((current) => {
        const next = [completedSet, ...current].slice(0, 500);
        writeStorage("hirocross-history", next);
        return next;
      });
    }
  }
  return (
    <main className="shell">
      <aside>
        <div className="brand">
          <BrandLogo compact />
        </div>
        <nav>
          {NAV_ITEMS.map(([key, icon, label]) => (
            <button
              type="button"
              className={activePage === key ? "active" : ""}
              key={key}
              disabled={running && key !== "analysis"}
              onClick={() => setActivePage(key)}
            >
              <span className="nav-icon"><NavIcon icon={icon} /></span>
              {label}
            </button>
          ))}
        </nav>
        <div className="online">● SISTEM TERHUBUNG</div>
      </aside>
      <section className="work">
        <header>
          <h1>
            {NAV_ITEMS.find(([key]) => key === activePage)?.[2] ?? "MOTION VBT"}
          </h1>
          <div className="header-account">
            <button
              type="button"
              className="athlete"
              onClick={() => setActivePage("analysis")}
            >
              <small>ATLET</small>
              <strong>{athleteName}</strong>⌄
            </button>
            <button className="logout-link" type="button" onClick={() => setActivePage("settings")}>{authUser ? "AKUN" : "MASUK"}</button>
          </div>
        </header>
        {activePage === "home" && (
          <section className="page-content home-page">
            <div className="page-heading">
              <div>
                <small>DASHBOARD ATLET AKTIF</small>
                <h2>{athleteName.toUpperCase()}</h2>
              </div>
              <div className="dashboard-actions">
                <select aria-label="Pilih latihan untuk melihat perkembangan" value={exercise} onChange={(event) => setExercise(event.target.value)}><ExerciseOptions /></select>
                <button className="page-action" onClick={() => setActivePage("analysis")}>＋ LATIHAN BARU</button>
              </div>
            </div>
            <div className="athlete-dashboard-grid">
              <article><small>TOTAL VOLUME ANGKATAN</small><strong>{athleteTotalVolume.toLocaleString("id-ID")}</strong><b>kg</b><p>Beban × repetisi seluruh set</p></article>
              <article><small>TOTAL REPETISI</small><strong>{athleteTotalReps}</strong><b>rep</b><p>Dari {athleteHistory.length} set tersimpan</p></article>
              <article className="one-rm-primary"><small>ESTIMASI 1RM • {exercise}</small><strong>{oneRmEstimate.value ? oneRmEstimate.value.toFixed(1) : "—"}</strong><b>{oneRmEstimate.value ? "kg" : ""}</b><p>{oneRmEstimate.method}</p></article>
              <article><small>BERAT BADAN</small><strong>{athleteWeight}</strong><b>kg</b><p>Profil atlet aktif</p></article>
            </div>
            <AthleteProgressDashboard sets={athleteHistory} exercise={exercise} athlete={athleteName} />
            <LoadVelocityProfile sets={athleteHistory} exercise={exercise} />
            <ForceVelocityCurve sets={athleteHistory} exercise={exercise} />
            <PowerLoadProfile sets={athleteHistory} exercise={exercise} />
            <div className="latest-set-heading"><small>HASIL SET TERAKHIR</small><strong>{reps.length ? `${reps.length} REPETISI` : "BELUM ADA HASIL"}</strong></div>
            {reps.length ? (
              <>
                <div className="overview-grid">
                  <article><small>MEAN VELOCITY</small><strong>{mean.toFixed(2)}</strong><b>m/s</b></article>
                  <article><small>PEAK VELOCITY</small><strong>{peak.toFixed(2)}</strong><b>m/s</b></article>
                  <article><small>VELOCITY LOSS</small><strong>{loss.toFixed(1)}</strong><b>%</b></article>
                  <article><small>MEAN POWER</small><strong>{meanPower.toFixed(0)}</strong><b>W</b></article>
                </div>
                <RepChart reps={reps} />
              </>
            ) : (
              <div className="page-empty">
                <div className="marker">•</div>
                <h3>HASIL ANALISIS AKAN MUNCUL DI SINI</h3>
                <p>Data tetap tersimpan setelah aplikasi ditutup atau halaman direfresh.</p>
              </div>
            )}
          </section>
        )}

        {activePage === "analysis" && (
          <>
            <div className={`analysis-mode-switch ${running ? "measurement-active" : ""}`} role="group" aria-label="Pilih metode analisis">
              <button type="button" className={analysisMode === "video" ? "active" : ""} onClick={() => setAnalysisMode("video")} disabled={running}>▣ VIDEO TRACKING</button>
              <button type="button" className={analysisMode === "sensor" ? "active" : ""} onClick={() => setAnalysisMode("sensor")} disabled={running}>⌁ SENSOR HP</button>
              <button type="button" className={analysisMode === "sprint" ? "active" : ""} onClick={() => setAnalysisMode("sprint")} disabled={running}>⚑ KECEPATAN LARI</button>
              <span>{analysisMode === "video" ? "Analisis plate dari rekaman kamera" : analysisMode === "sensor" ? "HP menjadi device pengukur gerak" : "Satu kamera untuk start dan finish pada garis yang sama"}</span>
            </div>
            {analysisMode !== "sprint" && <div className={`toolbar ${analysisMode === "sensor" ? "sensor-page-toolbar" : ""}`}>
              <select className="training-athlete-select" aria-label="Pilih atlet yang berlatih" value={activeAthleteId} onChange={(event) => { const profile = athletes.find((item) => item.id === event.target.value); if (profile) selectAthlete(profile); }} disabled={running}>
                {athletes.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
              <select value={exercise} onChange={(event) => setExercise(event.target.value)}>
                <ExerciseOptions />
              </select>
              <label className="load-field">
                <small>TOTAL BEBAN</small>
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="0.5"
                  value={loadKg}
                  onChange={(e) => setLoadKg(Math.max(1, +e.target.value))}
                />
                <b>kg</b>
              </label>
              {analysisMode === "video" ? (
                <>
                  <button
                    type="button"
                    className="recalibrate"
                    disabled={!url || running}
                    onClick={() => setCalibrated(false)}
                  >
                    ◎ KALIBRASI ULANG {lockQuality ? `• ${lockQuality}%` : ""}
                  </button>
                  <div className="video-source-actions" role="group" aria-label="Pilih sumber video">
                    <label className="upload record-video">
                      <input type="file" accept="video/*" capture="environment" onChange={upload} />●
                      REKAM VIDEO
                    </label>
                    <label className="upload">
                      <input id="pick" type="file" accept="video/*" onChange={upload} />＋
                      UNGGAH GALERI
                    </label>
                  </div>
                </>
              ) : (
                <div className="sensor-toolbar-note">⌁ DATA SENSOR DISIMPAN KE PROFIL <strong>{athleteName.toUpperCase()}</strong></div>
              )}
            </div>}
            {analysisMode === "sprint" ? (
              <SprintWorkspace athleteName={athleteName} />
            ) : analysisMode === "sensor" ? (
              <PhoneSensorWorkspace loadKg={loadKg} exercise={exercise} athleteName={athleteName} athletes={athletes} activeAthleteId={activeAthleteId} onAthleteChange={(athleteId) => { const profile = athletes.find((item) => item.id === athleteId); if (profile) selectAthlete(profile); }} onExerciseChange={setExercise} onLoadChange={setLoadKg} onSave={saveSensorSet} />
            ) : (
            <div className="dash">
              <div className="left">
                <section className="video">
              {url ? (
                <>
                  <video
                    ref={video}
                    src={url}
                    muted
                    playsInline
                    onEnded={finish}
                  />
                  <canvas ref={canvas} />
                  {running && (
                    <div className="live-telemetry desktop-telemetry">
                      <article>
                        <small>LIVE VELOCITY</small>
                        <strong>{liveVelocity.toFixed(2)}</strong>
                        <b>m/s</b>
                      </article>
                      <article>
                        <small>LIVE MEAN</small>
                        <strong>{liveMean.toFixed(2)}</strong>
                        <b>m/s</b>
                      </article>
                      <article>
                        <small>LIVE PEAK</small>
                        <strong>{livePeak.toFixed(2)}</strong>
                        <b>m/s</b>
                      </article>
                      <article>
                        <small>LIVE ROM</small>
                        <strong>{(liveRom * 100).toFixed(0)}</strong>
                        <b>cm</b>
                      </article>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty">
                  <div className="marker">•</div>
                  <h2>VIDEO ANALISIS VBT</h2>
                  <p>
                    Rekam dari samping dan pasang marker oranye pada ujung
                    barbell.
                  </p>
                  <button
                    onClick={() => document.getElementById("pick")?.click()}
                  >
                    UNGGAH VIDEO
                  </button>
                </div>
              )}
              <div className="live">
                ● {running ? "ANALISIS PRESISI" : "SIAP"} • ENGINE{" "}
                {ENGINE_VERSION}
                {running ? ` • ${Math.round(analysisRate * 100)}% SPEED` : ""}
              </div>
              <div className="status">◎ {status}</div>
              {url && (
                <div className="direction-legend">
                  <span>
                    <i className="up" /> NAIK
                  </span>
                  <span>
                    <i className="down" /> TURUN
                  </span>
                </div>
              )}
                </section>
                {running && (
                  <section className="mobile-analysis-panel" aria-label="Data analisis langsung">
                    <VelocityGauge velocity={liveMean} motionVelocity={liveVelocity} loadKg={loadKg} phase={livePhase} exercise={exercise} repNumber={liveRepNumber} />
                    <div className="live-telemetry mobile-telemetry">
                      <article><small>LIVE VELOCITY</small><strong>{liveVelocity.toFixed(2)}</strong><b>m/s</b></article>
                      <article><small>LIVE MEAN</small><strong>{liveMean.toFixed(2)}</strong><b>m/s</b></article>
                      <article><small>LIVE PEAK</small><strong>{livePeak.toFixed(2)}</strong><b>m/s</b></article>
                      <article><small>LIVE ROM</small><strong>{(liveRom * 100).toFixed(0)}</strong><b>cm</b></article>
                    </div>
                    <div className="mobile-analysis-status"><span>● ENGINE {ENGINE_VERSION} • {Math.round(analysisRate * 100)}% SPEED</span><small>◎ {status}</small></div>
                  </section>
                )}
                {url && (
                  <LiveMotionChart
                    points={liveTrace}
                    ratio={cm / 100 / Math.max(1, px)}
                    running={running}
                  />
                )}
                {reps.length > 0 && (
                  <>
                    <section className="repbox">
                <h3>
                  REPETISI <span>{reps.length} TERDETEKSI</span>
                </h3>
                <div className="repgrid">
                  {reps.map((r, i) => (
                    <article
                      className={`${i === reps.length - 1 ? "current" : ""} zone-${velocityZone(r.mean).key}`}
                      key={i}
                    >
                      <small>REP {String(i + 1).padStart(2, "0")}</small>
                      <strong>{r.mean.toFixed(2).replace(".", ",")}</strong>
                      <b>m/s</b>
                      <span className="velocity-review">{velocityZone(r.mean).label}</span>
                      <p>
                        ROM {(r.rom * 100).toFixed(0)} cm • {r.power.toFixed(0)}{" "}
                        W
                        <br />
                        Peak {r.peak.toFixed(2)} m/s • {r.duration.toFixed(2)}s
                      </p>
                    </article>
                  ))}
                </div>
                    </section>
                    <RepChart reps={reps} />
                  </>
                )}
              </div>
              <div className="right">
                {running && <div className="desktop-live-gauge"><VelocityGauge velocity={liveMean} motionVelocity={liveVelocity} loadKg={loadKg} phase={livePhase} exercise={exercise} repNumber={liveRepNumber} /></div>}
                {reps.length > 0 && (
                  <>
                <section className="metric hero">
                  <div className="metric-heading">
                    <label>{primaryData.label}</label>
                    <select
                      aria-label="Pilih metrik utama"
                      value={primaryMetric}
                      onChange={(e) => {
                        const value = e.target.value as PrimaryMetric;
                        setPrimaryMetric(value);
                        try {
                          window.localStorage.setItem(
                            "hirocross-primary-metric",
                            value,
                          );
                        } catch {
                          // Pilihan tetap aktif untuk sesi ini.
                        }
                      }}
                    >
                      <option value="meanVelocity">Mean Velocity</option>
                      <option value="peakVelocity">Peak Velocity</option>
                      <option value="meanPower">Mean Power</option>
                      <option value="peakPower">Peak Power</option>
                    </select>
                  </div>
                  <div>
                    <strong>
                      {primaryData.value
                        .toFixed(primaryData.digits)
                        .replace(".", ",")}
                    </strong>
                    <b>{primaryData.unit}</b>
                  </div>
                  <p>
                    {primaryData.secondaryLabel}
                    <span>{primaryData.secondaryValue}</span>
                  </p>
                </section>
                <section className="metric loss">
                  <label>VELOCITY LOSS</label>
                  <strong>
                    {reps.length > 1
                      ? loss.toFixed(1).replace(".", ",")
                      : "—"}
                    <b>{reps.length > 1 ? "%" : ""}</b>
                  </strong>
                  <div className="bars">
                    {reps.map((r, i) => (
                      <i
                        key={i}
                        style={{
                          height: `${(r.mean / (bestMean || 1)) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                  {reps.length > 1 && (
                    <small className="loss-detail">
                      Terbaik {bestMean.toFixed(2)} m/s → terakhir{" "}
                      {reps[reps.length - 1].mean.toFixed(2)} m/s
                    </small>
                  )}
                  <p className={loss > 20 ? "danger" : "safe"}>
                    {reps.length < 2
                      ? "BUTUH MINIMAL 2 REPETISI VALID"
                      : loss > 20
                        ? "⚠ HENTIKAN SET — FATIGUE TINGGI"
                        : "♢ AMAN — LANJUTKAN SET"}
                  </p>
                </section>
                <section className="performance-summary">
                  <article>
                    <label>MEAN ROM</label>
                    <div>
                      <strong>{(meanRom * 100).toFixed(1)}</strong>
                      <b>cm</b>
                    </div>
                    <small>Range of motion vertikal</small>
                  </article>
                  <article>
                    <label>
                      MEAN POWER <em>EST.</em>
                    </label>
                    <div>
                      <strong>{meanPower.toFixed(0)}</strong>
                      <b>W</b>
                    </div>
                    <small>
                      Peak {peakPower.toFixed(0)} W • beban {loadKg} kg
                    </small>
                  </article>
                  <article className="one-rm-result">
                    <label>ESTIMASI 1RM <em>EST.</em></label>
                    <div><strong>{oneRmEstimate.value ? oneRmEstimate.value.toFixed(1) : "—"}</strong><b>{oneRmEstimate.value ? "kg" : ""}</b></div>
                    <small>{oneRmEstimate.method} • {exercise}</small>
                  </article>
                </section>
                  </>
                )}
                <button className={`start ${running ? "measurement-finish" : ""}`} onClick={running ? finish : start}>
                  {running ? "■ SELESAI & SIMPAN" : "▶ MULAI ANALISIS"}
                </button>
              </div>
            </div>
            )}
          </>
        )}

        {activePage === "history" && (
          <section className="page-content">
            <div className="page-heading">
              <div><small>TERSIMPAN DI HP • {athleteName.toUpperCase()}</small><h2>KALENDER LATIHAN</h2></div>
              <div className="dashboard-actions">
                <span className="page-count">{athleteHistory.length} SET</span>
              </div>
            </div>
            <TrainingCalendar sets={athleteHistory} athlete={athleteName} onOpen={(item) => { setReps(item.reps); setLoadKg(item.loadKg); setExercise(item.exercise); setActivePage("home"); }} />
          </section>
        )}

        {activePage === "athletes" && (
          <section className="page-content form-page">
            <div className="page-heading"><div><small>DATA ATLET</small><h2>TAMBAH ATLET</h2></div><button className="page-action" type="button" onClick={addAthlete}>＋ ATLET BARU</button></div>
            <div className="profile-saved"><span className="saved-badge">{athletes.length} ATLET TERSIMPAN</span><small>Pergantian atlet yang berlatih dilakukan langsung dari halaman Latihan.</small></div>
            <div className="form-grid">
              <label>NAMA ATLET<input value={athleteName} onChange={(event) => saveAthleteProfile({ name: event.target.value })} placeholder="Nama atlet" /></label>
              <label>BERAT BADAN<input type="number" min="20" max="300" value={athleteWeight} onChange={(event) => saveAthleteProfile({ weight: Math.max(20, +event.target.value) })} /><b>kg</b></label>
              <label className="wide">CATATAN<textarea value={athleteNote} onChange={(event) => saveAthleteProfile({ note: event.target.value })} placeholder="Target latihan, cedera, atau catatan pelatih" /></label>
            </div>
          </section>
        )}

        {activePage === "settings" && (
          <section className="page-content form-page">
            <div className="page-heading"><div><small>ENGINE {ENGINE_VERSION}</small><h2>PENGATURAN</h2></div><span className="saved-badge">TERSIMPAN OTOMATIS</span></div>
            <AccountSettings user={authUser} onUserChange={setAuthUser} />
            <section className="app-install-card"><div><span>APLIKASI HP</span><h3>INSTAL HIROCROSS MOTION VBT</h3><p>Buka dari ikon di layar utama dengan tampilan penuh seperti aplikasi Android atau iPhone.</p></div><button type="button" onClick={() => void installApplication()}>{installState === "installed" ? "✓ SUDAH TERINSTAL" : "⇩ INSTAL APLIKASI"}</button></section>
            <div className="settings-list">
              <SensorAlertSettings />
              <label><div><strong>Mode analisis presisi</strong><small>Memperlambat video di HP agar tidak ada repetisi terlewat.</small></div><input type="checkbox" checked={precisionMode} onChange={(event) => setPrecisionMode(event.target.checked)} /></label>
              <label><div><strong>Jenis bar default</strong><small>Digunakan saat membuka analisis berikutnya.</small></div><select value={barType} onChange={(event) => setBarType(event.target.value)}><option>Olympic Bar Pria • 20 kg</option><option>Olympic Bar Wanita • 15 kg</option><option>Technique Bar • 5–10 kg</option><option>Trap Bar</option><option>Bar Custom</option></select></label>
              <label><div><strong>Diameter plate</strong><small>Referensi skala untuk ROM dan velocity.</small></div><select value={plate} onChange={(event) => { const value = +event.target.value; setPlate(value); setCm(value); }}><option value="45">45 cm</option><option value="40">40 cm</option><option value="35">35 cm</option><option value="30">30 cm</option><option value="25">25 cm</option><option value="20">20 cm</option></select></label>
              <label><div><strong>Fokus pelacakan</strong><small>Objek yang menjadi pusat garis pergerakan.</small></div><select value={focus} onChange={(event) => setFocus(event.target.value)}><option>Plate yang bergerak</option><option>Ujung bar yang bergerak</option><option>Pusat plate</option></select></label>
            </div>
          </section>
        )}
      </section>
      {showInstallGuide && <section className="install-guide" role="dialog" aria-modal="true" aria-label="Cara instal HiroCross Motion VBT"><button type="button" className="install-close" onClick={() => setShowInstallGuide(false)}>×</button><span>INSTAL DI HP</span><h2>TAMBAHKAN HIROCROSS KE LAYAR UTAMA</h2><div><article><b>ANDROID • CHROME</b><ol><li>Tekan menu <strong>⋮</strong> di kanan atas Chrome.</li><li>Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li><li>Tekan <strong>Instal</strong>.</li></ol></article><article><b>IPHONE • SAFARI</b><ol><li>Tekan tombol <strong>Bagikan</strong>.</li><li>Pilih <strong>Add to Home Screen</strong>.</li><li>Tekan <strong>Add</strong>.</li></ol></article></div><small>Setelah terpasang, HiroCross dapat dibuka dari ikon aplikasi seperti aplikasi HP lainnya.</small></section>}
    </main>
  );
}
