import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClasses, useMyTeacherProfile } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";

const CATEGORIES = ["General", "Exam", "Event", "Holiday", "Homework", "Meeting"];
const PRIORITIES = ["High", "Medium", "Low"];

/**
 * A teacher's notice to the classes they teach or are class teacher of. It reaches those
 * classes' students and their parents. Pass `category` to fix it (e.g. "Announcement").
 */
export function ClassNoticeForm({ category, onDone }: { category?: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: teacher } = useMyTeacherProfile();
  const { data: classes, isLoading } = useClasses();

  // Same set the database allows: subject assignments plus classes they are class teacher of.
  const myClasses = useMemo(() => {
    const assigned = new Set<string>(teacher ? JSON.parse(teacher.assigned_classes) : []);
    return (classes ?? []).filter(
      (c) => c.status === "ACTIVE" && (assigned.has(c.id) || c.class_teacher_id === teacher?.id),
    );
  }, [classes, teacher]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [noticeCategory, setNoticeCategory] = useState(category ?? "General");
  const [priority, setPriority] = useState("Medium");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const allSelected = myClasses.length > 0 && classIds.length === myClasses.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classIds.length) {
      toast.error("Choose at least one class");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/notices", {
        title,
        description,
        category: noticeCategory,
        priority,
        classIds,
      });
      await queryClient.invalidateQueries({ queryKey: ["notices"] });
      toast.success(
        `Sent to ${classIds.length} class${classIds.length === 1 ? "" : "es"} — students and parents`,
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to publish");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="cn-title">Title</Label>
        <Input id="cn-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cn-desc">Message</Label>
        <Textarea
          id="cn-desc"
          required
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!category && (
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={noticeCategory} onValueChange={setNoticeCategory}>
              <SelectTrigger className="bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>Send to classes</Label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading your classes…</p>
        ) : myClasses.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            You aren't assigned to any class yet. Ask the school admin to assign you.
          </p>
        ) : (
          <div className="grid gap-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) =>
                  setClassIds(checked ? myClasses.map((c) => c.id) : [])
                }
              />
              All my classes
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {myClasses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={classIds.includes(c.id)}
                    onCheckedChange={(checked) =>
                      setClassIds((current) =>
                        checked ? [...current, c.id] : current.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name} {c.section}
                </label>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Students of the selected classes and their parents will see this and get a notification.
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !classIds.length}>
          {submitting ? "Publishing…" : "Publish"}
        </Button>
      </DialogFooter>
    </form>
  );
}
