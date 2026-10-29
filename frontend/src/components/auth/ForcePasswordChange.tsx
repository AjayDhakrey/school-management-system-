import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { studentIdFromEmail } from "@/lib/student-login";
import { mobileFromEmail } from "@/lib/parent-login";

/**
 * Shown instead of the app after a first Student-ID or parent mobile login (or a reset): the
 * starting password follows a known rule, so it has to be replaced before anything else.
 */
export function ForcePasswordChange() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const studentId = user ? studentIdFromEmail(user.email) : null;
  const mobile = user ? mobileFromEmail(user.email) : null;
  const firstPassword = mobile
    ? {
        rule: "the first four letters of your name (first one capital) followed by the first four digits of your mobile number",
        label: "Current password (first password)",
        example: "e.g. Raje9876",
        same: "Your new password must be different from your first password",
      }
    : {
        rule: "your date of birth",
        label: "Current password (date of birth, DDMMYYYY)",
        example: "e.g. 14032016",
        same: "Your new password must be different from your date of birth",
      };
  const mismatch = confirm.length > 0 && confirm !== next;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("Choose a password of at least 6 characters");
      return;
    }
    if (next === current) {
      toast.error(firstPassword.same);
      return;
    }
    if (next !== confirm) {
      toast.error("The new passwords don't match");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/auth/password", { currentPassword: current, newPassword: next });
      await api.post("/auth/complete-password-change", {});
      await refreshUser();
      toast.success("Password changed — welcome!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-backdrop grid min-h-screen place-items-center p-4">
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold">Set your own password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hi {user?.name?.split(" ")[0] ?? "there"}! Your first password is {firstPassword.rule}.
          Choose a new one only you know — you&apos;ll use it from now on.
        </p>
        {studentId && (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
            Your Student ID: <span className="font-bold tracking-wide">{studentId}</span>
          </p>
        )}
        {mobile && (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
            You sign in with your mobile number:{" "}
            <span className="font-bold tracking-wide">{mobile}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="fp-current">{firstPassword.label}</Label>
            <Input
              id="fp-current"
              type={show ? "text" : "password"}
              inputMode={mobile ? "text" : "numeric"}
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={firstPassword.example}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fp-new">New password</Label>
            <div className="relative">
              <Input
                id="fp-new"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="At least 6 characters"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide passwords" : "Show passwords"}
                className="absolute top-1/2 right-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fp-confirm">Confirm new password</Label>
            <Input
              id="fp-confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
          </div>
          <Button type="submit" disabled={saving || mismatch} className="mt-1">
            {saving ? "Saving…" : "Save and continue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="gap-2 text-muted-foreground"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
