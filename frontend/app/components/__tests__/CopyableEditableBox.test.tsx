import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CopyableEditableBox from "../CopyableEditableBox";

describe("CopyableEditableBox", () => {
  const defineClipboard = (writeText: jest.Mock) => {
    Object.defineProperty(navigator, "clipboard", {
      writable: true,
      configurable: true,
      value: { writeText },
    });
  };

  afterEach(() => {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  });

  test("renders given title and content", () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    defineClipboard(writeText);

    render(<CopyableEditableBox title="Demo" content="Hei verden" />);

    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Hei verden")).toBeInTheDocument();
  });

  test("copies text and shows feedback", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const writeText = jest.fn().mockResolvedValue(undefined);
    defineClipboard(writeText);

    render(<CopyableEditableBox title="Demo" content="Hei verden" />);

    await user.click(screen.getByTitle("Kopier"));

    expect(writeText).toHaveBeenCalledWith("Hei verden");
    expect(await screen.findByText("Kopiert!")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1600);
    });

    expect(screen.queryByText("Kopiert!")).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  test("lar brukeren redigere og lagre tekst", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    defineClipboard(writeText);

    render(<CopyableEditableBox title="Demo" content="Hei verden" />);

    await user.click(screen.getByTitle("Rediger"));
    const textbox = screen.getByRole("textbox");
    expect(textbox).toHaveValue("Hei verden");

    await user.clear(textbox);
    await user.type(textbox, "Oppdatert");
    await user.click(screen.getByText("Lagre"));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Oppdatert")).toBeInTheDocument();
  });
});
