import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const jsonResponse = (payload: any, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }) as Response;

import Home from "../page";

describe("Home page", () => {
  test("viser opplastingsskjema", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "NB-transcribe", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opplasting", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Last opp lydfil")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Arbeidsflyt" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start Transkribering" })
    ).toBeInTheDocument();
  });

  test("viser resultater etter polling", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const originalFormData = globalThis.FormData;
    class MockFormData {
      private readonly store = new Map<string, unknown>();
      append(key: string, value: unknown) {
        this.store.set(key, value);
      }
    }
    (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData = MockFormData as unknown as typeof FormData;
    const originalFetch = globalThis.fetch;
    const originalWindowFetch = typeof window !== "undefined" ? window.fetch : undefined;
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "fetch", {
        value: fetchMock,
        configurable: true,
        writable: true,
      });
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ job_id: "job-123" }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "done",
          result: { raw: "Rå tekst", clean: "Ren tekst" },
        })
      );

    try {
      render(<Home />);

      const fileInput = screen.getByLabelText("Last opp lydfil");
      const testFile = new File(["fake"], "test.wav", { type: "audio/wav" });
      await user.upload(fileInput, testFile);

      const submitButton = screen.getByRole("button", { name: "Start Transkribering" });
      const form = submitButton.closest("form");
      expect(form).not.toBeNull();
      if (form) {
        (form as HTMLFormElement).noValidate = true;
        await act(async () => {
          const event = new Event("submit", { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
        });
      }

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/jobs",
          expect.objectContaining({ method: "POST" })
        )
      );

      expect(
        await screen.findByText("Jobb lagt i kø – starter om et øyeblikk.")
      ).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(await screen.findByText("Rå tekst")).toBeInTheDocument();
      expect(await screen.findByText("Ren tekst")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      if (originalFetch) {
        Object.defineProperty(globalThis, "fetch", {
          value: originalFetch,
          configurable: true,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, "fetch");
      }
      if (typeof window !== "undefined") {
        if (originalWindowFetch) {
          Object.defineProperty(window, "fetch", {
            value: originalWindowFetch,
            configurable: true,
            writable: true,
          });
        } else {
          Reflect.deleteProperty(window as unknown as Record<string, unknown>, "fetch");
        }
      }
      if (originalFormData) {
        (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData = originalFormData;
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, "FormData");
      }
    }
  });
});
