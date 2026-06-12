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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState } from "@/app/app-providers";
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
    driveProjects,
    projectSummary,
    projectDetails,
    fetchProjectSlidePreviewBlob,
    updateProjectSlideCaption,
    moveProjectSlide,
    reorderProjectSlidesByDrag,
    deleteProjectSlides,
    duplicateProjectSlide,
    captionUpdateSlideId,
    captionUpdateMessage,
    captionUpdateDiagnostics,
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
  const assetCount =
    readyProjectDetails?.assetCount ?? projectSummary?.assetCount ?? 0;
  const slideCount =
     readyProjectDetails?.slideCount ?? projectSummary?.slideCount ?? 0;
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

  async function handleDeleteSelectedSlides() {
    if (!canDeleteSelectedSlides) {
      return;
    }

    const slideIdsToDelete = Array.from(selectedSlideIds);
    const confirmed = window.confirm(
      [
        `選択した${slideIdsToDelete.length}件の slide をこの project から削除します。`,
        "Drive assets/ の画像ファイルは削除しません。",
        "iPad再生に反映するには offline sync が必要です。",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

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
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>Driveプロジェクト数</CardTitle>
            <CardDescription>index.json.projects で確認済みの件数</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{driveProjects.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>素材数</CardTitle>
            <CardDescription>Drive assets/ 配下の素材管理</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{assetCount}</p>
            <p className="mt-2 text-sm text-slate-500">
              manifest.json.slides が参照する検証済みasset数を表示します。
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>本編スライド数</CardTitle>
            <CardDescription>manifest.json.slides の編集対象</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{slideCount}</p>
            <p className="mt-2 text-sm text-slate-500">
              manifest.json.slides の件数を表示します。各slideのテロップは下の一覧で編集できます。
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>選択中Driveプロジェクト</CardTitle>
            <CardDescription>
              Drive上で検証済みの選択中projectを表示します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {projectSummary ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{projectSummary.title}</h2>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {projectSummary.manifestPath}
                    </p>
                  </div>
                  <Badge
                    variant={projectStatus === "ready" ? "default" : "secondary"}
                  >
                    {projectStatus === "ready" ? "Drive確認済み" : "確認待ち"}
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-900">projectId</dt>
                    <dd>{projectSummary.projectIdPart}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">作成日時</dt>
                    <dd>{projectSummary.createdAt}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">更新日時</dt>
                    <dd>{projectSummary.updatedAt}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">素材数</dt>
                    <dd>{assetCount}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">本編スライド数</dt>
                    <dd>{slideCount}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">スライド編集</dt>
                    <dd>テロップ編集に対応</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
                Drive project はまだ表示できません。上のDriveプロジェクト状態で
                ready になっていることを確認してください。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>素材管理</CardTitle>
            <CardDescription>
              Google Photos Picker 連携後に、assets/ 配下へ保存する素材を扱います。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssetImportPanel />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-white text-slate-950">
          <CardHeader>
            <CardTitle>本編スライド順</CardTitle>
            <CardDescription>
              画像の順番とテロップを編集します。反映にはoffline syncが必要です。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">画像の順番</p>
              <p className="mt-1">
                この順番が /player の再生順になります。変更後、iPad再生に反映するには
                offline sync を実行してください。
              </p>
              {slideReorderBlockedReason ? (
                <p className="mt-2 text-xs text-slate-500">
                  現在の状態: {slideReorderBlockedReason}
                </p>
              ) : null}
            </div>
            {slides.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {selectedCount > 0
                        ? `${selectedCount}件選択中`
                        : "slideを選択して一括操作できます"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      すべて削除すると、この project は再生対象 slide がない状態になります。
                      Drive assets/ の画像ファイルは削除しません。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={selectedCount === 0 || isSlideEditInFlight}
                      onClick={clearSelectedSlides}
                    >
                      選択解除
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={!canDeleteSelectedSlides}
                      onClick={handleDeleteSelectedSlides}
                    >
                      {isSlideDeleteInFlight
                        ? "削除中"
                        : "選択した slide を削除"}
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
                      <div className="grid gap-3 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)]">
                        <p>選択</p>
                        <p>順番</p>
                        <p>プレビュー</p>
                        <p>asset</p>
                        <p>並び替え</p>
                        <p>操作</p>
                        <p>テロップ</p>
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
                                  <span className="sr-only">slide を選択</span>
                                </label>
                                <div className="space-y-2">
                                  <p className="font-medium">{index + 1}</p>
                                  {dragHandle}
                                </div>
                                <DriveSlidePreview
                                  assetFileId={slide.assetFileId}
                                  mimeType={slide.mimeType}
                                  assetName={slide.assetName}
                                  fetchProjectSlidePreviewBlob={
                                    fetchProjectSlidePreviewBlob
                                  }
                                />
                                <div>
                                  <p className="font-medium">{slide.assetName}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    source: {slide.sourceMimeType} / createTime:{" "}
                                    {slide.sourceCreateTime}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    slide: {slide.slideIdPart} /{" "}
                                    {slide.durationSeconds}秒 / {slide.mimeType}
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
                                    slideCount >= PROJECT_SLIDE_MAX_COUNT
                                  }
                                  onDuplicate={duplicateProjectSlide}
                                />
                                <SlideCaptionEditor
                                  key={`${slide.slideId}:${slide.caption}`}
                                  slideId={slide.slideId}
                                  caption={slide.caption}
                                  isSaving={captionUpdateSlideId === slide.slideId}
                                  isDisabled={isSlideEditInFlight}
                                  onSave={updateProjectSlideCaption}
                                />
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
                  manifest.json.slides に追加済みのスライドがここに表示されます。
                  素材を追加すると、ここでテロップを編集できます。
                </p>
              </div>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              画像順とテロップ変更をiPad再生に反映するには、このprojectをoffline syncしてください。
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
          </CardContent>
        </Card>
      </section>
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
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-xs text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      {...attributes}
      {...listeners}
    >
      ☰ ドラッグして並び替え
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        isDragging
          ? "grid gap-3 bg-white px-4 py-3 text-sm opacity-90 shadow-lg ring-2 ring-slate-300 lg:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)]"
          : "grid gap-3 bg-white px-4 py-3 text-sm lg:grid-cols-[3rem_4rem_8rem_minmax(0,1fr)_9rem_8rem_minmax(14rem,1.4fr)]"
      }
    >
      {children({ dragHandle })}
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">テロップ</p>
        {hasUnsavedChange ? (
          <Badge variant={isTooLong ? "destructive" : "outline"}>未保存</Badge>
        ) : null}
      </div>
      <textarea
        value={draftCaption}
        onChange={(event) => setDraftCaption(event.target.value)}
        maxLength={SLIDE_CAPTION_MAX_LENGTH + 20}
        rows={3}
        className="mt-2 min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        placeholder="テロップを入力"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={isTooLong ? "text-xs text-red-700" : "text-xs text-slate-500"}>
          {captionLength} / {SLIDE_CAPTION_MAX_LENGTH} 文字
        </p>
        <Button
          type="button"
          size="sm"
          variant={hasUnsavedChange ? "default" : "secondary"}
          disabled={!hasUnsavedChange || isSaving || isDisabled || isTooLong}
          onClick={() => onSave(slideId, normalizedDraftCaption)}
        >
          {isSaving ? "保存中" : "保存"}
        </Button>
      </div>
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
        disabled={isDisabled || isDuplicateLimitReached}
        title={
          isDuplicateLimitReached
            ? "slide 数が上限の50件に達しているため、複製できません。"
            : "slideを複製"
        }
        onClick={() => {
          void onDuplicate(slideId);
        }}
      >
        {isDuplicating ? "複製中" : "複製"}
      </Button>
      {isDuplicateLimitReached ? (
        <p className="text-xs leading-5 text-slate-500">
          slide 数が上限の50件に達しているため、複製できません。
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
        disabled={isDisabled || isFirst}
        onClick={() => onMove(slideId, "up")}
      >
        ↑ 上へ
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
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
  mimeType,
  assetName,
  fetchProjectSlidePreviewBlob,
}: {
  assetFileId: string;
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
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        if (createdObjectUrl) {
          URL.revokeObjectURL(createdObjectUrl);
          createdObjectUrl = null;
        }

        setPreviewState({ status: "error" });

        if (process.env.NODE_ENV !== "production") {
          console.warn("Drive slide preview fetch failed.", error);
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
  }, [assetFileId, fetchProjectSlidePreviewBlob, mimeType]);

  if (previewState.status === "loading") {
    return (
      <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
        読み込み中
      </div>
    );
  }

  if (previewState.status === "error") {
    return (
      <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 text-center text-xs text-amber-800">
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
        className="h-16 w-24 rounded-lg border border-slate-200 object-cover"
        loading="lazy"
        decoding="async"
      />
    </>
  );
}
