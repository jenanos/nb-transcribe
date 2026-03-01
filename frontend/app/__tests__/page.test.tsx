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
    setFetchMock(jest.fn().mockResolvedValue(jsonResponse({ status: "ok" })));
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
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))              // health check
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
    // Health check + Chunked flow: init → append → finalize → poll done
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))              // health check
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
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))              // health check
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
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))              // health check
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

  test("shows backend unavailable banner when health check fails", async () => {
    setFetchMock(jest.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    render(<Home />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Backend utilgjengelig")).toBeInTheDocument();
  });

  test("banner disappears when health check recovers after a transient failure", async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn();
    setFetchMock(fetchMock);
    // First health check fails → banner appears
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // Re-check (after interval) succeeds → banner disappears
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    try {
      render(<Home />);

      // Banner appears after first (failed) health check
      expect(await screen.findByRole("alert")).toBeInTheDocument();

      // Advance past HEALTHCHECK_INTERVAL_MS (30 s) to trigger re-check
      await act(async () => {
        jest.advanceTimersByTime(30000);
      });

      // Banner should be gone after the successful re-check
      await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("does not show banner when health check succeeds", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    setFetchMock(fetchMock);

    render(<Home />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/health",
        expect.objectContaining({ cache: "no-store", credentials: "include" })
      )
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("banner can be dismissed", async () => {
    const user = userEvent.setup();
    setFetchMock(jest.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    render(<Home />);

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: "Lukk varsel" });
    await user.click(closeButton);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
