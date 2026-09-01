"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductAlertDialog } from "@/components/product-alert-dialog";
import { ProductDisclosure } from "@/components/product-disclosure";
import { ProjectSlideImageView } from "@/components/project-slide-image-view";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAppState,
  type ProjectSlideSummary,
} from "@/app/app-providers";
import {
  DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS,
  DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS,
} from "@/lib/google-drive";
import { formatUiDateTime } from "@/lib/ui-format";
import {
  areProjectSlideImageEditsEqual,
  normalizeProjectSlideImageEditForWrite,
  parseProjectSlideImageEdit,
  type ProjectSlideImageEdit,
} from "@/lib/project-slide-image-edit";
import { AssetCleanupPreviewPanel } from "./asset-cleanup-preview-panel";
import { AssetImportPanel } from "./asset-import-panel";
import { ProjectSlideImageEditorButton } from "./project-slide-image-editor-dialog";

const SLIDE_CAPTION_MAX_LENGTH = 80;
const PROJECT_SLIDE_MAX_COUNT = 50;

type SlideListState = {
  projectId: string | null;
  sourceSlideIds: string[];
  orderedSlideIds: string[];
  selectedSlideIds: Set<string>;
  activeDragSlideId: string | null;
  isMobileSelectionMode: boolean;
  editingSlideId: string | null;
};

export function DriveProjectWorkspacePanel() {
  const {
    projectStatus,
    projectSummary,
    projectDetails,
    fetchProjectSlidePreviewBlob,
    updateProjectSlideEdits,
    moveProjectSlide,
    reorderProjectSlidesByDrag,
    deleteProjectSlides,
    duplicateProjectSlide,
    slideEditsUpdateSlideId,
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
    isMobileSelectionMode: false,
    editingSlideId: null,
  }));
  const slideListStateRef = useRef(slideListState);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const mobileEditorTriggerRef = useRef<HTMLElement | null>(null);
  const bulkDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingDeleteSlideIds, setPendingDeleteSlideIds] = useState<string[] | null>(null);

  const {
    orderedSlideIds,
    selectedSlideIds,
    activeDragSlideId,
    isMobileSelectionMode,
    editingSlideId,
  } = slideListState;
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
  const editingSlide = editingSlideId
    ? slideById.get(editingSlideId) ?? null
    : null;
  const editingSlideIndex = editingSlide
    ? orderedSlideIds.indexOf(editingSlide.slideId)
    : -1;
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
        isMobileSelectionMode: false,
        editingSlideId: null,
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

  function startMobileSelectionMode() {
    updateSlideListState((current) => ({
      ...current,
      isMobileSelectionMode: true,
      editingSlideId: null,
    }));
  }

  function cancelMobileSelectionMode() {
    updateSlideListState((current) => ({
      ...current,
      selectedSlideIds: new Set(),
      isMobileSelectionMode: false,
    }));
  }

  function openMobileSlideEditor(slideId: string, trigger: HTMLElement) {
    mobileEditorTriggerRef.current = trigger;
    updateSlideListState((current) => ({
      ...current,
      editingSlideId: slideId,
    }));
  }

  function closeMobileSlideEditor() {
    updateSlideListState((current) => ({
      ...current,
      editingSlideId: null,
    }));
  }

  function handleDeleteSelectedSlides(
    event?: ReactMouseEvent<HTMLButtonElement>,
  ) {
    if (!canDeleteSelectedSlides) {
      return;
    }

    deleteTriggerRef.current = event?.currentTarget ?? bulkDeleteButtonRef.current;
    setPendingDeleteSlideIds(Array.from(selectedSlideIds));
  }

  function handleDeleteSingleSlide(slideId: string, trigger: HTMLElement) {
    if (areSlideActionsDisabled) {
      return;
    }

    deleteTriggerRef.current = trigger;
    setPendingDeleteSlideIds([slideId]);
  }

  async function confirmDeleteSelectedSlides() {
    const slideIdsToDelete = pendingDeleteSlideIds;
    if (
      !slideIdsToDelete ||
      slideIdsToDelete.length === 0 ||
      areSlideActionsDisabled
    ) {
      return;
    }
    setPendingDeleteSlideIds(null);
    const ok = await deleteProjectSlides(slideIdsToDelete);

    if (ok) {
      updateSlideListState((current) => ({
        ...current,
        selectedSlideIds: new Set(),
        isMobileSelectionMode: false,
        editingSlideId: slideIdsToDelete.includes(current.editingSlideId ?? "")
          ? null
          : current.editingSlideId,
      }));
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
          <p className="font-semibold">編集するアルバムを選択してください</p>
          <p className="mt-1 text-sm leading-6">アルバムを選択すると、素材の追加とスライド編集を始められます。</p>
          <a href="#project" className="mt-3 inline-flex min-h-11 items-center font-medium underline decoration-amber-300/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
            アルバムを選択
          </a>
        </div>
      ) : null}

      <ProductDisclosure label="使い方を見る">
        <div className="space-y-2">
          <p>写真や動画を追加し、スライドをドラッグして並び替えます。</p>
          <p>変更を再生に反映するには、あとで「ローカル」から保存してください。公開は別の操作です。</p>
          <p>大容量動画は本体をローカルへ保存せず、オンライン時に再生します。対応形式や上限は素材追加の詳細で確認できます。</p>
        </div>
      </ProductDisclosure>

      <section aria-labelledby="asset-import-heading">
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle><h3 id="asset-import-heading">素材を追加</h3></CardTitle>
            <CardDescription>
              写真または動画を選び、このアルバムへ追加します。
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
                <div
                  data-mobile-slide-toolbar
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 xl:hidden"
                >
                  {isMobileSelectionMode ? (
                    <>
                      <div className="flex min-h-11 items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">
                          {selectedCount}件選択中
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-11"
                          onClick={cancelMobileSelectionMode}
                        >
                          キャンセル
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-h-11 w-full"
                        disabled={!canDeleteSelectedSlides}
                        onClick={handleDeleteSelectedSlides}
                      >
                        {isSlideDeleteInFlight
                          ? "削除中"
                          : "選択したスライドを削除"}
                      </Button>
                    </>
                  ) : (
                    <div className="flex min-h-11 items-center justify-between gap-3">
                      <p className="text-xs leading-5 text-slate-500">
                        カードを開いて内容を編集できます。
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="min-h-11 shrink-0"
                        onClick={startMobileSelectionMode}
                      >
                        選択
                      </Button>
                    </div>
                  )}
                </div>

                <div className="hidden flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 xl:flex xl:flex-row xl:items-center xl:justify-between">
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
                      ref={bulkDeleteButtonRef}
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
                    strategy={rectSortingStrategy}
                  >
                    <div className="min-w-0 xl:overflow-hidden xl:rounded-xl xl:border xl:border-slate-200">
                      <div className="hidden gap-2 bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid xl:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)]">
                        <p>選択</p>
                        <p>順番</p>
                        <p>プレビュー</p>
                        <p>素材</p>
                        <p>並び替え</p>
                        <p>操作</p>
                        <p>編集</p>
                      </div>
                      <div
                        data-mobile-slide-card-grid
                        className="grid min-w-0 gap-3 md:grid-cols-2 xl:block xl:divide-y xl:divide-slate-200"
                      >
                        {orderedSlides.map((slide, index) => (
                          <SortableSlideRow
                            key={`${slide.slideIdPart}-${slide.assetIdPart}`}
                            slideId={slide.slideId}
                            isDisabled={areSlideActionsDisabled}
                            isDragging={activeDragSlideId === slide.slideId}
                          >
                            {({ dragHandle }) => (
                              <>
                                <label
                                  className={
                                    isMobileSelectionMode
                                      ? "absolute left-3 top-3 z-20 flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/95 text-xs text-slate-600 shadow-sm xl:static xl:rounded-lg xl:border-0 xl:bg-transparent xl:shadow-none"
                                      : "hidden items-center gap-2 text-xs text-slate-600 xl:flex"
                                  }
                                >
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
                                    className="size-5 rounded border-slate-300"
                                  />
                                  <span className="sr-only">
                                    スライド {index + 1} を選択
                                  </span>
                                </label>
                                <div className="contents xl:flex xl:min-w-11 xl:flex-col xl:items-start xl:gap-2">
                                  <p
                                    className={
                                      isMobileSelectionMode
                                        ? "absolute left-4 top-16 z-10 rounded-full bg-slate-950/65 px-2 py-0.5 text-xs font-semibold text-white xl:static xl:bg-transparent xl:px-0 xl:py-0 xl:text-sm xl:text-slate-900"
                                        : "absolute left-4 top-4 z-10 rounded-full bg-slate-950/65 px-2 py-0.5 text-xs font-semibold text-white xl:static xl:bg-transparent xl:px-0 xl:py-0 xl:text-sm xl:text-slate-900"
                                    }
                                  >
                                    <span className="xl:hidden">#{index + 1}</span>
                                    <span className="hidden xl:inline">{index + 1}</span>
                                  </p>
                                  <span className="absolute left-16 top-3 z-10 md:left-24 xl:static">
                                    {dragHandle}
                                  </span>
                                </div>
                                <DriveSlidePreview
                                  assetFileId={slide.assetFileId}
                                  assetType={getAssetTypeLabel(slide.type)}
                                  mimeType={slide.mimeType}
                                  assetName={slide.assetName}
                                  imageEdit={slide.imageEdit}
                                  fetchProjectSlidePreviewBlob={
                                    fetchProjectSlidePreviewBlob
                                  }
                                  size="card"
                                />
                                <div className="flex min-w-0 flex-col xl:block">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    <p className="line-clamp-2 min-w-0 basis-full break-words font-semibold leading-5 text-slate-950 xl:basis-auto">
                                      {slide.assetName}
                                    </p>
                                    <Badge variant="secondary">
                                      {getAssetTypeDisplayLabel(slide.type)}
                                    </Badge>
                                    <Badge variant="default">
                                      {slide.durationSeconds}秒
                                    </Badge>
                                    {slide.imageEdit ? (
                                      <Badge
                                        variant="outline"
                                        className="border-sky-200 bg-sky-50 text-sky-800"
                                      >
                                        画像編集あり
                                      </Badge>
                                    ) : null}
                                    {slide.unsupportedReason ? (
                                      <Badge variant="destructive">
                                        {getUnsupportedReasonDisplayLabel(
                                          slide.unsupportedReason,
                                        )}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  {slide.caption ? (
                                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">
                                      {slide.caption}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 hidden text-xs text-slate-500 xl:block">
                                    作成日時:{" "}
                                    {slide.sourceCreateTime
                                      ? formatUiDateTime(slide.sourceCreateTime)
                                      : "取得なし"}
                                  </p>
                                  <p className="mt-1 hidden text-xs text-slate-500 xl:block">
                                    動画の実時間:{" "}
                                    {formatOptionalDurationMs(slide.durationMs)} / 容量:{" "}
                                    {formatOptionalBytes(slide.fileSize)}
                                  </p>
                                  <div className="mt-auto flex justify-end pt-1 xl:hidden">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="min-h-11 min-w-11 px-3 text-slate-700"
                                      disabled={isMobileSelectionMode}
                                      aria-label={`スライド ${index + 1} を編集`}
                                      onClick={(event) =>
                                        openMobileSlideEditor(
                                          slide.slideId,
                                          event.currentTarget,
                                        )
                                      }
                                    >
                                      編集 <span aria-hidden="true">›</span>
                                    </Button>
                                  </div>
                                </div>
                                <div className="hidden xl:contents">
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
                                    isDeleting={isSlideDeleteInFlight}
                                    isDuplicateLimitReached={
                                      slideCount !== null &&
                                      slideCount >= PROJECT_SLIDE_MAX_COUNT
                                    }
                                    onDuplicate={duplicateProjectSlide}
                                    onDelete={handleDeleteSingleSlide}
                                  />
                                </div>
                                <div className="hidden space-y-2 xl:block">
                                  <SlideEditForm
                                    key={slideEditFormKey(slide)}
                                    slide={slide}
                                    variant="compact"
                                    isSaving={slideEditsUpdateSlideId === slide.slideId}
                                    isDisabled={areSlideActionsDisabled}
                                    fetchProjectSlidePreviewBlob={fetchProjectSlidePreviewBlob}
                                    onSave={updateProjectSlideEdits}
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
              スライド順、テロップ、表示時間の変更を再生に反映するには、このアルバムをローカルに保存してください。
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
          </CardContent>
        </Card>
      </section>

      {editingSlide && editingSlideIndex >= 0 ? (
        <MobileSlideDetailEditor
          key={slideEditFormKey(editingSlide)}
          triggerRef={mobileEditorTriggerRef}
          slide={editingSlide}
          slideNumber={editingSlideIndex + 1}
          isBusy={isSlideEditInFlight}
          isDisabled={areSlideActionsDisabled}
          isSaving={slideEditsUpdateSlideId === editingSlide.slideId}
          isDuplicating={isSlideDuplicateInFlight}
          isDeleting={isSlideDeleteInFlight}
          isDuplicateLimitReached={
            slideCount !== null && slideCount >= PROJECT_SLIDE_MAX_COUNT
          }
          editMessage={slideEditMessage}
          editDiagnostics={slideEditDiagnostics}
          fetchProjectSlidePreviewBlob={fetchProjectSlidePreviewBlob}
          onSave={updateProjectSlideEdits}
          onDuplicate={duplicateProjectSlide}
          onDelete={handleDeleteSingleSlide}
          onClose={closeMobileSlideEditor}
        />
      ) : null}

      {pendingDeleteSlideIds ? (
        <ProductAlertDialog
          title={
            pendingDeleteSlideIds.length === 1
              ? "このスライドを削除しますか？"
              : "選択したスライドを削除しますか？"
          }
          description={
            pendingDeleteSlideIds.length === 1
              ? "このスライドをアルバムから削除します。\nGoogle Drive上の素材ファイルは削除しません。\nローカルへの反映には、保存をもう一度実行してください。"
              : `選択した${pendingDeleteSlideIds.length}件のスライドをこのアルバムから削除します。\nGoogle Drive上の素材ファイルは削除しません。\nローカルへの反映には、保存をもう一度実行してください。`
          }
          confirmLabel="スライドを削除"
          triggerRef={deleteTriggerRef}
          onCancel={() => setPendingDeleteSlideIds(null)}
          onConfirm={confirmDeleteSelectedSlides}
        />
      ) : null}
    </div>
  );
}

function MobileSlideDetailEditor({
  triggerRef,
  slide,
  slideNumber,
  isBusy,
  isDisabled,
  isSaving,
  isDuplicating,
  isDeleting,
  isDuplicateLimitReached,
  editMessage,
  editDiagnostics,
  fetchProjectSlidePreviewBlob,
  onSave,
  onDuplicate,
  onDelete,
  onClose,
}: {
  triggerRef: RefObject<HTMLElement | null>;
  slide: ProjectSlideSummary;
  slideNumber: number;
  isBusy: boolean;
  isDisabled: boolean;
  isSaving: boolean;
  isDuplicating: boolean;
  isDeleting: boolean;
  isDuplicateLimitReached: boolean;
  editMessage: string | null;
  editDiagnostics: string[];
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: string,
    signal: AbortSignal,
  ) => Promise<Blob>;
  onSave: SlideEditSaveHandler;
  onDuplicate: (slideId: string) => Promise<boolean>;
  onDelete: (slideId: string, trigger: HTMLElement) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelDialog = useEffectEvent(() => {
    if (!isBusy) onClose();
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      const activeModal = document.activeElement?.closest(
        '[role="dialog"], [role="alertdialog"]',
      );
      if (activeModal && activeModal !== dialogRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        cancelDialog();
        return;
      }

      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      triggerElement?.focus();
    };
  }, [triggerRef]);

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/85 backdrop-blur-sm sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-mobile-slide-detail
        className="flex min-h-svh w-full flex-col bg-white text-slate-950 shadow-2xl outline-none sm:mx-auto sm:my-4 sm:min-h-0 sm:max-w-5xl sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:rounded-t-3xl sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold sm:text-xl">
              スライド {slideNumber} を編集
            </h2>
            <p id={descriptionId} className="truncate text-xs text-slate-500">
              {slide.assetName}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            disabled={isBusy}
            onClick={onClose}
          >
            閉じる
          </Button>
        </header>

        <div className="grid flex-1 gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-2xl bg-slate-950">
              <DriveSlidePreview
                assetFileId={slide.assetFileId}
                assetType={getAssetTypeLabel(slide.type)}
                mimeType={slide.mimeType}
                assetName={slide.assetName}
                imageEdit={slide.imageEdit}
                fetchProjectSlidePreviewBlob={fetchProjectSlidePreviewBlob}
                size="detail"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant={
                  getAssetTypeLabel(slide.type) === "video"
                    ? "secondary"
                    : "outline"
                }
              >
                {getAssetTypeDisplayLabel(slide.type)}
              </Badge>
              <Badge variant="secondary">{slide.durationSeconds}秒</Badge>
              {slide.imageEdit ? (
                <Badge variant="outline">画像編集あり</Badge>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 space-y-6">
            <SlideEditForm
              slide={slide}
              variant="detail"
              isSaving={isSaving}
              isDisabled={isDisabled}
              fetchProjectSlidePreviewBlob={fetchProjectSlidePreviewBlob}
              onSave={onSave}
            />

            {editMessage ? (
              <SlideEditResult
                message={editMessage}
                diagnostics={editDiagnostics}
              />
            ) : null}

            <section
              aria-labelledby={`${titleId}-secondary-actions`}
              className="border-t border-slate-200 pt-5"
            >
              <h3
                id={`${titleId}-secondary-actions`}
                className="text-sm font-semibold text-slate-700"
              >
                その他
              </h3>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 flex-1"
                  disabled={isDisabled || isDuplicateLimitReached}
                  onClick={() => {
                    void onDuplicate(slide.slideId);
                  }}
                >
                  {isDuplicating ? "複製中" : "スライドを複製"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11 flex-1"
                  disabled={isDisabled}
                  onClick={(event) =>
                    onDelete(slide.slideId, event.currentTarget)
                  }
                >
                  {isDeleting ? "削除中" : "スライドを削除"}
                </Button>
              </div>
              {isDuplicateLimitReached ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  スライド数が上限の50件に達しているため、複製できません。
                </p>
              ) : null}
            </section>
          </div>
        </div>

        <footer
          data-mobile-slide-detail-actions
          className="sticky bottom-0 z-10 mt-auto border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur sm:rounded-b-3xl sm:px-6"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 sm:min-w-28"
              disabled={isBusy}
              onClick={onClose}
            >
              閉じる
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SlideEditResult({
  message,
  diagnostics,
}: {
  message: string;
  diagnostics: string[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <p className="font-medium text-slate-900">{message}</p>
      {diagnostics.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs">
          {diagnostics.map((diagnostic, index) => (
            <p key={`${index}-${diagnostic}`}>・{diagnostic}</p>
          ))}
        </div>
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
      className="inline-flex size-11 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-base font-semibold leading-none text-slate-500 shadow-none hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 xl:rounded-md"
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
          ? "relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm opacity-90 shadow-lg ring-2 ring-slate-300 sm:p-4 md:p-3 xl:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)] xl:rounded-none xl:border-0 xl:px-3 xl:py-2"
          : "relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm sm:p-4 md:p-3 xl:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)] xl:rounded-none xl:border-0 xl:px-3 xl:py-2 xl:shadow-none"
      }
    >
      {children({ dragHandle })}
    </div>
  );
}

type SlideEditSaveHandler = (input: {
  slideId: string;
  caption: string;
  durationSeconds: number;
  imageEdit: ProjectSlideImageEdit | undefined;
}) => Promise<boolean>;

function SlideEditForm({
  slide,
  variant,
  isSaving,
  isDisabled,
  fetchProjectSlidePreviewBlob,
  onSave,
}: {
  slide: ProjectSlideSummary;
  variant: "compact" | "detail";
  isSaving: boolean;
  isDisabled: boolean;
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: string,
    signal: AbortSignal,
  ) => Promise<Blob>;
  onSave: SlideEditSaveHandler;
}) {
  const [draftCaption, setDraftCaption] = useState(slide.caption);
  const [draftDurationSeconds, setDraftDurationSeconds] = useState(
    `${slide.durationSeconds}`,
  );
  const [draftImageEdit, setDraftImageEdit] = useState<
    ProjectSlideImageEdit | undefined
  >(() => normalizeProjectSlideImageEditForWrite(slide.imageEdit));
  const submitGuardRef = useRef(false);
  const normalizedCaption = draftCaption.trim();
  const captionLength = [...normalizedCaption].length;
  const isCaptionInvalid = captionLength > SLIDE_CAPTION_MAX_LENGTH;
  const parsedDurationSeconds = parseSlideDurationSeconds(draftDurationSeconds);
  const isDurationEmpty = draftDurationSeconds.trim() === "";
  const isDurationInvalid = !isDurationEmpty && parsedDurationSeconds === null;
  const parsedImageEdit =
    draftImageEdit === undefined
      ? { ok: true as const, value: undefined }
      : parseProjectSlideImageEdit(draftImageEdit);
  const normalizedImageEdit = parsedImageEdit.ok
    ? normalizeProjectSlideImageEditForWrite(parsedImageEdit.value)
    : undefined;
  const hasDurationChange =
    parsedDurationSeconds === null
      ? draftDurationSeconds !== `${slide.durationSeconds}`
      : parsedDurationSeconds !== slide.durationSeconds;
  const isDirty =
    normalizedCaption !== slide.caption.trim() ||
    hasDurationChange ||
    !areProjectSlideImageEditsEqual(slide.imageEdit, normalizedImageEdit);
  const isValid =
    !isCaptionInvalid && parsedDurationSeconds !== null && parsedImageEdit.ok;

  function changeDuration(delta: -1 | 1) {
    const current = parsedDurationSeconds ?? slide.durationSeconds;
    setDraftDurationSeconds(
      `${Math.min(
        DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS,
        Math.max(DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS, current + delta),
      )}`,
    );
  }

  async function saveChanges() {
    if (
      submitGuardRef.current ||
      !isDirty ||
      !isValid ||
      parsedDurationSeconds === null ||
      isSaving ||
      isDisabled
    ) {
      return;
    }
    submitGuardRef.current = true;
    try {
      await onSave({
        slideId: slide.slideId,
        caption: normalizedCaption,
        durationSeconds: parsedDurationSeconds,
        imageEdit: normalizedImageEdit,
      });
    } finally {
      submitGuardRef.current = false;
    }
  }

  const durationEditor =
    variant === "detail" ? (
      <section aria-label="表示時間">
        <h3 className="font-semibold">表示時間</h3>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <Button
            type="button"
            variant="outline"
            className="size-11 shrink-0 p-0 text-xl"
            disabled={
              isDisabled ||
              parsedDurationSeconds === null ||
              parsedDurationSeconds <= DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS
            }
            aria-label="表示時間を1秒減らす"
            onClick={() => changeDuration(-1)}
          >
            −
          </Button>
          <output className="min-w-0 text-center text-xl font-semibold tabular-nums">
            {draftDurationSeconds}秒
          </output>
          <Button
            type="button"
            variant="outline"
            className="size-11 shrink-0 p-0 text-xl"
            disabled={
              isDisabled ||
              parsedDurationSeconds === null ||
              parsedDurationSeconds >= DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS
            }
            aria-label="表示時間を1秒増やす"
            onClick={() => changeDuration(1)}
          >
            ＋
          </Button>
        </div>
      </section>
    ) : (
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
      </div>
    );

  return (
    <div className={variant === "detail" ? "space-y-6" : "space-y-2"}>
      {durationEditor}
      <section aria-label="テロップ">
        {variant === "detail" ? <h3 className="font-semibold">テロップ</h3> : null}
        <div className={variant === "detail" ? "mt-3" : "flex flex-wrap items-center gap-1.5 sm:gap-2"}>
          <textarea
            value={draftCaption}
            onChange={(event) => setDraftCaption(event.target.value)}
            maxLength={SLIDE_CAPTION_MAX_LENGTH + 20}
            rows={variant === "detail" ? 5 : 1}
            aria-label="テロップ"
            className={
              variant === "detail"
                ? "min-h-32 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                : "min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            }
            placeholder="テロップを入力"
          />
          <p className={isCaptionInvalid ? "text-xs text-red-700" : "text-xs text-slate-500"}>
            {captionLength} / {SLIDE_CAPTION_MAX_LENGTH} 文字
          </p>
        </div>
      </section>
      {getAssetTypeLabel(slide.type) === "image" ? (
        <section aria-label="画像編集">
          <ProjectSlideImageEditorButton
            assetFileId={slide.assetFileId}
            mimeType={slide.mimeType}
            assetName={slide.assetName}
            imageEdit={normalizedImageEdit}
            disabled={isDisabled || isSaving}
            fetchProjectSlidePreviewBlob={fetchProjectSlidePreviewBlob}
            onChange={setDraftImageEdit}
          />
        </section>
      ) : null}
      {isDirty ? <Badge variant={isValid ? "outline" : "destructive"}>未保存</Badge> : null}
      {isDurationEmpty ? (
        <p className="text-xs text-red-700">表示時間を入力してください。</p>
      ) : null}
      {isDurationInvalid ? (
        <p className="text-xs text-red-700">
          表示時間は {DRIVE_PROJECT_SLIDE_DURATION_MIN_SECONDS}〜
          {DRIVE_PROJECT_SLIDE_DURATION_MAX_SECONDS} 秒の整数で入力してください。
        </p>
      ) : null}
      {isCaptionInvalid ? (
        <p className="text-xs text-red-700">
          テロップは {SLIDE_CAPTION_MAX_LENGTH} 文字以内で入力してください。
        </p>
      ) : null}
      {!parsedImageEdit.ok ? (
        <p className="text-xs text-red-700">画像調整の内容を確認してください。</p>
      ) : null}
      <Button
        type="button"
        size={variant === "compact" ? "sm" : "default"}
        className="min-h-11"
        variant={isDirty ? "default" : "secondary"}
        disabled={!isDirty || !isValid || isSaving || isDisabled}
        onClick={() => void saveChanges()}
      >
        {isSaving ? "保存中" : "変更を保存"}
      </Button>
    </div>
  );
}

function SlideSingleActions({
  slideId,
  isDisabled,
  isDuplicating,
  isDeleting,
  isDuplicateLimitReached,
  onDuplicate,
  onDelete,
}: {
  slideId: string;
  isDisabled: boolean;
  isDuplicating: boolean;
  isDeleting: boolean;
  isDuplicateLimitReached: boolean;
  onDuplicate: (slideId: string) => Promise<boolean>;
  onDelete: (slideId: string, trigger: HTMLElement) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11 min-w-11 px-2.5"
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
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="min-h-11 min-w-11 px-2.5"
          disabled={isDisabled}
          aria-label="このスライドを削除"
          title="このスライドを削除"
          onClick={(event) => {
            onDelete(slideId, event.currentTarget);
          }}
        >
          {isDeleting ? "削除中" : "削除"}
        </Button>
      </div>
      {isDuplicateLimitReached ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">
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
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="min-h-11 min-w-11 px-0 sm:w-auto sm:px-2.5"
        disabled={isDisabled || isFirst}
        aria-label="このスライドを上へ移動"
        title="このスライドを上へ移動"
        onClick={() => onMove(slideId, "up")}
      >
        ↑<span className="hidden sm:inline"> 上へ</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="min-h-11 min-w-11 px-0 sm:w-auto sm:px-2.5"
        disabled={isDisabled || isLast}
        aria-label="このスライドを下へ移動"
        title="このスライドを下へ移動"
        onClick={() => onMove(slideId, "down")}
      >
        ↓<span className="hidden sm:inline"> 下へ</span>
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
  imageEdit,
  fetchProjectSlidePreviewBlob,
  size = "row",
}: {
  assetFileId: string;
  assetType: "image" | "video";
  mimeType: string;
  assetName: string;
  imageEdit?: ProjectSlideImageEdit;
  size?: "row" | "card" | "detail";
  fetchProjectSlidePreviewBlob: (
    assetFileId: string,
    expectedMimeType: string,
    signal: AbortSignal,
  ) => Promise<Blob>;
}) {
  const [previewState, setPreviewState] = useState<DriveSlidePreviewState>({
    status: "loading",
  });
  const previewClassName = getDriveSlidePreviewClassName(size);

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
      <div className={`${previewClassName} flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-2 text-center text-xs text-amber-800`}>
        動画素材
      </div>
    );
  }

  if (previewState.status === "loading") {
    return (
      <div className={`${previewClassName} flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500`}>
        読み込み中
      </div>
    );
  }

  if (previewState.status === "error") {
    return (
      <div className={`${previewClassName} flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-2 text-center text-xs text-amber-800`}>
        プレビュー取得失敗
      </div>
    );
  }

  return (
    <ProjectSlideImageView
      src={previewState.objectUrl}
      alt={`${assetName} のプレビュー`}
      imageEdit={imageEdit}
      className={`${previewClassName} rounded-xl border border-slate-200 bg-slate-950`}
    />
  );
}

function getDriveSlidePreviewClassName(size: "row" | "card" | "detail") {
  if (size === "detail") {
    return "h-56 w-full sm:h-80";
  }
  if (size === "card") {
    return "h-24 w-24 shrink-0 md:h-28 md:w-32 xl:h-14 xl:w-20";
  }
  return "h-14 w-20 shrink-0";
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

function slideEditFormKey(slide: ProjectSlideSummary) {
  return JSON.stringify([
    slide.slideId,
    slide.caption,
    slide.durationSeconds,
    slide.imageEdit ?? null,
  ]);
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
