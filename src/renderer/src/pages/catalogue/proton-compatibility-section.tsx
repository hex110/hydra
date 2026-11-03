import { CheckboxField } from "@renderer/components/checkbox-field/checkbox-field";
import { RadioField } from "@renderer/components/radio-field/radio-field";
import { SidebarSection } from "@renderer/components/sidebar-section/sidebar-section";
import SteamDeckLogo from "@renderer/assets/steam-deck-logo.svg?url";

import "./proton-compatibility-section.scss";

interface ProtonCompatibilitySectionProps {
  title: string;
  protonSliderLabel: string;
  deckSliderLabel: string;
  /** The first option, shown with no tier colour, clears the filter. */
  protonOptions: {
    value: string;
    label: string;
    tier?: "silver" | "gold" | "platinum";
  }[];
  protonValue: string;
  deckChecked: boolean;
  deckLabel: string;
  defaultOpen?: boolean;
  onProtonChange: (value: string) => void;
  onDeckChange: (checked: boolean) => void;
}

export function ProtonCompatibilitySection({
  title,
  protonSliderLabel,
  deckSliderLabel,
  protonOptions,
  protonValue,
  deckChecked,
  deckLabel,
  defaultOpen = false,
  onProtonChange,
  onDeckChange,
}: ProtonCompatibilitySectionProps) {
  return (
    <SidebarSection
      title={title}
      defaultOpen={defaultOpen || protonValue !== "" || deckChecked}
    >
      <div className="proton-compatibility-section__content-inner">
        <div className="proton-compatibility-section__control">
          <span className="proton-compatibility-section__label">
            {protonSliderLabel}
          </span>

          <div className="proton-compatibility-section__option-list">
            {protonOptions.map((option) => (
              <div key={option.value}>
                <RadioField
                  name="protondb-tier-filter"
                  value={option.value}
                  checked={protonValue === option.value}
                  onChange={() => onProtonChange(option.value)}
                  className="proton-compatibility-section__option-item"
                  labelClassName="proton-compatibility-section__option-label"
                  label={option.label}
                  leftSlot={
                    <span
                      className={`proton-compatibility-section__option-orb proton-compatibility-section__option-orb--${option.tier ?? "any"}`}
                      aria-hidden="true"
                    />
                  }
                  aria-label={option.label}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="proton-compatibility-section__control">
          <span className="proton-compatibility-section__label proton-compatibility-section__label--deck">
            <img
              src={SteamDeckLogo}
              alt=""
              aria-hidden="true"
              className="proton-compatibility-section__deck-icon"
            />
            {deckSliderLabel}
          </span>

          <CheckboxField
            label={deckLabel}
            checked={deckChecked}
            onChange={(event) => onDeckChange(event.target.checked)}
          />
        </div>
      </div>
    </SidebarSection>
  );
}
