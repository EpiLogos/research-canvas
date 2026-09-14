import React from 'react';
import { createRoot } from 'react-dom/client';
import AppMockupShell from './AppMockupShell';
import ExampleMockup from './ExampleMockup';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppMockupShell
      product="App Mockup Workbench"
      title="Single-state professional interface design"
      mode="intent-led"
      status="draft"
      state={{
        stateId: 'replace-with-real-state',
        surface: 'Workspace',
        actor: 'Researcher',
        primaryGoal: 'Inspect one consequential working state before implementation detail hardens the design.',
        activeScope: 'Project / active object set',
        activeObjects: ['Primary object', 'Supporting source', 'Related object'],
        selection: 'One meaningful object is selected.',
        primaryAction: 'Inspect and revise the selected relation.',
        visibleConsequence: 'The inspector exposes only controls relevant to the selection.',
        supportingInformation: ['Project scope', 'Current selection', 'Source relation'],
        hiddenOrDeferred: ['Global settings', 'Unrelated agent conversations', 'Rare commands'],
        agentRole: 'Contextual',
        openDesignQuestions: ['Should the inspector dock or overlay at the alternate viewport?'],
      }}
      geometry={{
        canonicalViewport: '1600 × 1000',
        alternateViewport: '1366 × 768',
        stageShare: 'At least 68% of useful working area.',
        permanentChrome: ['Compact application bar', 'Workspace tabs', 'Status strip'],
        contextualRegions: ['Selection inspector appears only with meaningful selection'],
        densityNotes: ['Compact controls', 'Thin separators', 'No card grid as default workspace'],
        collapseRules: ['Inspector overlays or closes before the stage becomes cramped'],
      }}
    >
      <ExampleMockup />
    </AppMockupShell>
  </React.StrictMode>
);
