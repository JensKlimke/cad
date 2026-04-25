export interface SdkOpParameterDoc {
  readonly name: string;
  readonly description: string;
}

export interface SdkOpDocMetadata {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly handbookPath: `/handbook/${string}`;
  readonly parameters: readonly SdkOpParameterDoc[];
}

export const docMetadata = {
  defineDocument: {
    id: 'defineDocument',
    title: 'Define document',
    description: 'Create the canonical executable TypeScript document definition.',
    handbookPath: '/handbook/features/define-document',
    parameters: [
      { name: 'parameters', description: 'Document parameter collection built with parameters().' },
      { name: 'body', description: 'Ordered feature body built with body().' },
    ],
  },
  parameters: {
    id: 'parameters',
    title: 'Parameters',
    description: 'Declare typed document parameters and expressions.',
    handbookPath: '/handbook/features/parameters',
    parameters: [
      { name: 'entries', description: 'Named parameter definitions keyed by parameter name.' },
    ],
  },
  body: {
    id: 'body',
    title: 'Body',
    description: 'Declare an ordered feature body for evaluation.',
    handbookPath: '/handbook/features/body',
    parameters: [
      { name: 'features', description: 'Ordered features to evaluate for the document body.' },
    ],
  },
  pad: {
    id: 'pad',
    title: 'Pad',
    description: 'Extrude a referenced sketch into a solid along its plane normal.',
    handbookPath: '/handbook/features/pad',
    parameters: [
      { name: 'id', description: 'Stable feature identifier used by the authoring layer and runtime.' },
      { name: 'sketch', description: 'Referenced sketch feature used as the profile for the extrusion.' },
      { name: 'length', description: 'Extrusion length as a literal, expression, or parameter reference.' },
      { name: 'direction', description: 'Extrusion direction relative to the sketch plane normal.' },
    ],
  },
  sketch: {
    id: 'sketch',
    title: 'Sketch',
    description: 'Declare a persisted rectangle-first sketch feature anchored to a datum plane.',
    handbookPath: '/handbook/features/sketch',
    parameters: [
      { name: 'id', description: 'Stable feature identifier used by the authoring layer and runtime.' },
      { name: 'plane', description: 'Datum plane used for the persisted sketch.' },
      { name: 'svg', description: 'Canonical persisted SVG for the supported sketch subset.' },
      { name: 'constraints', description: 'Rectangle-first constraint payload, including width and height bindings.' },
    ],
  },
} as const satisfies Readonly<Record<string, SdkOpDocMetadata>>;

export const ops = Object.values(docMetadata).map((entry) => entry.id);

export type SdkOpId = typeof ops[number];
