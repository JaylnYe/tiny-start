"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Phase = "input" | "plan" | "timer" | "continue" | "feedback" | "done" | "history";

type ActionPlan = {
  stage: string;
  tags: string[];
  eyebrow: string;
  title: string;
  explanation: string;
  action: string;
  smallerAction: string;
  duration: number;
  stopCondition: string;
  artifact: string;
  taskType?: string;
  frictionType?: string;
  interventionType?: string;
  stepMode?: "single" | "progressive";
  activationStatus?: "friction_remaining" | "activation_achieved" | "blocked_external";
};

type SuggestionVersion = "initial" | "smaller" | "reparsed";
type HelpfulRating = "yes" | "somewhat" | "no";
type SessionEventType = "initial" | "smaller" | "reparsed" | "continued" | "action_happened" | "action_not_happened";

type SessionEvent = {
  type: SessionEventType;
  timestamp: number;
  stepNumber: number;
  action?: string;
  frictionType?: string;
  interventionType?: string;
};

type StoredSession = {
  id: number;
  task: string;
  before: number;
  after: number;
  started: boolean;
  stage?: string;
  action?: string;
  artifact?: string;
  duration?: number;
  taskType?: string;
  frictionType?: string;
  interventionType?: string;
  suggestionVersion?: SuggestionVersion;
  suggestionHelpful?: HelpfulRating;
  retryCount?: number;
  completedActions?: string[];
  events?: SessionEvent[];
  activationStatus?: ActionPlan["activationStatus"];
};

function getDateGroup(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startToday - startDate) / 86400000);
  if (daysAgo === 0) return "今天";
  if (daysAgo === 1) return "昨天";
  if (daysAgo < 7) return "本周";
  return "更早";
}

const examples = [
  "洗碗洗衣服吹头发，一想到很花时间就不想动",
  "我有一个小工具想法，但不知道怎么开始做",
  "延期很久的字段拼接方案，不知道怎么重新进入",
];

const frictionOptions = [
  "没理解我要做什么",
  "这一步还是不知道怎么做",
  "缺少资料或权限",
  "需要找人沟通",
  "害怕被评价",
  "现在没有精力",
];

function buildPlan(raw: string): ActionPlan {
  const text = raw.toLowerCase();

  if (/洗碗|洗衣|吹头|家务|打扫|收拾/.test(text)) {
    return {
      stage: "执行阶段",
      tags: ["时间被放大", "即时分心"],
      eyebrow: "你的阻力更像是",
      title: "把等待时间，也当成了持续投入",
      explanation:
        "你不需要一次处理完所有家务。先启动一个会自己继续运转的过程，让环境替你产生进度。",
      action: "把一件要洗的衣服放到洗衣机旁边。",
      smallerAction: "从椅子上拿起一件要洗的衣服。",
      duration: 1,
      stopCondition: "衣服出现在洗衣机旁边，就可以停下来。",
      artifact: "一件放到洗衣机旁的衣服",
      stepMode: "single",
      activationStatus: "activation_achieved",
    };
  }

  if (/字段|kafka|vom|sql|离线|事实表|开发|业务|方案/.test(text)) {
    return {
      stage: "重新进入 · 探索阶段",
      tags: ["关键口径不明确", "害怕被评价"],
      eyebrow: "你并不是完全不会做",
      title: "几个未知项和延期压力挤在了一起",
      explanation:
        "现在不适合直接写完整方案。先恢复上下文，把未知变成正常、可以讨论的数据问题。",
      action: "打开 VOM 表的 DDL。",
      smallerAction: "在代码平台搜索 VOM 表名。",
      duration: 2,
      stopCondition: "DDL 出现在屏幕上，就可以停下来。",
      artifact: "一个已打开的 VOM 表 DDL",
      stepMode: "progressive",
      activationStatus: "friction_remaining",
    };
  }

  if (/产品|工具|vibe|coding|原型|想法|app|网站/.test(text)) {
    return {
      stage: "探索阶段",
      tags: ["路径模糊", "完整产品压迫"],
      eyebrow: "你现在缺的不是更多功能",
      title: "需要先看见一个可以丢弃的东西",
      explanation:
        "先把想法变成一个能被指着讨论的粗糙产物。它不需要正确，只需要存在。",
      action: "画一个代表输入框的长方形。",
      smallerAction: "在纸上画一条横线。",
      duration: 1,
      stopCondition: "长方形出现，就可以停。",
      artifact: "一个输入框草图",
      stepMode: "progressive",
      activationStatus: "friction_remaining",
    };
  }

  return {
    stage: "启动阶段",
    tags: ["任务规模感过大", "第一步模糊"],
    eyebrow: "我猜你现在卡在",
    title: "脑子看见了整个项目，而不是下一动作",
    explanation:
      "先不解决整件事。我们只留下一个看得见的痕迹，再决定要不要继续。",
    action: "打开与这件事最相关的文件。",
    smallerAction: "在文件列表中找到它的名字。",
    duration: 2,
    stopCondition: "文件出现在屏幕上，就可以停。",
    artifact: "一个已打开的相关文件",
    stepMode: "progressive",
    activationStatus: "friction_remaining",
  };
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("input");
  const [task, setTask] = useState("");
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [before, setBefore] = useState(7);
  const [after, setAfter] = useState(4);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [artifact, setArtifact] = useState("");
  const [started, setStarted] = useState(true);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "started" | "stuck">("all");
  const [reparseMode, setReparseMode] = useState(false);
  const [previousPlan, setPreviousPlan] = useState<ActionPlan | null>(null);
  const [analysisNotice, setAnalysisNotice] = useState("");
  const [isReplanning, setIsReplanning] = useState(false);
  const [suggestionVersion, setSuggestionVersion] = useState<SuggestionVersion>("initial");
  const [retryCount, setRetryCount] = useState(0);
  const [feedbackStep, setFeedbackStep] = useState<"difficulty" | "helpful">("difficulty");
  const [stepNumber, setStepNumber] = useState(1);
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem("tiny-start-sessions");
    if (saved) {
      try {
        setSessions(JSON.parse(saved));
      } catch {
        window.localStorage.removeItem("tiny-start-sessions");
      }
    }
  }, []);

  useEffect(() => {
    if (phase !== "timer" || secondsLeft <= 0) return;
    const timer = window.setInterval(
      () => setSecondsLeft((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase, secondsLeft]);

  const progress = useMemo(() => {
    if (!plan) return 0;
    const total = plan.duration * 60;
    return Math.max(0, Math.min(1, (total - secondsLeft) / total));
  }, [plan, secondsLeft]);

  const visibleSessions = sessions.filter((session) => {
    if (historyFilter === "started") return session.started;
    if (historyFilter === "stuck") return !session.started;
    return true;
  });
  const sessionGroups = ["今天", "昨天", "本周", "更早"]
    .map((label) => ({ label, items: visibleSessions.filter((session) => getDateGroup(session.id) === label) }))
    .filter((group) => group.items.length);

  const difficultySessions = sessions.filter((session) => session.started);
  const averageDelta = difficultySessions.length
    ? difficultySessions.reduce((sum, session) => sum + session.before - session.after, 0) / difficultySessions.length
    : 0;
  const averageBefore = difficultySessions.length ? difficultySessions.reduce((sum, session) => sum + session.before, 0) / difficultySessions.length : 0;
  const averageAfter = difficultySessions.length ? difficultySessions.reduce((sum, session) => sum + session.after, 0) / difficultySessions.length : 0;
  const calibrationSummary = !difficultySessions.length
    ? "还没有足够的数据"
    : averageDelta > 0.5
      ? "最近你通常会把开始想难一点"
      : averageDelta < -0.5
        ? "最近有些动作实际比预想更难"
        : "最近你的困难预估比较接近实际";

  const now = Date.now();
  const todaySessions = sessions.filter((session) => getDateGroup(session.id) === "今天");
  const todayDifficultySessions = todaySessions.filter((session) => session.started);
  const recentWeek = sessions.filter((session) => now - session.id < 7 * 86400000);
  const previousWeek = sessions.filter((session) => now - session.id >= 7 * 86400000 && now - session.id < 14 * 86400000);
  const meanRetries = (items: StoredSession[]) => items.length
    ? items.reduce((sum, session) => sum + (session.retryCount ?? 0), 0) / items.length
    : 0;
  const todayBefore = todayDifficultySessions.length ? todayDifficultySessions.reduce((sum, item) => sum + item.before, 0) / todayDifficultySessions.length : 0;
  const todayAfter = todayDifficultySessions.length ? todayDifficultySessions.reduce((sum, item) => sum + item.after, 0) / todayDifficultySessions.length : 0;
  const frictionCounts = sessions.reduce<Record<string, number>>((counts, session) => {
    const key = session.frictionType;
    if (key) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const commonFrictions = Object.entries(frictionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const interventionStats = sessions.reduce<Record<string, { total: number; happened: number }>>((stats, session) => {
    const key = session.interventionType;
    if (!key) return stats;
    stats[key] ??= { total: 0, happened: 0 };
    stats[key].total += 1;
    if (session.started) stats[key].happened += 1;
    return stats;
  }, {});
  const bestIntervention = Object.entries(interventionStats)
    .sort((a, b) => (b[1].happened / b[1].total) - (a[1].happened / a[1].total))[0];
  const observationSummary = commonFrictions[0]
    ? `最近你最常卡在“${commonFrictions[0][0]}”。${bestIntervention ? `“${bestIntervention[0]}”目前更容易让下一步发生。` : "再记录几次，就能看见哪种干预更有效。"}`
    : "还在观察。完成几次启动后，这里会慢慢看见你的阻力规律。";

  function createEvent(type: SessionEventType, currentPlan: ActionPlan | null, currentStep = stepNumber): SessionEvent {
    return {
      type,
      timestamp: Date.now(),
      stepNumber: currentStep,
      action: currentPlan?.action,
      frictionType: currentPlan?.frictionType ?? currentPlan?.tags[0],
      interventionType: currentPlan?.interventionType,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!task.trim()) return;
    setIsThinking(true);
    setAnalysisNotice("");
    const wasReparse = reparseMode;
    let resolvedPlan: ActionPlan;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: task.trim(),
          previousPlan: reparseMode ? previousPlan : null,
          correction: reparseMode ? "任务拆解或意图解析不准确，请结合补充后的描述重新判断。" : null,
        }),
      });
      if (!response.ok) throw new Error("analysis unavailable");
      const data = await response.json() as { plan: ActionPlan };
      resolvedPlan = data.plan;
      setPlan(resolvedPlan);
    } catch {
      resolvedPlan = buildPlan(task);
      setPlan(resolvedPlan);
      setAnalysisNotice("AI 暂时未连接，已使用本地拆解继续。你的内容没有丢失。");
    } finally {
      setIsThinking(false);
      setSuggestionVersion(wasReparse ? "reparsed" : "initial");
      if (wasReparse) setRetryCount((value) => value + 1);
      setReparseMode(false);
      setPreviousPlan(null);
      setSessionEvents((events) => wasReparse
        ? [...events, createEvent("reparsed", resolvedPlan, stepNumber)]
        : [createEvent("initial", resolvedPlan, 1)]);
      setPhase("plan");
    }
  }

  function requestReparse() {
    setShowCorrection(false);
    setPreviousPlan(plan);
    setPlan(null);
    setReparseMode(true);
    setPhase("input");
  }

  async function replanFromFriction(correction: string, version: SuggestionVersion = "reparsed") {
    if (!plan || isReplanning) return;
    setIsReplanning(true);
    setAnalysisNotice("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim(), previousPlan: plan, correction }),
      });
      if (!response.ok) throw new Error("replan unavailable");
      const data = await response.json() as { plan: ActionPlan };
      setPlan(data.plan);
      setSessionEvents((events) => [...events, createEvent(version === "smaller" ? "smaller" : "reparsed", data.plan)]);
      setSuggestionVersion(version);
      setRetryCount((value) => value + 1);
      setShowCorrection(false);
      setBefore(7);
    } catch {
      setAnalysisNotice("这次没能重新拆解，原来的第一步还在。可以稍后再试，或修改任务描述。");
      setShowCorrection(false);
    } finally {
      setIsReplanning(false);
    }
  }

  function makeSmaller() {
    replanFromFriction("这一步仍然太大。请避开同义改写，只返回一个更小、更靠前、10 秒到 1 分钟内可发生的原子动作。", "smaller");
  }

  function beginTimer() {
    if (!plan) return;
    setSecondsLeft(plan.duration * 60);
    setPhase("timer");
  }

  function markActionHappened() {
    if (!plan) return;
    setStarted(true);
    setCompletedActions((items) => [...items, plan.action]);
    setSessionEvents((events) => [...events, createEvent("action_happened", plan)]);
    setPhase(plan.activationStatus === "friction_remaining" && stepNumber < 5 ? "continue" : "feedback");
  }

  function markActionNotHappened() {
    setStarted(false);
    setSessionEvents((events) => [...events, createEvent("action_not_happened", plan)]);
    setPhase("feedback");
  }

  async function loadNextStep() {
    if (!plan || isLoadingNext) return;
    setIsLoadingNext(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: task.trim(),
          previousPlan: plan,
          correction: `第 ${stepNumber} 步已经发生。已完成动作：${completedActions.join("；")}。只生成自然衔接的下一个原子动作；如果任务已经足够启动，stepMode 设为 single。`,
        }),
      });
      if (!response.ok) throw new Error("next step unavailable");
      const data = await response.json() as { plan: ActionPlan };
      setPlan(data.plan);
      setSessionEvents((events) => [...events, createEvent("continued", data.plan, stepNumber + 1)]);
      setStepNumber((value) => value + 1);
      setPhase("plan");
    } catch {
      setAnalysisNotice("下一步暂时没有生成。已经发生的动作仍会被保留。");
      setPhase("feedback");
    } finally {
      setIsLoadingNext(false);
    }
  }

  function saveSession(suggestionHelpful?: HelpfulRating) {
    const nextSession: StoredSession = {
      id: Date.now(),
      task,
      before,
      after,
      started,
      stage: plan?.stage,
      action: plan?.action,
      artifact,
      duration: plan?.duration,
      taskType: plan?.taskType,
      frictionType: plan?.frictionType ?? plan?.tags[0],
      interventionType: plan?.interventionType,
      suggestionVersion,
      suggestionHelpful,
      retryCount,
      completedActions,
      events: sessionEvents,
      activationStatus: plan?.activationStatus,
    };
    const nextSessions = [nextSession, ...sessions].slice(0, 20);
    setSessions(nextSessions);
    window.localStorage.setItem(
      "tiny-start-sessions",
      JSON.stringify(nextSessions),
    );
    setPhase("done");
  }

  function finishDifficultyFeedback() {
    if (started && sessions.length % 3 === 0) setFeedbackStep("helpful");
    else saveSession();
  }

  function restart() {
    setTask("");
    setPlan(null);
    setArtifact("");
    setBefore(7);
    setAfter(4);
    setStarted(true);
    setShowCorrection(false);
    setReparseMode(false);
    setPreviousPlan(null);
    setAnalysisNotice("");
    setSuggestionVersion("initial");
    setRetryCount(0);
    setFeedbackStep("difficulty");
    setStepNumber(1);
    setCompletedActions([]);
    setIsLoadingNext(false);
    setSessionEvents([]);
    setPhase("input");
  }

  function deleteSession(id: number) {
    const nextSessions = sessions.filter((session) => session.id !== id);
    setSessions(nextSessions);
    window.localStorage.setItem("tiny-start-sessions", JSON.stringify(nextSessions));
  }

  const anchor = phase === "history"
    ? { label: "观察记录", note: "看看什么对你真的有用。" }
    : phase === "input"
      ? { label: "00 · 说出来", note: "先不用想清楚。" }
      : phase === "continue"
        ? { label: `${String(stepNumber).padStart(2, "0")} ✓`, note: "下一步暂时不会追你。" }
        : phase === "feedback" || phase === "done"
          ? started
            ? { label: `${String(stepNumber).padStart(2, "0")} ✓ · 已经发生`, note: "这一步已经算数。" }
            : { label: `${String(stepNumber).padStart(2, "0")} · 这次没动`, note: "也没关系，我们只记录真实。" }
          : { label: `${String(stepNumber).padStart(2, "0")} · 当前一步`, note: "不用完成，只让这一步发生。" };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={restart} aria-label="回到首页">
          <span className="brand-mark">→</span>
          <span>Tiny Start</span>
        </button>
        <button
          className="today-pill"
          aria-label="查看我的启动校准"
          onClick={() => setPhase("history")}
        >
          <span className="pulse-dot" /> 看看我的启动校准
          <span className="history-arrow">↗</span>
        </button>
      </header>

      <section className="content-wrap">
        <aside className="side-note" aria-live="polite">
          <span>{anchor.label}</span>
          <div className="side-line" />
          <p>{anchor.note}</p>
        </aside>

        <div className="stage" data-phase={phase}>
          {phase === "input" && (
            <section className="input-view">
              <div className="hero-copy">
                <p className="kicker"><span>{reparseMode ? "重新解析" : "先动一下"}</span>，不用准备好</p>
                <h1>{reparseMode ? <>刚才理解偏了，<br />再说得具体一点。</> : <>现在有什么事情，<br />你一直不想开始？</>}</h1>
                <p className="subtitle">
                  {reparseMode
                    ? "原来的内容已经保留。可以补充真正想完成的结果、目前做到哪里，或者指出哪一部分被拆错了。"
                    : "随便说。我们先认出你卡在哪里，再把整件事缩成一个动作。"}
                </p>
              </div>

              {reparseMode && (
                <div className="reparse-notice">
                  <span>↺</span>
                  <p><b>正在重新理解任务</b>修改下面的描述后再次解析，不会覆盖以前的启动记录。</p>
                </div>
              )}

              <form className="task-composer" onSubmit={handleSubmit}>
                <textarea
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="比如：季度总结拖了很久，一想到要整理很多东西就不想打开……"
                  rows={5}
                  aria-label="描述一件不想开始的事情"
                />
                <div className="composer-footer">
                  <span>{task.length}/300</span>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!task.trim() || isThinking}
                  >
                    {isThinking ? (
                      <><span className="thinking-dot" /> 正在找第一步</>
                    ) : (
                      <>{reparseMode ? "重新解析" : "帮我开始"} <span>→</span></>
                    )}
                  </button>
                </div>
              </form>

              <div className="examples">
                <span>试试这些真实场景</span>
                <div className="example-list">
                  {examples.map((example, index) => (
                    <button key={example} onClick={() => setTask(example)}>
                      <b>0{index + 1}</b>{example}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {phase === "plan" && plan && (
            <section className="plan-view">
              <button className="back-button" onClick={() => setPhase("input")}>
                ← 换一件事
              </button>

              {analysisNotice && <div className="analysis-notice">{analysisNotice}</div>}

              <div className="action-card">
                <div className="action-number"><small>0{stepNumber}</small>只做<br /><strong>这一步</strong></div>
                <div className="action-main">
                  <p className="mini-label">现在唯一要做的事</p>
                  <h3>{plan.action}</h3>
                  <div className="action-details">
                    <div><span>启动窗口</span><b>{plan.duration} 分钟</b></div>
                    <div><span>留下</span><b>{plan.artifact}</b></div>
                  </div>
                  <div className="stop-note">
                    <span>✓</span>
                    <p><b>允许停止</b>{plan.stopCondition}</p>
                  </div>
                </div>
              </div>

              <details className="insight-disclosure">
                <summary>为什么给我这一步？ <span>⌄</span></summary>
                <div className="insight-card">
                  <div className="insight-meta">
                    <span>{plan.stage}</span>
                    <span className="soft-label">一种可能的理解</span>
                  </div>
                  <p className="eyebrow">{plan.eyebrow}</p>
                  <h2>{plan.title}</h2>
                  <p className="explanation">{plan.explanation}</p>
                  <div className="tag-row">
                    {plan.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </div>
              </details>

              {stepNumber === 1 && <div className="difficulty-row">
                <label>开始前，这一步感觉有多难？</label>
                <div className="scale" role="group" aria-label="开始前难度">
                  {[1,2,3,4,5,6,7,8,9,10].map((value) => (
                    <button
                      key={value}
                      className={before === value ? "active" : ""}
                      onClick={() => setBefore(value)}
                      aria-label={`难度 ${value}`}
                    >{value}</button>
                  ))}
                </div>
              </div>}

              <button className="start-button" onClick={beginTimer}>
                给自己一个启动窗口 <span>→</span>
              </button>

              <div className="adjust-row">
                <button onClick={makeSmaller} disabled={isReplanning}>{isReplanning ? "正在继续缩小…" : "这一步还是太大"}</button>
                <i />
                <button onClick={() => setShowCorrection(!showCorrection)}>不太像我</button>
              </div>

              {showCorrection && (
                <div className="correction-panel">
                  <p>{isReplanning ? "正在根据反馈换一个入口…" : "没关系。刚才具体错在哪里？"}</p>
                  <div>
                    <button className="reparse-option" onClick={requestReparse} disabled={isReplanning}>
                      <span>↺</span>
                      <p><b>任务拆解时解析错了</b>保留原文，修改后重新解析</p>
                    </button>
                    {frictionOptions.map((option) => (
                      <button
                        key={option}
                        disabled={isReplanning}
                        onClick={() => replanFromFriction(option)}
                      >{isReplanning ? "重新拆解中…" : option}</button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {phase === "timer" && plan && (
            <section className="timer-view">
              <p className="kicker"><span>现在</span>，世界只剩这一小步</p>
              <h2>{plan.action}</h2>
              <p className="timer-stop">做到这里就够了：{plan.stopCondition}</p>
              <div
                className="timer-ring"
                style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}
              >
                <div>
                  <span>{formatTime(secondsLeft)}</span>
                  <small>{secondsLeft === 0 ? "现在可以停" : "启动窗口"}</small>
                </div>
              </div>
              <p className="timer-hint">不用等倒计时结束，动作发生就可以结束。</p>
              <div className="timer-actions">
                <button className="start-button" onClick={markActionHappened}>
                  做到了
                </button>
                <button className="text-button" onClick={markActionNotHappened}>
                  还没动
                </button>
              </div>
            </section>
          )}

          {phase === "continue" && plan && (
            <section className="continue-view">
              <div className="completed-step">✓</div>
              <p className="kicker"><span>第 {stepNumber} 步发生了</span></p>
              <h2>到这里已经够了。</h2>
              <p className="subtitle">下一步不会追着你。只有你想继续时，它才会出现。</p>
              <div className="continue-actions">
                <button className="start-button" onClick={loadNextStep} disabled={isLoadingNext}>
                  {isLoadingNext ? "正在找下一步…" : "我想再走一步"}
                </button>
                <button className="text-button" onClick={() => setPhase("feedback")}>今天到这里</button>
              </div>
            </section>
          )}

          {phase === "feedback" && plan && feedbackStep === "difficulty" && (
            <section className="feedback-view">
              <div className="feedback-mark">{started ? "✓" : "↺"}</div>
              <p className="kicker"><span>{started ? "第一步发生了" : "这次也算一次观察"}</span></p>
              <h2>{started ? "实际开始后，有多难？" : "是什么挡住了这一步？"}</h2>
              <p className="subtitle">
                {started
                  ? "不是打分自己，只是在帮大脑校准预测。"
                  : "不用补偿，也不用自责。留下真实反馈，下一次再缩小。"}
              </p>

              <div className="feedback-scale">
                <div className="scale-labels"><span>几乎没阻力</span><span>非常困难</span></div>
                <div className="scale large" role="group" aria-label="实际难度">
                  {[1,2,3,4,5,6,7,8,9,10].map((value) => (
                    <button
                      key={value}
                      className={after === value ? "active" : ""}
                      onClick={() => setAfter(value)}
                    >{value}</button>
                  ))}
                </div>
              </div>

              <label className="artifact-input">
                <span>{started ? "留下了什么？（可选）" : "没开始的原因（可选）"}</span>
                <input
                  value={artifact}
                  onChange={(event) => setArtifact(event.target.value)}
                  placeholder={started ? `例如：${plan.artifact}` : "例如：还是不知道去哪里找文件"}
                />
              </label>

              <button className="start-button" onClick={finishDifficultyFeedback}>记录这次感受</button>
            </section>
          )}

          {phase === "feedback" && plan && feedbackStep === "helpful" && (
            <section className="feedback-view helpful-view">
              <div className="feedback-mark">?</div>
              <p className="kicker"><span>最后一个轻反馈</span></p>
              <h2>这条建议有帮助吗？</h2>
              <p className="subtitle">只偶尔问一次，用来判断哪种干预真的能让动作发生。</p>
              <div className="helpful-options">
                <button onClick={() => saveSession("yes")}>有帮助</button>
                <button onClick={() => saveSession("somewhat")}>一般</button>
                <button onClick={() => saveSession("no")}>没有</button>
              </div>
            </section>
          )}

          {phase === "done" && plan && (
            <section className="done-view">
              <div className="confetti">✦</div>
              <p className="kicker"><span>已记录</span></p>
              <h2>{started ? "不是完成了一切。\n是你重新获得了行动权。" : "没有假装成功。\n这也是有用的数据。"}</h2>
              <div className="result-card">
                <div><span>开始前</span><b>{before}</b></div>
                <span className="result-arrow">→</span>
                <div><span>实际感受</span><b>{after}</b></div>
                <p className={after <= before ? "easier" : "harder"}>
                  {after <= before
                    ? `比预想低 ${before - after} 分`
                    : `比预想高 ${after - before} 分，下次需要再缩小`}
                </p>
              </div>
              {artifact && <p className="artifact-result">“{artifact}”</p>}
              <button className="start-button" onClick={restart}>再启动一件事</button>
            </section>
          )}

          {phase === "history" && (
            <section className="history-view">
              <button className="back-button" onClick={() => setPhase("input")}>
                ← 回到启动页
              </button>
              <div className="history-heading">
                <div>
                  <p className="kicker"><span>我的启动画像</span>，只观察，不评价</p>
                  <h2>看看什么阻力常出现，<br />什么方法真的有用。</h2>
                </div>
                <button className="compact-start" onClick={restart}>＋ 启动一件事</button>
              </div>

              <div className="calibration-story observation-hero">
                <span>最近的观察</span>
                <h3>{observationSummary}</h3>
                <p>{sessions.length < 5 ? `目前只有 ${sessions.length} 条记录，还在观察，不急着下结论。` : calibrationSummary}</p>
              </div>

              <div className="daily-observation">
                <div>
                  <span>每日启动观察</span>
                  <h3>{todaySessions.length ? `今天记录了 ${todaySessions.length} 次启动。` : "今天还没有记录，也没关系。"}</h3>
                  <p>{todayDifficultySessions.length
                    ? `预计难度 ${todayBefore.toFixed(1)}，实际难度 ${todayAfter.toFixed(1)}。你今天通常把开始${todayBefore >= todayAfter ? "想难了" : "想轻了"} ${Math.abs(todayBefore - todayAfter).toFixed(1)} 分。`
                    : "下一次动作发生后，这里会留下当天的真实体感。"}</p>
                </div>
                <b className={`start-feeling ${todayBefore - todayAfter > 0.5 ? "lighter" : todayAfter - todayBefore > 0.5 ? "needs-smaller" : "steady"}`}>
                  {todayDifficultySessions.length ? (todayBefore - todayAfter > 0.5 ? "更轻了" : todayAfter - todayBefore > 0.5 ? "需要更小入口" : "差不多") : "还在观察"}
                </b>
              </div>

              <div className="week-trend">
                最近一周，你平均需要调整 <b>{meanRetries(recentWeek).toFixed(1)}</b> 次才能找到合适动作；
                {previousWeek.length ? <>上周是 <b>{meanRetries(previousWeek).toFixed(1)}</b> 次。</> : "上周数据还不够。"}
              </div>

              <div className="observation-grid">
                <article><span>困难校准</span><b>{difficultySessions.length ? `${averageBefore.toFixed(1)} → ${averageAfter.toFixed(1)}` : "还在观察"}</b><p>{calibrationSummary}</p></article>
                <article><span>常见阻力</span><b>{commonFrictions.length ? commonFrictions.map(([name]) => name).join(" · ") : "还在观察"}</b><p>{commonFrictions.length ? "这些阻力最近出现得更多。" : "有记录后才会形成画像。"}</p></article>
                <article><span>有效干预</span><b>{bestIntervention ? bestIntervention[0] : "还在观察"}</b><p>{bestIntervention ? `${bestIntervention[1].happened}/${bestIntervention[1].total} 次让动作发生。` : "先不根据少量数据下结论。"}</p></article>
                <article><span>调整过程</span><b>{sessions.length ? `${meanRetries(sessions).toFixed(1)} 次` : "还在观察"}</b><p>平均需要缩小或重新理解的次数。</p></article>
              </div>

              <div className="time-observation">{sessions.length >= 10 ? "时间段规律将在下一轮画像中出现。" : `再积累 ${Math.max(0, 10 - sessions.length)} 条记录后，才会尝试判断哪个时间段更容易卡住。`}</div>

              <div className="history-toolbar">
                <div className="history-tabs" role="group" aria-label="筛选启动记录">
                  <button className={historyFilter === "all" ? "active" : ""} onClick={() => setHistoryFilter("all")}>全部</button>
                  <button className={historyFilter === "started" ? "active" : ""} onClick={() => setHistoryFilter("started")}>已开始</button>
                  <button className={historyFilter === "stuck" ? "active" : ""} onClick={() => setHistoryFilter("stuck")}>未开始</button>
                </div>
                <span>数据保存在当前浏览器</span>
              </div>

              {visibleSessions.length ? (
                <div className="dated-session-list">
                  {sessionGroups.map((group) => <section className="date-group" key={group.label}>
                    <h3>{group.label}<span>{group.items.length} 条观察</span></h3>
                    <div className="session-list">
                    {group.items.map((session) => (
                    <article className="session-item" key={session.id}>
                      <div className={`session-status ${session.started ? "success" : "stuck"}`}>
                        {session.started ? "✓" : "↺"}
                      </div>
                      <div className="session-content">
                        <div className="session-meta">
                          <span>{new Date(session.id).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <span>{session.stage ?? "启动阶段"}</span>
                          {session.suggestionVersion && <span>{session.suggestionVersion === "initial" ? "初次建议" : session.suggestionVersion === "smaller" ? "缩小后" : "重新解析后"}</span>}
                          {!!session.retryCount && <span>调整 {session.retryCount} 次</span>}
                        </div>
                        <h3>{session.task}</h3>
                        {session.action && <p className="session-action"><b>第一步</b>{session.action}</p>}
                        {session.artifact && <p className="session-artifact">“{session.artifact}”</p>}
                        {!!session.completedActions?.length && <p className="session-path">走了 {session.completedActions.length} 步 · 最后一步：{session.completedActions.at(-1)}</p>}
                      </div>
                      <div className="session-score">
                        <span>{session.before} → {session.after}</span>
                        <small>{session.started ? "已开始" : "需要再缩小"}</small>
                      </div>
                      <button className="delete-session" onClick={() => deleteSession(session.id)} aria-label={`删除记录：${session.task}`} title="删除这条记录">×</button>
                    </article>
                    ))}
                    </div>
                  </section>)}
                </div>
              ) : (
                <div className="history-empty">
                  <span>→</span>
                  <h3>{sessions.length ? "这个筛选下还没有记录" : "第一条记录，会在你开始之后出现"}</h3>
                  <p>我们记录启动，不用完成数量催促你。</p>
                  {!sessions.length && <button className="primary-button" onClick={restart}>开始第一次</button>}
                </div>
              )}
            </section>
          )}
        </div>
      </section>

      <footer>
        <span>你的内容只保存在当前浏览器</span>
        <span>Tiny Start · 原型 0.1</span>
      </footer>
    </main>
  );
}
