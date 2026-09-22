import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { noticeAudienceLabel, type ApiNotice } from "@/hooks/useApi";
import { api } from "@/lib/api";

/** The full text of a notice or announcement. Opening an unread one marks it read. */
export function NoticeDetailDialog({
  notice,
  onClose,
  footer,
}: {
  notice: ApiNotice | null;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const id = notice?.id;
  const unread = notice ? !notice.read : false;

  useEffect(() => {
    if (!id || !unread) return;
    api
      .post(`/notices/${id}/read`)
      .then(() => queryClient.invalidateQueries({ queryKey: ["notices"] }))
      .catch(() => {
        // Best-effort: failing to record a read must not block reading the notice.
      });
  }, [id, unread, queryClient]);

  return (
    <Dialog open={!!notice} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        {notice && (
          <>
            <DialogHeader>
              <DialogTitle>{notice.title}</DialogTitle>
              <DialogDescription>
                {[notice.date, notice.author].filter(Boolean).join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {notice.priority && <StatusBadge status={notice.priority} />}
                {notice.category && <StatusBadge status={notice.category} tone="neutral" />}
                <StatusBadge status={noticeAudienceLabel(notice)} tone="info" />
              </div>
              <p className="break-words whitespace-pre-wrap">{notice.description}</p>
            </div>
            {footer}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
