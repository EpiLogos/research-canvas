import React, { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import './mockup-shell.css';

export type MockupMode = 'recovery-grounded' | 'intent-led' | 'hybrid';
export type RecognitionStatus = 'draft' | 'review' | 'recognised' | 'superseded';

export type ViewportPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export type StateBrief = {
  stateId: string;
  surface: string;
  actor: string;
  primaryGoal: string;
  entryContext?: string;
  activeScope?: string;
  activeObjects?: string[];
  selection?: string;
  primaryAction?: string;
  secondaryActions?: string[];
  visibleConsequence?: string;
  supportingInformation?: string[];
  hiddenOrDeferred?: string[];
  agentRole?: string;
  networkState?: string;
  openDesignQuestions?: string[];
};

export type GeometryContract = {
  canonicalViewport: string;
  alternateViewport?: string;
  stageShare?: string;
  permanentChrome?: string[];
  contextualRegions?: string[];
  densityNotes?: string[];
  collapseRules?: string[];
};

export type ReferenceItem = {
  id: string;
  label: string;
  question: string;
  lesson: string;
  authority?: 'constraint' | 'evidence' | 'inspiration';
  href?: string;
};

export type ReviewSection = {
  id: string;
  label: string;
  prompt: string;
};

export type ReviewComment = {
  id: string;
  body: string;
  createdAt: string;
  resolved: boolean;
};

export type RecognitionCheck = {
  id: string;
  label: string;
};

export type AppMockupShellProps = {
  product: string;
  title: string;
  mode: MockupMode;
  status?: RecognitionStatus;
  state: StateBrief;
  geometry: GeometryContract;
  references?: ReferenceItem[];
  reviewSections?: ReviewSection[];
  recognitionChecks?: RecognitionCheck[];
  viewports?: ViewportPreset[];
  children: ReactNode;
};

const DEFAULT_VIEWPORTS: ViewportPreset[] = [
  { id: 'desktop', label: '1600 × 1000', width: 1600, height: 1000 },
  { id: 'laptop', label: '1366 × 768', width: 1366, height: 768 },
];

const DEFAULT_REVIEW_SECTIONS: ReviewSection[] = [
  { id: 'state', label: 'Working state', prompt: 'Does the screen depict one credible working state with a clear task and selection?' },
  { id: 'geometry', label: 'Geometry', prompt: 'Does the stage dominate, and do permanent regions justify the space they consume?' },
  { id: 'density', label: 'Density', prompt: 'Are type, rows, controls, spacing, and metadata credible for prolonged professional use?' },
  { id: 'interaction', label: 'Interaction', prompt: 'Are frequent actions stable and local actions contextual or directly manipulable?' },
  { id: 'surface', label: 'Surface identity', prompt: 'Does this workspace use the spatial logic of its actual work instead of a repeated panel template?' },
  { id: 'product', label: 'Product identity', prompt: 'Would this remain recognisable as this product without a logo or explanatory caption?' },
  { id: 'failures', label: 'Failure scan', prompt: 'Scan for generic SaaS smell, mockup inflation, panel symmetry, card capture, dead stage, feature exhibition, and agent colonisation.' },
];

const DEFAULT_CHECKS: RecognitionCheck[] = [
  { id: 'specific-state', label: 'The working state is specific and inhabited.' },
  { id: 'geometry', label: 'The geometry contract is visible in the composition.' },
  { id: 'stage', label: 'The primary work surface dominates.' },
  { id: 'density', label: 'Density is credible for sustained professional use.' },
  { id: 'saas', label: 'Generic SaaS grammar does not define the workspace.' },
  { id: 'surface', label: 'The surface has its own task-specific composition.' },
  { id: 'product', label: 'Product-specific semantics are visibly present.' },
  { id: 'revision', label: 'A rendered critique produced a material revision.' },
];

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function FitViewport({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      const next = Math.min(rect.width / width, rect.height / height, 1);
      setScale(Math.max(0.1, next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [width, height]);

  const frameStyle = {
    '--logical-w': `${width}px`,
    '--logical-h': `${height}px`,
    '--mock-scale': scale,
  } as CSSProperties;

  return (
    <div className="mock-viewport-host" ref={hostRef}>
      <div className="mock-viewport-stage" style={frameStyle}>
        <div className="mock-viewport" style={{ width, height }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ContextList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="context-block">
      <h3>{title}</h3>
      <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

export function AppMockupShell({
  product,
  title,
  mode,
  status = 'draft',
  state,
  geometry,
  references = [],
  reviewSections = DEFAULT_REVIEW_SECTIONS,
  recognitionChecks = DEFAULT_CHECKS,
  viewports = DEFAULT_VIEWPORTS,
  children,
}: AppMockupShellProps) {
  const storageRoot = useMemo(() => `app-mockup:${slug(product)}:${state.stateId}`, [product, state.stateId]);
  const [viewportId, setViewportId] = useState(viewports[0].id);
  const [activeReview, setActiveReview] = useState(reviewSections[0].id);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => safeRead('app-mockup:theme', 'dark'));
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Record<string, ReviewComment[]>>(() => safeRead(`${storageRoot}:comments`, {}));
  const [checks, setChecks] = useState<Record<string, boolean>>(() => safeRead(`${storageRoot}:checks`, {}));
  const [saveMessage, setSaveMessage] = useState('Review state saves locally when available.');

  const viewport = viewports.find(item => item.id === viewportId) ?? viewports[0];
  const review = reviewSections.find(item => item.id === activeReview) ?? reviewSections[0];
  const sectionComments = comments[review.id] ?? [];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    safeWrite('app-mockup:theme', theme);
  }, [theme]);

  function persistComments(next: Record<string, ReviewComment[]>) {
    setComments(next);
    setSaveMessage(safeWrite(`${storageRoot}:comments`, next) ? 'Comments saved locally.' : 'Local persistence is unavailable for comments.');
  }

  function addComment() {
    const body = commentText.trim();
    if (!body) return;
    const nextComment: ReviewComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      body,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    persistComments({ ...comments, [review.id]: [...sectionComments, nextComment] });
    setCommentText('');
  }

  function toggleComment(id: string) {
    persistComments({
      ...comments,
      [review.id]: sectionComments.map(comment => comment.id === id ? { ...comment, resolved: !comment.resolved } : comment),
    });
  }

  function deleteComment(id: string) {
    persistComments({ ...comments, [review.id]: sectionComments.filter(comment => comment.id !== id) });
  }

  function toggleCheck(id: string) {
    const next = { ...checks, [id]: !checks[id] };
    setChecks(next);
    setSaveMessage(safeWrite(`${storageRoot}:checks`, next) ? 'Recognition checks saved locally.' : 'Local persistence is unavailable for checks.');
  }

  const shellClass = [
    'mock-workbench',
    leftOpen ? '' : 'left-closed',
    rightOpen ? '' : 'right-closed',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass}>
      <header className="workbench-topbar">
        <button className="chrome-button" type="button" onClick={() => setLeftOpen(value => !value)} aria-expanded={leftOpen} aria-label="Toggle design context">☰</button>
        <div className="workbench-title">
          <strong>{product}</strong>
          <span>{title}</span>
        </div>
        <div className="state-chip"><b>{state.surface}</b><span>{state.stateId}</span></div>
        <div className={`status-chip status-${status}`}>{status}</div>
        <label className="viewport-control">
          <span>Viewport</span>
          <select value={viewportId} onChange={event => setViewportId(event.target.value)}>
            {viewports.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button className="chrome-button" type="button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label="Switch theme">◐</button>
        <button className="chrome-button" type="button" onClick={() => setRightOpen(value => !value)} aria-expanded={rightOpen} aria-label="Toggle review rail">✎</button>
      </header>

      <aside className="design-context" aria-label="State and design context">
        <div className="rail-scroll">
          <div className="rail-kicker">Design mode</div>
          <div className="mode-card"><strong>{mode}</strong><span>Current implementation is {mode === 'intent-led' ? 'not a default constraint' : mode === 'hybrid' ? 'selective evidence' : 'required evidence before redesign'}.</span></div>

          <section className="context-block context-primary">
            <h2>{state.primaryGoal}</h2>
            <dl>
              <div><dt>Actor</dt><dd>{state.actor}</dd></div>
              {state.activeScope && <div><dt>Scope</dt><dd>{state.activeScope}</dd></div>}
              {state.selection && <div><dt>Selection</dt><dd>{state.selection}</dd></div>}
              {state.primaryAction && <div><dt>Action</dt><dd>{state.primaryAction}</dd></div>}
              {state.visibleConsequence && <div><dt>Consequence</dt><dd>{state.visibleConsequence}</dd></div>}
              {state.agentRole && <div><dt>Agent</dt><dd>{state.agentRole}</dd></div>}
            </dl>
          </section>

          <ContextList title="Active objects" items={state.activeObjects} />
          <ContextList title="Supporting information" items={state.supportingInformation} />
          <ContextList title="Hidden / deferred" items={state.hiddenOrDeferred} />
          <ContextList title="Open design questions" items={state.openDesignQuestions} />

          <section className="context-block">
            <h3>Geometry contract</h3>
            <dl>
              <div><dt>Canonical</dt><dd>{geometry.canonicalViewport}</dd></div>
              {geometry.alternateViewport && <div><dt>Alternate</dt><dd>{geometry.alternateViewport}</dd></div>}
              {geometry.stageShare && <div><dt>Stage</dt><dd>{geometry.stageShare}</dd></div>}
            </dl>
            <ContextList title="Permanent chrome" items={geometry.permanentChrome} />
            <ContextList title="Context regions" items={geometry.contextualRegions} />
            <ContextList title="Density" items={geometry.densityNotes} />
            <ContextList title="Collapse" items={geometry.collapseRules} />
          </section>

          {references.length > 0 && (
            <section className="context-block">
              <h3>Reference ledger</h3>
              <div className="reference-list">
                {references.map(reference => (
                  <article key={reference.id} className="reference-item">
                    <div><strong>{reference.label}</strong>{reference.authority && <span>{reference.authority}</span>}</div>
                    <p><b>Question.</b> {reference.question}</p>
                    <p><b>Lesson.</b> {reference.lesson}</p>
                    {reference.href && <a href={reference.href} target="_blank" rel="noreferrer">Open source</a>}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>

      <main className="mockup-main">
        <div className="mockup-meta-row">
          <span>{viewport.width} × {viewport.height} logical px</span>
          <span>Inspect at fit and 100% capture</span>
        </div>
        <FitViewport width={viewport.width} height={viewport.height}>{children}</FitViewport>
      </main>

      <aside className="review-rail" aria-label="Mockup review">
        <div className="rail-scroll">
          <div className="rail-kicker">Rendered critique</div>
          <div className="review-tabs" role="tablist" aria-label="Review lenses">
            {reviewSections.map(section => (
              <button key={section.id} type="button" className={activeReview === section.id ? 'active' : ''} onClick={() => setActiveReview(section.id)}>{section.label}</button>
            ))}
          </div>

          <section className="review-section">
            <h2>{review.label}</h2>
            <p className="review-prompt">{review.prompt}</p>
            <label htmlFor="review-comment">Add review comment</label>
            <textarea id="review-comment" value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Describe the visible problem, its consequence, and the next revision." />
            <button className="primary-small" type="button" onClick={addComment}>Add comment</button>
            <div className="save-message">{saveMessage}</div>
          </section>

          <section className="comment-list" aria-label="Review comments">
            {sectionComments.length === 0 && <p className="empty-copy">No comments for this review lens.</p>}
            {sectionComments.map(comment => (
              <article key={comment.id} className={comment.resolved ? 'review-comment resolved' : 'review-comment'}>
                <p>{comment.body}</p>
                <div><time>{new Date(comment.createdAt).toLocaleString()}</time><span className="spacer" /><button type="button" onClick={() => toggleComment(comment.id)}>{comment.resolved ? 'Reopen' : 'Resolve'}</button><button type="button" onClick={() => deleteComment(comment.id)}>Delete</button></div>
              </article>
            ))}
          </section>

          <section className="recognition-block">
            <h3>Recognition gate</h3>
            <div className="check-list">
              {recognitionChecks.map(check => (
                <label key={check.id}><input type="checkbox" checked={Boolean(checks[check.id])} onChange={() => toggleCheck(check.id)} /><span>{check.label}</span></label>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default AppMockupShell;
