import { type Dispatch, type SetStateAction, useCallback } from "react"
import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"
import type { AboutProjectBlock, AboutSectionBlock, ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import {
  createBlankAboutProject,
  createBlankAboutSection,
  createBlankLinkItem,
  type LinkTab,
  moveListItem,
  reorderListItem,
} from "src/routes/Admin/AdminProfileWorkspaceModel"

export type OpenIconPicker = `${LinkTab}:${number}` | null

type UseAdminProfileWorkspaceDraftActionsArgs = {
  setDraft: Dispatch<SetStateAction<ProfileWorkspaceContent>>
  setOpenIconPicker: Dispatch<SetStateAction<OpenIconPicker>>
}

export const useAdminProfileWorkspaceDraftActions = ({
  setDraft,
  setOpenIconPicker,
}: UseAdminProfileWorkspaceDraftActionsArgs) => {
  const updateDraft = useCallback(
    (
      field: keyof ProfileWorkspaceContent,
      value:
        | string
        | ProfileCardLinkItem[]
        | AboutSectionBlock[]
        | ((current: ProfileWorkspaceContent) => ProfileWorkspaceContent)
    ) => {
      if (typeof value === "function") {
        setDraft((current) => value(current))
        return
      }

      setDraft((current) => ({
        ...current,
        [field]: value,
      }))
    },
    [setDraft]
  )

  const updateLinkItem = useCallback(
    (section: LinkTab, index: number, field: keyof ProfileCardLinkItem, value: string) => {
      setDraft((current) => {
        const key = section === "service" ? "serviceLinks" : "contactLinks"
        return {
          ...current,
          [key]: current[key].map((item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  [field]: value,
                }
              : item
          ),
        }
      })
    },
    [setDraft]
  )

  const appendLinkItem = useCallback(
    (section: LinkTab) => {
      setDraft((current) => {
        const key = section === "service" ? "serviceLinks" : "contactLinks"
        return {
          ...current,
          [key]: [...current[key], createBlankLinkItem(section)],
        }
      })
    },
    [setDraft]
  )

  const removeLinkItem = useCallback(
    (section: LinkTab, index: number) => {
      setDraft((current) => {
        const key = section === "service" ? "serviceLinks" : "contactLinks"
        return {
          ...current,
          [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
        }
      })
      setOpenIconPicker((current) => (current === `${section}:${index}` ? null : current))
    },
    [setDraft, setOpenIconPicker]
  )

  const moveLinkItem = useCallback(
    (section: LinkTab, index: number, direction: -1 | 1) => {
      setDraft((current) => {
        const key = section === "service" ? "serviceLinks" : "contactLinks"
        return {
          ...current,
          [key]: moveListItem(current[key], index, direction),
        }
      })
    },
    [setDraft]
  )

  const reorderLinkItems = useCallback(
    (section: LinkTab, fromIndex: number, toIndex: number) => {
      setDraft((current) => {
        const key = section === "service" ? "serviceLinks" : "contactLinks"
        return {
          ...current,
          [key]: reorderListItem(current[key], fromIndex, toIndex),
        }
      })
    },
    [setDraft]
  )

  const updateAboutSection = useCallback(
    (sectionIndex: number, updater: (section: AboutSectionBlock) => AboutSectionBlock) => {
      setDraft((current) => ({
        ...current,
        aboutSections: current.aboutSections.map((section, index) =>
          index === sectionIndex ? updater(section) : section
        ),
      }))
    },
    [setDraft]
  )

  const addAboutSection = useCallback(() => {
    setDraft((current) => ({
      ...current,
      aboutSections: [...current.aboutSections, createBlankAboutSection()],
    }))
  }, [setDraft])

  const removeAboutSection = useCallback(
    (sectionIndex: number) => {
      setDraft((current) => ({
        ...current,
        aboutSections: current.aboutSections.filter((_, index) => index !== sectionIndex),
      }))
    },
    [setDraft]
  )

  const moveAboutSection = useCallback(
    (sectionIndex: number, direction: -1 | 1) => {
      setDraft((current) => ({
        ...current,
        aboutSections: moveListItem(current.aboutSections, sectionIndex, direction),
      }))
    },
    [setDraft]
  )

  const addAboutItem = useCallback(
    (sectionIndex: number) => {
      updateAboutSection(sectionIndex, (section) => ({
        ...section,
        items: [...section.items, ""],
      }))
    },
    [updateAboutSection]
  )

  const removeAboutItem = useCallback(
    (sectionIndex: number, itemIndex: number) => {
      updateAboutSection(sectionIndex, (section) => ({
        ...section,
        items: section.items.filter((_, index) => index !== itemIndex),
      }))
    },
    [updateAboutSection]
  )

  const moveAboutItem = useCallback(
    (sectionIndex: number, itemIndex: number, direction: -1 | 1) => {
      updateAboutSection(sectionIndex, (section) => ({
        ...section,
        items: moveListItem(section.items, itemIndex, direction),
      }))
    },
    [updateAboutSection]
  )

  const updateAboutProject = useCallback(
    (projectIndex: number, updater: (project: AboutProjectBlock) => AboutProjectBlock) => {
      setDraft((current) => ({
        ...current,
        aboutProjects: current.aboutProjects.map((project, index) =>
          index === projectIndex ? updater(project) : project
        ),
      }))
    },
    [setDraft]
  )

  const addAboutProject = useCallback(() => {
    setDraft((current) => ({
      ...current,
      aboutProjects: [...current.aboutProjects, createBlankAboutProject()],
    }))
  }, [setDraft])

  const removeAboutProject = useCallback(
    (projectIndex: number) => {
      setDraft((current) => ({
        ...current,
        aboutProjects: current.aboutProjects.filter((_, index) => index !== projectIndex),
      }))
    },
    [setDraft]
  )

  const moveAboutProject = useCallback(
    (projectIndex: number, direction: -1 | 1) => {
      setDraft((current) => ({
        ...current,
        aboutProjects: moveListItem(current.aboutProjects, projectIndex, direction),
      }))
    },
    [setDraft]
  )

  return {
    addAboutItem,
    addAboutProject,
    addAboutSection,
    appendLinkItem,
    moveAboutItem,
    moveAboutProject,
    moveAboutSection,
    moveLinkItem,
    removeAboutItem,
    removeAboutProject,
    removeAboutSection,
    removeLinkItem,
    reorderLinkItems,
    updateAboutProject,
    updateAboutSection,
    updateDraft,
    updateLinkItem,
  }
}
