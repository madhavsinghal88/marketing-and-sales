"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_STATS, DEFAULT_TEMPLATE, MOCK_EVENTS } from "@/data/mock";
import type { EmailTemplate, EventItem, Participant } from "@/lib/types";
import { loadTemplate, saveTemplate } from "@/lib/template";
import { AppSidebar } from "./AppSidebar";
import { EventWorkspace } from "./EventWorkspace";
import { EventsList } from "./EventsList";
import { StatsBar } from "./StatsBar";
import { TemplatePanel } from "./TemplatePanel";
import { TopHeader } from "./TopHeader";

type OutlookStatus = {
  connected: boolean;
  mode: "demo" | "live" | null;
  mailbox: string | null;
  displayName: string | null;
  oauthConfigured: boolean;
};

export function DashboardApp() {
  const [events, setEvents] = useState<EventItem[]>(MOCK_EVENTS);
  const [selectedId, setSelectedId] = useState(MOCK_EVENTS[0]?.id ?? "");
  const [eventQuery, setEventQuery] = useState("");
  const [template, setTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE);
  const [templateReady, setTemplateReady] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [outlook, setOutlook] = useState<OutlookStatus>({
    connected: false,
    mode: null,
    mailbox: null,
    displayName: null,
    oauthConfigured: false,
  });
  const [connecting, setConnecting] = useState(false);

  const refreshOutlook = useCallback(async () => {
    try {
      const res = await fetch("/api/outlook/status");
      const data = (await res.json()) as OutlookStatus;
      setOutlook(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setTemplate(loadTemplate());
    setTemplateReady(true);
    void refreshOutlook();

    const params = new URLSearchParams(window.location.search);
    const outlookFlag = params.get("outlook");
    if (outlookFlag === "connected") {
      showToast("Outlook connected.");
      window.history.replaceState({}, "", "/");
    } else if (outlookFlag === "error") {
      showToast(
        `Outlook connect failed: ${params.get("reason") ?? "unknown error"}`,
      );
      window.history.replaceState({}, "", "/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOutlook]);

  const filteredEvents = useMemo(() => {
    const q = eventQuery.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => e.name.toLowerCase().includes(q));
  }, [events, eventQuery]);

  const selectedEvent =
    events.find((e) => e.id === selectedId) ?? filteredEvents[0] ?? events[0];

  const previewContext = useMemo(() => {
    const person = selectedEvent?.participants[0];
    return {
      name: person?.name ?? "Alex Participant",
      email: person?.email ?? "alex@example.com",
      event: selectedEvent?.name ?? "Sample Event",
    };
  }, [selectedEvent]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }

  function setParticipants(participants: Participant[]) {
    if (!selectedEvent) return;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === selectedEvent.id
          ? { ...e, participants, participantCount: participants.length }
          : e,
      ),
    );
  }

  function handleSaveTemplate(next: EmailTemplate) {
    setTemplate(next);
    saveTemplate(next);
    showToast("Template saved. It will be used for all future sends.");
  }

  async function handleConnectOutlook() {
    setConnecting(true);
    try {
      const statusRes = await fetch("/api/outlook/status");
      const status = (await statusRes.json()) as OutlookStatus;
      setOutlook(status);

      if (status.oauthConfigured) {
        window.location.href = "/api/outlook/connect";
        return;
      }

      const demoRes = await fetch("/api/outlook/demo", { method: "POST" });
      if (!demoRes.ok) {
        showToast("Could not start Outlook demo connection.");
        return;
      }
      await refreshOutlook();
      showToast(
        "Outlook connected in demo mode. Add Azure credentials for live Graph send.",
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnectOutlook() {
    await fetch("/api/outlook/disconnect", { method: "POST" });
    await refreshOutlook();
    showToast("Outlook disconnected.");
  }

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}
    >
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        outlookConnected={outlook.connected}
        mailbox={outlook.mailbox ?? "marketing@eventmail.app"}
        onOpenTemplates={() => setTemplateOpen(true)}
      />

      <div className="app-main">
        <TopHeader
          outlookConnected={outlook.connected}
          outlookMode={outlook.mode}
          mailbox={outlook.mailbox}
          oauthConfigured={outlook.oauthConfigured}
          connecting={connecting}
          onConnect={handleConnectOutlook}
          onDisconnect={handleDisconnectOutlook}
          userName="Madhav Singhal"
        />

        <div className="app-content">
          <StatsBar stats={APP_STATS} />

          <div className="split">
            <EventsList
              events={filteredEvents}
              selectedId={selectedEvent?.id ?? ""}
              query={eventQuery}
              onQueryChange={setEventQuery}
              onSelect={setSelectedId}
              onAddEvent={() => showToast("Add Event — coming in Phase 5.")}
            />

            {selectedEvent ? (
              <EventWorkspace
                key={selectedEvent.id}
                event={selectedEvent}
                template={template}
                outlookConnected={outlook.connected}
                onParticipantsChange={setParticipants}
                onToast={showToast}
                onEditTemplate={() => setTemplateOpen(true)}
                onConnectOutlook={handleConnectOutlook}
              />
            ) : (
              <div className="workspace workspace--empty">
                <p>Select an event to manage outreach.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {templateReady && (
        <TemplatePanel
          open={templateOpen}
          template={template}
          preview={previewContext}
          onChange={setTemplate}
          onSave={handleSaveTemplate}
          onClose={() => setTemplateOpen(false)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
