"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductAlertDialog } from "@/components/product-alert-dialog";
import { ProductDisclosure } from "@/components/product-disclosure";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState } from "@/app/app-providers";
import {
  DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS,
  DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS,
} from "@/lib/google-drive";
import { formatUiDateTime } from "@/lib/ui-format";
import { AssetCleanupPreviewPanel } from "./asset-cleanup-preview-panel";
import { AssetImportPanel } from "./asset-import-panel";

const SLIDE_CAPTION_MAX_LENGTH = 80;
const PROJECT_SLIDE_MAX_COUNT = 50;

type SlideListState = {
  projectId: string | null;
  sourceSlideIds: string[];
  orderedSlideIds: string[];
  selectedSlideIds: Set<string>;
  activeDragSlideId: string | null;
};

export function DriveProjectWorkspacePanel() {
  const {
    projectStatus,
    projectSummary,
    projectDetails,
    fetchProjectSlidePreviewBlob,
    updateProjectSlideCaption,
    updateProjectSlideDuration,
    moveProjectSlide,
    reorderProjectSlidesByDrag,
    deleteProjectSlides,
    duplicateProjectSlide,
    captionUpdateSlideId,
    captionUpdateMessage,
    captionUpdateDiagnostics,
    durationUpdateSlideId,
    durationUpdateMessage,
    durationUpdateDiagnostics,
    slideEditMessage,
    slideEditDiagnostics,
    isSlideEditInFlight,
    isSlideDeleteInFlight,
    isSlideDuplicateInFlight,
    slideEditBlockedReason,
    slideReorderMessage,
    slideReorderDiagnostics,
    slideReorderBlockedReason,
  } = useAppState();

  const readyProjectDetails = projectStatus === "ready" ? projectDetails : null;
  const projectId = projectSummary?.projectId ?? null;
  const slideCount =
    readyProjectDetails?.slideCount ?? projectSummary?.slideCount ?? null;
  const slides = useMemo(
    () => readyProjectDetails?.slides ?? [],
    [readyProjectDetails?.slides],
  );
  const slideIds = useMemo(() => slides.map((slide) => slide.slideId), [slides]);
  const [slideListState, setSlideListState] = useState<SlideListState>(() => ({
    projectId,
    sourceSlideIds: slideIds,
    orderedSlideIds: slideIds,
    selectedSlideIds: new Set<string>(),
    activeDragSlideId: null,
  }));
  const slideListStateRef = useRef(slideListState);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const [pendingDeleteSlideIds, setPendingDeleteSlideIds] = useState<string[] | null>(null);

  const { orderedSlideIds, selectedSlideIds, activeDragSlideId } = slideListState;
  const selectedCount = selectedSlideIds.size;
  const slideById = useMemo(
    () => new Map(slides.map((slide) => [slide.slideId, slide])),
    [slides],
  );
  const orderedSlides = useMemo(
    () =>
      orderedSlideIds
        .map((slideId) => slideById.get(slideId))
        .filter((slide): slide is (typeof slides)[number] => Boolean(slide)),
    [orderedSlideIds, slideById],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const areSlideActionsDisabled = isSlideEditInFlight || slideEditBlockedReason !== null;
  const canDeleteSelectedSlides = selectedCount > 0 && !areSlideActionsDisabled;

  useEffect(() => {
    updateSlideListState((current) => {
      if (
        current.projectId === projectId &&
        areStringArraysEqual(current.sourceSlideIds, slideIds)
      ) {
        return current;
      }

      return {
        projectId,
        sourceSlideIds: slideIds,
        orderedSlideIds: slideIds,
        selectedSlideIds: new Set(),
        activeDragSlideId: null,
      };
    });
  }, [projectId, slideIds]);

  function updateSlideListState(
    updater: (current: SlideListState) => SlideListState,
  ) {
    setSlideListState((current) => {
      const next = updater(current);
      slideListStateRef.current = next;
      return next;
    });
  }

  function toggleSelectedSlide(slideId: string, checked: boolean) {
    updateSlideListState((current) => {
      const nextSelectedSlideIds = new Set(current.selectedSlideIds);

      if (checked) {
        nextSelectedSlideIds.add(slideId);
      } else {
        nextSelectedSlideIds.delete(slideId);
      }

      return {
        ...current,
        selectedSlideIds: nextSelectedSlideIds,
      };
    });
  }

  function clearSelectedSlides() {
    updateSlideListState((current) => ({
      ...current,
      selectedSlideIds: new Set(),
    }));
  }

  function handleDeleteSelectedSlides() {
    if (!canDeleteSelectedSlides) {
      return;
    }

    setPendingDeleteSlideIds(Array.from(selectedSlideIds));
  }

  async function confirmDeleteSelectedSlides() {
    const slideIdsToDelete = pendingDeleteSlideIds;
    if (!slideIdsToDelete || !canDeleteSelectedSlides) return;
    setPendingDeleteSlideIds(null);
    const ok = await deleteProjectSlides(slideIdsToDelete);

    if (ok) {
      clearSelectedSlides();
    }
  }

  function handleDragOver(event: DragOverEvent) {
    if (areSlideActionsDisabled) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!overId || activeId === overId) {
      return;
    }

    updateSlideListState((current) => {
      const oldIndex = current.orderedSlideIds.indexOf(activeId);
      const newIndex = current.orderedSlideIds.indexOf(overId);

      if (oldIndex === -1 || newIndex === -1) {
        return current;
      }

      return {
        ...current,
        orderedSlideIds: arrayMove(current.orderedSlideIds, oldIndex, newIndex),
      };
    });
  }

  async function handleDragEnd() {
    const nextOrderedSlideIds = slideListStateRef.current.orderedSlideIds;
    const sourceSlideIds = slideListStateRef.current.sourceSlideIds;

    updateSlideListState((current) => ({
      ...current,
      activeDragSlideId: null,
    }));

    if (areSlideActionsDisabled) {
      updateSlideListState((current) => ({
        ...current,
        orderedSlideIds: current.sourceSlideIds,
      }));
      return;
    }

    if (areStringArraysEqual(nextOrderedSlideIds, sourceSlideIds)) {
      return;
    }

    const ok = await reorderProjectSlidesByDrag(nextOrderedSlideIds);

    if (!ok) {
      updateSlideListState((current) => ({
        ...current,
        orderedSlideIds: current.sourceSlideIds,
      }));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">スライドをつくる</h2>
      </div>

      {!projectSummary ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 p-5 text-amber-100">
          <p className="font-semibold">編集する作品を選択してください</p>
          <p className="mt-1 text-sm leading-6">作品を選択すると、素材の追加とスライド編集を始められます。</p>
          <a href="#project" className="mt-3 inline-flex min-h-11 items-center font-medium underline decoration-amber-300/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
            作品を選択
          </a>
        </div>
      ) : null}

      <ProductDisclosure label="使い方を見る">
        <div className="space-y-2">
          <p>写真や動画を追加し、スライドをドラッグして並び替えます。</p>
          <p>変更を再生に反映するには、あとで「この端末」から保存してください。公開は別の操作です。</p>
          <p>大容量動画は本体をこの端末へ保存せず、オンライン時に再生します。対応形式や上限は素材追加の詳細で確認できます。</p>
        </div>
      </ProductDisclosure>

      <section aria-labelledby="asset-import-heading">
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle><h3 id="asset-import-heading">素材を追加</h3></CardTitle>
            <CardDescription>
              写真または動画を選び、この作品へ追加します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssetImportPanel />
          </CardContent>
        </Card>
      </section>

      <section aria-label="素材の整理" className="border-t border-white/8 pt-8">
        <ProductDisclosure label="使っていない素材を整理">
          <AssetCleanupPreviewPanel />
        </ProductDisclosure>
      </section>

      <section aria-labelledby="slide-editor-heading" className="border-t border-white/8 pt-8">
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle><h3 id="slide-editor-heading">スライド</h3></CardTitle>
            <CardDescription>
              ドラッグして並び替え
            </CardDescription>
          </CardHeader>
          <CardContent>
            {slideReorderBlockedReason ? (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{slideReorderBlockedReason}</p>
            ) : null}
            {slides.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {selectedCount > 0
                        ? `${selectedCount}件選択中`
                        : "スライドを選択して一括操作できます"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      すべて削除すると、このプロジェクトは再生対象のスライドがない状態になります。
                      Google Drive上の素材ファイルは削除しません。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-11"
                      disabled={selectedCount === 0 || isSlideEditInFlight}
                      onClick={clearSelectedSlides}
                    >
                      選択解除
                    </Button>
                    <Button
                      ref={deleteTriggerRef}
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="min-h-11"
                      disabled={!canDeleteSelectedSlides}
                      onClick={handleDeleteSelectedSlides}
                    >
                      {isSlideDeleteInFlight
                        ? "削除中"
                        : "選択したスライドを削除"}
                    </Button>
                  </div>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={(event) =>
                    updateSlideListState((current) => ({
                      ...current,
                      activeDragSlideId: String(event.active.id),
                    }))
                  }
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => {
                    updateSlideListState((current) => ({
                      ...current,
                      activeDragSlideId: null,
                      orderedSlideIds: current.sourceSlideIds,
                    }));
                  }}
                >
                  <SortableContext
                    items={orderedSlideIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="grid gap-2 bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)]">
                        <p>選択</p>
                        <p>順番</p>
                        <p>プレビュー</p>
                        <p>素材</p>
                        <p>並び替え</p>
                        <p>操作</p>
                        <p>編集</p>
                      </div>
                      <div className="divide-y divide-slate-200">
                        {orderedSlides.map((slide, index) => (
                          <SortableSlideRow
                            key={`${slide.slideIdPart}-${slide.assetIdPart}`}
                            slideId={slide.slideId}
                            isDisabled={areSlideActionsDisabled}
                            isDragging={activeDragSlideId === slide.slideId}
                          >
                            {({ dragHandle }) => (
                              <>
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={selectedSlideIds.has(slide.slideId)}
                                    disabled={isSlideEditInFlight}
                                    onChange={(event) =>
                                      toggleSelectedSlide(
                                        slide.slideId,
                                        event.target.checked,
                                      )
                                    }
                                    className="size-4 rounded border-slate-300"
                                  />
                                  <span className="sr-only">スライドを選択</span>
                                </label>
                                <div className="space-y-2">
                                  <p className="font-medium">{index + 1}</p>
                                  {dragHandle}
                                </div>
                                <DriveSlidePreview
                                  assetFileId={slide.assetFileId}
                                  assetType={getAssetTypeLabel(slide.type)}
                                  mimeType={slide.mimeType}
                                  assetName={slide.assetName}
                                  fetchProjectSlidePreviewBlob={
                                    fetchProjectSlidePreviewBlob
                                  }
                                />
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium">{slide.assetName}</p>
                                    <Badge
                                      variant={
                                        getAssetTypeLabel(slide.type) === "video"
                                          ? "secondary"
                                          : "outline"
                                      }
                                    >
                                      種類: {getAssetTypeDisplayLabel(slide.type)}
                                    </Badge>
                                    {slide.unsupportedReason ? (
                                      <Badge variant="destructive">
                                        {getUnsupportedReasonDisplayLabel(
                                          slide.unsupportedReason,
                                        )}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    作成日時:{" "}
                                    {slide.sourceCreateTime
                                      ? formatUiDateTime(slide.sourceCreateTime)
                                      : "取得なし"}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">表示時間: {slide.durationSeconds}秒</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    動画の実時間:{" "}
                                    {formatOptionalDurationMs(slide.durationMs)} / 容量:{" "}
                                    {formatOptionalBytes(slide.fileSize)}
                                  </p>
                                </div>
                                <SlideReorderControls
                                  slideId={slide.slideId}
                                  isFirst={index === 0}
                                  isLast={index === orderedSlides.length - 1}
                                  isDisabled={
                                    isSlideEditInFlight ||
                                    slideReorderBlockedReason !== null
                                  }
                                  onMove={moveProjectSlide}
                                />
                                <SlideSingleActions
                                  slideId={slide.slideId}
                                  isDisabled={areSlideActionsDisabled}
                                  isDuplicating={isSlideDuplicateInFlight}
                                  isDuplicateLimitReached={
                                    slideCount !== null &&
                                    slideCount >= PROJECT_SLIDE_MAX_COUNT
                                  }
                                  onDuplicate={duplicateProjectSlide}
                                />
                                <div className="space-y-2">
                                  <SlideDurationEditor
                                    key={`${slide.slideId}:${slide.durationSeconds}:${slide.durationMs ?? "none"}`}
                                    slideId={slide.slideId}
                                    durationSeconds={slide.durationSeconds}
                                    isSaving={
                                      durationUpdateSlideId === slide.slideId
                                    }
                                    isDisabled={areSlideActionsDisabled}
                                    onSave={updateProjectSlideDuration}
                                  />
                                  <SlideCaptionEditor
                                    key={`${slide.slideId}:${slide.caption}`}
                                    slideId={slide.slideId}
                                    caption={slide.caption}
                                    isSaving={
                                      captionUpdateSlideId === slide.slideId
                                    }
                                    isDisabled={areSlideActionsDisabled}
                                    onSave={updateProjectSlideCaption}
                                  />
                                </div>
                              </>
                            )}
                          </SortableSlideRow>
                        ))}
                      </div>
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">
                  検証済みスライドはまだありません。
                </p>
                <p className="mt-2">
                  プロジェクトに追加済みのスライドがここに表示されます。
                  素材を追加すると、ここでテロップを編集できます。
                </p>
              </div>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              スライド順、テロップ、表示時間の変更を再生に反映するには、この作品をこの端末に保存してください。
            </p>
            {slideEditMessage ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{slideEditMessage}</p>
                {slideEditDiagnostics.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {slideEditDiagnostics.map((diagnostic, index) => (
                      <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {slideReorderMessage ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{slideReorderMessage}</p>
                {slideReorderDiagnostics.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {slideReorderDiagnostics.map((diagnostic, index) => (
                      <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {captionUpdateMessage ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{captionUpdateMessage}</p>
                {captionUpdateDiagnostics.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {captionUpdateDiagnostics.map((diagnostic, index) => (
                      <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {durationUpdateMessage ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{durationUpdateMessage}</p>
                {durationUpdateDiagnostics.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {durationUpdateDiagnostics.map((diagnostic, index) => (
                      <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {pendingDeleteSlideIds ? (
        <ProductAlertDialog
          title="選択したスライドを削除しますか？"
          description={`選択した${pendingDeleteSlideIds.length}件のスライドをこの作品から削除します。\nGoogle Drive上の素材ファイルは削除しません。\nこの端末への反映には、保存をもう一度実行してください。`}
          confirmLabel="スライドを削除"
          triggerRef={deleteTriggerRef}
          onCancel={() => setPendingDeleteSlideIds(null)}
          onConfirm={confirmDeleteSelectedSlides}
        />
      ) : null}
    </div>
  );
}

function SortableSlideRow({
  slideId,
  isDisabled,
  isDragging,
  children,
}: {
  slideId: string;
  isDisabled: boolean;
  isDragging: boolean;
  children: (input: { dragHandle: ReactNode }) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({
    id: slideId,
    disabled: isDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      disabled={isDisabled}
      aria-label="ドラッグして並び替え"
      title="ドラッグして並び替え"
      className="inline-flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-base font-semibold leading-none text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      {...attributes}
      {...listeners}
    >
      ≡
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        isDragging
          ? "grid gap-2 bg-white px-3 py-2 text-sm opacity-90 shadow-lg ring-2 ring-slate-300 xl:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)]"
          : "grid gap-2 bg-white px-3 py-2 text-sm xl:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)]"
      }
    >
      {children({ dragHandle })}
    </div>
  );
}

function SlideDurationEditor({
  slideId,
  durationSeconds,
  isSaving,
  isDisabled,
  onSave,
}: {
  slideId: string;
  durationSeconds: number;
  isSaving: boolean;
  isDisabled: boolean;
  onSave: (slideId: string, durationSeconds: number) => void;
}) {
  const [draftDurationSeconds, setDraftDurationSeconds] = useState(
    `${durationSeconds}`,
  );
  const parsedDurationSeconds = parseSlideDurationSeconds(draftDurationSeconds);
  const hasValidDuration = parsedDurationSeconds !== null;
  const hasUnsavedChange =
    hasValidDuration && parsedDurationSeconds !== durationSeconds;
  const isEmpty = draftDurationSeconds.trim() === "";
  const isInvalid = !isEmpty && !hasValidDuration;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS}
          max={DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS}
          step={1}
          value={draftDurationSeconds}
          onChange={(event) => setDraftDurationSeconds(event.target.value)}
          className="min-h-11 w-20 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          aria-label="スライドの表示時間"
        />
        <span className="text-sm text-slate-700">秒</span>
        {hasUnsavedChange ? <Badge variant="outline">未保存</Badge> : null}
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          variant={hasUnsavedChange ? "default" : "secondary"}
          disabled={
            !hasUnsavedChange ||
            !hasValidDuration ||
            isSaving ||
            isDisabled
          }
          onClick={() => {
            if (parsedDurationSeconds !== null) {
              onSave(slideId, parsedDurationSeconds);
            }
          }}
        >
          {isSaving ? "保存中" : "保存"}
        </Button>
      </div>
      {isEmpty ? (
        <p className="mt-1 text-xs text-red-700">表示時間を入力してください。</p>
      ) : null}
      {isInvalid ? (
        <p className="mt-1 text-xs text-red-700">
          表示時間は {DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS}〜
          {DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS} 秒の整数で入力してください。
        </p>
      ) : null}
    </div>
  );
}

function SlideCaptionEditor({
  slideId,
  caption,
  isSaving,
  isDisabled,
  onSave,
}: {
  slideId: string;
  caption: string;
  isSaving: boolean;
  isDisabled: boolean;
  onSave: (slideId: string, caption: string) => void;
}) {
  const [draftCaption, setDraftCaption] = useState(caption);

  const normalizedDraftCaption = draftCaption.trim();
  const hasUnsavedChange = normalizedDraftCaption !== caption.trim();
  const captionLength = [...normalizedDraftCaption].length;
  const isTooLong = captionLength > SLIDE_CAPTION_MAX_LENGTH;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <textarea
        value={draftCaption}
        onChange={(event) => setDraftCaption(event.target.value)}
        maxLength={SLIDE_CAPTION_MAX_LENGTH + 20}
        rows={1}
        aria-label="テロップ"
        className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        placeholder="テロップを入力"
      />
      <p className={isTooLong ? "text-xs text-red-700" : "text-xs text-slate-500"}>
        {captionLength} / {SLIDE_CAPTION_MAX_LENGTH} 文字
      </p>
      {hasUnsavedChange ? (
        <Badge variant={isTooLong ? "destructive" : "outline"}>未保存</Badge>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="min-h-11"
        variant={hasUnsavedChange ? "default" : "secondary"}
        disabled={!hasUnsavedChange || isSaving || isDisabled || isTooLong}
        onClick={() => onSave(slideId, normalizedDraftCaption)}
      >
        {isSaving ? "保存中" : "保存"}
      </Button>
    </div>
  );
}

function SlideSingleActions({
  slideId,
  isDisabled,
  isDuplicating,
  isDuplicateLimitReached,
  onDuplicate,
}: {
  slideId: string;
  isDisabled: boolean;
  isDuplicating: boolean;
  isDuplicateLimitReached: boolean;
  onDuplicate: (slideId: string) => Promise<boolean>;
}) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="min-h-11"
        disabled={isDisabled || isDuplicateLimitReached}
        title={
          isDuplicateLimitReached
            ? "スライド数が上限の50件に達しているため、複製できません。"
            : "スライドを複製"
        }
        onClick={() => {
          void onDuplicate(slideId);
        }}
      >
        {isDuplicating ? "複製中" : "複製"}
      </Button>
      {isDuplicateLimitReached ? (
        <p className="text-xs leading-5 text-slate-500">
          スライド数が上限の50件に達しているため、複製できません。
        </p>
      ) : null}
    </div>
  );
}

function SlideReorderControls({
  slideId,
  isFirst,
  isLast,
  isDisabled,
  onMove,
}: {
  slideId: string;
  isFirst: boolean;
  isLast: boolean;
  isDisabled: boolean;
  onMove: (slideId: string, direction: "up" | "down") => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="min-h-11"
        disabled={isDisabled || isFirst}
        onClick={() => onMove(slideId, "up")}
      >
        ↑ 上へ
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="min-h-11"
        disabled={isDisabled || isLast}
        onClick={() => onMove(slideId, "down")}
      >
        ↓ 下へ
      </Button>
    </div>
  );
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

type DriveSlidePreviewState =
  | { status: "loading" }
  | { status: "ready"; objectUrl: string }
  | { status: "error" };

function DriveSlidePreview({
  assetFileId,
  assetType,
  mimeType,
  assetName,
  fetchProjectSlidePreviewBlob,
}: {
  assetFileId: string;
  assetType: "image" | "video";
  mimeType: string;
  assetName: string;
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: string,
    signal: AbortSignal,
  ) => Promise<Blob>;
}) {
  const [previewState, setPreviewState] = useState<DriveSlidePreviewState>({
    status: "loading",
  });

  useEffect(() => {
    if (assetType !== "image") {
      return;
    }

    const abortController = new AbortController();
    let createdObjectUrl: string | null = null;
    let isMounted = true;

    fetchProjectSlidePreviewBlob(assetFileId, mimeType, abortController.signal)
      .then((blob) => {
        if (!isMounted || abortController.signal.aborted) {
          return;
        }

        createdObjectUrl = URL.createObjectURL(blob);
        setPreviewState({
          status: "ready",
          objectUrl: createdObjectUrl,
        });
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }

        if (createdObjectUrl) {
          URL.revokeObjectURL(createdObjectUrl);
          createdObjectUrl = null;
        }

        setPreviewState({ status: "error" });

        if (process.env.NODE_ENV !== "production") {
          console.warn("Drive slide preview fetch failed.");
        }
      });

    return () => {
      isMounted = false;
      abortController.abort();

      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }
    };
  }, [assetFileId, assetType, fetchProjectSlidePreviewBlob, mimeType]);

  if (assetType !== "image") {
    return (
      <div className="flex h-14 w-20 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 text-center text-xs text-amber-800">
        動画素材
      </div>
    );
  }

  if (previewState.status === "loading") {
    return (
      <div className="flex h-14 w-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
        読み込み中
      </div>
    );
  }

  if (previewState.status === "error") {
    return (
      <div className="flex h-14 w-20 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 text-center text-xs text-amber-800">
        プレビュー取得失敗
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewState.objectUrl}
        alt={`${assetName} のプレビュー`}
        className="h-14 w-20 rounded-lg border border-slate-200 object-cover"
        loading="lazy"
        decoding="async"
      />
    </>
  );
}

function getAssetTypeLabel(value: "image" | "video" | undefined) {
  return value ?? "image";
}

function getAssetTypeDisplayLabel(value: "image" | "video" | undefined) {
  return getAssetTypeLabel(value) === "video" ? "動画" : "画像";
}

function getUnsupportedReasonDisplayLabel(reason: string) {
  return reason === "unsupportedVideoMimeType"
    ? "未対応の動画形式"
    : "未対応の素材形式";
}

function parseSlideDurationSeconds(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS ||
    parsedValue > DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS
  ) {
    return null;
  }

  return parsedValue;
}

function formatOptionalDurationMs(value: number | undefined) {
  if (typeof value !== "number") {
    return "未設定";
  }

  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatOptionalBytes(value: number | undefined) {
  return typeof value === "number" ? formatBytes(value) : "未設定";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "未設定";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
