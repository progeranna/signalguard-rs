import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Tooltip } from "./Tooltip";

function getTooltipGroup(trigger: HTMLElement): HTMLElement {
  const group = trigger.parentElement;

  if (!group) {
    throw new Error("Tooltip trigger is missing its wrapper");
  }

  return group;
}

function strictModeTooltips() {
  return (
    <StrictMode>
      <Tooltip content="First tooltip">
        <button type="button">First trigger</button>
      </Tooltip>
      <Tooltip content="Second tooltip">
        <button type="button">Second trigger</button>
      </Tooltip>
    </StrictMode>
  );
}

describe("Tooltip", () => {
  it("is absent before interaction and opens and closes on pointer hover", () => {
    render(
      <Tooltip content="Latest event ingestion delay">
        <button type="button">Event lag</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Event lag" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-describedby");

    fireEvent.pointerEnter(getTooltipGroup(trigger));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Latest event ingestion delay");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.pointerLeave(getTooltipGroup(trigger));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-describedby");
  });

  it("opens on focus and closes when focus leaves the tooltip group", () => {
    render(
      <div>
        <Tooltip content="Current market health status">
          <button type="button">Health</button>
        </Tooltip>
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Health" });
    const outside = screen.getByRole("button", { name: "Outside" });

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.blur(trigger, { relatedTarget: outside });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on Escape without activating the trigger", () => {
    const onClick = vi.fn();

    render(
      <Tooltip content="Detector explanation">
        <button type="button" onClick={onClick}>
          Detector
        </button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Detector" });
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("preserves existing handlers and the trigger accessible name", () => {
    const onClick = vi.fn();
    const onFocus = vi.fn();
    const onPointerEnter = vi.fn();

    render(
      <Tooltip content="Additional operational context">
        <button
          type="button"
          onClick={onClick}
          onFocus={onFocus}
          onPointerEnter={onPointerEnter}
        >
          Run analysis
        </button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Run analysis" });
    fireEvent.pointerEnter(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(trigger);

    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Run analysis" })).toBe(trigger);
    expect(
      screen.queryByRole("button", { name: "Additional operational context" }),
    ).not.toBeInTheDocument();
  });

  it("preserves an existing description while adding the live tooltip id", () => {
    render(
      <div>
        <span id="existing-description">Persistent description</span>
        <Tooltip content="Temporary tooltip description">
          <button type="button" aria-describedby="existing-description">
            Described trigger
          </button>
        </Tooltip>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Described trigger" });
    expect(trigger).toHaveAttribute("aria-describedby", "existing-description");

    fireEvent.pointerEnter(getTooltipGroup(trigger));
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute(
      "aria-describedby",
      `existing-description ${tooltip.id}`,
    );

    fireEvent.pointerLeave(getTooltipGroup(trigger));
    expect(trigger).toHaveAttribute("aria-describedby", "existing-description");
  });

  it("keeps multiple Strict Mode instances independent with unique live ids", () => {
    const { rerender } = render(strictModeTooltips());

    const firstTrigger = screen.getByRole("button", { name: "First trigger" });
    const secondTrigger = screen.getByRole("button", { name: "Second trigger" });

    fireEvent.focus(firstTrigger);
    fireEvent.pointerEnter(getTooltipGroup(secondTrigger));

    const firstTooltip = screen.getByText("First tooltip");
    const secondTooltip = screen.getByText("Second tooltip");
    expect(firstTooltip).toHaveAttribute("role", "tooltip");
    expect(secondTooltip).toHaveAttribute("role", "tooltip");
    expect(firstTooltip.id).not.toBe(secondTooltip.id);
    expect(firstTrigger).toHaveAttribute("aria-describedby", firstTooltip.id);
    expect(secondTrigger).toHaveAttribute("aria-describedby", secondTooltip.id);

    fireEvent.pointerLeave(getTooltipGroup(secondTrigger));
    expect(screen.getByText("First tooltip")).toBeInTheDocument();
    expect(screen.queryByText("Second tooltip")).not.toBeInTheDocument();

    fireEvent.pointerEnter(getTooltipGroup(secondTrigger));
    rerender(strictModeTooltips());

    const liveIds = screen.getAllByRole("tooltip").map((tooltip) => tooltip.id);
    expect(new Set(liveIds).size).toBe(liveIds.length);
  });

  it("removes its Escape listener when unmounted while open", () => {
    const addEventListener = vi.spyOn(document, "addEventListener");
    const removeEventListener = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(
      <Tooltip content="Listener lifecycle">
        <button type="button">Listener trigger</button>
      </Tooltip>,
    );

    fireEvent.pointerEnter(
      getTooltipGroup(screen.getByRole("button", { name: "Listener trigger" })),
    );

    const keydownRegistration = addEventListener.mock.calls.find(
      ([eventName]) => eventName === "keydown",
    );
    expect(keydownRegistration).toBeDefined();

    unmount();

    expect(
      removeEventListener.mock.calls.some(
        ([eventName, listener]) =>
          eventName === "keydown" && listener === keydownRegistration?.[1],
      ),
    ).toBe(true);
  });

  it("renders standalone without a portal, root, or provider", () => {
    render(
      <div data-testid="host">
        <Tooltip content="Inline tooltip">
          <button type="button">Standalone trigger</button>
        </Tooltip>
      </div>,
    );

    fireEvent.pointerEnter(
      getTooltipGroup(screen.getByRole("button", { name: "Standalone trigger" })),
    );

    expect(screen.getByTestId("host")).toContainElement(
      screen.getByRole("tooltip"),
    );
  });
});
