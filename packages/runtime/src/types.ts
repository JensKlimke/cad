import type { ParameterEvaluationResult, Quantity } from '@cad/expr';
import type { RectangleSketchConstraints, RectangleSketchGeometry, SketchConstraintStatus, SketchPlane } from '@cad/sketch';

export interface RuntimeOptions {
  readonly timeoutMs?: number;
  readonly memoryMb?: number;
}

export interface RuntimeDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly range?: {
    readonly start: number;
    readonly end: number;
  };
  readonly path?: readonly string[];
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

export interface RuntimePadFeatureResult {
  readonly id: string;
  readonly kind: 'pad';
  readonly inputHash: string;
  readonly cached: boolean;
  readonly pad: {
    readonly sketch: string;
    readonly length: number;
    readonly direction: 'up' | 'down' | 'symmetric';
  };
}

export interface RuntimeSketchFeatureResult {
  readonly id: string;
  readonly kind: 'sketch';
  readonly inputHash: string;
  readonly cached: boolean;
  readonly sketch: {
    readonly plane: SketchPlane;
    readonly svg: string;
    readonly geometry: RectangleSketchGeometry;
    readonly constraints: RectangleSketchConstraints;
    readonly dimensions: {
      readonly width: number;
      readonly height: number;
    };
    readonly status: SketchConstraintStatus;
    readonly diagnostics: readonly string[];
  };
}

export type RuntimeFeatureResult = RuntimePadFeatureResult | RuntimeSketchFeatureResult;

export interface JsonTessellation {
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly indices: readonly number[];
  readonly metadata: {
    readonly hash: string;
    readonly triangleCount: number;
    readonly vertexCount: number;
    readonly bbox: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
  };
}

export interface RuntimeBuildResult {
  readonly documentHash: string;
  readonly parameters: ParameterEvaluationResult['values'];
  readonly parameterOrder: readonly string[];
  readonly features: readonly RuntimeFeatureResult[];
  readonly tessellation: JsonTessellation | null;
}

export interface WorkerSuccessMessage {
  readonly ok: true;
  readonly result: RuntimeBuildResult;
}

export interface WorkerFailureMessage {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly diagnostics: readonly RuntimeDiagnostic[];
  };
}

export type WorkerMessage = WorkerSuccessMessage | WorkerFailureMessage;

export interface ResolvedRuntimeContext {
  readonly parameters: Readonly<Record<string, Quantity>>;
}
