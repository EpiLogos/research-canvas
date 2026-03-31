import type { PublishSettings } from "@research-canvas/schema";

interface PublishProfileFormProps {
  value: PublishSettings;
  onChange: (nextValue: PublishSettings) => void;
}

export function PublishProfileForm({ value, onChange }: PublishProfileFormProps) {
  return (
    <form className="publish-profile-form">
      <label className="publish-profile-form__row">
        <input
          checked={value.includeResources}
          type="checkbox"
          onChange={(event) =>
            onChange({
              ...value,
              includeResources: event.target.checked
            })
          }
        />
        <span>Include downloadable resources</span>
      </label>

      <label className="publish-profile-form__row">
        <input
          checked={value.mobileSequenceFirst}
          type="checkbox"
          onChange={(event) =>
            onChange({
              ...value,
              mobileSequenceFirst: event.target.checked
            })
          }
        />
        <span>Prefer sequence-first mobile fallback</span>
      </label>

      <label className="publish-profile-form__field">
        <span>Theme</span>
        <select
          value={value.theme}
          onChange={(event) =>
            onChange({
              ...value,
              theme: event.target.value as PublishSettings["theme"]
            })
          }
        >
          <option value="paper">Paper</option>
          <option value="ledger">Ledger</option>
          <option value="nocturne">Nocturne</option>
        </select>
      </label>
    </form>
  );
}
