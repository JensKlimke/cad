import { useT } from '@cad/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useHandbookPage } from '../api/handbook.js';
import { WorkspaceShell } from '../components/WorkspaceShell.js';

import type { HandbookKind } from '@cad/protocol';

export function HandbookRoute(): React.JSX.Element {
  const { t } = useT('handbook');
  const navigate = useNavigate();
  const { kind, slug } = useParams<{ kind: HandbookKind; slug: string }>();
  const pageQuery = useHandbookPage(kind, slug);
  const page = pageQuery.data;
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  const railBody = useMemo(() => {
    if (page === undefined) {
      return null;
    }
    return (
      <>
        <dl className="workspace-meta">
          <div className="workspace-meta__row">
            <dt>{t('page.kind')}</dt>
            <dd>{page.kind}</dd>
          </div>
          <div className="workspace-meta__row">
            <dt>{t('page.locale')}</dt>
            <dd>{page.sourceLocale.toUpperCase()}</dd>
          </div>
        </dl>
        {page.isFallback && (
          <div className="document-note">
            <p className="document-note__title">{t('page.fallback_title')}</p>
            <p className="document-note__body">{t('page.fallback_body')}</p>
          </div>
        )}
        <div className="workspace-panel__subsection">
          <p className="workspace-panel__eyebrow">{t('toc.eyebrow')}</p>
          <h3 className="workspace-panel__title workspace-panel__title--small">{t('toc.title')}</h3>
          <ol className="handbook-toc">
            {page.headings.map((heading) => (
              <li
                key={heading.slug}
                className={`handbook-toc__item handbook-toc__item--depth-${String(heading.depth)}`}
              >
                <a href={`#${heading.slug}`}>{heading.title}</a>
              </li>
            ))}
          </ol>
        </div>
      </>
    );
  }, [page, t]);

  useEffect(() => {
    const element = contentRef.current;
    if (element === null) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.dataset['copyCode'] === undefined) {
        return;
      }
      const wrapper = target.closest('.handbook-code-block');
      const code = wrapper?.querySelector('code');
      if (code === null || code === undefined) {
        return;
      }
      void navigator.clipboard.writeText(code.textContent ?? '');
      setCopyFeedback(t('copy.success'));
      globalThis.setTimeout(() => setCopyFeedback(null), 1500);
    };

    element.addEventListener('click', handleClick);
    return () => {
      element.removeEventListener('click', handleClick);
    };
  }, [t]);

  if (pageQuery.isPending) {
    return (
      <WorkspaceShell
        title={t('loading.title')}
        description={t('loading.body')}
        testId="handbook-route"
      >
        <div className="workspace-state workspace-state--panel">
          <p className="workspace-state__title">{t('loading.title')}</p>
          <p className="workspace-state__body">{t('loading.body')}</p>
        </div>
      </WorkspaceShell>
    );
  }

  if (pageQuery.isError || page === undefined) {
    return (
      <WorkspaceShell
        title={t('error.title')}
        description={t('error.body')}
        testId="handbook-route"
      >
        <div className="workspace-state workspace-state--panel">
          <p className="workspace-state__title">{t('error.title')}</p>
          <p className="workspace-state__body">{t('error.body')}</p>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      title={page.title}
      description={page.summary}
      railBody={railBody}
      testId="handbook-route"
      headerActions={
        <div className="workspace-inline-actions">
          <button
            type="button"
            className="workspace-button workspace-button--secondary"
            onClick={() => navigate(-1)}
          >
            {t('actions.back')}
          </button>
        </div>
      }
    >
      <article className="workspace-panel handbook-panel">
        <div className="workspace-panel__header">
          <div>
            <p className="workspace-panel__eyebrow">{t('page.eyebrow')}</p>
            <h2 className="workspace-panel__title">{page.title}</h2>
          </div>
          <Link className="workspace-inline-link" to={page.path}>
            {t('actions.permalink')}
          </Link>
        </div>
        {copyFeedback !== null && <p className="workspace-inline-note">{copyFeedback}</p>}
        <section
          ref={contentRef}
          className="handbook-content"
          data-testid="handbook-content"
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      </article>
    </WorkspaceShell>
  );
}
