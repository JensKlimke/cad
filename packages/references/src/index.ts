import { z } from 'zod';

export const EntityKindSchema = z.enum(['face', 'edge', 'vertex', 'sketch']);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const Vector3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type Vector3Tuple = z.infer<typeof Vector3Schema>;

export const FinderQuerySchema = z.object({
  entityKind: EntityKindSchema,
  featureId: z.string().min(1).optional(),
  constructionPath: z.string().min(1).optional(),
  normal: Vector3Schema.optional(),
  centroid: Vector3Schema.optional(),
  area: z.number().finite().nonnegative().optional(),
  length: z.number().finite().nonnegative().optional(),
  zRange: z.tuple([z.number().finite(), z.number().finite()]).optional(),
});
export type FinderQuery = z.infer<typeof FinderQuerySchema>;

export const EntityHashSchema = z.object({
  value: z.string().length(64),
  quantization: z.number().positive(),
});
export type EntityHash = z.infer<typeof EntityHashSchema>;

export const SelectorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('finder'),
    query: FinderQuerySchema,
  }),
  z.object({
    kind: z.literal('construction'),
    featureId: z.string().min(1),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal('hash'),
    hash: EntityHashSchema,
  }),
]);
export type Selector = z.infer<typeof SelectorSchema>;

export const HandleSchema = z.object({
  id: z.string().min(1),
  entityKind: EntityKindSchema,
  selectors: z.array(SelectorSchema).min(1),
  label: z.string().min(1).optional(),
});
export type Handle = z.infer<typeof HandleSchema>;

export const TopologyEntitySchema = z.object({
  id: z.string().min(1),
  kind: EntityKindSchema,
  featureId: z.string().min(1),
  constructionPath: z.string().min(1),
  label: z.string().min(1),
  centroid: Vector3Schema,
  normal: Vector3Schema.optional(),
  area: z.number().finite().nonnegative().optional(),
  length: z.number().finite().nonnegative().optional(),
  zRange: z.tuple([z.number().finite(), z.number().finite()]).optional(),
  hash: EntityHashSchema,
});
export type TopologyEntity = z.infer<typeof TopologyEntitySchema>;

export const TopologySchema = z.object({
  entities: z.array(TopologyEntitySchema),
});
export type Topology = z.infer<typeof TopologySchema>;

export interface LayerDiagnostic {
  readonly layer: Selector['kind'];
  readonly ok: boolean;
  readonly message: string;
  readonly candidateCount: number;
}

export interface ResolutionResult {
  readonly ok: boolean;
  readonly handle: Handle;
  readonly entity: TopologyEntity | null;
  readonly layer: Selector['kind'] | null;
  readonly diagnostics: readonly LayerDiagnostic[];
  readonly candidates: readonly TopologyEntity[];
}

export interface RepairCandidate {
  readonly entity: TopologyEntity;
  readonly score: number;
  readonly reasons: readonly string[];
}

export const HASH_QUANTIZATION = 1e-6;
const VECTOR_TOLERANCE = 1e-4;
const SCALAR_TOLERANCE = 1e-4;

export function createEntityHash(
  input: Omit<TopologyEntity, 'hash' | 'id' | 'label'>,
  quantization = HASH_QUANTIZATION,
): EntityHash {
  const canonical = {
    kind: input.kind,
    featureId: input.featureId,
    constructionPath: input.constructionPath,
    centroid: quantizeVector(input.centroid, quantization),
    normal: input.normal === undefined ? null : quantizeVector(input.normal, quantization),
    area: input.area === undefined ? null : quantize(input.area, quantization),
    length: input.length === undefined ? null : quantize(input.length, quantization),
    zRange:
      input.zRange === undefined
        ? null
        : input.zRange.map((value) => quantize(value, quantization)),
  };
  return {
    value: stableDigest64(JSON.stringify(canonical)),
    quantization,
  };
}

export function createHandleFromEntity(entity: TopologyEntity): Handle {
  return {
    id: `handle:${entity.constructionPath}`,
    entityKind: entity.kind,
    label: entity.label,
    selectors: [
      {
        kind: 'finder',
        query: {
          entityKind: entity.kind,
          featureId: entity.featureId,
          constructionPath: entity.constructionPath,
          centroid: entity.centroid,
          ...(entity.normal === undefined ? {} : { normal: entity.normal }),
          ...(entity.area === undefined ? {} : { area: entity.area }),
          ...(entity.length === undefined ? {} : { length: entity.length }),
          ...(entity.zRange === undefined ? {} : { zRange: entity.zRange }),
        },
      },
      {
        kind: 'construction',
        featureId: entity.featureId,
        path: entity.constructionPath,
      },
      {
        kind: 'hash',
        hash: entity.hash,
      },
    ],
  };
}

export function resolveHandle(handle: Handle, topology: Topology): ResolutionResult {
  const parsedHandle = HandleSchema.parse(handle);
  const parsedTopology = TopologySchema.parse(topology);
  const diagnostics: LayerDiagnostic[] = [];

  for (const selector of parsedHandle.selectors) {
    const candidates = resolveSelector(selector, parsedHandle.entityKind, parsedTopology);
    if (candidates.length === 1) {
      diagnostics.push({
        layer: selector.kind,
        ok: true,
        message: `Resolved ${parsedHandle.entityKind} by ${selector.kind}.`,
        candidateCount: candidates.length,
      });
      return {
        ok: true,
        handle: parsedHandle,
        entity: candidates[0] ?? null,
        layer: selector.kind,
        diagnostics,
        candidates,
      };
    }
    diagnostics.push({
      layer: selector.kind,
      ok: false,
      message:
        candidates.length === 0
          ? `No ${parsedHandle.entityKind} matched ${selector.kind}.`
          : `${String(candidates.length)} ${parsedHandle.entityKind} candidates matched ${selector.kind}.`,
      candidateCount: candidates.length,
    });
  }

  return {
    ok: false,
    handle: parsedHandle,
    entity: null,
    layer: null,
    diagnostics,
    candidates: rankRepairCandidates(parsedHandle, parsedTopology).map(
      (candidate) => candidate.entity,
    ),
  };
}

export function rankRepairCandidates(
  handle: Handle,
  topology: Topology,
): readonly RepairCandidate[] {
  const finder = handle.selectors.find(
    (selector): selector is Extract<Selector, { kind: 'finder' }> => selector.kind === 'finder',
  );
  const construction = handle.selectors.find(
    (selector): selector is Extract<Selector, { kind: 'construction' }> =>
      selector.kind === 'construction',
  );
  const query = finder?.query;

  const candidates = topology.entities
    .filter((entity) => entity.kind === handle.entityKind)
    .map((entity) => {
      let score = 0;
      const reasons: string[] = [];
      if (construction !== undefined && entity.featureId === construction.featureId) {
        score += 30;
        reasons.push('same feature');
      }
      if (construction !== undefined && entity.constructionPath === construction.path) {
        score += 50;
        reasons.push('same construction path');
      }
      if (query?.normal !== undefined && entity.normal !== undefined) {
        score += Math.max(0, 20 - vectorDistance(query.normal, entity.normal) * 20);
        reasons.push('similar normal');
      }
      if (query?.centroid !== undefined) {
        score += Math.max(0, 20 - vectorDistance(query.centroid, entity.centroid));
        reasons.push('near centroid');
      }
      if (query?.area !== undefined && entity.area !== undefined) {
        score += Math.max(0, 10 - Math.abs(query.area - entity.area));
        reasons.push('similar area');
      }
      return { entity, score, reasons };
    });
  return insertSorted(candidates, compareRepairCandidates);
}

function insertSorted<T>(
  items: readonly T[],
  compare: (left: T, right: T) => number,
): readonly T[] {
  const sorted: T[] = [];
  for (const item of items) {
    const index = sorted.findIndex((current) => compare(item, current) < 0);
    if (index === -1) {
      sorted.push(item);
    } else {
      sorted.splice(index, 0, item);
    }
  }
  return sorted;
}

function compareRepairCandidates(left: RepairCandidate, right: RepairCandidate): number {
  return (
    right.score - left.score ||
    left.entity.constructionPath.localeCompare(right.entity.constructionPath)
  );
}

export function findEntityByRawSelection(
  topology: Topology,
  selection: { readonly kind: EntityKind; readonly index: number },
): TopologyEntity | null {
  const entities = topology.entities.filter((entity) => entity.kind === selection.kind);
  if (selection.kind === 'face') {
    // Mesh raycasters report triangle indices; box faces are emitted as paired triangles.
    return entities[Math.floor(selection.index / 2)] ?? entities[selection.index] ?? null;
  }
  return entities[selection.index] ?? null;
}

function resolveSelector(
  selector: Selector,
  entityKind: EntityKind,
  topology: Topology,
): readonly TopologyEntity[] {
  switch (selector.kind) {
    case 'finder': {
      return topology.entities.filter((entity) =>
        matchesFinder(entity, entityKind, selector.query),
      );
    }
    case 'construction': {
      return topology.entities.filter(
        (entity) =>
          entity.kind === entityKind &&
          entity.featureId === selector.featureId &&
          entity.constructionPath === selector.path,
      );
    }
    case 'hash': {
      return topology.entities.filter(
        (entity) => entity.kind === entityKind && entity.hash.value === selector.hash.value,
      );
    }
  }
}

function matchesFinder(
  entity: TopologyEntity,
  entityKind: EntityKind,
  query: FinderQuery,
): boolean {
  return (
    entity.kind === entityKind &&
    entity.kind === query.entityKind &&
    (query.featureId === undefined || entity.featureId === query.featureId) &&
    (query.constructionPath === undefined || entity.constructionPath === query.constructionPath) &&
    (query.normal === undefined ||
      (entity.normal !== undefined &&
        vectorDistance(entity.normal, query.normal) <= VECTOR_TOLERANCE)) &&
    (query.centroid === undefined ||
      vectorDistance(entity.centroid, query.centroid) <= VECTOR_TOLERANCE) &&
    (query.area === undefined ||
      (entity.area !== undefined && Math.abs(entity.area - query.area) <= SCALAR_TOLERANCE)) &&
    (query.length === undefined ||
      (entity.length !== undefined &&
        Math.abs(entity.length - query.length) <= SCALAR_TOLERANCE)) &&
    (query.zRange === undefined ||
      (entity.zRange !== undefined &&
        Math.abs(entity.zRange[0] - query.zRange[0]) <= SCALAR_TOLERANCE &&
        Math.abs(entity.zRange[1] - query.zRange[1]) <= SCALAR_TOLERANCE))
  );
}

function quantizeVector(vector: Vector3Tuple, step: number): Vector3Tuple {
  return vector.map((value) => quantize(value, step)) as Vector3Tuple;
}

function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function vectorDistance(left: Vector3Tuple, right: Vector3Tuple): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function stableDigest64(input: string): string {
  return [
    2_166_136_261,
    2_166_136_261 ^ 2_654_435_769,
    2_166_136_261 ^ 2_246_822_507,
    2_166_136_261 ^ 3_266_489_909,
  ]
    .map((seed) => fnv1a(input, seed).toString(16).padStart(8, '0'))
    .join('')
    .repeat(2)
    .slice(0, 64);
}

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}
