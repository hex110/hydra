import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon, TriangleDownIcon } from "@primer/octicons-react";
import cn from "classnames";
import type { ReactNode } from "react";

import type { ButtonProps } from "../button/button";
import "./split-button.scss";

export interface SplitButtonOption {
  id: string;
  label: string;
  /** A line under the label: what the option does. */
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface SplitButtonProps {
  children: ReactNode;
  onClick: () => void;
  options: SplitButtonOption[];
  /** Names the arrow for screen readers. */
  menuLabel: string;
  theme?: ButtonProps["theme"];
  disabled?: boolean;
  className?: string;
  /** Classes for both halves, such as a border the page sets. */
  partClassName?: string;
}

/**
 * A button with a menu of alternatives on its right side, like
 * Play / Play (modded): the main part runs the current choice.
 */
export function SplitButton({
  children,
  onClick,
  options,
  menuLabel,
  theme = "outline",
  disabled,
  className,
  partClassName,
}: Readonly<SplitButtonProps>) {
  return (
    <div className={cn("split-button", className)}>
      <button
        type="button"
        className={cn(
          "button",
          `button--${theme}`,
          "split-button__main",
          partClassName
        )}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
      <DropdownMenuPrimitive.Root>
        <DropdownMenuPrimitive.Trigger asChild disabled={disabled}>
          <button
            type="button"
            className={cn(
              "button",
              `button--${theme}`,
              "split-button__toggle",
              partClassName
            )}
            aria-label={menuLabel}
            title={menuLabel}
            disabled={disabled}
          >
            <TriangleDownIcon size={16} />
          </button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="end"
            sideOffset={6}
            collisionPadding={16}
            className="split-button__menu"
          >
            {options.map((option) => (
              <DropdownMenuPrimitive.CheckboxItem
                key={option.id}
                checked={option.checked ?? false}
                disabled={option.disabled}
                onSelect={option.onSelect}
                className="split-button__item"
              >
                <span className="split-button__check">
                  <DropdownMenuPrimitive.ItemIndicator>
                    <CheckIcon size={14} />
                  </DropdownMenuPrimitive.ItemIndicator>
                </span>
                <span className="split-button__text">
                  <span>{option.label}</span>
                  {option.hint && (
                    <small className="split-button__hint">{option.hint}</small>
                  )}
                </span>
              </DropdownMenuPrimitive.CheckboxItem>
            ))}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </div>
  );
}
