"use client";

import * as React from "react";
import { cn } from "./cn";

/*
 * Floating "Chat now" button + panel driven by a Dograh chat workflow.
 * The Dograh widget runs in Headless mode (Workflow > Settings > Configure Widget: type Chat, mode Headless),
 * so Dograh draws nothing and this component renders the whole UI in the site's --tw-* tokens.
 */

type ChatStatus = "idle" | "starting" | "ready" | "waiting" | "ended" | "expired" | "error";

type DograhTurn = {
  id: string;
  status?: string;
  user_message?: { text?: string } | null;
  assistant_message?: { text?: string } | null;
};

type DograhState = {
  isInitialized: boolean;
  sessionToken: string | null;
  workflowRunId: string | null;
  config: { embedMode?: string; widgetType?: string };
  chat: {
    status: ChatStatus;
    revision: unknown;
    turns: DograhTurn[];
    pendingUserText: string | null;
    ending: boolean;
    confirmingEnd: boolean;
    banner: string | null;
    seenAssistantTurnIds: Set<string>;
  };
};

type DograhWidgetApi = {
  start: () => Promise<void>;
  startChat: () => Promise<void>;
  restartChat?: () => Promise<void>;
  endChat: () => Promise<DograhTurn[] | null>;
  sendMessage: (text: string) => Promise<DograhTurn[] | null>;
  getMessages: () => DograhTurn[];
  getState: () => DograhState;
  setContext: (vars: Record<string, string>) => void;
  onReady: (cb: () => void) => void;
  onMessage: (cb: (text: string, turn: DograhTurn) => void) => void;
  onChatStateChange: (cb: (status: ChatStatus) => void) => void;
  onError: (cb: (error: Error) => void) => void;
};

declare global {
  interface Window {
    DograhWidget?: DograhWidgetApi;
  }
}

type Message = { id: string; role: "user" | "assistant"; text: string; failed?: boolean };

const SCRIPT_ID = "dograh-widget";

function toMessages(turns: DograhTurn[], pending: string | null): Message[] {
  const out: Message[] = [];
  for (const t of turns) {
    if (t.user_message?.text) out.push({ id: `${t.id}:u`, role: "user", text: t.user_message.text, failed: t.status === "failed" });
    if (t.status === "completed" && t.assistant_message?.text) out.push({ id: `${t.id}:a`, role: "assistant", text: t.assistant_message.text });
  }
  if (pending) out.push({ id: "pending", role: "user", text: pending });
  return out;
}

export function ChatWidget({
  widgetUrl,
  title = "Chat with us",
  label = "Chat now",
  context,
}: {
  /** Script src from Dograh's embed code: …/embed/dograh-widget.js?token=…&apiEndpoint=… */
  widgetUrl?: string;
  title?: string;
  label?: string;
  /** Extra visitor context, available to the workflow as {{initial_context.<key>}}. */
  context?: Record<string, string>;
}) {
  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [status, setStatus] = React.useState<ChatStatus>("idle");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [banner, setBanner] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [loadError, setLoadError] = React.useState(false);

  const panelId = React.useId();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const contextRef = React.useRef(context);
  contextRef.current = context;

  // Mirror the widget's transcript into React state. The server transcript is the source of truth.
  const sync = React.useCallback(() => {
    const api = window.DograhWidget;
    if (!api) return;
    const s = api.getState();
    setStatus(s.chat.status);
    setBanner(s.chat.banner);
    setMessages(toMessages(s.chat.turns, s.chat.pendingUserText));
  }, []);

  // Load the Dograh script once per page and register callbacks (each on* setter holds a single listener).
  React.useEffect(() => {
    if (!widgetUrl) return;
    const register = () => {
      const api = window.DograhWidget;
      if (!api) return;
      api.onMessage(() => sync());
      api.onChatStateChange(() => sync());
      api.onError(() => sync());
      api.onReady(() => {
        const mode = api.getState().config.embedMode;
        if (mode !== "headless") {
          console.warn(`Dograh: embed mode is "${mode}". Set it to Headless so Dograh doesn't draw its own button.`);
        }
      });
      setLoaded(true);
      sync();
    };

    if (window.DograhWidget) {
      register();
      return;
    }
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = widgetUrl;
      script.async = true;
      script.setAttribute(
        "data-dograh-context",
        JSON.stringify({ page_url: window.location.href, site_name: title, ...contextRef.current }),
      );
      document.body.appendChild(script);
    }
    const onError = () => setLoadError(true);
    script.addEventListener("load", register);
    script.addEventListener("error", onError);
    return () => {
      script?.removeEventListener("load", register);
      script?.removeEventListener("error", onError);
    };
  }, [widgetUrl, title, sync]);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  React.useEffect(() => {
    if (open && status === "ready") inputRef.current?.focus();
  }, [open, status]);

  const close = React.useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!widgetUrl) return null;

  const api = () => window.DograhWidget;

  const withContext = (w: DograhWidgetApi) =>
    w.setContext({ page_url: window.location.href, site_name: title, ...contextRef.current });

  // Called from the click handler so the session starts on a user gesture. start() awaits widget init.
  const toggle = async () => {
    if (open) return close();
    setOpen(true);
    const w = api();
    if (!w) return;
    const s = w.getState().chat.status;
    if (s === "idle" || s === "error") {
      withContext(w);
      await w.start();
    }
    sync();
  };

  const restart = async () => {
    const w = api();
    if (!w) return;
    withContext(w);
    if (w.restartChat) {
      await w.restartChat();
    } else {
      // Older widget builds have no public restart: reset the session the same way the widget does internally.
      const s = w.getState();
      s.sessionToken = null;
      s.workflowRunId = null;
      Object.assign(s.chat, {
        status: "idle",
        revision: null,
        turns: [],
        pendingUserText: null,
        ending: false,
        confirmingEnd: false,
        banner: null,
        seenAssistantTurnIds: new Set(),
      });
      await w.startChat();
    }
    sync();
  };

  const send = async () => {
    const text = draft.trim();
    const w = api();
    if (!text || !w || status !== "ready") return;
    setDraft("");
    const p = w.sendMessage(text);
    sync(); // show the optimistic bubble + typing dots
    const result = await p;
    if (result === null) setDraft(text);
    sync();
  };

  const end = async () => {
    await api()?.endChat();
    sync();
  };

  const connecting = !loaded && !loadError;
  const finished = status === "ended" || status === "expired" || status === "error";
  const bannerText =
    (loadError && "Chat is unavailable right now.") ||
    banner ||
    (status === "expired" && "This chat session has expired.") ||
    (status === "ended" && "This conversation has ended.") ||
    (status === "error" && "Could not start the chat.") ||
    null;

  return (
    <>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-surface text-fg",
            "sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(560px,calc(100dvh-8rem))] sm:w-[380px]",
            "sm:rounded-ui sm:border sm:border-border sm:shadow-2xl",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden />
            <h2 className="flex-1 truncate text-sm font-semibold">{title}</h2>
            {status === "ready" && (
              <button onClick={end} className="rounded-ui px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg">
                End chat
              </button>
            )}
            <button
              onClick={close}
              aria-label="Close chat"
              className="grid h-8 w-8 place-items-center rounded-ui text-muted hover:bg-surface-2 hover:text-fg"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 && (status === "starting" || connecting) && (
              <p className="text-center text-sm text-muted">Connecting…</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                    m.role === "user" ? "rounded-br-sm bg-primary text-primary-fg" : "rounded-bl-sm bg-surface-2 text-fg",
                    m.failed && "opacity-60",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {(status === "waiting" || (status === "starting" && messages.length > 0)) && (
              <div className="flex justify-start" aria-label="Agent is typing">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-3">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {bannerText && (
            <div className="flex items-center gap-3 border-t border-border bg-surface-2 px-4 py-2 text-xs text-muted">
              <span className="flex-1">{bannerText}</span>
              {finished && !loadError && (
                <button onClick={restart} className="rounded-ui bg-primary px-3 py-1.5 font-medium text-primary-fg">
                  Start new chat
                </button>
              )}
            </div>
          )}

          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={status !== "ready"}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type a message…"
              aria-label="Message"
              className="max-h-[120px] flex-1 resize-none rounded-ui border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status !== "ready" || !draft.trim()}
              aria-label="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-ui bg-primary text-primary-fg disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      )}

      <button
        ref={buttonRef}
        onClick={toggle}
        disabled={connecting}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          "fixed bottom-4 right-4 z-50 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-fg shadow-lg transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80 sm:bottom-6 sm:right-6",
          open ? "hidden sm:inline-flex" : "inline-flex",
        )}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
          </svg>
        )}
        {open ? "Close" : label}
      </button>
    </>
  );
}
