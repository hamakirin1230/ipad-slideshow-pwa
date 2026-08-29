"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ProjectSlideImageView } from "@/components/project-slide-image-view";
import { Button } from "@/components/ui/button";
import {
  PROJECT_SLIDE_IMAGE_EDIT_MIN_CROP_FRACTION,
  PROJECT_SLIDE_IMAGE_FULL_CROP,
  areProjectSlideImageEditsEqual,
  getEffectiveCrop,
  getRotatedImageDimensions,
  normalizeProjectSlideImageEditForWrite,
  rotateProjectSlideImageEditClockwise,
  rotateProjectSlideImageEditCounterClockwise,
  type ProjectSlideImageCrop,
  type ProjectSlideImageEdit,
} from "@/lib/project-slide-image-edit";

type ImageSourceState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      objectUrl: string;
      naturalWidth: number;
      naturalHeight: number;
    };

type CropPointerMode = "move" | "northWest" | "northEast" | "southWest" | "southEast";

type ActiveCropPointer = {
  pointerId: number;
  mode: CropPointerMode;
  startClientX: number;
  startClientY: number;
  crop: ProjectSlideImageCrop;
};

export function ProjectSlideImageEditorButton({
  slideId,
  assetFileId,
  mimeType,
  assetName,
  imageEdit,
  disabled,
  isSaving,
  fetchProjectSlidePreviewBlob,
  onSave,
}: {
  slideId: string;
  assetFileId: string;
  mimeType: string;
  assetName: string;
  imageEdit?: ProjectSlideImageEdit;
  disabled: boolean;
  isSaving: boolean;
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: string,
    signal: AbortSignal,
  ) => Promise<Blob>;
  onSave: (
    slideId: string,
    imageEdit: ProjectSlideImageEdit | undefined,
  ) => Promise<boolean>;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<ProjectSlideImageEdit>(() =>
    editableImageEdit(imageEdit),
  );

  function openEditor() {
    setDraft(editableImageEdit(imageEdit));
    setIsOpen(true);
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled}
        onClick={openEditor}
      >
        画像を編集
      </Button>
      {isOpen ? (
        <ProjectSlideImageEditorDialog
          triggerRef={triggerRef}
          assetFileId={assetFileId}
          mimeType={mimeType}
          assetName={assetName}
          savedImageEdit={imageEdit}
          draft={draft}
          isSaving={isSaving}
          isBlocked={disabled}
          fetchProjectSlidePreviewBlob={fetchProjectSlidePreviewBlob}
          onDraftChange={setDraft}
          onCancel={() => setIsOpen(false)}
          onSave={async () => {
            const didSave = await onSave(
              slideId,
              normalizeProjectSlideImageEditForWrite(draft),
            );
            if (didSave) {
              setIsOpen(false);
            }
            return didSave;
          }}
        />
      ) : null}
    </>
  );
}

function ProjectSlideImageEditorDialog({
  triggerRef,
  assetFileId,
  mimeType,
  assetName,
  savedImageEdit,
  draft,
  isSaving,
  isBlocked,
  fetchProjectSlidePreviewBlob,
  onDraftChange,
  onCancel,
  onSave,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  assetFileId: string;
  mimeType: string;
  assetName: string;
  savedImageEdit?: ProjectSlideImageEdit;
  draft: ProjectSlideImageEdit;
  isSaving: boolean;
  isBlocked: boolean;
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: string,
    signal: AbortSignal,
  ) => Promise<Blob>;
  onDraftChange: (edit: ProjectSlideImageEdit) => void;
  onCancel: () => void;
  onSave: () => Promise<boolean>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cropAreaRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<ActiveCropPointer | null>(null);
  const [sourceState, setSourceState] = useState<ImageSourceState>({
    status: "loading",
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const cancelDialog = useEffectEvent(() => {
    if (!isSaving) onCancel();
  });

  useEffect(() => {
    const abortController = new AbortController();
    let objectUrl: string | null = null;
    const image = new Image();

    fetchProjectSlidePreviewBlob(assetFileId, mimeType, abortController.signal)
      .then((blob) => {
        if (abortController.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        image.onload = () => {
          if (!objectUrl || abortController.signal.aborted) return;
          setSourceState({
            status: "ready",
            objectUrl,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          });
        };
        image.onerror = () => {
          if (!abortController.signal.aborted) setSourceState({ status: "error" });
        };
        image.src = objectUrl;
      })
      .catch(() => {
        if (!abortController.signal.aborted) setSourceState({ status: "error" });
      });

    return () => {
      abortController.abort();
      image.onload = null;
      image.onerror = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetFileId, fetchProjectSlidePreviewBlob, mimeType]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDialog();
        return;
      }

      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [triggerRef]);

  const crop = getEffectiveCrop(draft);
  const changed = !areProjectSlideImageEditsEqual(savedImageEdit, draft);

  function beginCropPointer(
    event: ReactPointerEvent<HTMLElement>,
    mode: CropPointerMode,
  ) {
    if (isSaving || sourceState.status !== "ready") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = {
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      crop,
    };
  }

  function updateCropPointer(event: ReactPointerEvent<HTMLElement>) {
    const active = activePointerRef.current;
    const area = cropAreaRef.current;
    if (!active || !area || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const bounds = area.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const deltaX = (event.clientX - active.startClientX) / bounds.width;
    const deltaY = (event.clientY - active.startClientY) / bounds.height;
    onDraftChange({
      rotation: draft.rotation,
      crop: resizeCrop(active.crop, active.mode, deltaX, deltaY),
    });
  }

  function endCropPointer(event: ReactPointerEvent<HTMLElement>) {
    if (activePointerRef.current?.pointerId === event.pointerId) {
      activePointerRef.current = null;
    }
  }

  async function save() {
    setSaveFailed(false);
    try {
      const didSave = await onSave();
      setSaveFailed(!didSave);
    } catch {
      setSaveFailed(true);
    }
  }

  const rotatedDimensions =
    sourceState.status === "ready"
      ? getRotatedImageDimensions(
          sourceState.naturalWidth,
          sourceState.naturalHeight,
          draft.rotation,
        )
      : null;
  const editorWidth = rotatedDimensions
    ? `min(100%, ${(55 * rotatedDimensions.width) / rotatedDimensions.height}vh)`
    : "100%";

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="mx-auto flex min-h-full w-full max-w-6xl items-center"
      >
        <div className="w-full rounded-2xl bg-white p-4 text-slate-950 shadow-2xl sm:p-6">
          <h2 id={titleId} className="text-xl font-semibold">
            画像を編集
          </h2>
          <p id={descriptionId} className="mt-1 text-sm text-slate-600">
            回転とトリミングは元画像を変更せず、保存後もやり直せます。
          </p>

          <div className="mt-4 flex min-h-64 items-center justify-center rounded-xl bg-slate-950 p-2 sm:p-4">
            {sourceState.status === "loading" ? (
              <p className="text-sm text-slate-200">画像を読み込んでいます。</p>
            ) : sourceState.status === "error" ? (
              <p className="text-sm text-red-200">画像を読み込めませんでした。</p>
            ) : (
              <div
                ref={cropAreaRef}
                className="relative max-h-[55vh] touch-none overflow-hidden"
                style={{
                  aspectRatio: `${rotatedDimensions?.width ?? 1} / ${rotatedDimensions?.height ?? 1}`,
                  width: editorWidth,
                }}
              >
                <ProjectSlideImageView
                  src={sourceState.objectUrl}
                  alt={`${assetName} の編集プレビュー`}
                  sourceWidth={sourceState.naturalWidth}
                  sourceHeight={sourceState.naturalHeight}
                  imageEdit={{ rotation: draft.rotation }}
                  className="absolute inset-0 h-full w-full"
                />
                <CropOverlay crop={crop} />
                <button
                  type="button"
                  aria-label="トリミング範囲を移動"
                  className="absolute cursor-move touch-none border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(15,23,42,0.7)]"
                  style={cropStyle(crop)}
                  onPointerDown={(event) => beginCropPointer(event, "move")}
                  onPointerMove={updateCropPointer}
                  onPointerUp={endCropPointer}
                  onPointerCancel={endCropPointer}
                />
                {(
                  [
                    ["northWest", "左上"],
                    ["northEast", "右上"],
                    ["southWest", "左下"],
                    ["southEast", "右下"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-label={`${label}のハンドルでトリミング範囲を変更`}
                    className="absolute z-10 flex size-11 touch-none items-center justify-center"
                    style={handleStyle(crop, mode)}
                    onPointerDown={(event) => beginCropPointer(event, mode)}
                    onPointerMove={updateCropPointer}
                    onPointerUp={endCropPointer}
                    onPointerCancel={endCropPointer}
                  >
                    <span className="size-4 rounded-full border-2 border-slate-900 bg-white shadow" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={isSaving || sourceState.status !== "ready"}
              onClick={() =>
                onDraftChange(rotateProjectSlideImageEditCounterClockwise(draft))
              }
            >
              左に回転
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={isSaving || sourceState.status !== "ready"}
              onClick={() =>
                onDraftChange(rotateProjectSlideImageEditClockwise(draft))
              }
            >
              右に回転
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={isSaving || sourceState.status !== "ready"}
              onClick={() => onDraftChange(editableImageEdit(undefined))}
            >
              リセット
            </Button>
          </div>

          {saveFailed ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              画像編集を保存できませんでした。Drive状態を確認して、もう一度お試しください。
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={isSaving}
              onClick={onCancel}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={
                !changed ||
                isSaving ||
                isBlocked ||
                sourceState.status !== "ready"
              }
              onClick={() => void save()}
            >
              {isSaving ? "保存中" : "画像編集を保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function editableImageEdit(
  imageEdit: ProjectSlideImageEdit | undefined,
): ProjectSlideImageEdit {
  return {
    rotation: imageEdit?.rotation ?? 0,
    crop: { ...(imageEdit?.crop ?? PROJECT_SLIDE_IMAGE_FULL_CROP) },
  };
}

function CropOverlay({ crop }: { crop: ProjectSlideImageCrop }) {
  const overlayClass = "pointer-events-none absolute bg-slate-950/65";
  return (
    <>
      <div className={overlayClass} style={{ inset: `0 0 ${100 - crop.y * 100}% 0` }} />
      <div
        className={overlayClass}
        style={{
          left: 0,
          top: `${crop.y * 100}%`,
          width: `${crop.x * 100}%`,
          height: `${crop.height * 100}%`,
        }}
      />
      <div
        className={overlayClass}
        style={{
          right: 0,
          top: `${crop.y * 100}%`,
          width: `${(1 - crop.x - crop.width) * 100}%`,
          height: `${crop.height * 100}%`,
        }}
      />
      <div className={overlayClass} style={{ inset: `${(crop.y + crop.height) * 100}% 0 0 0` }} />
    </>
  );
}

function cropStyle(crop: ProjectSlideImageCrop) {
  return {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
}

function handleStyle(crop: ProjectSlideImageCrop, mode: CropPointerMode) {
  const isEast = mode === "northEast" || mode === "southEast";
  const isSouth = mode === "southWest" || mode === "southEast";
  return {
    left: `calc(${(isEast ? crop.x + crop.width : crop.x) * 100}% - 22px)`,
    top: `calc(${(isSouth ? crop.y + crop.height : crop.y) * 100}% - 22px)`,
  };
}

function resizeCrop(
  crop: ProjectSlideImageCrop,
  mode: CropPointerMode,
  deltaX: number,
  deltaY: number,
): ProjectSlideImageCrop {
  const min = PROJECT_SLIDE_IMAGE_EDIT_MIN_CROP_FRACTION;
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;

  if (mode === "move") {
    return {
      ...crop,
      x: clamp(crop.x + deltaX, 0, 1 - crop.width),
      y: clamp(crop.y + deltaY, 0, 1 - crop.height),
    };
  }

  const west = mode === "northWest" || mode === "southWest";
  const north = mode === "northWest" || mode === "northEast";
  const x = west ? clamp(crop.x + deltaX, 0, right - min) : crop.x;
  const y = north ? clamp(crop.y + deltaY, 0, bottom - min) : crop.y;
  const nextRight = west ? right : clamp(right + deltaX, crop.x + min, 1);
  const nextBottom = north ? bottom : clamp(bottom + deltaY, crop.y + min, 1);
  return { x, y, width: nextRight - x, height: nextBottom - y };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
