export type JumpProtocol = "cmj" | "dropJump" | "repeatedJump";
export type JumpPhase = "ready" | "unweighting" | "braking" | "propulsion" | "flight" | "landing" | "contact" | "stabilizing";

export type JumpResult = {
  protocol: JumpProtocol;
  flightTime: number;
  contactTime?: number;
  jumpHeightCm: number;
  rsi?: number;
  takeoffVelocity: number;
  timestamp: number;
};

export const GRAVITY = 9.80665;

export function jumpHeightFromFlightTime(flightTimeSeconds: number) {
  if (!Number.isFinite(flightTimeSeconds) || flightTimeSeconds <= 0) return 0;
  return (GRAVITY * flightTimeSeconds * flightTimeSeconds / 8) * 100;
}

export function takeoffVelocityFromFlightTime(flightTimeSeconds: number) {
  if (!Number.isFinite(flightTimeSeconds) || flightTimeSeconds <= 0) return 0;
  return GRAVITY * flightTimeSeconds / 2;
}

export function reactiveStrengthIndex(jumpHeightCm: number, contactTimeSeconds: number) {
  if (!Number.isFinite(contactTimeSeconds) || contactTimeSeconds <= 0) return 0;
  return (jumpHeightCm / 100) / contactTimeSeconds;
}

/**
 * Conservative IMU state machine for a phone fixed firmly at the athlete's waist.
 * The engine uses acceleration magnitude so it remains usable when phone orientation
 * changes slightly. It intentionally requires stable periods before arming a jump.
 * Thresholds are configurable and should be validated against a force plate/contact mat.
 */
export class JumpDetector {
  protocol: JumpProtocol;
  phase: JumpPhase = "ready";
  results: JumpResult[] = [];
  private stableSince = 0;
  private movementSince = 0;
  private flightSince = 0;
  private contactSince = 0;
  private lastTimestamp = 0;
  private filteredMagnitude = GRAVITY;
  private armed = false;

  constructor(protocol: JumpProtocol = "cmj") {
    this.protocol = protocol;
  }

  reset(protocol: JumpProtocol = this.protocol) {
    this.protocol = protocol;
    this.phase = "ready";
    this.results = [];
    this.stableSince = 0;
    this.movementSince = 0;
    this.flightSince = 0;
    this.contactSince = 0;
    this.lastTimestamp = 0;
    this.filteredMagnitude = GRAVITY;
    this.armed = false;
  }

  ingest(timestampMs: number, ax: number, ay: number, az: number): JumpResult | null {
    const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    this.filteredMagnitude = this.filteredMagnitude * 0.78 + magnitude * 0.22;
    const deviation = Math.abs(this.filteredMagnitude - GRAVITY);
    const stable = deviation < 0.65;
    const lowG = this.filteredMagnitude < 3.2;
    const impact = this.filteredMagnitude > 13.2;

    if (!this.lastTimestamp) this.lastTimestamp = timestampMs;
    this.lastTimestamp = timestampMs;

    if (stable) {
      if (!this.stableSince) this.stableSince = timestampMs;
      if (timestampMs - this.stableSince >= 500) this.armed = true;
    } else {
      this.stableSince = 0;
    }

    if (!this.armed) {
      this.phase = "ready";
      return null;
    }

    if (this.phase === "ready" && deviation > 1.05) {
      this.movementSince = timestampMs;
      this.phase = this.protocol === "dropJump" ? "flight" : "unweighting";
      if (this.protocol === "dropJump") this.flightSince = timestampMs;
      return null;
    }

    if (this.protocol !== "dropJump" && ["unweighting", "braking", "propulsion"].includes(this.phase)) {
      const elapsed = timestampMs - this.movementSince;
      if (elapsed > 70 && this.phase === "unweighting") this.phase = "braking";
      if (elapsed > 140 && this.phase === "braking") this.phase = "propulsion";
      if (lowG && elapsed > 170) {
        this.phase = "flight";
        this.flightSince = timestampMs;
      }
      return null;
    }

    if (this.phase === "flight" && impact) {
      const flightTime = Math.max(0, (timestampMs - this.flightSince) / 1000);
      // Reject vibration/steps and implausibly long events.
      if (flightTime < 0.18 || flightTime > 1.2) {
        this.phase = "stabilizing";
        this.armed = false;
        return null;
      }
      this.phase = this.protocol === "dropJump" ? "contact" : "landing";
      this.contactSince = timestampMs;
      if (this.protocol !== "dropJump") return this.finish(flightTime, timestampMs);
      return null;
    }

    // Drop Jump: first flight is the box-to-floor drop. Measure floor contact, then
    // the subsequent rebound flight. This prevents reporting the drop itself as JH.
    if (this.protocol === "dropJump" && this.phase === "contact" && lowG && timestampMs - this.contactSince > 70) {
      this.phase = "landing";
      this.flightSince = timestampMs;
      return null;
    }
    if (this.protocol === "dropJump" && this.phase === "landing" && impact) {
      const reboundFlight = Math.max(0, (timestampMs - this.flightSince) / 1000);
      const contactTime = Math.max(0, (this.flightSince - this.contactSince) / 1000);
      if (reboundFlight < 0.18 || reboundFlight > 1.2 || contactTime < 0.07 || contactTime > 0.8) {
        this.phase = "stabilizing";
        this.armed = false;
        return null;
      }
      return this.finish(reboundFlight, timestampMs, contactTime);
    }

    if (this.phase === "stabilizing" && stable) {
      this.phase = "ready";
      this.armed = false;
    }
    return null;
  }

  private finish(flightTime: number, timestampMs: number, contactTime?: number) {
    const jumpHeightCm = jumpHeightFromFlightTime(flightTime);
    const result: JumpResult = {
      protocol: this.protocol,
      flightTime,
      contactTime,
      jumpHeightCm,
      takeoffVelocity: takeoffVelocityFromFlightTime(flightTime),
      rsi: contactTime ? reactiveStrengthIndex(jumpHeightCm, contactTime) : undefined,
      timestamp: timestampMs,
    };
    this.results.push(result);
    this.phase = "stabilizing";
    this.armed = false;
    return result;
  }
}
