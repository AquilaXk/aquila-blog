import React from "react"
import type { CategoryIconId } from "src/libs/utils/category"
import CategoryGlyph from "src/components/icons/CategoryGlyph"

type Props = {
  iconId: CategoryIconId
  className?: string
}

const CategoryIcon: React.FC<Props> = ({ iconId, className }) => {
  return <CategoryGlyph iconId={iconId} className={className} />
}

export default CategoryIcon
