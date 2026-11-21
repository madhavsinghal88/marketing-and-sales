"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APP_STATS,
  DEFAULT_AUTOMATIONS,
  DEFAULT_CAMPAIGNS,
  DEFAULT_TEMPLATE,
  MOCK_EVENTS,
} from "@/data/mock";
import type {
  AppView,
  AutomationRule,
  EmailTemplate,
  EventItem,
  FollowUpTask,
  MarketingCampaign,
  Participant,
  PipelineStage,
  SalesActivity,
  SalesLead,
  SalesOwner,
} from "@/lib/types";
import { loadTemplate, saveTemplate } from "@/lib/template";
import { runDueDripJobs } from "@/lib/drip/runner";
import {
  mergeStoredParticipants,
  saveManualParticipants,
} from "@/lib/participants";
import { computeCampaignMetrics, flattenParticipants } from "@/lib/analytics";
import {
  assignLeadOwner,
  buildActivities,
  buildDeals,
  buildFollowUps,
  buildLeadsFromEvents,
  moveLeadStage,
  reconcileManualLeads,
} from "@/lib/sales";
import { useSalesforceSync } from "@/lib/salesforce/useSync";
import {
  applyFollowUpPatches,
  applyLeadPatches,
  type FollowUpPatch,
  type LeadPatch,
} from "@/lib/salesforce/reconcile";
import {
  applyFollowUpOverrides,
  applyLeadOverrides,
  diffFollowUps,
  diffLeads,
  loadFollowUpOverrides,
  loadLeadOverrides,
  saveFollowUpOverrides,
  saveLeadOverrides,
} from "@/lib/overrides";
import { AppSidebar } from "./AppSidebar";
import { AnalyticsView } from "./AnalyticsView";
import { AutomationTimeline } from "./AutomationTimeline";
import { AutomationView } from "./AutomationView";
import { CampaignPerformance } from "./CampaignPerformance";
import { CampaignsView } from "./CampaignsView";
import { DealsView } from "./DealsView";
import { EventWorkspace } from "./EventWorkspace";
import { EventsList } from "./EventsList";
import { FollowUpsView } from "./FollowUpsView";
import { IntegrationsView } from "./IntegrationsView";
import { LeadsView } from "./LeadsView";
import { PipelineView } from "./PipelineView";
import { PlaceholderView } from "./PlaceholderView";
import { SalesReportsView } from "./SalesReportsView";
import { SegmentsView } from "./SegmentsView";
import { StatsBar } from "./StatsBar";
import { TemplatePanel } from "./TemplatePanel";
import { TopHeader } from "./TopHeader";

const BOARD_VIEWS: AppView[] = [
  "dashboard",
  "events",
  "participants",
  "templates",
];

const PLACEHOLDER_VIEWS: Record<
  Extract<AppView, "landing-pages" | "forms" | "roi" | "settings">,
  {
    eyebrow: string;
    title: string;
    description: string;
    phaseHint: string;
    bullets: string[];
  }
> = {
  "landing-pages": {
    eyebrow: "Marketing",
    title: "Landing Pages",
    description:
      "Publish event landing pages that capture registrations into the hub.",
    phaseHint: "Phase 4",
    bullets: [
      "Event registration pages",
      "UTM + campaign attribution",
      "Sync signups into participants",
    ],
  },
  forms: {
    eyebrow: "Marketing",
    title: "Forms",
    description:
      "Embed forms for RSVPs, lead capture, and preference updates.",
    phaseHint: "Phase 4",
    bullets: [
      "RSVP and waitlist forms",
      "Lead capture fields",
      "Preference / unsubscribe forms",
    ],
  },
  roi: {
    eyebrow: "Analytics",
    title: "ROI & Conversions",
    description:
      "Connect campaign spend and outreach volume to revenue outcomes.",
    phaseHint: "Phase 4",
    bullets: [
      "Cost per lead",
      "Campaign ROI",
      "Conversion funnel by event",
    ],
  },
  settings: {
    eyebrow: "System",
    title: "Settings",
    description:
      "Workspace preferences, mailbox defaults, and team access controls.",
    phaseHint: "Later",
    bullets: [
      "Workspace profile",
      "Sending defaults",
      "Roles and permissions",
    ],
  },
};

type OutlookStatus = {
  connected: boolean;
  mode: "demo" | "live" | null;
  mailbox: string | null;
  displayName: string | null;
  oauthConfigured: boolean;
  canRead?: boolean;
};

type SalesforceStatus = {
  connected: boolean;
  mode: "demo" | "live" | null;
  username: string | null;
  displayName: string | null;
  instanceUrl: string | null;
  /** The Salesforce user EventMail is connected as. */
  userId?: string | null;
  oauthConfigured: boolean;
};

/** The lists as they are built from sample data: edits are stored as a diff against these. */
const BASE_LEADS = buildLeadsFromEvents(MOCK_EVENTS);
const BASE_FOLLOW_UPS = buildFollowUps(BASE_LEADS);

export function DashboardApp() {
  const [events, setEvents] = useState<EventItem[]>(MOCK_EVENTS);
  const [selectedId, setSelectedId] = useState(MOCK_EVENTS[0]?.id ?? "");
  const [eventQuery, setEventQuery] = useState("");
  const [template, setTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE);
  const [templateReady, setTemplateReady] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [campaigns, setCampaigns] =
    useState<MarketingCampaign[]>(DEFAULT_CAMPAIGNS);
  const [automations, setAutomations] =
    useState<AutomationRule[]>(DEFAULT_AUTOMATIONS);
  const [leads, setLeads] = useState<SalesLead[]>(() =>
    buildLeadsFromEvents(MOCK_EVENTS),
  );
  const [followUps, setFollowUps] = useState<FollowUpTask[]>(() =>
    buildFollowUps(buildLeadsFromEvents(MOCK_EVENTS)),
  );
  const [activities] = useState<SalesActivity[]>(() =>
    buildActivities(buildLeadsFromEvents(MOCK_EVENTS)),
  );
  const [scheduleRequestId, setScheduleRequestId] = useState(0);
  const [outlook, setOutlook] = useState<OutlookStatus>({
    connected: false,
    mode: null,
    mailbox: null,
    displayName: null,
    oauthConfigured: false,
  });
  const [connecting, setConnecting] = useState(false);
  const [salesforce, setSalesforce] = useState<SalesforceStatus>({
    connected: false,
    mode: null,
    username: null,
    displayName: null,
    instanceUrl: null,
    oauthConfigured: false,
  });
  const [sfConnecting, setSfConnecting] = useState(false);
  // Saved lead/follow-up edits are loaded once; saving waits for that so an early save
  // can't overwrite them with the untouched sample data.
  const [editsLoaded, setEditsLoaded] = useState(false);
  const dripRunning = useRef(false);
  const eventsRef = useRef(events);
  const templateRef = useRef(template);
  const outlookRef = useRef(outlook);

  eventsRef.current = events;
  templateRef.current = template;
  outlookRef.current = outlook;

  const refreshOutlook = useCallback(async () => {
    try {
      const res = await fetch("/api/outlook/status");
      const data = (await res.json()) as OutlookStatus;
      setOutlook(data);
    } catch {
      // ignore
    }
  }, []);

  const refreshSalesforce = useCallback(async () => {
    try {
      const res = await fetch("/api/salesforce/status");
      const data = (await res.json()) as SalesforceStatus;
      setSalesforce(data);
    } catch {
      // ignore
    }
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    setTemplate(loadTemplate());
    setTemplateReady(true);
    void refreshOutlook();
    void refreshSalesforce();

    const params = new URLSearchParams(window.location.search);
    const salesforceFlag = params.get("salesforce");
    if (salesforceFlag === "connected") {
      showToast("Salesforce connected.");
      setActiveView("integrations");
      window.history.replaceState({}, "", "/");
    } else if (salesforceFlag === "error") {
      showToast(
        `Salesforce connect failed: ${params.get("reason") ?? "unknown error"}`,
      );
      setActiveView("integrations");
      window.history.replaceState({}, "", "/");
    }

    // Bring back participants the user added in earlier sessions.
    const merged = mergeStoredParticipants(MOCK_EVENTS);
    if (merged) {
      setEvents(merged);
    }
    // People added in earlier sessions also need their lead; stage / owner edits made
    // earlier (by a user or pulled from Salesforce) are put back on top.
    const leadEdits = loadLeadOverrides();
    setLeads((prev) =>
      applyLeadOverrides(
        merged ? merged.reduce((acc, e) => reconcileManualLeads(acc, e), prev) : prev,
        leadEdits,
      ),
    );
    setFollowUps((prev) => applyFollowUpOverrides(prev, loadFollowUpOverrides()));
    setEditsLoaded(true);

    const outlookFlag = params.get("outlook");
    if (outlookFlag === "connected") {
      const tracking = params.get("tracking");
      showToast(
        tracking === "1"
          ? "Outlook connected with delivery tracking."
          : tracking === "denied"
            ? "Outlook connected, but delivery tracking was not granted. A Microsoft admin may need to approve Mail.Read."
            : "Outlook connected.",
      );
      window.history.replaceState({}, "", "/");
    } else if (outlookFlag === "error") {
      showToast(
        `Outlook connect failed: ${params.get("reason") ?? "unknown error"}`,
      );
      window.history.replaceState({}, "", "/");
    }
  }, [refreshOutlook, refreshSalesforce]);

  // Persist manually added participants (and their send/delivery state) locally.
  // Skipped until something actually changed, so it can't overwrite saved data
  // with the untouched mock list before the saved participants are merged in.
  useEffect(() => {
    if (events === MOCK_EVENTS) return;
    saveManualParticipants(events);
  }, [events]);

  useEffect(() => {
    async function tick() {
      if (dripRunning.current) return;
      if (!outlookRef.current.connected) return;

      dripRunning.current = true;
      try {
        const result = await runDueDripJobs({
          events: eventsRef.current,
          template: templateRef.current,
          outlookConnected: outlookRef.current.connected,
        });
        if (result.processed > 0) {
          setEvents(result.events);
          if (result.message) showToast(result.message);
        }
      } finally {
        dripRunning.current = false;
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), 30_000);
    return () => window.clearInterval(id);
  }, [outlook.connected]);

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

  const selectedMetrics = useMemo(
    () =>
      computeCampaignMetrics(selectedEvent?.participants ?? []),
    [selectedEvent],
  );

  const globalMetrics = useMemo(
    () => computeCampaignMetrics(flattenParticipants(events)),
    [events],
  );

  const deals = useMemo(() => buildDeals(leads), [leads]);

  // Remember stage / owner / follow-up edits across page loads.
  useEffect(() => {
    if (!editsLoaded) return;
    saveLeadOverrides(diffLeads(BASE_LEADS, leads));
    saveFollowUpOverrides(diffFollowUps(BASE_FOLLOW_UPS, followUps));
  }, [editsLoaded, leads, followUps]);

  function applyPulledChanges(patches: {
    leadPatches: LeadPatch[];
    followUpPatches: FollowUpPatch[];
  }) {
    if (patches.leadPatches.length) {
      setLeads((prev) => applyLeadPatches(prev, patches.leadPatches));
    }
    if (patches.followUpPatches.length) {
      setFollowUps((prev) => applyFollowUpPatches(prev, patches.followUpPatches));
    }
  }

  const sf = useSalesforceSync({
    connected: salesforce.connected,
    mode: salesforce.mode,
    instanceUrl: salesforce.instanceUrl,
    userId: salesforce.userId ?? null,
    onApplyPull: applyPulledChanges,
    onResetData: () => {
      setLeads(events.reduce((acc, e) => reconcileManualLeads(acc, e), BASE_LEADS));
      setFollowUps(BASE_FOLLOW_UPS);
    },
    leads,
    deals,
    followUps,
    activities,
    events,
    onToast: showToast,
    onAuthLost: () => void refreshSalesforce(),
    onNeedConnect: () => {
      showToast("Connect Salesforce first, then sync.");
      setActiveView("integrations");
    },
  });

  function setParticipants(participants: Participant[]) {
    if (!selectedEvent) return;
    // Added/removed people must also appear/disappear in the Leads list.
    setLeads((prev) =>
      reconcileManualLeads(prev, {
        id: selectedEvent.id,
        name: selectedEvent.name,
        participants,
      }),
    );
    setEvents((prev) =>
      prev.map((e) =>
        e.id === selectedEvent.id
          ? {
              ...e,
              participants,
              // The event's headline count covers more people than the loaded
              // sample list, so move it by the change instead of overwriting it.
              participantCount: Math.max(
                0,
                e.participantCount + participants.length - e.participants.length,
              ),
            }
          : e,
      ),
    );
  }

  function handleSaveTemplate(next: EmailTemplate) {
    setTemplate(next);
    saveTemplate(next);
    showToast("Template saved. It will be used for all future sends.");
  }

  function handleNavigate(view: AppView) {
    if (view === "templates") {
      setTemplateOpen(true);
    }
    setActiveView(view);
  }

  function openScheduleForEvent(eventId: string) {
    setSelectedId(eventId);
    setActiveView("dashboard");
    setScheduleRequestId((n) => n + 1);
  }

  function handleMoveStage(leadId: string, stage: PipelineStage) {
    setLeads((prev) => moveLeadStage(prev, leadId, stage));
    showToast(`Lead moved to ${stage}.`);
  }

  function handleAssignOwner(leadId: string, owner: SalesOwner) {
    setLeads((prev) => assignLeadOwner(prev, leadId, owner));
    setFollowUps((prev) =>
      prev.map((task) =>
        task.leadId === leadId ? { ...task, owner } : task,
      ),
    );
    showToast(`Assigned to ${owner}.`);
  }

  function handleToggleFollowUp(taskId: string) {
    setFollowUps((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        const nextStatus = task.status === "Done" ? "Open" : "Done";
        return {
          ...task,
          status: nextStatus,
          dueLabel: nextStatus === "Done" ? "Completed" : task.dueLabel,
        };
      }),
    );
  }

  function handleReassignFollowUp(taskId: string, owner: SalesOwner) {
    setFollowUps((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, owner } : task)),
    );
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

  async function handleConnectSalesforce() {
    setSfConnecting(true);
    try {
      const statusRes = await fetch("/api/salesforce/status");
      const status = (await statusRes.json()) as SalesforceStatus;
      setSalesforce(status);

      if (status.oauthConfigured) {
        window.location.href = "/api/salesforce/connect";
        return;
      }

      const demoRes = await fetch("/api/salesforce/demo", { method: "POST" });
      if (!demoRes.ok) {
        showToast("Could not start Salesforce demo connection.");
        return;
      }
      await refreshSalesforce();
      showToast(
        "Salesforce connected in demo mode. Add Connected App credentials for a live org.",
      );
    } finally {
      setSfConnecting(false);
    }
  }

  async function handleConnectSalesforceDemo() {
    setSfConnecting(true);
    try {
      const res = await fetch("/api/salesforce/demo", { method: "POST" });
      if (!res.ok) {
        showToast("Could not start Salesforce demo connection.");
        return;
      }
      await refreshSalesforce();
      showToast("Salesforce connected in demo mode. Nothing is sent to a real org.");
    } finally {
      setSfConnecting(false);
    }
  }

  async function handleDisconnectSalesforce() {
    await fetch("/api/salesforce/disconnect", { method: "POST" });
    await refreshSalesforce();
    showToast("Salesforce disconnected.");
  }

  const showBoard = BOARD_VIEWS.includes(activeView);
  const placeholder =
    activeView in PLACEHOLDER_VIEWS
      ? PLACEHOLDER_VIEWS[activeView as keyof typeof PLACEHOLDER_VIEWS]
      : null;

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}
    >
      <AppSidebar
        collapsed={sidebarCollapsed}
        activeView={activeView}
        onNavigate={handleNavigate}
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
          salesforceConnected={salesforce.connected}
          salesforceMode={salesforce.mode}
          salesforceUser={salesforce.username}
          onDisconnectSalesforce={handleDisconnectSalesforce}
          userName="Madhav Singhal"
        />

        <div className="app-content">
          {(activeView === "dashboard" ||
            activeView === "events" ||
            activeView === "participants") && <StatsBar stats={APP_STATS} />}

          {showBoard && (
            <div className="split split--with-rail">
              <EventsList
                events={filteredEvents}
                selectedId={selectedEvent?.id ?? ""}
                query={eventQuery}
                onQueryChange={setEventQuery}
                onSelect={setSelectedId}
                onAddEvent={() =>
                  showToast("Add Event — coming in a later phase.")
                }
              />

              {selectedEvent ? (
                <EventWorkspace
                  key={selectedEvent.id}
                  event={selectedEvent}
                  template={template}
                  outlookConnected={outlook.connected}
                  outlookMode={outlook.mode}
                  outlookMailbox={outlook.mailbox}
                  outlookCanRead={Boolean(outlook.canRead)}
                  sf={sf}
                  scheduleRequestId={scheduleRequestId}
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

              {selectedEvent ? (
                <aside className="insight-rail" aria-label="Insights">
                  <CampaignPerformance
                    metrics={selectedMetrics}
                    title="Campaign Performance"
                  />
                  <AutomationTimeline
                    participants={selectedEvent.participants}
                    onSchedule={() => setScheduleRequestId((n) => n + 1)}
                  />
                </aside>
              ) : null}
            </div>
          )}

          {activeView === "campaigns" && (
            <CampaignsView
              campaigns={campaigns}
              events={events}
              onCreate={(eventId, name) => {
                const event = events.find((e) => e.id === eventId);
                setCampaigns((prev) => [
                  {
                    id: `camp-${Date.now()}`,
                    name,
                    eventId,
                    eventName: event?.name ?? "Event",
                    status: "Draft",
                    audienceLabel: "All participants",
                    createdAt: new Date().toISOString().slice(0, 10),
                  },
                  ...prev,
                ]);
              }}
              onOpenSchedule={openScheduleForEvent}
              onToast={showToast}
            />
          )}

          {activeView === "segments" && (
            <SegmentsView events={events} onToast={showToast} />
          )}

          {activeView === "automation" && (
            <AutomationView
              rules={automations}
              selectedEvent={selectedEvent}
              onToggle={(id) =>
                setAutomations((prev) =>
                  prev.map((rule) =>
                    rule.id === id
                      ? { ...rule, enabled: !rule.enabled }
                      : rule,
                  ),
                )
              }
              onOpenSchedule={() => {
                if (!selectedEvent) return;
                openScheduleForEvent(selectedEvent.id);
              }}
            />
          )}

          {activeView === "analytics" && (
            <AnalyticsView events={events} globalMetrics={globalMetrics} />
          )}

          {activeView === "leads" && (
            <LeadsView
              leads={leads}
              onAssignOwner={handleAssignOwner}
              onOpenPipeline={() => setActiveView("pipeline")}
              sf={sf}
            />
          )}

          {activeView === "pipeline" && (
            <PipelineView leads={leads} onMoveStage={handleMoveStage} />
          )}

          {activeView === "followups" && (
            <FollowUpsView
              tasks={followUps}
              activities={activities}
              onToggleDone={handleToggleFollowUp}
              onReassign={handleReassignFollowUp}
              sf={sf}
            />
          )}

          {activeView === "deals" && (
            <DealsView deals={deals} onToast={showToast} sf={sf} />
          )}

          {activeView === "sales-reports" && (
            <SalesReportsView leads={leads} deals={deals} />
          )}

          {activeView === "integrations" && (
            <IntegrationsView
              outlookConnected={outlook.connected}
              onConnectOutlook={handleConnectOutlook}
              salesforce={salesforce}
              salesforceConnecting={sfConnecting}
              onConnectSalesforce={handleConnectSalesforce}
              onConnectSalesforceDemo={handleConnectSalesforceDemo}
              onDisconnectSalesforce={handleDisconnectSalesforce}
              onToast={showToast}
              sf={sf}
              syncEntities={{ leads, deals, followUps }}
              syncTotals={{
                leads: leads.length,
                deals: deals.length,
                tasks: followUps.length + activities.length,
                events: events.filter((e) =>
                  leads.some((l) => l.eventId === e.id),
                ).length,
              }}
            />
          )}

          {placeholder && (
            <PlaceholderView
              eyebrow={placeholder.eyebrow}
              title={placeholder.title}
              description={placeholder.description}
              phaseHint={placeholder.phaseHint}
              bullets={placeholder.bullets}
            />
          )}
        </div>
      </div>

      {templateReady && (
        <TemplatePanel
          open={templateOpen}
          template={template}
          preview={previewContext}
          onChange={setTemplate}
          onSave={handleSaveTemplate}
          onClose={() => {
            setTemplateOpen(false);
            if (activeView === "templates") setActiveView("dashboard");
          }}
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
