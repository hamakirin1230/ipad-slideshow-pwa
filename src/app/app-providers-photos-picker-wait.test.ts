import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pickerMocks = vi.hoisted(() => ({
  getPhotosPickerSession: vi.fn(),
}));

vi.mock("@/lib/google-photos-picker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-photos-picker")>()),
  getPhotosPickerSession: pickerMocks.getPhotosPickerSession,
}));

import {
  PHOTOS_PICKER_MAX_APP_WAIT_SECONDS,
  PhotosPickerSelectionError,
  type PhotosPickerCreatedSession,
  type PhotosPickerSessionSnapshot,
} from "@/lib/google-photos-picker";
import { waitForPhotosPickerSelection } from "./app-providers";

const APP_WAIT_TIMEOUT_MS = PHOTOS_PICKER_MAX_APP_WAIT_SECONDS * 1000;
const providersSource = readFileSync(
  new URL("./app-providers.tsx", import.meta.url),
  "utf8",
);

function createSession(
  overrides: Partial<PhotosPickerCreatedSession> = {},
): PhotosPickerCreatedSession {
  return {
    id: "fixture-session",
    pickerUri: "fixture-picker-uri",
    mediaItemsSet: false,
    pollingTiming: {
      pollIntervalSeconds: 1,
      timeoutInSeconds: PHOTOS_PICKER_MAX_APP_WAIT_SECONDS * 2,
      diagnostics: [],
    },
    diagnostics: ["Photos Picker session fixture."],
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<PhotosPickerSessionSnapshot> = {},
): PhotosPickerSessionSnapshot {
  return {
    id: "fixture-session",
    pickerUri: null,
    mediaItemsSet: false,
    pollingTiming: {
      pollIntervalSeconds: 1,
      timeoutInSeconds: PHOTOS_PICKER_MAX_APP_WAIT_SECONDS,
      diagnostics: [],
    },
    diagnostics: ["Photos Picker snapshot fixture."],
    ...overrides,
  };
}

async function readRejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Expected promise to reject.");
}

function expectAppWaitTimeout(error: unknown) {
  expect(error).toBeInstanceOf(PhotosPickerSelectionError);
  if (!(error instanceof PhotosPickerSelectionError)) {
    return;
  }

  expect(error).toMatchObject({
    status: "error",
    message: "Photos Picker selection wait reached the app timeout.",
  });
  expect(error.diagnostics).toEqual([
    "Photos Pickerの選択待ちが30分でタイムアウトしました。",
    "Drive保存: 未実行",
    "プロジェクト反映: 未実行",
  ]);
  expect(error.diagnostics.join("\n")).not.toMatch(
    /fixture-credential|fixture-session|token|authorization|bearer|https?:\/\//i,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  pickerMocks.getPhotosPickerSession.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Photos Picker selection app deadline", () => {
  it("ends at 30 minutes while sleeping without starting a session request", async () => {
    const session = createSession({
      pollingTiming: {
        pollIntervalSeconds: PHOTOS_PICKER_MAX_APP_WAIT_SECONDS + 60,
        timeoutInSeconds: PHOTOS_PICKER_MAX_APP_WAIT_SECONDS + 60,
        diagnostics: [],
      },
    });
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const rejection = readRejection(
      waitForPhotosPickerSelection({
        accessToken: "fixture-credential",
        session,
        signal: controller.signal,
      }),
    );

    await vi.advanceTimersByTimeAsync(APP_WAIT_TIMEOUT_MS);

    expectAppWaitTimeout(await rejection);
    expect(pickerMocks.getPhotosPickerSession).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends at 30 minutes during a non-cooperative session request and ignores its delayed snapshot", async () => {
    let resolveSnapshot: ((snapshot: PhotosPickerSessionSnapshot) => void) | null =
      null;
    pickerMocks.getPhotosPickerSession.mockImplementation(
      () =>
        new Promise<PhotosPickerSessionSnapshot>((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    const onSnapshot = vi.fn();
    const rejection = readRejection(
      waitForPhotosPickerSelection({
        accessToken: "fixture-credential",
        session: createSession(),
        signal: new AbortController().signal,
        onSnapshot,
      }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(pickerMocks.getPhotosPickerSession).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(APP_WAIT_TIMEOUT_MS - 1_000);

    expectAppWaitTimeout(await rejection);
    resolveSnapshot?.(createSnapshot({ mediaItemsSet: true }));
    await Promise.resolve();
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(pickerMocks.getPhotosPickerSession).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps parent cancellation distinct from the app timeout", async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const rejection = readRejection(
      waitForPhotosPickerSelection({
        accessToken: "fixture-credential",
        session: createSession(),
        signal: controller.signal,
      }),
    );

    controller.abort();

    await expect(rejection).resolves.toMatchObject({ name: "AbortError" });
    expect(pickerMocks.getPhotosPickerSession).not.toHaveBeenCalled();
    const abortHandler = addListener.mock.calls.find(
      ([type]) => type === "abort",
    )?.[1];
    expect(abortHandler).toBeTypeOf("function");
    expect(removeListener).toHaveBeenCalledWith("abort", abortHandler);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the existing session timeout classification", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const error = await readRejection(
      waitForPhotosPickerSelection({
        accessToken: "fixture-credential",
        session: createSession({
          pollingTiming: {
            pollIntervalSeconds: 1,
            timeoutInSeconds: 0,
            diagnostics: [],
          },
        }),
        signal: controller.signal,
      }),
    );

    expect(error).toBeInstanceOf(PhotosPickerSelectionError);
    expect(error).toMatchObject({
      status: "cancelled",
      message: "Photos Picker polling reached the session timeout.",
    });
    expect(pickerMocks.getPhotosPickerSession).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("completes normally and releases the app deadline after selection", async () => {
    const snapshot = createSnapshot({ mediaItemsSet: true });
    pickerMocks.getPhotosPickerSession.mockResolvedValue(snapshot);
    const onSnapshot = vi.fn();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const result = waitForPhotosPickerSelection({
      accessToken: "fixture-credential",
      session: createSession(),
      signal: controller.signal,
      onSnapshot,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({
      diagnostics: [
        "Photos Picker session fixture.",
        "Photos Picker snapshot fixture.",
      ],
    });
    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    expect(pickerMocks.getPhotosPickerSession).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps the app deadline to an explicit user-facing timeout message", () => {
    expect(providersSource).toContain(
      "error.message === PHOTOS_PICKER_APP_WAIT_TIMEOUT_ERROR_MESSAGE",
    );
    expect(providersSource).toContain(
      "Googleフォトでの写真選択が30分以内に完了しなかったため、素材追加を終了しました。",
    );
  });

  it("returns an initially completed session without timers or requests", async () => {
    const result = await waitForPhotosPickerSelection({
      accessToken: "fixture-credential",
      session: createSession({ mediaItemsSet: true }),
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      diagnostics: ["Photos Picker session fixture."],
    });
    expect(pickerMocks.getPhotosPickerSession).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
