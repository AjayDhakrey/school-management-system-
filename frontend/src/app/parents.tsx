"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import { mobileFromEmail, parentFirstPassword } from "@/lib/parent-login";
import { Users, UserCheck, Link2, Phone, Mail, ChevronRight, KeyRound } from "lucide-react";
import {
  PageHeader,
  SearchInput,
  EmptyState,
  Pager,
  Initials,
  usePaged,
  TableSkeleton,
} from "@/components/shared/ui-kit";
import { InfoCard, ProgressBar } from "@/components/shared/InfoCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useParents,
  useStudents,
  useUsers,
  type ApiParent,
  type ApiStudent,
  type ApiUser,
} from "@/hooks/useApi";

const PER_PAGE = 8;

interface CreateResult {
  created: { parent_id: string }[];
  switched: { parent_id: string }[];
  skipped: { parent_id: string; name: string; reason: string }[];
  existing: number;
}

function linkedIds(p: ApiParent): string[] {
  try {
    const parsed = JSON.parse(p.linked_student_ids);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Page() {
  const { data: parents, isLoading } = useParents();
  const { data: students } = useStudents();
  const { data: users } = useUsers();
  const queryClient = useQueryClient();
  const [creatingLogins, setCreatingLogins] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<ApiParent | null>(null);

  const parentRows = parents ?? [];
  const studentRows = students ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parentRows.filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q);
    });
  }, [parentRows, search]);

  useEffect(() => setPage(1), [search]);

  const { rows, pageCount } = usePaged(filtered, page, PER_PAGE);

  const total = parentRows.length;
  const activeCount = total; // no status field on real parent records
  const linkedStudents = parentRows.reduce((a, p) => a + linkedIds(p).length, 0);

  const loginByParent = useMemo(() => {
    const map = new Map<string, ApiUser>();
    for (const u of users ?? []) if (u.linked_parent_id) map.set(u.linked_parent_id, u);
    return map;
  }, [users]);
  const withoutMobileLogin = parentRows.filter((p) => {
    const login = loginByParent.get(p.id);
    return !login || !mobileFromEmail(login.email);
  }).length;

  // Parents sign in with their registered mobile; the first password is four name letters +
  // four mobile digits (e.g. Raje9876), which they can change any time in Settings.
  async function createLogins() {
    setCreatingLogins(true);
    try {
      const res = await api.post<CreateResult>("/parent-logins/create", {});
      const made = res.created.length + res.switched.length;
      if (made) toast.success(`${made} parent login${made === 1 ? "" : "s"} ready`);
      if (res.skipped.length) {
        const names = res.skipped
          .slice(0, 3)
          .map((s) => `${s.name} (${s.reason})`)
          .join(", ");
        toast.warning(
          `${res.skipped.length} skipped: ${names}${res.skipped.length > 3 ? ", …" : ""}`,
        );
      }
      if (!made && !res.skipped.length) toast.info("Every parent already has a mobile login");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the logins");
    } finally {
      setCreatingLogins(false);
    }
  }

  async function resetPassword(parent: ApiParent) {
    setResetting(true);
    try {
      await api.post(`/parent-logins/${parent.id}/reset`, {});
      toast.success(
        `Password reset to ${parentFirstPassword(parent.name, parent.phone) ?? "the first password"}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reset the password");
    } finally {
      setResetting(false);
    }
  }

  const childrenOf = (p: ApiParent): ApiStudent[] => {
    const ids = linkedIds(p);
    return studentRows.filter((s) => ids.includes(s.id));
  };

  return (
    <div>
      <PageHeader
        title="Parents"
        description="Directory of parents and guardians."
        breadcrumb={["Dashboard", "Parents"]}
        actions={
          <Button
            size="sm"
            onClick={createLogins}
            disabled={creatingLogins || withoutMobileLogin === 0}
          >
            <KeyRound className="h-4 w-4" />
            {creatingLogins
              ? "Creating…"
              : withoutMobileLogin
                ? `Create logins (${withoutMobileLogin})`
                : "All logins created"}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Total Parents" value={total} icon={Users} tone="navy" />
        <InfoCard label="Active" value={activeCount} icon={UserCheck} tone="success" />
        <InfoCard label="Linked Students" value={linkedStudents} icon={Link2} tone="info" />
      </div>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or email…" />
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No parents found"
            description="Try adjusting your search, or add parents from Users."
          />
        ) : (
          <>
            {/* Phones: one row per parent. */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map((p) => {
                const kids = childrenOf(p);
                const name = p.name.replace(/\s+Guardian$/i, "");
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setActive(p)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted/50"
                    >
                      <Initials
                        name={name.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                        tone="gold"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold capitalize">
                          {name.toLowerCase()}
                        </p>
                        <p className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span className="truncate">{p.phone ?? "No phone"}</span>
                          {p.email && (
                            <>
                              <span className="opacity-50">·</span>
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{p.email}</span>
                            </>
                          )}
                        </p>
                        {kids.length > 0 && (
                          <p className="mt-0.5 truncate text-[11px] text-foreground/70 capitalize">
                            Child: {kids.map((c) => c.name.toLowerCase()).join(", ")}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Parent</th>
                    <th className="px-3 py-2.5">Contact</th>
                    <th className="px-3 py-2.5">Children</th>
                    <th className="px-4 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const name = p.name.replace(/\s+Guardian$/i, "");
                    const guardian = /\s+Guardian$/i.test(p.name);
                    const kids = childrenOf(p);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <Initials
                              name={name.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                              tone="gold"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold capitalize">
                                {name.toLowerCase()}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {guardian ? "Guardian" : "Parent"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="flex items-center gap-1.5 whitespace-nowrap">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {p.phone ? (
                              <span className="tabular-nums">
                                {p.phone.replace(/^(\d{5})(\d{5})$/, "$1 $2")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">No phone</span>
                            )}
                          </p>
                          <p className="mt-0.5 flex max-w-[260px] items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{p.email ?? "No email"}</span>
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          {kids.length ? (
                            <div className="flex flex-wrap gap-1">
                              {kids.map((c) => (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] px-2.5 py-1 text-[11px] font-medium text-foreground capitalize"
                                >
                                  {c.name.toLowerCase()}
                                  {c.class_name && (
                                    <span className="text-muted-foreground">
                                      · {c.class_name.replace(/^class\s*/i, "")}
                                      {c.section ? `-${c.section}` : ""}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">Not linked</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1 text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => setActive(p)}
                          >
                            View <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              onPage={setPage}
              total={filtered.length}
            />
          </>
        )}
      </div>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {active &&
            (() => {
              const name = active.name.replace(/\s+Guardian$/i, "");
              const nice = name.replace(/\b\w/g, (ch) => ch.toUpperCase());
              const guardian = /\s+Guardian$/i.test(active.name);
              const kids = childrenOf(active);
              const phone = active.phone?.replace(/^(\d{5})(\d{5})$/, "$1 $2");
              return (
                <>
                  <SheetHeader className="sr-only">
                    <SheetTitle>{nice}</SheetTitle>
                  </SheetHeader>

                  {/* Profile */}
                  <div className="flex flex-col items-center px-4 pt-6 text-center">
                    <span className="grid h-20 w-20 place-items-center rounded-full bg-gold-soft font-display text-2xl font-bold text-gold-foreground ring-4 ring-gold-soft/40">
                      {nice
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <h2 className="mt-3 font-display text-xl font-bold capitalize">
                      {name.toLowerCase()}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {guardian ? "Guardian" : "Parent"} · {kids.length} child
                      {kids.length === 1 ? "" : "ren"}
                    </p>

                    {/* Quick actions */}
                    <div className="mt-4 flex gap-6">
                      {[
                        {
                          label: "Call",
                          icon: Phone,
                          href: active.phone ? `tel:${active.phone}` : null,
                        },
                        {
                          label: "Email",
                          icon: Mail,
                          href: active.email ? `mailto:${active.email}` : null,
                        },
                      ].map(({ label, icon: Icon, href }) => (
                        <a
                          key={label}
                          href={href ?? undefined}
                          aria-disabled={!href}
                          className={cn(
                            "flex flex-col items-center gap-1 text-[11px] font-medium",
                            href ? "text-primary" : "pointer-events-none text-muted-foreground/50",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-11 w-11 place-items-center rounded-full",
                              href ? "bg-primary/10" : "bg-muted",
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          {label}
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    {/* Contact */}
                    <section>
                      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Contact
                      </p>
                      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                        {[
                          { icon: Phone, label: "Mobile", value: phone },
                          { icon: Mail, label: "Email", value: active.email },
                        ].map(({ icon: Icon, label, value }) => (
                          <li key={label} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[11px] text-muted-foreground">{label}</p>
                              <p
                                className={cn(
                                  "truncate text-sm font-medium",
                                  !value && "text-muted-foreground/60",
                                )}
                              >
                                {value ?? "Not added"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {/* Portal login */}
                    {(() => {
                      const login = loginByParent.get(active.id);
                      const mobile = login ? mobileFromEmail(login.email) : null;
                      const firstPassword = parentFirstPassword(active.name, active.phone);
                      return (
                        <section>
                          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Portal login
                          </p>
                          <div className="space-y-2 rounded-2xl border border-border bg-card p-3 text-sm">
                            {mobile ? (
                              <>
                                <p>
                                  Signs in with{" "}
                                  <span className="font-semibold tabular-nums">{mobile}</span>
                                </p>
                                {login?.must_change_password ? (
                                  <p className="text-xs text-muted-foreground">
                                    First password:{" "}
                                    <span className="font-semibold text-foreground">
                                      {firstPassword}
                                    </span>{" "}
                                    — not changed yet
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Has set their own password
                                  </p>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={resetting}
                                  onClick={() => resetPassword(active)}
                                >
                                  {resetting ? "Resetting…" : "Reset to first password"}
                                </Button>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {login
                                  ? "Still on an email login — use Create logins to move it to the mobile number."
                                  : firstPassword
                                    ? `No login yet — Create logins gives them mobile ${active.phone} with first password ${firstPassword}.`
                                    : "No login yet — add a 10-digit mobile number first."}
                              </p>
                            )}
                          </div>
                        </section>
                      );
                    })()}

                    {/* Children */}
                    <section>
                      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Children
                      </p>
                      {kids.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                          No children linked yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {kids.map((c) => {
                            const att = Number(c.attendance ?? 0);
                            const tone =
                              att >= 90
                                ? { bar: "bg-success", text: "text-success" }
                                : att >= 75
                                  ? { bar: "bg-warning", text: "text-warning" }
                                  : { bar: "bg-destructive", text: "text-destructive" };
                            return (
                              <li
                                key={c.id}
                                className="rounded-2xl border border-border bg-card p-3"
                              >
                                <div className="flex items-center gap-3">
                                  <Initials
                                    name={c.name.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold capitalize">
                                      {c.name.toLowerCase()}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground capitalize">
                                      {c.class_name
                                        ? `${c.class_name}${c.section ? ` – ${c.section}` : ""}`
                                        : "No class"}
                                      {c.roll ? ` · Roll ${c.roll}` : ""}
                                    </p>
                                  </div>
                                  <span className={cn("text-sm font-bold tabular-nums", tone.text)}>
                                    {att}%
                                  </span>
                                </div>
                                <div className="mt-2.5 flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground">
                                    Attendance
                                  </span>
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={cn("h-full rounded-full", tone.bar)}
                                      style={{ width: `${Math.min(100, Math.max(att, 0))}%` }}
                                    />
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  </div>
                </>
              );
            })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
