import AppIcon from "src/components/icons/AppIcon"
import {
  getProfileCardIconOptions,
  isAllowedProfileLinkHref,
  normalizeProfileLinkHref,
  type ProfileCardLinkItem,
} from "src/constants/profileCardLinks"
import type { ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import {
  DangerButton,
  DragHandleButton,
  EmptyStateCard,
  FieldBox,
  FieldLabel,
  FieldSectionCard,
  GhostButton,
  IconOptionButton,
  IconOptionText,
  IconPickerButton,
  IconPickerCopy,
  IconPickerField,
  IconPickerPanel,
  IconPreview,
  InlineActionRow,
  Input,
  LinkCardList,
  LinkInputs,
  LinkManagerHeader,
  LinkRowCard,
  MiniButton,
  PreviewAnchor,
  SectionBlockHeader,
  SectionStack,
  SegmentButton,
  SegmentedControl,
} from "src/routes/Admin/AdminProfileWorkspace.styles"
import type { LinkTab } from "src/routes/Admin/AdminProfileWorkspaceModel"
import type { OpenIconPicker } from "src/routes/Admin/AdminProfileWorkspacePageDraftActions"

export const renderAdminProfileLinksSection = (props: Record<string, any>) => {
  const {
    appendLinkItem,
    dragOverLinkIndex,
    dragOverLinkPosition,
    draggingLinkIndex,
    draft,
    linkTab,
    moveLinkItem,
    openIconPicker,
    removeLinkItem,
    reorderLinkItems,
    setDragOverLinkIndex,
    setDragOverLinkPosition,
    setDraggingLinkIndex,
    setLinkTab,
    setOpenIconPicker,
    updateLinkItem,
  } = props as Record<string, any> & { draft: ProfileWorkspaceContent; linkTab: LinkTab }
  const visibleLinks: ProfileCardLinkItem[] = linkTab === "service" ? draft.serviceLinks : draft.contactLinks

  return (
    <SectionStack>
      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>외부 링크</h3>
          </div>
          <SegmentedControl>
            <SegmentButton type="button" data-active={linkTab === "service"} onClick={() => setLinkTab("service")}>
              서비스
            </SegmentButton>
            <SegmentButton type="button" data-active={linkTab === "contact"} onClick={() => setLinkTab("contact")}>
              연락 채널
            </SegmentButton>
          </SegmentedControl>
        </SectionBlockHeader>

        <LinkManagerHeader>
          <div>
            <strong>{linkTab === "service" ? "서비스 링크" : "연락 채널"}</strong>
          </div>
          <GhostButton type="button" onClick={() => appendLinkItem(linkTab)}>
            링크 추가
          </GhostButton>
        </LinkManagerHeader>
        {visibleLinks.length > 0 ? (
          <LinkCardList>
            {visibleLinks.map((item, index) => {
              const section = linkTab
              const options = getProfileCardIconOptions(section)
              const pickerKey = `${section}:${index}` as OpenIconPicker
              const previewHref = normalizeProfileLinkHref(section, item.href)
              const optionLabel = options.find((option) => option.id === item.icon)?.label || "아이콘"

              return (
                <LinkRowCard
                  key={`${section}-${index}`}
                  draggable={true}
                  data-dragging={draggingLinkIndex === index ? "true" : "false"}
                  data-drop-target={dragOverLinkIndex === index && draggingLinkIndex !== index ? "true" : "false"}
                  data-drop-position={dragOverLinkIndex === index ? dragOverLinkPosition || undefined : undefined}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", `${section}:${index}`)
                    setDraggingLinkIndex(index)
                    setDragOverLinkIndex(index)
                    setDragOverLinkPosition("after")
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                    const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect()
                    const nextPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
                    if (dragOverLinkIndex !== index) {
                      setDragOverLinkIndex(index)
                    }
                    setDragOverLinkPosition(nextPosition)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const payload = event.dataTransfer.getData("text/plain")
                    const [dragSection, rawIndex] = payload.split(":")
                    const fromIndex = Number.parseInt(rawIndex ?? "", 10)
                    if (dragSection === section && Number.isFinite(fromIndex)) {
                      const rawTargetIndex =
                        dragOverLinkPosition === "after" && index < visibleLinks.length - 1 ? index + 1 : index
                      const normalizedTargetIndex = fromIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex
                      const nextTargetIndex = Math.max(0, Math.min(visibleLinks.length - 1, normalizedTargetIndex))
                      reorderLinkItems(section, fromIndex, nextTargetIndex)
                    }
                    setDraggingLinkIndex(null)
                    setDragOverLinkIndex(null)
                    setDragOverLinkPosition(null)
                  }}
                  onDragEnd={() => {
                    setDraggingLinkIndex(null)
                    setDragOverLinkIndex(null)
                    setDragOverLinkPosition(null)
                  }}
                >
                  <IconPickerField data-icon-picker-root="true">
                    <FieldLabel as="span">아이콘</FieldLabel>
                    <IconPickerButton
                      type="button"
                      aria-expanded={openIconPicker === pickerKey}
                      onClick={() =>
                        setOpenIconPicker((current: OpenIconPicker) => (current === pickerKey ? null : pickerKey))
                      }
                    >
                      <IconPreview>
                        <AppIcon name={item.icon} />
                      </IconPreview>
                      <IconPickerCopy>
                        <strong>{optionLabel}</strong>
                        <span>{item.icon}</span>
                      </IconPickerCopy>
                      <AppIcon name="chevron-down" />
                    </IconPickerButton>
                    {openIconPicker === pickerKey ? (
                      <IconPickerPanel role="listbox" aria-label="링크 아이콘 선택">
                        {options.map((option) => (
                          <IconOptionButton
                            key={option.id}
                            type="button"
                            data-selected={option.id === item.icon}
                            onClick={() => {
                              updateLinkItem(section, index, "icon", option.id)
                              setOpenIconPicker(null)
                            }}
                          >
                            <IconPreview data-compact={true}>
                              <AppIcon name={option.id} />
                            </IconPreview>
                            <IconOptionText>
                              <strong>{option.label}</strong>
                              <span>{option.id}</span>
                            </IconOptionText>
                          </IconOptionButton>
                        ))}
                      </IconPickerPanel>
                    ) : null}
                  </IconPickerField>

                  <LinkInputs>
                    <FieldBox>
                      <FieldLabel>이름</FieldLabel>
                      <Input
                        value={item.label}
                        placeholder={section === "service" ? "예: aquila-blog" : "예: 이메일"}
                        onChange={(event) => updateLinkItem(section, index, "label", event.target.value)}
                      />
                    </FieldBox>
                    <FieldBox>
                      <FieldLabel>연결 주소</FieldLabel>
                      <Input
                        value={item.href}
                        placeholder={section === "service" ? "https://..." : "mailto:me@example.com 또는 https://..."}
                        onChange={(event) => updateLinkItem(section, index, "href", event.target.value)}
                      />
                    </FieldBox>
                  </LinkInputs>

                  <InlineActionRow className="linkActions">
                    <DragHandleButton aria-hidden="true">
                      <AppIcon name="list" />
                      드래그 정렬
                    </DragHandleButton>
                    <InlineActionRow className="linkActionButtons">
                      {previewHref && isAllowedProfileLinkHref(section, item.href) ? (
                        <PreviewAnchor href={previewHref} target="_blank" rel="noreferrer">
                          열기
                        </PreviewAnchor>
                      ) : (
                        <MiniButton type="button" disabled>
                          열기
                        </MiniButton>
                      )}
                      <MiniButton
                        className="reorderButton"
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveLinkItem(section, index, -1)}
                      >
                        위로
                      </MiniButton>
                      <MiniButton
                        className="reorderButton"
                        type="button"
                        disabled={index === visibleLinks.length - 1}
                        onClick={() => moveLinkItem(section, index, 1)}
                      >
                        아래로
                      </MiniButton>
                      <DangerButton type="button" onClick={() => removeLinkItem(section, index)}>
                        삭제
                      </DangerButton>
                    </InlineActionRow>
                  </InlineActionRow>
                </LinkRowCard>
              )
            })}
          </LinkCardList>
        ) : (
          <EmptyStateCard>
            <strong>아직 등록된 링크가 없습니다</strong>
          </EmptyStateCard>
        )}
      </FieldSectionCard>
    </SectionStack>
  )
}
