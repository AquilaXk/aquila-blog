import React from "react"
import { IconType } from "react-icons"
import {
  FiArchive,
  FiBarChart2,
  FiBook,
  FiBookOpen,
  FiCpu,
  FiFileText,
  FiFolder,
  FiGrid,
  FiMonitor,
  FiSend,
  FiSettings,
} from "react-icons/fi"
import { HiOutlineFolderOpen } from "react-icons/hi"
import type { CategoryIconId } from "src/libs/utils/category"

type Props = {
  iconId: CategoryIconId
  className?: string
}

const ICON_MAP: Record<CategoryIconId, IconType> = {
  all: HiOutlineFolderOpen,
  folder: FiFolder,
  "folder-open": HiOutlineFolderOpen,
  stack: FiGrid,
  "book-open": FiBookOpen,
  book: FiBook,
  note: FiFileText,
  monitor: FiMonitor,
  lab: FiCpu,
  settings: FiSettings,
  rocket: FiSend,
  chart: FiBarChart2,
  archive: FiArchive,
}

const CategoryIcon: React.FC<Props> = ({ iconId, className }) => {
  const Icon = ICON_MAP[iconId] || FiFolder

  return <Icon className={className} aria-hidden="true" />
}

export default CategoryIcon
