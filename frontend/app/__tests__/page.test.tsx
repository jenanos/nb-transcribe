import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const jsonResponse = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }) as Response;

import Home from "../page";

describe("Home page", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let originalWindowFetch: typeof window.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindowFetch = typeof window !== "undefined" ? window.fetch : undefined;
  });

  afterEach(() => {
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
  });

  const setFetchMock = (mock: jest.Mock) => {
    Object.defineProperty(globalThis, "fetch", {
      value: mock,
      configurable: true,
      writable: true,
    });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "fetch", {
        value: mock,
        configurable: true,
        writable: true,
      });
    }
  };

  test("viser opplastingsskjema", () => {
    setFetchMock(jest.fn());
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "NB-transcribe", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opplasting", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Last opp lydfil")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start transkribering" })
    ).toBeInTheDocument();
  });

  test("setter fil ved dra-og-slipp på opplastingsfeltet", () => {
    setFetchMock(jest.fn());
    render(<Home />);

    const dropZone = screen
      .getByText("Klikk for å velge fil eller dra og slipp")
      .closest("label");
    expect(dropZone).not.toBeNull();

    const droppedFile = new File(["lyd"], "droppet-opptak.wav", { type: "audio/wav" });

    // fireEvent returnerer false når preventDefault ble kalt – uten det
    // ville nettleseren åpnet filen i stedet for å laste den opp.
    const dragOverNotCancelled = fireEvent.dragOver(dropZone as HTMLElement, {
      dataTransfer: { files: [droppedFile] },
    });
    expect(dragOverNotCancelled).toBe(false);

    const dropNotCancelled = fireEvent.drop(dropZone as HTMLElement, {
      dataTransfer: { files: [droppedFile] },
    });
    expect(dropNotCancelled).toBe(false);

    expect(screen.getByText("droppet-opptak.wav")).toBeInTheDocument();
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
    const fetchMock = jest.fn();
    setFetchMock(fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ job_id: "job-123" }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: "queued" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "done",
          result: { raw: "Rå tekst" },
        })
      );

    try {
      render(<Home />);

      const fileInput = screen.getByLabelText("Last opp lydfil");
      const testFile = new File(["fake"], "test.wav", { type: "audio/wav" });
      await user.upload(fileInput, testFile);

      const submitButton = screen.getByRole("button", { name: "Start transkribering" });
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

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(await screen.findByText("Rå tekst")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      if (originalFormData) {
        (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData = originalFormData;
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, "FormData");
      }
    }
  });

  test("viser feil hvis backend melder done uten resultat", async () => {
    const user = userEvent.setup();
    const originalFormData = globalThis.FormData;
    class MockFormData {
      private readonly store = new Map<string, unknown>();
      append(key: string, value: unknown) {
        this.store.set(key, value);
      }
    }
    (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData =
      MockFormData as unknown as typeof FormData;
    const fetchMock = jest.fn();
    setFetchMock(fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ job_id: "job-without-result" }, 202))
      .mockResolvedValueOnce(jsonResponse({ status: "done", result: null }));

    try {
      render(<Home />);

      const fileInput = screen.getByLabelText("Last opp lydfil");
      await user.upload(
        fileInput,
        new File(["fake"], "test.wav", { type: "audio/wav" })
      );
      const form = screen
        .getByRole("button", { name: "Start transkribering" })
        .closest("form");
      expect(form).not.toBeNull();
      if (form) {
        (form as HTMLFormElement).noValidate = true;
        await act(async () => {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
      }

      expect(
        await screen.findByText(
          "Serveren markerte jobben som ferdig uten å returnere en transkripsjon. Prøv igjen."
        )
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Resultater" })).not.toBeInTheDocument();
    } finally {
      if (originalFormData) {
        (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData = originalFormData;
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, "FormData");
      }
    }
  });

  test("uses chunked upload for files above 1 MB", async () => {
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
    const fetchMock = jest.fn();
    setFetchMock(fetchMock);
    // Chunked flow: init → append → finalize → poll done
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ upload_id: "upl-1" }))        // init
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))              // append
      .mockResolvedValueOnce(jsonResponse({ job_id: "job-chunked", status: "queued" }, 202)) // finalize
      .mockResolvedValueOnce(
        jsonResponse({ status: "done", result: { raw: "Chunked result" } })
      );

    try {
      render(<Home />);

      const fileInput = screen.getByLabelText("Last opp lydfil");
      // Create a file > 1 MB to trigger chunked upload
      const largeContent = new Uint8Array(2 * 1024 * 1024);
      const testFile = new File([largeContent], "long-recording.mp3", { type: "audio/mpeg" });
      await user.upload(fileInput, testFile);

      const submitButton = screen.getByRole("button", { name: "Start transkribering" });
      const form = submitButton.closest("form");
      expect(form).not.toBeNull();
      if (form) {
        (form as HTMLFormElement).noValidate = true;
        await act(async () => {
          const event = new Event("submit", { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
        });
      }

      // The first call should be the chunked init endpoint
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/api/jobs/chunked/init"),
          expect.objectContaining({ method: "POST" })
        )
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(await screen.findByText("Chunked result")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      if (originalFormData) {
        (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData = originalFormData;
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, "FormData");
      }
    }
  });

  test("polling retries on transient 502 errors", async () => {
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
    const fetchMock = jest.fn();
    setFetchMock(fetchMock);
    fetchMock
      // 1. Job creation succeeds
      .mockResolvedValueOnce(jsonResponse({ job_id: "job-retry" }, 202))
      // 2. First poll → transient 502
      .mockResolvedValueOnce(jsonResponse({}, 502))
      // 3. Retry poll → transient 502 again
      .mockResolvedValueOnce(jsonResponse({}, 502))
      // 4. Retry poll → success
      .mockResolvedValueOnce(
        jsonResponse({
          status: "done",
          result: { raw: "Retried transcript" },
        })
      );

    try {
      render(<Home />);

      const fileInput = screen.getByLabelText("Last opp lydfil");
      const testFile = new File(["fake"], "test.wav", { type: "audio/wav" });
      await user.upload(fileInput, testFile);

      const submitButton = screen.getByRole("button", { name: "Start transkribering" });
      const form = submitButton.closest("form");
      expect(form).not.toBeNull();
      if (form) {
        (form as HTMLFormElement).noValidate = true;
        await act(async () => {
          const event = new Event("submit", { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
        });
      }

      // Wait for job creation
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/jobs",
          expect.objectContaining({ method: "POST" })
        )
      );

      // First poll → 502, triggers retry with backoff (2000 * 1 = 2s)
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Second poll → 502, triggers retry with backoff (2000 * 2 = 4s)
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });

      // Third poll → success (backoff after 2nd 502 = 2000 * 2 = 4000ms)
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });

      expect(await screen.findByText("Retried transcript")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      if (originalFormData) {
        (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData = originalFormData;
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, "FormData");
      }
    }
  });

  test("polling retries on network TypeError errors", async () => {
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
    const fetchMock = jest.fn();
    setFetchMock(fetchMock);
    fetchMock
      // 1. Job creation succeeds
      .mockResolvedValueOnce(jsonResponse({ job_id: "job-net" }, 202))
      // 2. First poll → network error (TypeError)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      // 3. Retry poll → network error again
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      // 4. Retry poll → success
      .mockResolvedValueOnce(
        jsonResponse({
          status: "done",
          result: { raw: "Network retry transcript" },
        })
      );

    try {
      render(<Home />);

      const fileInput = screen.getByLabelText("Last opp lydfil");
      const testFile = new File(["fake"], "test.wav", { type: "audio/wav" });
      await user.upload(fileInput, testFile);

      const submitButton = screen.getByRole("button", { name: "Start transkribering" });
      const form = submitButton.closest("form");
      expect(form).not.toBeNull();
      if (form) {
        (form as HTMLFormElement).noValidate = true;
        await act(async () => {
          const event = new Event("submit", { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
        });
      }

      // Wait for job creation
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/jobs",
          expect.objectContaining({ method: "POST" })
        )
      );

      // First poll → TypeError, triggers retry with backoff (2000 * 1 = 2s)
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Second poll → TypeError, triggers retry with backoff (2000 * 2 = 4s)
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });

      expect(await screen.findByText("Network retry transcript")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      if (originalFormData) {
        (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData = originalFormData;
      } else {
        Reflect.deleteProperty(globalThis as Record<string, unknown>, "FormData");
      }
    }
  });

});
