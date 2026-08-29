"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

export interface DashboardSelectorOption {
  value: string;
  label: string;
  color?: string;
}

export type DashboardSelectorPresentation = "adaptive" | "menu";

interface DashboardSelectorProps {
  id: string;
  label: string;
  value: string;
  options: DashboardSelectorOption[];
  disabled?: boolean;
  presentation?: DashboardSelectorPresentation;
  descriptionId?: string;
  onChange(value: string): void;
}

type ProfileIdentityStyle = CSSProperties & { "--profile-color"?: string };

function optionId(id: string, value: string) {
  return `${id}-option-${value.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function DashboardSelector({
  id,
  label,
  value,
  options,
  disabled = false,
  presentation = "adaptive",
  descriptionId,
  onChange,
}: DashboardSelectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? null;
  const [open, setOpen] = useState(false);
  const [previousDisabled, setPreviousDisabled] = useState(disabled);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const activeOption = options[activeIndex] ?? selectedOption;

  if (disabled !== previousDisabled) {
    setPreviousDisabled(disabled);
    if (disabled && open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    listboxRef.current?.focus({ preventScroll: true });

    function handlePointerDown(event: Event) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openMenu() {
    if (disabled || !options.length) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function selectOption(index: number) {
    if (disabled) return;
    const option = options[index];
    if (!option) return;
    const restoreTriggerFocus = open;
    if (option.value !== value) onChange(option.value);
    closeMenu(restoreTriggerFocus);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }
  }

  function handleListboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = Math.min(options.length - 1, activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, activeIndex - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = Math.max(0, options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeIndex);
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
  }

  return (
    <div
      className="dashboard-selector"
      data-open={open ? "true" : "false"}
      data-presentation={presentation}
      ref={rootRef}
      onBlur={handleBlur}
    >
      <button
        className="dashboard-selector-trigger"
        id={`${id}-trigger`}
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-describedby={descriptionId}
        aria-labelledby={`${id}-label ${id}-value`}
        disabled={disabled}
        onClick={() => open ? closeMenu(false) : openMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="dashboard-selector-label" id={`${id}-label`}>
          {label}
        </span>
        <span className="dashboard-selector-value">
          {selectedOption?.color ? (
            <span
              className="dashboard-selector-mark"
              style={{ "--profile-color": selectedOption.color } as ProfileIdentityStyle}
              aria-hidden="true"
            />
          ) : null}
          <span id={`${id}-value`}>{selectedOption?.label ?? "None"}</span>
        </span>
        <ChevronDown
          className="dashboard-selector-chevron"
          aria-hidden="true"
          size={16}
          strokeWidth={2}
        />
      </button>
      <div
        className="dashboard-selector-listbox"
        id={`${id}-listbox`}
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        ref={listboxRef}
        aria-label={label}
        aria-disabled={disabled}
        aria-describedby={descriptionId}
        aria-activedescendant={activeOption ? optionId(id, activeOption.value) : undefined}
        onKeyDown={handleListboxKeyDown}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const active = index === activeIndex;
          return (
            <div
              className="dashboard-selector-option"
              id={optionId(id, option.value)}
              role="option"
              tabIndex={-1}
              aria-selected={selected}
              aria-disabled={disabled}
              data-active={active ? "true" : "false"}
              data-selected={selected ? "true" : "false"}
              data-value={option.value}
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              onClick={() => selectOption(index)}
              onPointerMove={() => {
                if (!disabled) setActiveIndex(index);
              }}
            >
              {option.color ? (
                <span
                  className="dashboard-selector-mark"
                  style={{ "--profile-color": option.color } as ProfileIdentityStyle}
                  aria-hidden="true"
                />
              ) : null}
              <span className="dashboard-selector-option-label">{option.label}</span>
              {selected ? (
                <span className="dashboard-selector-check" aria-hidden="true">
                  <Check size={15} strokeWidth={2.5} />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
