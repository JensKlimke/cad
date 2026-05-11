import { serializeSketchSvg, solveRectangleSketch, type SketchConstraintValue } from '@cad/sketch';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { SketchFeatureAst } from '@cad/authoring';
import type { ResolvedParameter } from '@cad/protocol';

interface SketchModePanelProps {
  readonly feature: SketchFeatureAst;
  readonly parameters: readonly { readonly name: string }[];
  readonly resolvedParameters: readonly ResolvedParameter[];
  readonly onCommit: (feature: SketchFeatureAst) => Promise<void>;
  readonly onExit: () => void;
}

interface DragState {
  readonly startX: number;
  readonly startY: number;
}

export function SketchModePanel({
  feature,
  parameters,
  resolvedParameters,
  onCommit,
  onExit,
}: SketchModePanelProps): React.JSX.Element {
  const svgReference = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draftGeometry, setDraftGeometry] = useState(feature.geometry);
  const [draftConstraints, setDraftConstraints] = useState(feature.constraints);
  const [status, setStatus] = useState(
    feature.constraints.kind === 'rectangle' ? 'fully_constrained' : 'under_constrained',
  );
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
  const [committing, setCommitting] = useState(false);
  const [previewGeometry, setPreviewGeometry] = useState(feature.geometry);

  const resolvedParameterMap = useMemo(
    () =>
      Object.fromEntries(
        resolvedParameters.map((parameter) => [
          parameter.name,
          { value: parameter.value, unit: parameter.unit, source: parameter.source },
        ]),
      ),
    [resolvedParameters],
  );

  useEffect(() => {
    setDraftGeometry(feature.geometry);
    setPreviewGeometry(feature.geometry);
    setDraftConstraints(feature.constraints);
  }, [feature]);

  useEffect(() => {
    let cancelled = false;
    void solveRectangleSketch(
      {
        plane: feature.plane,
        geometry: draftGeometry,
        constraints: draftConstraints,
      },
      {
        parameters: resolvedParameterMap,
      },
    )
      .then((artifact) => {
        if (cancelled) {
          return;
        }
        setStatus(artifact.status);
        setDiagnostics(artifact.diagnostics);
        setPreviewGeometry(artifact.geometry);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus('over_constrained');
        setDiagnostics([error instanceof Error ? error.message : String(error)]);
        setPreviewGeometry(draftGeometry);
      });
    return () => {
      cancelled = true;
    };
  }, [draftConstraints, draftGeometry, feature.plane, resolvedParameterMap]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && drag === null && !committing) {
        onExit();
      }
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [committing, drag, onExit]);

  async function commitRectangle(
    nextGeometry: SketchFeatureAst['geometry'],
    nextConstraints: SketchFeatureAst['constraints'],
  ): Promise<void> {
    setCommitting(true);
    try {
      const solved = await solveRectangleSketch(
        {
          plane: feature.plane,
          geometry: nextGeometry,
          constraints: nextConstraints,
        },
        {
          parameters: resolvedParameterMap,
        },
      );
      setStatus(solved.status);
      setDiagnostics(solved.diagnostics);
      setDraftGeometry(solved.geometry);
      setPreviewGeometry(solved.geometry);
      setDraftConstraints(nextConstraints);
      await onCommit({
        ...feature,
        plane: solved.plane,
        svg: solved.svg,
        geometry: solved.geometry,
        constraints: nextConstraints,
      });
    } finally {
      setCommitting(false);
    }
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>): void {
    if (event.button !== 0) {
      return;
    }
    const point = getCanvasPoint(event, svgReference.current);
    if (point === null) {
      return;
    }
    setDrag(point);
    setPreviewGeometry({
      kind: 'rectangle',
      x: point.startX,
      y: point.startY,
      width: 1,
      height: 1,
    });
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (drag === null) {
      return;
    }
    const point = getCanvasPoint(event, svgReference.current);
    if (point === null) {
      return;
    }
    setPreviewGeometry(toRectangle(drag.startX, drag.startY, point.startX, point.startY));
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>): void {
    if (drag === null) {
      return;
    }
    const point = getCanvasPoint(event, svgReference.current);
    setDrag(null);
    if (point === null) {
      return;
    }
    const geometry = toRectangle(drag.startX, drag.startY, point.startX, point.startY);
    const constraints = {
      ...draftConstraints,
      width: { kind: 'literal', value: geometry.width, unit: 'mm' } as const,
      height: { kind: 'literal', value: geometry.height, unit: 'mm' } as const,
    };
    void commitRectangle(geometry, constraints);
  }

  function updateConstraint(axis: 'width' | 'height', value: SketchConstraintValue): void {
    setDraftConstraints((current) => ({
      ...current,
      [axis]: value,
    }));
  }

  async function applyDimensionBindings(): Promise<void> {
    await commitRectangle(draftGeometry, draftConstraints);
  }

  return (
    <section className="sketch-mode" data-testid="sketch-mode">
      <header className="sketch-mode__header">
        <div>
          <p className="workspace-panel__eyebrow">Sketch mode</p>
          <h2 className="workspace-panel__title">Rectangle sketch on {feature.plane}</h2>
          <p className="workspace-inline-note">
            Drag in the canvas to redraw the rectangle. Width and height bindings persist into
            source.
          </p>
        </div>
        <div className="workspace-inline-actions">
          <button
            type="button"
            className="workspace-button workspace-button--ghost"
            onClick={() => void applyDimensionBindings()}
            disabled={committing}
            data-testid="sketch-apply-bindings"
          >
            Apply dimensions
          </button>
          <button
            type="button"
            className="workspace-button workspace-button--secondary"
            onClick={onExit}
            disabled={drag !== null || committing}
            data-testid="sketch-exit"
          >
            Exit sketch
          </button>
        </div>
      </header>
      <div className="sketch-mode__grid">
        <div className="sketch-mode__canvas-card">
          <svg
            ref={svgReference}
            className="sketch-mode__canvas"
            viewBox={computeViewBox(previewGeometry)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            data-testid="sketch-canvas"
          >
            <defs>
              <pattern id="sketch-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path
                  d="M 10 0 L 0 0 0 10"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect x={-400} y={-400} width={800} height={800} fill="url(#sketch-grid)" />
            <line x1={-400} y1={0} x2={400} y2={0} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <line x1={0} y1={-400} x2={0} y2={400} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <rect
              x={previewGeometry.x}
              y={previewGeometry.y}
              width={previewGeometry.width}
              height={previewGeometry.height}
              fill="rgba(128, 214, 255, 0.12)"
              stroke="rgba(128, 214, 255, 0.95)"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <div className="sketch-mode__sidebar">
          <ConstraintField
            axis="width"
            value={draftConstraints.width}
            parameterNames={parameters.map((parameter) => parameter.name)}
            onChange={(value) => updateConstraint('width', value)}
          />
          <ConstraintField
            axis="height"
            value={draftConstraints.height}
            parameterNames={parameters.map((parameter) => parameter.name)}
            onChange={(value) => updateConstraint('height', value)}
          />
          <dl className="workspace-meta workspace-meta--compact">
            <div className="workspace-meta__row">
              <dt>Status</dt>
              <dd data-testid="sketch-status">{status.replaceAll('_', ' ')}</dd>
            </div>
            <div className="workspace-meta__row">
              <dt>Preview</dt>
              <dd data-testid="sketch-preview-size">
                {Math.round(previewGeometry.width)} × {Math.round(previewGeometry.height)} mm
              </dd>
            </div>
          </dl>
          {diagnostics.length > 0 && (
            <ul className="sketch-mode__diagnostics">
              {diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          )}
          <pre className="sketch-mode__source">
            {serializeSketchSvg({
              plane: feature.plane,
              geometry: previewGeometry,
              constraints: draftConstraints,
            })}
          </pre>
        </div>
      </div>
    </section>
  );
}

function ConstraintField({
  axis,
  value,
  parameterNames,
  onChange,
}: {
  readonly axis: 'width' | 'height';
  readonly value: SketchConstraintValue;
  readonly parameterNames: readonly string[];
  readonly onChange: (value: SketchConstraintValue) => void;
}): React.JSX.Element {
  const axisPrefix = `sketch-${axis}`;
  return (
    <fieldset className="inspector-form__fieldset" data-testid={`${axisPrefix}-fieldset`}>
      <legend>{axis === 'width' ? 'Width' : 'Height'}</legend>
      <label className="inspector-form__field">
        <span>Binding</span>
        <select
          value={value.kind}
          data-testid={`${axisPrefix}-binding`}
          onChange={(event) => {
            const nextKind = event.target.value as SketchConstraintValue['kind'];
            if (nextKind === 'literal') {
              onChange({ kind: 'literal', value: 10, unit: 'mm' });
              return;
            }
            if (nextKind === 'reference') {
              onChange({ kind: 'reference', name: parameterNames[0] ?? 'width' });
              return;
            }
            onChange({ kind: 'expression', source: `${axis}Param`, unit: 'mm' });
          }}
        >
          <option value="literal">Literal</option>
          <option value="reference">Parameter</option>
          <option value="expression">Expression</option>
        </select>
      </label>
      {value.kind === 'literal' && (
        <label className="inspector-form__field">
          <span>Value</span>
          <input
            value={String(value.value)}
            data-testid={`${axisPrefix}-literal`}
            onChange={(event) => onChange({ ...value, value: Number(event.target.value || '0') })}
          />
        </label>
      )}
      {value.kind === 'reference' && (
        <label className="inspector-form__field">
          <span>Parameter</span>
          <select
            value={value.name}
            data-testid={`${axisPrefix}-reference`}
            onChange={(event) => onChange({ kind: 'reference', name: event.target.value })}
          >
            {parameterNames.length === 0 ? (
              <option value="width">width</option>
            ) : (
              parameterNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </select>
        </label>
      )}
      {value.kind === 'expression' && (
        <label className="inspector-form__field">
          <span>Expression</span>
          <input
            value={value.source}
            data-testid={`${axisPrefix}-expression`}
            onChange={(event) => onChange({ ...value, source: event.target.value })}
          />
        </label>
      )}
    </fieldset>
  );
}

function getCanvasPoint(
  event: React.PointerEvent<SVGSVGElement>,
  element: SVGSVGElement | null,
): DragState | null {
  if (element === null) {
    return null;
  }
  const bounds = element.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    return null;
  }
  const viewBox = element.viewBox.baseVal;
  const x = viewBox.x + ((event.clientX - bounds.left) / bounds.width) * viewBox.width;
  const y = viewBox.y + ((event.clientY - bounds.top) / bounds.height) * viewBox.height;
  return {
    startX: Math.round(x),
    startY: Math.round(y),
  };
}

function toRectangle(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): SketchFeatureAst['geometry'] {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    kind: 'rectangle',
    x,
    y,
    width: Math.max(1, Math.abs(endX - startX)),
    height: Math.max(1, Math.abs(endY - startY)),
  };
}

function computeViewBox(geometry: SketchFeatureAst['geometry']): string {
  const margin = 30;
  const x = Math.min(-40, geometry.x - margin);
  const y = Math.min(-40, geometry.y - margin);
  const width = Math.max(geometry.x + geometry.width + margin - x, 200);
  const height = Math.max(geometry.y + geometry.height + margin - y, 160);
  return `${x} ${y} ${width} ${height}`;
}
