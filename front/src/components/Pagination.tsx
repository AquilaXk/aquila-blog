import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  armSize?: number;
  className?: string;
}

function calcMiddlePages(
  totalPages: number,
  currentPage: number,
  armSize: number,
  hasPrevEllipsis: boolean,
  hasNextEllipsis: boolean,
): number[] {
  return Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) =>
      p > 1 &&
      p < totalPages &&
      (Math.abs(p - currentPage) <= armSize ||
        (!hasPrevEllipsis && p <= 2) ||
        (!hasNextEllipsis && p >= totalPages - 1)),
  );
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  armSize = 2,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const prevEllipsisPage =
    currentPage - armSize - 1 > 2
      ? currentPage - armSize - 1
      : undefined;

  const nextEllipsisPage =
    currentPage + armSize + 1 < totalPages - 1
      ? currentPage + armSize + 1
      : undefined;

  const middlePages = calcMiddlePages(
    totalPages,
    currentPage,
    armSize,
    !!prevEllipsisPage,
    !!nextEllipsisPage,
  );

  return (
    <div className={`flex items-center justify-center gap-1 ${className ?? ""}`}>
      <Button
        variant="outline"
        size="icon"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <PageButton page={1} current={currentPage} onClick={onPageChange} />

      {prevEllipsisPage && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(prevEllipsisPage)}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      )}

      {middlePages.map((p) => (
        <PageButton key={p} page={p} current={currentPage} onClick={onPageChange} />
      ))}

      {nextEllipsisPage && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(nextEllipsisPage)}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      )}

      {totalPages > 1 && (
        <PageButton page={totalPages} current={currentPage} onClick={onPageChange} />
      )}

      <Button
        variant="outline"
        size="icon"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function PageButton({
  page,
  current,
  onClick,
}: {
  page: number;
  current: number;
  onClick: (page: number) => void;
}) {
  return (
    <Button
      variant={page === current ? "default" : "outline"}
      size="icon"
      onClick={() => onClick(page)}
    >
      {page}
    </Button>
  );
}
