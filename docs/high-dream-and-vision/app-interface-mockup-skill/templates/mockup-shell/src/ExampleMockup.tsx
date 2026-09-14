import React from 'react';

export function ExampleMockup() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: '38px 34px minmax(0,1fr) 24px', background: '#0a111b', color: '#cbd6e2', fontFamily: 'ui-sans-serif,system-ui,sans-serif', fontSize: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', borderBottom: '1px solid #243247', background: '#0d1826' }}>
        <strong style={{ letterSpacing: '.08em', fontSize: 10 }}>PRODUCT</strong>
        <span style={{ color: '#7f90a4' }}>Project / Working state</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#7f90a4', fontSize: 10 }}>⌘K Command</span>
      </header>
      <nav style={{ display: 'flex', alignItems: 'end', gap: 2, padding: '0 8px', borderBottom: '1px solid #243247', background: '#101c2c' }}>
        {['Workspace', 'Timeline', 'Map'].map((name, index) => <div key={name} style={{ height: 28, padding: '7px 10px', borderBottom: index === 0 ? '2px solid #6ea7e1' : '2px solid transparent', color: index === 0 ? '#e4edf5' : '#8798aa' }}>{name}</div>)}
      </nav>
      <section style={{ minHeight: 0, display: 'grid', gridTemplateColumns: '218px minmax(0,1fr) 292px' }}>
        <aside style={{ padding: 10, borderRight: '1px solid #243247', background: '#0d1826' }}>
          <div style={{ color: '#617286', fontSize: 9, fontWeight: 800, letterSpacing: '.12em', marginBottom: 8 }}>PROJECT</div>
          {['Current constellation', 'Primary source set', 'Related inquiry', 'Archived material'].map((item, index) => <div key={item} style={{ padding: '6px 7px', background: index === 0 ? '#162b43' : 'transparent', marginBottom: 2 }}>{item}</div>)}
        </aside>
        <main style={{ position: 'relative', overflow: 'hidden', background: '#08101a' }}>
          <svg width="100%" height="100%" viewBox="0 0 900 620" preserveAspectRatio="none" aria-label="Example working stage">
            <path d="M225 190 C340 140 430 310 560 250" stroke="#486784" strokeWidth="1.5" fill="none" />
            <path d="M560 250 C650 220 690 380 760 410" stroke="#486784" strokeWidth="1.5" fill="none" />
            <g transform="translate(140 135)"><rect width="210" height="112" rx="7" fill="#101f30" stroke="#38516b"/><text x="14" y="24" fill="#8fb6dd" fontSize="10">SOURCE-BACKED NOTE</text><text x="14" y="49" fill="#dce6f0" fontSize="15">A meaningful object</text><text x="14" y="72" fill="#8193a6" fontSize="10">Representative content belongs here.</text></g>
            <g transform="translate(465 205)"><rect width="210" height="112" rx="7" fill="#152338" stroke="#78aee8" strokeWidth="2"/><text x="14" y="24" fill="#78aee8" fontSize="10">SELECTED RELATION</text><text x="14" y="49" fill="#e6edf5" fontSize="15">Current working focus</text><text x="14" y="72" fill="#8da0b3" fontSize="10">The mockup should depict one task.</text></g>
            <g transform="translate(690 365)"><rect width="150" height="88" rx="7" fill="#101f30" stroke="#38516b"/><text x="12" y="25" fill="#dce6f0" fontSize="13">Related object</text><text x="12" y="48" fill="#8193a6" fontSize="9">Context remains reachable.</text></g>
          </svg>
        </main>
        <aside style={{ padding: 11, borderLeft: '1px solid #243247', background: '#0d1826' }}>
          <div style={{ color: '#617286', fontSize: 9, fontWeight: 800, letterSpacing: '.12em', marginBottom: 9 }}>SELECTION</div>
          <strong style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>Current working focus</strong>
          <p style={{ color: '#8495a8', fontSize: 10.5, lineHeight: 1.5, margin: 0 }}>Use this slot for state-specific controls and information. Remove it when the state does not require an inspector.</p>
        </aside>
      </section>
      <footer style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 9px', borderTop: '1px solid #243247', color: '#6f8093', background: '#0d1826', fontSize: 9 }}><span>Local</span><span>1 selected</span><span style={{ flex: 1 }} /><span>Example only — replace the whole nested mockup</span></footer>
    </div>
  );
}

export default ExampleMockup;
