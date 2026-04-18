/**
 * Component tests for `<ProjectList />`.
 *
 * Pure presentational component — no fetching, no router, no
 * provider stack beyond the i18n provider. Verifies the empty
 * state, the populated list, and the click callbacks.
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ProjectList } from '../src/components/ProjectList.js';

import type { Project } from '@cad/protocol';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

const fixture: Project = {
  id: '01HQ8K3VBRZ8XGRGY5T0WJD8AB',
  workspaceId: '01HQ8K3VBRZ8XGRGY5T0WJD8AC',
  name: 'Smoke Test',
  createdBy: '01HQ8K3VBRZ8XGRGY5T0WJD8AD',
  createdAt: '2026-04-14T10:30:00Z',
  updatedAt: '2026-04-14T10:30:00Z',
};

let i18n: I18nInstance;

beforeAll(async () => {
  i18n = await createBrowserI18n({ initialLocale: 'en' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderList(projects: readonly Project[]) {
  const onCreateClick = vi.fn();
  const onOpenProject = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ProjectList
        projects={projects}
        onCreateClick={onCreateClick}
        onOpenProject={onOpenProject}
      />
    </I18nProvider>,
  );
  return { onCreateClick, onOpenProject };
}

describe('<ProjectList />', () => {
  it('renders the empty state when no projects are provided', () => {
    renderList([]);
    expect(screen.getByTestId('project-list-empty')).toBeDefined();
  });

  it('renders a card per project when populated', () => {
    renderList([fixture, { ...fixture, id: '01HQ8K3VBRZ8XGRGY5T0WJD8AE', name: 'Other' }]);
    expect(screen.getByTestId(`project-card-${fixture.id}`)).toBeDefined();
    expect(screen.getByText('Smoke Test')).toBeDefined();
    expect(screen.getByText('Other')).toBeDefined();
  });

  it('invokes onCreateClick when the create button is pressed', () => {
    const { onCreateClick } = renderList([]);
    fireEvent.click(screen.getByTestId('project-list-create'));
    expect(onCreateClick).toHaveBeenCalledOnce();
  });

  it('invokes onOpenProject with the project id when a card is opened', () => {
    const { onOpenProject } = renderList([fixture]);
    fireEvent.click(screen.getByTestId(`project-card-open-${fixture.id}`));
    expect(onOpenProject).toHaveBeenCalledWith(fixture.id);
  });

  it('renders the title in German when bound to the de locale', async () => {
    const deI18n = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <I18nProvider i18n={deI18n}>
        <ProjectList projects={[]} onCreateClick={() => {}} onOpenProject={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText('Projekte')).toBeDefined();
    expect(screen.getAllByText('Neues Projekt')).toHaveLength(2);
  });
});
