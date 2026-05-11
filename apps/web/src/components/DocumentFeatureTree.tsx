import { Link } from 'react-router';

import type { AstNodeSelection, DocumentAST } from '@cad/authoring';

interface DocumentFeatureTreeProps {
  readonly ast: DocumentAST | null;
  readonly selection: AstNodeSelection | null;
  readonly sourceIsValid: boolean;
  readonly onSelect: (selection: AstNodeSelection) => void;
  readonly onAddParameter: () => void;
  readonly onAddPad: () => void;
  readonly onAddSketch: () => void;
  readonly onRemoveParameter: (id: string) => void;
  readonly onRemoveFeature: (id: string) => void;
  readonly onMoveFeature: (id: string, direction: -1 | 1) => void;
}

export function DocumentFeatureTree({
  ast,
  selection,
  sourceIsValid,
  onSelect,
  onAddParameter,
  onAddPad,
  onAddSketch,
  onRemoveParameter,
  onRemoveFeature,
  onMoveFeature,
}: DocumentFeatureTreeProps): React.JSX.Element {
  const features = ast?.features ?? [];
  const nestedSketchIds = new Set(
    features.filter((feature) => feature.kind === 'pad').map((feature) => feature.sketch),
  );
  return (
    <section
      className="workspace-panel workspace-panel--tree"
      data-testid="document-authoring-tree"
    >
      <div className="workspace-panel__header workspace-panel__header--compact">
        <div>
          <p className="workspace-panel__eyebrow">Dual-write</p>
          <h2 className="workspace-panel__title">Feature tree</h2>
        </div>
        <Link
          className="workspace-inline-link"
          to="/handbook/concepts/dual-write"
          data-testid="authoring-tree-help"
        >
          ?
        </Link>
      </div>

      <div className="authoring-tree__section">
        <div className="authoring-tree__section-header">
          <h3 className="authoring-tree__section-title">Parameters</h3>
          <div className="authoring-tree__header-actions">
            <Link className="workspace-inline-link" to="/handbook/features/parameters">
              ?
            </Link>
            <button
              type="button"
              className="workspace-inline-link"
              onClick={onAddParameter}
              disabled={!sourceIsValid}
              data-testid="authoring-add-parameter"
            >
              Add parameter
            </button>
          </div>
        </div>
        <ul className="authoring-tree__list" data-testid="authoring-parameter-list">
          {(ast?.parameters ?? []).map((parameter) => {
            const active = selection?.kind === 'parameter' && selection.id === parameter.id;
            return (
              <li key={parameter.id} className="authoring-tree__item">
                <button
                  type="button"
                  className={
                    active
                      ? 'authoring-tree__node authoring-tree__node--active'
                      : 'authoring-tree__node'
                  }
                  onClick={() => onSelect({ kind: 'parameter', id: parameter.id })}
                  data-testid={`authoring-parameter-${parameter.id}`}
                >
                  <span className="authoring-tree__node-label">{parameter.name}</span>
                  <span className="authoring-tree__node-meta">
                    {'expression' in parameter.definition ? 'Expression' : 'Number'}
                  </span>
                </button>
                <button
                  type="button"
                  className="authoring-tree__action"
                  onClick={() => onRemoveParameter(parameter.id)}
                  disabled={!sourceIsValid}
                  aria-label={`Remove ${parameter.name}`}
                  data-testid={`authoring-remove-parameter-${parameter.id}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="authoring-tree__section">
        <div className="authoring-tree__section-header">
          <h3 className="authoring-tree__section-title">Body</h3>
          <div className="authoring-tree__header-actions">
            <Link className="workspace-inline-link" to="/handbook/features/body">
              ?
            </Link>
            <button
              type="button"
              className="workspace-inline-link"
              onClick={onAddPad}
              disabled={!sourceIsValid}
              data-testid="authoring-add-pad"
            >
              Add pad
            </button>
            <button
              type="button"
              className="workspace-inline-link"
              onClick={onAddSketch}
              disabled={!sourceIsValid}
              data-testid="authoring-add-sketch"
            >
              Add sketch
            </button>
          </div>
        </div>
        <ol className="authoring-tree__list" data-testid="authoring-feature-list">
          {features.map((feature, index) => {
            if (feature.kind === 'sketch' && nestedSketchIds.has(feature.id)) {
              return null;
            }
            const active = selection?.kind === 'feature' && selection.id === feature.id;
            const disableMoveUp = index === 0 || !sourceIsValid;
            const disableMoveDown = index === (ast?.features.length ?? 1) - 1 || !sourceIsValid;
            const nestedSketch =
              feature.kind === 'pad'
                ? (features.find(
                    (candidate) => candidate.kind === 'sketch' && candidate.id === feature.sketch,
                  ) ?? null)
                : null;
            return (
              <li key={feature.id} className="authoring-tree__item">
                <button
                  type="button"
                  className={
                    active
                      ? 'authoring-tree__node authoring-tree__node--active'
                      : 'authoring-tree__node'
                  }
                  onClick={() => onSelect({ kind: 'feature', id: feature.id })}
                  data-testid={`authoring-feature-${feature.id}`}
                >
                  <span className="authoring-tree__node-label">{feature.id}</span>
                  <span className="authoring-tree__node-meta">{feature.kind}</span>
                </button>
                <div className="authoring-tree__controls">
                  <button
                    type="button"
                    className="authoring-tree__action"
                    onClick={() => onMoveFeature(feature.id, -1)}
                    disabled={disableMoveUp}
                    aria-label={`Move ${feature.id} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="authoring-tree__action"
                    onClick={() => onMoveFeature(feature.id, 1)}
                    disabled={disableMoveDown}
                    aria-label={`Move ${feature.id} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="authoring-tree__action"
                    onClick={() => onRemoveFeature(feature.id)}
                    disabled={!sourceIsValid}
                    aria-label={`Remove ${feature.id}`}
                    data-testid={`authoring-remove-feature-${feature.id}`}
                  >
                    ×
                  </button>
                </div>
                {nestedSketch === null ? null : (
                  <div className="authoring-tree__child">
                    <button
                      type="button"
                      className={
                        selection?.kind === 'feature' && selection.id === nestedSketch.id
                          ? 'authoring-tree__node authoring-tree__node--active'
                          : 'authoring-tree__node'
                      }
                      onClick={() => onSelect({ kind: 'feature', id: nestedSketch.id })}
                      data-testid={`authoring-feature-${nestedSketch.id}`}
                    >
                      <span className="authoring-tree__node-label">{nestedSketch.id}</span>
                      <span className="authoring-tree__node-meta">sketch</span>
                    </button>
                    <button
                      type="button"
                      className="authoring-tree__action"
                      onClick={() => onRemoveFeature(nestedSketch.id)}
                      disabled={!sourceIsValid}
                      aria-label={`Remove ${nestedSketch.id}`}
                      data-testid={`authoring-remove-feature-${nestedSketch.id}`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
