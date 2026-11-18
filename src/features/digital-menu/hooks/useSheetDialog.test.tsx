import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
// @ts-ignore react-dom types are not installed in devDependencies
import { flushSync } from "react-dom";
import { useSheetDialog } from "./useSheetDialog";
import { setupFakeDom, type MockElement } from "../test-utils/fakeDom";

interface TestComponentProps {
  isOpen: boolean;
  onClose: () => void;
}

function TestDialogComponent({ isOpen, onClose }: TestComponentProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useSheetDialog({
    isOpen,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen) return null;

  return (
    <div>
      <button ref={closeButtonRef} type="button" aria-label="Close dialog">
        Close
      </button>
      <input type="text" placeholder="Kitchen note" />
    </div>
  );
}

describe("useSheetDialog", () => {
  it("focuses initialFocusRef and locks document.body.style.overflow to hidden on open", () => {
    const env = setupFakeDom();
    const { doc, root, findElement, cleanup } = env;

    try {
      const onClose = vi.fn();
      flushSync(() => {
        root.render(<TestDialogComponent isOpen={true} onClose={onClose} />);
      });

      expect(doc.body.style.overflow).toBe("hidden");

      const closeBtn = findElement((el: MockElement) => el.attributes["aria-label"] === "Close dialog");
      expect(closeBtn).not.toBeNull();
      expect(doc.activeElement === closeBtn).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("calls the LATEST onClose when Escape is pressed after parent re-renders with a new callback", () => {
    const env = setupFakeDom();
    const { doc, root, cleanup } = env;

    try {
      const initialOnClose = vi.fn();
      flushSync(() => {
        root.render(<TestDialogComponent isOpen={true} onClose={initialOnClose} />);
      });

      // Parent re-renders with a newly instantiated arrow function callback
      const latestOnClose = vi.fn();
      flushSync(() => {
        root.render(<TestDialogComponent isOpen={true} onClose={latestOnClose} />);
      });

      // Press Escape
      doc.dispatchEvent({
        type: "keydown",
        key: "Escape",
        stopPropagation: vi.fn(),
      });

      expect(initialOnClose).not.toHaveBeenCalled();
      expect(latestOnClose).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("does NOT re-focus or re-run setup when parent re-renders with a new onClose identity", () => {
    const env = setupFakeDom();
    const { doc, root, findElement, cleanup } = env;

    try {
      const initialOnClose = vi.fn();
      flushSync(() => {
        root.render(<TestDialogComponent isOpen={true} onClose={initialOnClose} />);
      });

      const closeBtn = findElement((el: MockElement) => el.attributes["aria-label"] === "Close dialog");
      const input = findElement((el: MockElement) => el.attributes.placeholder === "Kitchen note");

      expect(doc.activeElement === closeBtn).toBe(true);
      expect(input).not.toBeNull();

      // User focuses input to type a note
      input!.focus();
      expect(doc.activeElement === input).toBe(true);

      // Parent re-renders with a new onClose function identity (e.g., inline arrow in parent)
      const nextOnClose = vi.fn();
      flushSync(() => {
        root.render(<TestDialogComponent isOpen={true} onClose={nextOnClose} />);
      });

      // Focus MUST remain on the active text input, not reset to closeBtn
      expect(doc.activeElement === closeBtn).toBe(false);
      expect(doc.activeElement === input).toBe(true);
      expect(doc.body.style.overflow).toBe("hidden");
    } finally {
      cleanup();
    }
  });

  it("restores body overflow and previous focus on close", () => {
    const env = setupFakeDom();
    const { doc, root, findElement, cleanup } = env;

    try {
      // Simulate an external button before opening dialog
      const externalButton = doc.createElement("button");
      externalButton.setAttribute("aria-label", "Open trigger");
      doc.body.appendChild(externalButton);
      externalButton.focus();
      expect(doc.activeElement === externalButton).toBe(true);

      // Open dialog
      const onClose = vi.fn();
      flushSync(() => {
        root.render(<TestDialogComponent isOpen={true} onClose={onClose} />);
      });

      expect(doc.body.style.overflow).toBe("hidden");
      const closeBtn = findElement((el: MockElement) => el.attributes["aria-label"] === "Close dialog");
      expect(doc.activeElement === closeBtn).toBe(true);

      // Close dialog
      flushSync(() => {
        root.render(<TestDialogComponent isOpen={false} onClose={onClose} />);
      });

      expect(doc.body.style.overflow).toBe("");
      expect(doc.activeElement === externalButton).toBe(true);
    } finally {
      cleanup();
    }
  });
});
