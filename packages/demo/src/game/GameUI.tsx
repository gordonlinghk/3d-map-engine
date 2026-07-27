import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { ThreeMapRenderer } from '@map-engine/three';
import type { FactionStatus, GameController, GameSelection, GameUiState } from '../gameSetup';
import './gameUi.css';

export type GameUIProps = {
  controller: GameController;
  renderer: ThreeMapRenderer;
};

/**
 * Full-screen game HUD driven entirely by `GameController`'s observable
 * snapshot. Replaces `AtlasUI` wholesale in game mode (see App.tsx) — this
 * component and its CSS are self-contained and never touch `@map-engine/ui`.
 */
export function GameUI({ controller, renderer }: GameUIProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const scenario = controller.scenario;
  const factionName = useMemo(() => {
    const byId = new Map(scenario.factions.map((f) => [f.id, f.name]));
    return (id: string | null): string => (id !== null ? (byId.get(id) ?? id) : '中立');
  }, [scenario]);
  // Lobby-only "兵力" preview: `FactionStatus.unitCount` is always 0 before
  // `start()` spawns anything (by gameSetup's own documented contract), so
  // compute the scenario's starting troop strength directly instead —
  // cities.length * unitsPerCity per faction, from the scenario itself.
  const startingUnits = useMemo(
    () => new Map(scenario.factions.map((f) => [f.id, f.cities.length * f.unitsPerCity])),
    [scenario],
  );

  const showHud = state.phase === 'playing' || state.phase === 'won' || state.phase === 'lost';

  return (
    <div className="game-ui">
      {state.phase === 'lobby' && (
        <LobbyOverlay
          controller={controller}
          state={state}
          scenarioName={scenario.name}
          blurb={scenario.blurb}
          startingUnits={startingUnits}
        />
      )}

      {showHud && (
        <>
          <TopBar state={state} totalSites={state.totalSites} />
          {state.phase === 'playing' && state.selection && (
            <SelectedPanel
              controller={controller}
              selection={state.selection}
              trainCost={state.trainCost}
              canTrain={state.canTrain}
              factionName={factionName}
            />
          )}
          <CityLabels controller={controller} />
          <CommandPing state={state} renderer={renderer} />
        </>
      )}

      {(state.phase === 'won' || state.phase === 'lost') && (
        <EndOverlay
          won={state.phase === 'won'}
          victoryText={scenario.victoryText}
          defeatText={scenario.defeatText}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function LobbyOverlay({
  controller,
  state,
  scenarioName,
  blurb,
  startingUnits,
}: {
  controller: GameController;
  state: GameUiState;
  scenarioName: string;
  blurb: string;
  startingUnits: Map<string, number>;
}) {
  return (
    <div className="game-backdrop">
      <div className="game-lobby" data-testid="game-lobby">
        <h1 className="game-lobby-title">{scenarioName}</h1>
        <p className="game-lobby-blurb">{blurb}</p>
        <div className="game-faction-grid">
          {state.factions.map((f) => (
            <FactionCard
              key={f.id}
              faction={f}
              startingUnits={startingUnits.get(f.id) ?? f.unitCount}
              onStart={() => controller.start(f.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FactionCard({
  faction,
  startingUnits,
  onStart,
}: {
  faction: FactionStatus;
  startingUnits: number;
  onStart: () => void;
}) {
  return (
    <div className="game-faction-card" data-testid={`game-faction-card-${faction.id}`}>
      <div className="game-faction-card-head">
        <span className="game-color-dot" style={{ background: faction.color }} />
        <span className="game-faction-card-name">{faction.name}</span>
      </div>
      <div className="game-faction-card-stats">
        起始城池數 {faction.cityCount} · 兵力 {startingUnits}
      </div>
      <button type="button" className="game-btn game-btn-primary" onClick={onStart}>
        率領{faction.name}開戰
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({ state, totalSites }: { state: GameUiState; totalSites: number }) {
  return (
    <div className="game-topbar" data-testid="game-topbar">
      <div className="game-topbar-chips">
        {state.factions.map((f) => (
          <div
            key={f.id}
            className={`game-chip${f.isPlayer ? ' game-chip-player' : ''}`}
            data-testid={`game-faction-chip-${f.id}`}
          >
            <span className="game-color-dot" style={{ background: f.color }} />
            <span className="game-chip-name">{f.name}</span>
            {f.isPlayer && <span className="game-chip-badge">你</span>}
            <span className="game-chip-stat">
              城 {f.cityCount}/{totalSites}
            </span>
            {f.isPlayer && <span className="game-chip-stat">💰{f.resources}</span>}
          </div>
        ))}
      </div>
      <div className="game-topbar-hint">點選單位 → 點地面行軍 · 點城池睇詳情 · Esc 取消</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selected panel
// ---------------------------------------------------------------------------

function SelectedPanel({
  controller,
  selection,
  trainCost,
  canTrain,
  factionName,
}: {
  controller: GameController;
  selection: NonNullable<GameSelection>;
  trainCost: number;
  canTrain: boolean;
  factionName: (id: string | null) => string;
}) {
  return (
    <div className="game-selected-panel" data-testid="game-selected-panel">
      {selection.kind === 'unit' ? (
        <>
          <div className="game-selected-title">{factionName(selection.factionId)}單位</div>
          <div className="game-selected-body">
            兵力 {Math.max(0, Math.round(selection.hp))} / {selection.maxHp}
          </div>
        </>
      ) : (
        <>
          <div className="game-selected-title">{selection.name}</div>
          <div className="game-selected-body">城主:{factionName(selection.owner)}</div>
          {selection.isPlayerOwned && (
            <button
              type="button"
              className="game-btn game-btn-primary"
              data-testid="game-train-btn"
              disabled={!canTrain}
              onClick={() => controller.train()}
            >
              練兵({trainCost})
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// City labels — positioned via a dedicated rAF loop, never through React
// state, so a moving camera never triggers a re-render.
// ---------------------------------------------------------------------------

function CityLabels({ controller }: { controller: GameController }) {
  // The scenario's city set never changes at runtime — read it once for the
  // DOM node list (id/name); per-frame position/owner updates are written
  // straight to the refs below.
  const initialLabels = useMemo(() => controller.getCityLabels(), [controller]);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const dotRefs = useRef(new Map<string, HTMLSpanElement>());

  useEffect(() => {
    let rafId = 0;
    const loop = (): void => {
      for (const label of controller.getCityLabels()) {
        const node = nodeRefs.current.get(label.cityId);
        if (!node) continue;
        if (!label.visible) {
          node.style.display = 'none';
        } else {
          node.style.display = '';
          node.style.transform = `translate(${label.x}px, ${label.y}px) translate(-50%, -100%)`;
        }
        const dot = dotRefs.current.get(label.cityId);
        if (dot) dot.style.background = label.ownerColor;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [controller]);

  return (
    <div className="game-city-labels">
      {initialLabels.map((label) => (
        <div
          key={label.cityId}
          ref={(el) => {
            if (el) nodeRefs.current.set(label.cityId, el);
            else nodeRefs.current.delete(label.cityId);
          }}
          data-testid={`game-city-label-${label.cityId}`}
          className="game-city-label"
          style={{
            display: label.visible ? undefined : 'none',
            transform: `translate(${label.x}px, ${label.y}px) translate(-50%, -100%)`,
          }}
        >
          <span
            ref={(el) => {
              if (el) dotRefs.current.set(label.cityId, el);
              else dotRefs.current.delete(label.cityId);
            }}
            className="game-city-label-dot"
            style={{ background: label.ownerColor }}
          />
          <span className="game-city-label-name">{label.name}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command ping
// ---------------------------------------------------------------------------

const PING_LIFETIME_MS = 650;

type Ping = { id: number; x: number; y: number };

function CommandPing({ state, renderer }: { state: GameUiState; renderer: ThreeMapRenderer }) {
  const [pings, setPings] = useState<Ping[]>([]);
  const lastSeqRef = useRef<number | null>(null);
  const nextIdRef = useRef(0);
  const timeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const cmd = state.lastCommand;
    if (!cmd || lastSeqRef.current === cmd.seq) return;
    lastSeqRef.current = cmd.seq;
    // Ground height is unknown from {x, z} alone — project at y=0. Camera
    // drift over the ~600ms lifetime is acceptable (per spec); the ping is a
    // fire-and-forget acknowledgement, not a tracked marker.
    const screen = renderer.projectToScreen({ x: cmd.x, y: 0, z: cmd.z });
    if (!screen.visible) return;
    const id = nextIdRef.current++;
    setPings((prev) => [...prev, { id, x: screen.x, y: screen.y }]);
    const timeout = setTimeout(() => {
      timeoutsRef.current.delete(timeout);
      setPings((prev) => prev.filter((p) => p.id !== id));
    }, PING_LIFETIME_MS);
    timeoutsRef.current.add(timeout);
  }, [state.lastCommand, renderer]);

  // Clear any pending removals on unmount only — a new command arriving
  // before the previous ping's timeout fires must not cancel that timeout.
  useEffect(
    () => () => {
      for (const t of timeoutsRef.current) clearTimeout(t);
      timeoutsRef.current.clear();
    },
    [],
  );

  return (
    <div className="game-command-pings">
      {pings.map((p) => (
        <span
          key={p.id}
          className="game-command-ping"
          style={{ left: p.x, top: p.y } as CSSProperties}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// End overlay
// ---------------------------------------------------------------------------

function EndOverlay({
  won,
  victoryText,
  defeatText,
}: {
  won: boolean;
  victoryText: string;
  defeatText: string;
}) {
  return (
    <div className="game-backdrop">
      <div className="game-end-overlay" data-testid="game-end-overlay">
        <h1 className="game-end-heading">{won ? '勝利' : '敗北'}</h1>
        <p className="game-end-text">{won ? victoryText : defeatText}</p>
        <button
          type="button"
          className="game-btn game-btn-primary"
          data-testid="game-restart-btn"
          onClick={() => window.location.reload()}
        >
          再玩一局
        </button>
      </div>
    </div>
  );
}
