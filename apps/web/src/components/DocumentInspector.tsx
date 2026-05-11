import { useState } from 'react';
import { Link } from 'react-router';

import type { FeatureAst, ParameterAst, ScalarAstInput } from '@cad/authoring';
import type { ParameterDefinition } from '@cad/sdk';

interface DocumentInspectorProps {
  readonly parameter: ParameterAst | null;
  readonly feature: FeatureAst | null;
  readonly sourceIsValid: boolean;
  readonly onUpdateParameter: (
    id: string,
    name: string,
    definition: ParameterDefinition,
  ) => Promise<void>;
  readonly onUpdateFeature: (id: string, feature: FeatureAst) => Promise<void>;
  readonly onEnterSketchMode?: (featureId: string) => void;
}

export function DocumentInspector({
  parameter,
  feature,
  sourceIsValid,
  onUpdateParameter,
  onUpdateFeature,
  onEnterSketchMode,
}: DocumentInspectorProps): React.JSX.Element {
  if (parameter !== null) {
    return (
      <ParameterInspector
        key={parameter.id}
        parameter={parameter}
        sourceIsValid={sourceIsValid}
        onUpdateParameter={onUpdateParameter}
      />
    );
  }
  if (feature !== null) {
    return (
      <FeatureInspector
        key={feature.id}
        feature={feature}
        sourceIsValid={sourceIsValid}
        onUpdateFeature={onUpdateFeature}
        {...(onEnterSketchMode === undefined ? {} : { onEnterSketchMode })}
      />
    );
  }
  return (
    <section
      className="workspace-panel workspace-panel--inspector"
      data-testid="document-inspector-empty"
    >
      <div className="workspace-panel__header workspace-panel__header--compact">
        <div>
          <p className="workspace-panel__eyebrow">Inspector</p>
          <h2 className="workspace-panel__title">Nothing selected</h2>
        </div>
        <Link className="workspace-inline-link" to="/handbook/concepts/dual-write">
          ?
        </Link>
      </div>
      <p className="workspace-inline-note">
        Select a parameter or feature from the tree or editor to inspect and edit it.
      </p>
    </section>
  );
}

function ParameterInspector({
  parameter,
  sourceIsValid,
  onUpdateParameter,
}: {
  readonly parameter: ParameterAst;
  readonly sourceIsValid: boolean;
  readonly onUpdateParameter: (
    id: string,
    name: string,
    definition: ParameterDefinition,
  ) => Promise<void>;
}): React.JSX.Element {
  const [name, setName] = useState(parameter.name);
  const [mode, setMode] = useState<'expression' | 'number'>(
    'expression' in parameter.definition ? 'expression' : 'number',
  );
  const [value, setValue] = useState(
    String('value' in parameter.definition ? parameter.definition.value : 10),
  );
  const [expression, setExpression] = useState(
    'expression' in parameter.definition
      ? parameter.definition.expression
      : `${parameter.name} * 2`,
  );
  const [unit, setUnit] = useState(parameter.definition.unit);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const definition: ParameterDefinition =
      mode === 'expression'
        ? { kind: 'expression', expression, unit }
        : { kind: 'number', value: Number(value || '0'), unit };
    await onUpdateParameter(parameter.id, name, definition);
  }

  return (
    <section
      className="workspace-panel workspace-panel--inspector"
      data-testid="document-inspector-parameter"
    >
      <div className="workspace-panel__header workspace-panel__header--compact">
        <div>
          <p className="workspace-panel__eyebrow">Inspector</p>
          <h2 className="workspace-panel__title">{parameter.name}</h2>
        </div>
        <Link
          className="workspace-inline-link"
          to="/handbook/features/parameters"
          data-testid="parameter-inspector-help"
        >
          ?
        </Link>
      </div>
      <form className="inspector-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="inspector-form__field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!sourceIsValid}
            data-testid="document-inspector-parameter-name"
          />
        </label>
        <label className="inspector-form__field">
          <span className="inspector-form__label-with-help">
            Type
            <Link className="workspace-inline-link" to="/handbook/features/parameters">
              ?
            </Link>
          </span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as 'expression' | 'number')}
            disabled={!sourceIsValid}
            data-testid="document-inspector-parameter-mode"
          >
            <option value="number">Number</option>
            <option value="expression">Expression</option>
          </select>
        </label>
        {mode === 'number' ? (
          <label className="inspector-form__field">
            <span>Value</span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={!sourceIsValid}
              data-testid="document-inspector-parameter-value"
            />
          </label>
        ) : (
          <label className="inspector-form__field">
            <span className="inspector-form__label-with-help">
              Expression
              <Link className="workspace-inline-link" to="/handbook/concepts/expressions">
                ?
              </Link>
            </span>
            <input
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              disabled={!sourceIsValid}
              data-testid="document-inspector-parameter-expression"
            />
          </label>
        )}
        <label className="inspector-form__field">
          <span className="inspector-form__label-with-help">
            Unit
            <Link className="workspace-inline-link" to="/handbook/concepts/expressions">
              ?
            </Link>
          </span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value as ParameterDefinition['unit'])}
            disabled={!sourceIsValid}
            data-testid="document-inspector-parameter-unit"
          >
            <option value="mm">mm</option>
            <option value="deg">deg</option>
            <option value="rad">rad</option>
            <option value="count">count</option>
          </select>
        </label>
        <button
          type="submit"
          className="workspace-button workspace-button--primary"
          disabled={
            !sourceIsValid ||
            name.trim().length === 0 ||
            (mode === 'expression' ? expression.trim().length === 0 : false)
          }
          data-testid="document-inspector-save-parameter"
        >
          Apply parameter
        </button>
      </form>
    </section>
  );
}

function FeatureInspector({
  feature,
  sourceIsValid,
  onUpdateFeature,
  onEnterSketchMode,
}: {
  readonly feature: FeatureAst;
  readonly sourceIsValid: boolean;
  readonly onUpdateFeature: (id: string, feature: FeatureAst) => Promise<void>;
  readonly onEnterSketchMode?: (featureId: string) => void;
}): React.JSX.Element {
  const [id, setId] = useState(feature.id);
  const [plane, setPlane] = useState(feature.kind === 'sketch' ? (feature.plane ?? 'xy') : 'xy');
  const [padValues, setPadValues] = useState(() => createPadFormState(feature));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (feature.kind === 'sketch') {
      await onUpdateFeature(feature.id, {
        kind: 'sketch',
        id,
        plane,
        svg: feature.svg,
        geometry: feature.geometry,
        constraints: feature.constraints,
      });
      return;
    }
    await onUpdateFeature(feature.id, {
      kind: 'pad',
      id,
      sketch: padValues.sketch,
      length: parseScalarField(padValues.length),
      direction: padValues.direction,
    });
  }

  return (
    <section
      className="workspace-panel workspace-panel--inspector"
      data-testid="document-inspector-feature"
    >
      <div className="workspace-panel__header workspace-panel__header--compact">
        <div>
          <p className="workspace-panel__eyebrow">Inspector</p>
          <h2 className="workspace-panel__title">{feature.id}</h2>
        </div>
        <Link
          className="workspace-inline-link"
          to={feature.kind === 'pad' ? '/handbook/features/pad' : '/handbook/features/sketch'}
          data-testid="feature-inspector-help"
        >
          ?
        </Link>
      </div>
      <form className="inspector-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="inspector-form__field">
          <span>Id</span>
          <input
            value={id}
            onChange={(event) => setId(event.target.value)}
            disabled={!sourceIsValid}
          />
        </label>
        <label className="inspector-form__field">
          <span>Kind</span>
          <input value={feature.kind} disabled />
        </label>
        {feature.kind === 'sketch' ? (
          <>
            <label className="inspector-form__field">
              <span className="inspector-form__label-with-help">
                Plane
                <Link className="workspace-inline-link" to="/handbook/features/sketch">
                  ?
                </Link>
              </span>
              <select
                value={plane}
                onChange={(event) => setPlane(event.target.value as 'xy' | 'yz' | 'xz')}
                disabled={!sourceIsValid}
              >
                <option value="xy">xy</option>
                <option value="yz">yz</option>
                <option value="xz">xz</option>
              </select>
            </label>
            <button
              type="button"
              className="workspace-button workspace-button--secondary"
              onClick={() => onEnterSketchMode?.(feature.id)}
              data-testid="document-inspector-edit-sketch"
            >
              Edit sketch
            </button>
          </>
        ) : (
          <div className="inspector-form__group">
            <label className="inspector-form__field">
              <span>Sketch</span>
              <input
                value={padValues.sketch}
                onChange={(event) =>
                  setPadValues((current) => ({ ...current, sketch: event.target.value }))
                }
                disabled={!sourceIsValid}
              />
            </label>
            <ScalarField
              label="Length"
              value={padValues.length}
              onChange={(next) => setPadValues((current) => ({ ...current, length: next }))}
              disabled={!sourceIsValid}
            />
            <label className="inspector-form__field">
              <span>Direction</span>
              <select
                value={padValues.direction}
                onChange={(event) =>
                  setPadValues((current) => ({
                    ...current,
                    direction: event.target.value as PadFormState['direction'],
                  }))
                }
                disabled={!sourceIsValid}
              >
                <option value="up">up</option>
                <option value="down">down</option>
                <option value="symmetric">symmetric</option>
              </select>
            </label>
          </div>
        )}
        <button
          type="submit"
          className="workspace-button workspace-button--primary"
          disabled={!sourceIsValid || id.trim().length === 0}
          data-testid="document-inspector-save-feature"
        >
          Apply feature
        </button>
      </form>
    </section>
  );
}

type ScalarFieldState = {
  readonly kind: 'expression' | 'literal' | 'reference';
  readonly value: string;
  readonly unit: 'count' | 'deg' | 'mm' | 'rad';
};

type PadFormState = {
  readonly sketch: string;
  readonly length: ScalarFieldState;
  readonly direction: 'up' | 'down' | 'symmetric';
};

function ScalarField({
  label,
  value,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly value: ScalarFieldState;
  readonly onChange: (value: ScalarFieldState) => void;
  readonly disabled: boolean;
}): React.JSX.Element {
  return (
    <fieldset className="inspector-form__fieldset">
      <legend>{label}</legend>
      <label className="inspector-form__field">
        <span>Input</span>
        <select
          value={value.kind}
          onChange={(event) =>
            onChange({ ...value, kind: event.target.value as ScalarFieldState['kind'] })
          }
          disabled={disabled}
        >
          <option value="literal">Literal</option>
          <option value="reference">Reference</option>
          <option value="expression">Expression</option>
        </select>
      </label>
      <label className="inspector-form__field">
        <span>{scalarFieldLabel(value.kind)}</span>
        <input
          value={value.value}
          onChange={(event) => onChange({ ...value, value: event.target.value })}
          disabled={disabled}
        />
      </label>
      {value.kind !== 'reference' && (
        <label className="inspector-form__field">
          <span>Unit</span>
          <select
            value={value.unit}
            onChange={(event) =>
              onChange({ ...value, unit: event.target.value as ScalarFieldState['unit'] })
            }
            disabled={disabled}
          >
            <option value="mm">mm</option>
            <option value="deg">deg</option>
            <option value="rad">rad</option>
            <option value="count">count</option>
          </select>
        </label>
      )}
    </fieldset>
  );
}

function createPadFormState(feature: FeatureAst): PadFormState {
  if (feature.kind !== 'pad') {
    return {
      sketch: 'sketch_1',
      length: { kind: 'literal', value: '30', unit: 'mm' },
      direction: 'up',
    };
  }
  return {
    sketch: feature.sketch,
    length: toScalarField(feature.length),
    direction: feature.direction,
  };
}

function toScalarField(value: ScalarAstInput): ScalarFieldState {
  switch (value.kind) {
    case 'literal': {
      return { kind: 'literal', value: String(value.value), unit: value.unit };
    }
    case 'reference': {
      return { kind: 'reference', value: value.name, unit: 'mm' };
    }
    case 'expression': {
      return { kind: 'expression', value: value.source, unit: value.unit };
    }
  }
}

function parseScalarField(field: ScalarFieldState): ScalarAstInput {
  if (field.kind === 'reference') {
    return { kind: 'reference', name: field.value };
  }
  if (field.kind === 'expression') {
    return { kind: 'expression', source: field.value, unit: field.unit };
  }
  return { kind: 'literal', value: Number(field.value || '0'), unit: field.unit };
}

function scalarFieldLabel(kind: ScalarFieldState['kind']): string {
  if (kind === 'reference') {
    return 'Name';
  }
  if (kind === 'expression') {
    return 'Expression';
  }
  return 'Value';
}
