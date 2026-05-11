import { describe, expect, it } from 'vitest';

import {
  createEntityHash,
  createHandleFromEntity,
  rankRepairCandidates,
  resolveHandle,
  type TopologyEntity,
} from '../src/index.js';

function entity(overrides: Partial<TopologyEntity> = {}): TopologyEntity {
  const base = {
    kind: 'face' as const,
    featureId: 'pad_1',
    constructionPath: 'pad_1.face.top',
    label: 'Top face',
    centroid: [10, 5, 8] as [number, number, number],
    normal: [0, 0, 1] as [number, number, number],
    area: 200,
    zRange: [8, 8] as [number, number],
  };
  const withoutHash = { ...base, ...overrides };
  return {
    id: withoutHash.constructionPath,
    ...withoutHash,
    hash: createEntityHash(withoutHash),
  };
}

describe('@cad/references', () => {
  it('resolves a handle by finder before construction and hash', () => {
    const top = entity();
    const handle = createHandleFromEntity(top);
    const result = resolveHandle(handle, { entities: [top] });
    expect(result.ok).toBe(true);
    expect(result.layer).toBe('finder');
    expect(result.entity?.constructionPath).toBe('pad_1.face.top');
  });

  it('falls back to construction when finder geometry no longer matches', () => {
    const top = entity();
    const handle = createHandleFromEntity(top);
    const edited = entity({ centroid: [12, 5, 10], area: 240, zRange: [10, 10] });
    const result = resolveHandle(handle, { entities: [edited] });
    expect(result.ok).toBe(true);
    expect(result.layer).toBe('construction');
  });

  it('ranks repair candidates deterministically', () => {
    const top = entity();
    const side = entity({
      constructionPath: 'pad_1.face.xMax',
      label: 'Right face',
      centroid: [20, 5, 4],
      normal: [1, 0, 0],
      area: 80,
      zRange: [0, 8],
    });
    const handle = createHandleFromEntity(top);
    const ranked = rankRepairCandidates(handle, { entities: [side, top] });
    expect(ranked[0]?.entity.constructionPath).toBe('pad_1.face.top');
  });
});
