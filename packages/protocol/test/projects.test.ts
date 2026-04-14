/**
 * Round-trip tests for `@cad/protocol/projects` schemas.
 */

import { describe, expect, it } from 'vitest';

import {
  CreateProjectRequestSchema,
  ListProjectsResponseSchema,
  ProjectSchema,
  UpdateProjectRequestSchema,
} from '../src/projects.js';

const VALID_ULID = '01HQ8K3VBRZ8XGRGY5T0WJD8AB';
const SECOND_ULID = '01HQ8K3VBRZ8XGRGY5T0WJD8AC';

const fixture = {
  id: VALID_ULID,
  workspaceId: VALID_ULID,
  name: 'Smoke Test',
  createdBy: VALID_ULID,
  createdAt: '2026-04-14T10:30:00Z',
  updatedAt: '2026-04-14T10:30:00Z',
};

describe('ProjectSchema', () => {
  it('parses a complete project', () => {
    expect(ProjectSchema.parse(fixture).name).toBe('Smoke Test');
  });

  it('rejects a project with an empty name', () => {
    expect(() => ProjectSchema.parse({ ...fixture, name: '' })).toThrow();
  });

  it('rejects a project with a 121-character name', () => {
    expect(() => ProjectSchema.parse({ ...fixture, name: 'x'.repeat(121) })).toThrow();
  });
});

describe('CreateProjectRequestSchema', () => {
  it('trims whitespace around the name', () => {
    const result = CreateProjectRequestSchema.parse({ name: '  My Project  ' });
    expect(result.name).toBe('My Project');
  });

  it('rejects whitespace-only names', () => {
    expect(() => CreateProjectRequestSchema.parse({ name: '   ' })).toThrow();
  });
});

describe('UpdateProjectRequestSchema', () => {
  it('accepts an empty update body (no fields to change)', () => {
    expect(() => UpdateProjectRequestSchema.parse({})).not.toThrow();
  });

  it('accepts a name update', () => {
    expect(UpdateProjectRequestSchema.parse({ name: 'Renamed' }).name).toBe('Renamed');
  });

  it('rejects an empty name in an update', () => {
    expect(() => UpdateProjectRequestSchema.parse({ name: '' })).toThrow();
  });
});

describe('ListProjectsResponseSchema', () => {
  it('parses a list with no cursor', () => {
    const result = ListProjectsResponseSchema.parse({ items: [fixture] });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeUndefined();
  });

  it('parses a list with a cursor for the next page', () => {
    const result = ListProjectsResponseSchema.parse({
      items: [fixture],
      nextCursor: SECOND_ULID,
    });
    expect(result.nextCursor).toBe(SECOND_ULID);
  });

  it('rejects a list with a malformed cursor', () => {
    expect(() =>
      ListProjectsResponseSchema.parse({ items: [fixture], nextCursor: 'not-a-ulid' }),
    ).toThrow();
  });
});
