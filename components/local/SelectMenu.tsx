"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/** App-owned menu avoids native select popups outside the protected window. */
export function SelectMenu({
  label,
  value,
  options,
  onChange,
  placement = "up",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = Math.max(0, options.indexOf(value));
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const choose = (index: number) => {
    onChange(options[index]);
    setOpen(false);
  };
  return (
    <div
      className="mist-select"
      ref={root}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${highlighted}` : undefined}
        onClick={() => {
          setHighlighted(selected);
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              setHighlighted(selected);
              return;
            }
            setHighlighted((current) =>
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (current +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      options.length) %
                    options.length,
            );
          } else if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            choose(highlighted);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === "Tab") setOpen(false);
        }}
      >
        <span>{value}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-label={label}
          className={`mist-select-options ${placement === "down" ? "opens-down" : ""}`}
        >
          {options.map((option, index) => (
            <button
              key={option}
              id={`${id}-${index}`}
              type="button"
              role="option"
              aria-selected={value === option}
              tabIndex={-1}
              className={highlighted === index ? "highlighted" : ""}
              onMouseEnter={() => setHighlighted(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>{option}</span>
              {value === option && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
