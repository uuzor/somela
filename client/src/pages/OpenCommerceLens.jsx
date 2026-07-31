import { useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import TopNavigation from "@/components/commerce/TopNavigation";
import Discover from "@/components/commerce/Discover";
import ConversationPanel from "@/components/commerce/ConversationPanel";
import SearchResults from "@/components/commerce/SearchResults";
import ProductDetail from "@/components/commerce/ProductDetail";
import ComparisonView from "@/components/commerce/ComparisonView";
import TryOnStudio from "@/components/commerce/TryOnStudio";
import Checkout from "@/components/commerce/Checkout";
import CheckoutProgress from "@/components/commerce/CheckoutProgress";
import OrderConfirmation from "@/components/commerce/OrderConfirmation";
import MobileTabs from "@/components/commerce/MobileTabs";
import { products, cartSeed, merchantNames } from "@/data/commerceData";
import * as api from "@/services/commerceService";

const initial = [
  {
    id: "hello",
    role: "assistant",
    type: "text",
    text: "Describe a piece, upload a look, or ask me to build an outfit.",
  },
];

const CHAT_STATE_TO_MODE = {
  show_catalog: "results",
  show_product: "product",
  comparison: "comparison",
  tryon: "tryon",
  checkout: "checkout",
  processing: "processing",
  confirmation: "confirmation",
};

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAssistantMessage(message) {
  const text = typeof message?.text === "string" ? message.text : "";
  return {
    id: message?.id || randomId("assistant"),
    role: "assistant",
    type: message?.type || "text",
    text,
    toolCalls: Array.isArray(message?.toolCalls) ? message.toolCalls : [],
    products: Array.isArray(message?.products) ? message.products : undefined,
    image: message?.image,
  };
}

export default function OpenCommerceLens() {
  const [mode, setMode] = useState("discover");
  const { session: appSession, user: authUser, logout } = useAuth();
  const [fallbackSessionId] = useState(() => randomId("session"));
  const sessionId = appSession?.sessionId || fallbackSessionId;
  const userId = authUser?.id || appSession?.userId;
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState(initial);
  const [visible, setVisible] = useState([]);
  const [selected, setSelected] = useState();
  const [reference, setReference] = useState();
  const [jobs, setJobs] = useState([]);
  const [cart, setCart] = useState(cartSeed);
  const [progress, setProgress] = useState(0);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("canvas");
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const reduce = useReducedMotion();
  const assistantDraftId = useRef(null);

  const search = async () => {
    if (!query && !reference) return;
    setResultsLoading(true);
    setMode("searching");
    setMessages((current) => [
      ...current,
      {
        id: randomId("user"),
        role: "user",
        type: reference ? "image" : "text",
        text: query || "Find products like this image.",
        image: reference,
      },
    ]);

    const results = await api.searchProducts();
    applyCatalogResults(results);
    setMessages((current) => [
      ...current,
      {
        id: randomId("assistant"),
        role: "assistant",
        type: "search",
        text: "I found 86 close matches across 8 merchants. The first options preserve the cropped silhouette and wide collar.",
        products: results.slice(0, 3),
        toolCalls: [
          {
            id: "tc1",
            label: "Analyzing reference image",
            actions: 3,
            iconCount: 3,
            logs: [
              "1024 dims extracted from reference",
              "Color palette: warm earth tones detected",
              "Silhouette: cropped jacket confirmed",
            ],
          },
          {
            id: "tc2",
            label: "Searching merchant catalogs",
            actions: 4,
            iconCount: 2,
            logs: [
              "Queried 8 merchant catalogs",
              "86 visual matches found",
              "Sorted by similarity score",
              "Availability checked",
            ],
          },
        ],
      },
    ]);
    setSuggestedTasks([
      "Try on the closest match",
      "Compare top 3 matches",
      "Show options under $100",
    ]);
    setMode("results");
  };

  const applyCatalogResults = (items) => {
    const next = Array.isArray(items) ? items : [];
    setVisible(next);
    setSelected((current) => current && next.some((item) => item.id === current.id) ? current : next[0]);
    setResultsLoading(false);
    upsertAssistantDraft({
      products: next,
    });
  };
  const upload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setReference(url);
    setQuery("Find products similar to this look");
  };

  const upsertAssistantDraft = (patch) => {
    const id = assistantDraftId.current || randomId("assistant");
    assistantDraftId.current = id;

    setMessages((current) => {
      const next = [...current];
      const existingIndex = next.findIndex((message) => message.id === id);
      const existing = existingIndex >= 0
        ? next[existingIndex]
        : normalizeAssistantMessage({ id, role: "assistant", type: "text" });

      const updated = {
        ...existing,
        ...patch,
        id,
        role: "assistant",
        type: patch.type || existing.type || "text",
        toolCalls: patch.toolCalls ?? existing.toolCalls ?? [],
      };

      if (existingIndex >= 0) {
        next[existingIndex] = updated;
      } else {
        next.push(updated);
      }

      return next;
    });
  };

  const appendToolCall = (toolCall) => {
    const entry = {
      id: toolCall.id || randomId("tool"),
      label: toolCall.label || toolCall.name || "Tool call",
      actions: typeof toolCall.actions === "number" ? toolCall.actions : 1,
      iconCount: typeof toolCall.iconCount === "number" ? toolCall.iconCount : 2,
      logs: toolCall.logs || [],
    };

    setMessages((current) => {
      const next = [...current];
      const id = assistantDraftId.current;
      const index = next.findIndex((message) => message.id === id);
      if (index < 0) {
        return next;
      }

      const message = next[index];
      next[index] = {
        ...message,
        toolCalls: [...(message.toolCalls || []), entry],
      };
      return next;
    });
  };

  const appendToolResult = (toolName, result) => {
    const payload = typeof result === "string" ? result : JSON.stringify(result);

    setMessages((current) => {
      const next = [...current];
      const id = assistantDraftId.current;
      const index = next.findIndex((message) => message.id === id);
      if (index < 0) {
        return next;
      }

      const message = next[index];
      const toolCalls = [...(message.toolCalls || [])];
      if (toolCalls.length === 0) {
        toolCalls.push({
          id: randomId("tool"),
          label: toolName.replace(/_/g, " "),
          actions: 1,
          iconCount: 2,
          logs: [payload],
        });
      } else {
        const lastIndex = toolCalls.length - 1;
        const last = toolCalls[lastIndex];
        toolCalls[lastIndex] = {
          ...last,
          label: toolName.replace(/_/g, " "),
          logs: [...(last.logs || []), payload],
        };
      }

      next[index] = {
        ...message,
        toolCalls,
      };
      return next;
    });
  };

  const send = async (textArg, imageUrlArg) => {
    const resolvedText = typeof textArg === "string" ? textArg : chat;
    const imageUrl = typeof imageUrlArg === "string" && imageUrlArg ? imageUrlArg : null;
    const messageText = resolvedText.trim() || (imageUrl ? "Find products similar to this image." : "");

    if ((!messageText && !imageUrl) || isStreaming) return;

    setChat("");
    setIsStreaming(true);
    setResultsLoading(true);
    setSuggestedTasks([]);
    assistantDraftId.current = null;

    setMessages((current) => [
      ...current,
      {
        id: randomId("user"),
        role: "user",
        type: imageUrl ? "image" : "text",
        text: messageText,
        image: imageUrl || undefined,
      },
    ]);

    try {
      await api.streamChatMessage(messageText, { sessionId, userId, imageUrl }, {
        onEvent: (event) => {
          if (event.event === "connected") {
            if (event.data?.state && CHAT_STATE_TO_MODE[event.data.state]) {
              setMode(CHAT_STATE_TO_MODE[event.data.state]);
            }
            return;
          }

          if (event.event === "text") {
            upsertAssistantDraft({
              type: "text",
              text: event.data,
            });
            return;
          }

          if (event.event === "tool_call") {
            const toolName = event.data?.name || "tool";
            appendToolCall({
              id: event.data?.id || randomId("tool"),
              label: toolName.replace(/_/g, " "),
              actions: 1,
              iconCount: 2,
              logs: ["Calling backend tool"],
            });
            return;
          }

          if (event.event === "tool_result") {
            const toolName = event.data?.name || "tool";
            appendToolResult(toolName, event.data?.result);
            return;
          }

          if (event.event === "ui_state") {
            const nextState = event.data?.state;
            const nextMode = CHAT_STATE_TO_MODE[nextState];
            if (nextMode) {
              setMode(nextMode);
            }
            if (nextState === "chat" || nextState === "clarify") {
              setTab("chat");
            }
            return;
          }

          if (event.event === "ui_payload") {
            if (event.data?.type === "replace_catalog") {
              const next = Array.isArray(event.data.products) ? event.data.products : [];
              applyCatalogResults(next);
              setSuggestedTasks([
                "Try on the closest match",
                "Compare top 3 matches",
                "Show options under $100",
              ]);
              if (mode === "discover") {
                setMode("results");
              }
            }
            if (event.data?.type === "show_product") {
              setSelected(event.data.product);
              setMode("product");
            }
            if (event.data?.type === "confirm_purchase") {
              setMode("checkout");
            }
            return;
          }

          if (event.event === "ui_action" && event.data?.type === "suggest_try_on") {
            setSelected((current) => current || visible[0] || products[0]);
            return;
          }

          if (event.event === "done") {
            const doneUiPayload = event.data?.uiPayload;
            console.log(doneUiPayload)
            if (doneUiPayload?.type === "replace_catalog" && Array.isArray(doneUiPayload.products)) {
              applyCatalogResults(doneUiPayload.products);
            }
            if (event.data?.reply) {
              upsertAssistantDraft({
                text: event.data.reply,
              });
            }

            if (event.data?.chatState && CHAT_STATE_TO_MODE[event.data.chatState]) {
              setMode(CHAT_STATE_TO_MODE[event.data.chatState]);
            }

            assistantDraftId.current = null;
          }
        },
      });
    } catch (error) {
      upsertAssistantDraft({
        text: error instanceof Error ? error.message : "Chat failed",
      });
      assistantDraftId.current = null;
    } finally {
      setIsStreaming(false);
      setResultsLoading(false);
    }
  };
  const startTry = async (product) => {
    const nextProduct = product || selected || products[0];
    setSelected(nextProduct);
    setMode("tryon");
    const job = await api.startTryOn(nextProduct);
    setJobs((current) => [job, ...current]);
    api.getTryOnStatus(job).then((done) => {
      setJobs((current) => current.map((item) => (item.id === done.id ? done : item)));
    });
  };

  const startTask = (index) => {
    setSuggestedTasks([]);
    if (index === 0) startTry(selected || products[0]);
    else if (index === 1) setMode("comparison");
    else if (index === 2) {
      setMessages((current) => [
        ...current,
        {
          id: randomId("user"),
          role: "user",
          type: "text",
          text: "Show options under $100",
        },
      ]);
      setVisible((current) => current.filter((product) => product.price < 100));
    }
  };

  const approve = async () => {
    setMode("processing");
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 550));
      setProgress(i);
    }
    const result = await api.completeCheckout();
    setOrders(result);
    setMode("confirmation");
  };

  const nav = (nextMode) => {
    if (nextMode === "discover") {
      setMode("discover");
      return;
    }
    if (!visible.length) return;
    setMode(nextMode);
  };

  const canvas =
    mode === "results" || mode === "searching" ? (
      <SearchResults
        products={visible}
        selected={selected}
        onSelect={setSelected}
        onTry={startTry}
        onCompare={() => setMode("comparison")}
        onView={() => setMode("product")}
        loading={mode === "searching" || resultsLoading}
        reference={reference}
      />
    ) : mode === "product" ? (
      <ProductDetail
        product={selected}
        onBack={() => setMode("results")}
        onMode={setMode}
      />
    ) : mode === "comparison" ? (
      <ComparisonView
        products={products}
        onBack={() => setMode("results")}
        onTry={startTry}
      />
    ) : mode === "tryon" ? (
      <TryOnStudio
        product={selected || products[0]}
        jobs={jobs}
        onMode={setMode}
      />
    ) : mode === "checkout" ? (
      <Checkout
        items={cart}
        setItems={setCart}
        onApprove={approve}
        onBack={() => setMode("tryon")}
      />
    ) : mode === "processing" ? (
      <CheckoutProgress step={progress} orders={merchantNames} />
    ) : (
      <OrderConfirmation orders={orders} onMode={setMode} />
    );

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <TopNavigation mode={mode} onMode={nav} enabled={visible.length > 0} user={authUser} onLogout={logout} />
      <AnimatePresence mode="wait">
        {mode === "discover" ? (
          <motion.div
            key="discover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <Discover
              query={query}
              setQuery={setQuery}
              onSubmit={search}
              onUpload={upload}
              messages={messages}
              chat={chat}
              setChat={setChat}
              onSend={send}
              suggestedTasks={suggestedTasks}
              onStartTask={startTask}
              conversationStarted={messages.length > 1 || isStreaming}
              isStreaming={isStreaming || resultsLoading}
            />
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 min-h-0 grid md:grid-cols-[26%_1fr]"
          >
            <div className={`${tab === "chat" ? "block" : "hidden"} md:block min-h-0 max-w-[600px]`}>
              <ConversationPanel
                messages={messages}
                chat={chat}
                setChat={setChat}
                onSend={send}
                suggestedTasks={suggestedTasks}
                onStartTask={startTask}
              />
            </div>
            <main className={`${tab === "chat" ? "hidden" : "block"} md:block min-w-0 min-h-0`}>
              {canvas}
            </main>
          </motion.div>
        )}
      </AnimatePresence>
      {mode !== "discover" && (
        <MobileTabs
          mode={mode}
          tab={tab}
          onSelect={(id) => {
            if (id === "chat") {
              setTab("chat");
            } else {
              setTab("canvas");
              setMode(id);
            }
          }}
        />
      )}
    </div>
  );
}
















