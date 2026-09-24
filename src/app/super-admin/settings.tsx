"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/ui-kit";
import { SectionCard } from "@/components/shared/SectionCard";
import { SignOutCard } from "@/components/shared/SignOutCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SITE_METADATA } from "@/lib/siteData";
import { api } from "@/lib/api";

export default function PlatformSettingsPage() {
  const [platformName, setPlatformName] = useState(SITE_METADATA.titleDefault ?? "SchoolSphere");
  const [supportEmail, setSupportEmail] = useState("support@schoolsphere.app");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api
      .get<{ platformName?: string; supportEmail?: string }>("/platform-settings")
      .then((settings) => {
        if (settings.platformName) setPlatformName(settings.platformName);
        if (settings.supportEmail) setSupportEmail(settings.supportEmail);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <PageHeader
        title="Platform Settings"
        description="SaaS-level configuration for the platform."
        breadcrumb={["Dashboard", "Platform Settings"]}
      />


      <SectionCard
        title="Platform Identity"
        subtitle="Shown across login and communication"
        className="mt-4"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await api.put("/platform-settings", { platformName, supportEmail });
              toast.success("Platform settings saved");
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Failed to save platform settings",
              );
            } finally {
              setSaving(false);
            }
          }}
          className="grid max-w-lg gap-4"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="platform-name">Platform Name</Label>
            <Input
              id="platform-name"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="support-email">Support Email</Label>
            <Input
              id="support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </SectionCard>
      <SignOutCard />
    </div>
  );
}
