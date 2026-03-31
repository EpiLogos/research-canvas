import type { PublishSettings } from "@research-canvas/schema";

import { PublishProfileForm } from "./PublishProfileForm";

interface ExportDialogProps {
  isOpen: boolean;
  profile: PublishSettings;
  onClose: () => void;
  onExport: (profile: PublishSettings) => void;
  onProfileChange: (profile: PublishSettings) => void;
}

export function ExportDialog({
  isOpen,
  onClose,
  onExport,
  onProfileChange,
  profile
}: ExportDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="export-dialog" aria-label="Publish export settings">
      <header className="panel-header">
        <p className="eyebrow">Publish</p>
        <h2>Export profile</h2>
      </header>

      <PublishProfileForm value={profile} onChange={onProfileChange} />

      <div className="export-dialog__actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button type="button" onClick={() => onExport(profile)}>
          Export bundle
        </button>
      </div>
    </section>
  );
}
