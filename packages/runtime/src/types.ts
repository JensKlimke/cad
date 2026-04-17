import type { ParameterEvaluationResult, Quantity } from '@cad/expr';
import type { Feature } from '@cad/sdk';

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

export interface RuntimeFeatureResult {
  readonly id: string;
  readonly kind: Feature['kind'];
  readonly inputHash: string;
  readonly cached: boolean;
}

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
  readonly tessellation: JsonTessellation;
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
