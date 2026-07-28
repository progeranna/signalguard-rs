import {
  Children,
  cloneElement,
  useEffect,
  useId,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
} from "react";

type TooltipProps = {
  content: ReactNode;
  children: ReactElement;
  id?: string;
};

function describedByValue(
  existingValue: unknown,
  tooltipId: string,
  isOpen: boolean,
): string | undefined {
  const existingDescription =
    typeof existingValue === "string" ? existingValue.trim() : "";

  if (!isOpen) {
    return existingDescription || undefined;
  }

  return [existingDescription, tooltipId].filter(Boolean).join(" ");
}

export function Tooltip({ content, children, id }: TooltipProps) {
  const generatedId = useId();
  const tooltipId = id ?? `sg-tooltip-${generatedId}`;
  const [isPointerWithin, setIsPointerWithin] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const isOpen = (isPointerWithin || isFocusWithin) && !isDismissed;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setIsDismissed(true);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const trigger = Children.only(children);
  const describedBy = describedByValue(
    trigger.props["aria-describedby"],
    tooltipId,
    isOpen,
  );

  const handleFocus = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsDismissed(false);
    }
    setIsFocusWithin(true);
  };

  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    setIsFocusWithin(false);
  };

  return (
    <span
      className="relative inline-flex"
      onBlur={handleBlur}
      onFocus={handleFocus}
      onPointerEnter={() => {
        setIsPointerWithin(true);
        setIsDismissed(false);
      }}
      onPointerLeave={() => setIsPointerWithin(false)}
    >
      {cloneElement(trigger, { "aria-describedby": describedBy })}
      {isOpen ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-md border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs font-normal normal-case tracking-normal text-slate-100 shadow-lg"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
