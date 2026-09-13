"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Phase = "input" | "plan" | "timer" | "feedback" | "done" | "history";

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
};

const examples = [
  "洗碗洗衣服吹头发，一想到很花时间就不想动",
  "我有一个小工具想法，但不知道怎么开始做",
  "延期很久的字段拼接方案，不知道怎么重新进入",
];

const frictionOptions = [
  "事情太大",
  "不知道第一步",
  "害怕做不好",
  "害怕被评价",
  "太无聊",
  "精力不足",
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
      action: "把手机放到够不到的地方，只启动一轮洗衣机。",
      smallerAction: "把要洗的衣服放到洗衣机旁边，不要求开机。",
      duration: 3,
      stopCondition: "听到洗衣机开始运转，就可以停下来。",
      artifact: "一轮已经开始的洗衣程序",
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
      action:
        "打开 VOM、Kafka 离线表和资质上游表的 DDL，各写下业务键与时间字段。",
      smallerAction: "只找到 VOM 表的业务键，并在便签里记下一行。",
      duration: 8,
      stopCondition: "形成三行核对表；不知道的地方直接写“待确认”。",
      artifact: "数据源核对表",
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
      action: "画出“输入 → 下一步卡片 → 反馈”三个界面，文字框也可以。",
      smallerAction: "只画一个输入框，并写下它上方的那句话。",
      duration: 8,
      stopCondition: "纸上或文件里出现三个有名字的方框，就可以停。",
      artifact: "三屏交互草图",
    };
  }

  return {
    stage: "启动阶段",
    tags: ["任务规模感过大", "第一步模糊"],
    eyebrow: "我猜你现在卡在",
    title: "脑子看见了整个项目，而不是下一动作",
    explanation:
      "先不解决整件事。我们只留下一个看得见的痕迹，再决定要不要继续。",
    action: "打开最相关的文件，写下三个你目前还不知道的问题。",
    smallerAction: "只打开最相关的文件，并写下一个问号。",
    duration: 5,
    stopCondition: "写满三个问题即可，问题不需要有答案。",
    artifact: "三个待确认问题",
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

  const completedToday = sessions.filter((session) => {
    const date = new Date(session.id);
    return date.toDateString() === new Date().toDateString() && session.started;
  }).length;

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

  const averageDelta = sessions.length
    ? sessions.reduce((sum, session) => sum + session.before - session.after, 0) / sessions.length
    : 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!task.trim()) return;
    setIsThinking(true);
    window.setTimeout(() => {
      setPlan(buildPlan(task));
      setIsThinking(false);
      setReparseMode(false);
      setPhase("plan");
    }, 720);
  }

  function requestReparse() {
    setShowCorrection(false);
    setPlan(null);
    setReparseMode(true);
    setPhase("input");
  }

  function makeSmaller() {
    if (!plan) return;
    setPlan({
      ...plan,
      action: plan.smallerAction,
      duration: Math.min(plan.duration, 3),
      stopCondition: "完成这一小步就可以停，不需要顺势继续。",
      artifact: "一个已发生的微小动作",
      tags: ["已经再次缩小", ...plan.tags.slice(0, 1)],
    });
  }

  function beginTimer() {
    if (!plan) return;
    setSecondsLeft(plan.duration * 60);
    setPhase("timer");
  }

  function saveSession() {
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
    };
    const nextSessions = [nextSession, ...sessions].slice(0, 20);
    setSessions(nextSessions);
    window.localStorage.setItem(
      "tiny-start-sessions",
      JSON.stringify(nextSessions),
    );
    setPhase("done");
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
    setPhase("input");
  }

  function deleteSession(id: number) {
    const nextSessions = sessions.filter((session) => session.id !== id);
    setSessions(nextSessions);
    window.localStorage.setItem("tiny-start-sessions", JSON.stringify(nextSessions));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={restart} aria-label="回到首页">
          <span className="brand-mark">→</span>
          <span>Tiny Start</span>
        </button>
        <button
          className="today-pill"
          aria-label={`查看启动记录，今天启动 ${completedToday} 次`}
          onClick={() => setPhase("history")}
        >
          <span className="pulse-dot" /> 今天启动 {completedToday} 次
          <span className="history-arrow">↗</span>
        </button>
      </header>

      <section className="content-wrap">
        <aside className="side-note" aria-hidden="true">
          <span>01</span>
          <div className="side-line" />
          <p>不用完成。<br />只让第一步发生。</p>
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

              <div className="insight-card">
                <div className="insight-meta">
                  <span>{plan.stage}</span>
                  <span className="soft-label">初步判断</span>
                </div>
                <p className="eyebrow">{plan.eyebrow}</p>
                <h2>{plan.title}</h2>
                <p className="explanation">{plan.explanation}</p>
                <div className="tag-row">
                  {plan.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>

              <div className="action-card">
                <div className="action-number">只做<br /><strong>这一步</strong></div>
                <div className="action-main">
                  <p className="mini-label">现在唯一要做的事</p>
                  <h3>{plan.action}</h3>
                  <div className="action-details">
                    <div><span>预计</span><b>{plan.duration} 分钟</b></div>
                    <div><span>留下</span><b>{plan.artifact}</b></div>
                  </div>
                  <div className="stop-note">
                    <span>✓</span>
                    <p><b>允许停止</b>{plan.stopCondition}</p>
                  </div>
                </div>
              </div>

              <div className="difficulty-row">
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
              </div>

              <button className="start-button" onClick={beginTimer}>
                开始 {plan.duration} 分钟 <span>→</span>
              </button>

              <div className="adjust-row">
                <button onClick={makeSmaller}>这一步还是太大</button>
                <i />
                <button onClick={() => setShowCorrection(!showCorrection)}>你判断错了</button>
              </div>

              {showCorrection && (
                <div className="correction-panel">
                  <p>没关系。哪一种更接近？</p>
                  <div>
                    <button className="reparse-option" onClick={requestReparse}>
                      <span>↺</span>
                      <p><b>任务拆解时解析错了</b>保留原文，修改后重新解析</p>
                    </button>
                    {frictionOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => {
                          setPlan({ ...plan, tags: [option], title: `主要阻力更接近“${option}”` });
                          setShowCorrection(false);
                        }}
                      >{option}</button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {phase === "timer" && plan && (
            <section className="timer-view">
              <p className="kicker"><span>现在</span>，世界只剩这一小步</p>
              <div
                className="timer-ring"
                style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}
              >
                <div>
                  <span>{formatTime(secondsLeft)}</span>
                  <small>{secondsLeft === 0 ? "时间到了" : "正在发生"}</small>
                </div>
              </div>
              <h2>{plan.action}</h2>
              <p className="timer-stop">做到这里就够了：{plan.stopCondition}</p>
              <div className="timer-actions">
                <button className="start-button" onClick={() => { setStarted(true); setPhase("feedback"); }}>
                  我已经动起来了
                </button>
                <button className="text-button" onClick={() => { setStarted(false); setPhase("feedback"); }}>
                  还没有开始
                </button>
              </div>
            </section>
          )}

          {phase === "feedback" && plan && (
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

              <button className="start-button" onClick={saveSession}>保存这次启动</button>
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
                  <p className="kicker"><span>启动记录</span>，看见真实发生过的动作</p>
                  <h2>不是待办清单。<br />是你跨过阻力的证据。</h2>
                </div>
                <button className="compact-start" onClick={restart}>＋ 启动一件事</button>
              </div>

              <div className="history-stats">
                <div><span>全部尝试</span><b>{sessions.length}</b><small>次启动会话</small></div>
                <div><span>成功开始</span><b>{sessions.filter((item) => item.started).length}</b><small>留下了第一次动作</small></div>
                <div><span>难度校准</span><b>{averageDelta > 0 ? `−${averageDelta.toFixed(1)}` : averageDelta === 0 ? "—" : `+${Math.abs(averageDelta).toFixed(1)}`}</b><small>实际难度与预估之差</small></div>
              </div>

              <div className="history-toolbar">
                <div className="history-tabs" role="group" aria-label="筛选启动记录">
                  <button className={historyFilter === "all" ? "active" : ""} onClick={() => setHistoryFilter("all")}>全部</button>
                  <button className={historyFilter === "started" ? "active" : ""} onClick={() => setHistoryFilter("started")}>已开始</button>
                  <button className={historyFilter === "stuck" ? "active" : ""} onClick={() => setHistoryFilter("stuck")}>未开始</button>
                </div>
                <span>数据保存在当前浏览器</span>
              </div>

              {visibleSessions.length ? (
                <div className="session-list">
                  {visibleSessions.map((session) => (
                    <article className="session-item" key={session.id}>
                      <div className={`session-status ${session.started ? "success" : "stuck"}`}>
                        {session.started ? "✓" : "↺"}
                      </div>
                      <div className="session-content">
                        <div className="session-meta">
                          <span>{new Date(session.id).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <span>{session.stage ?? "启动阶段"}</span>
                        </div>
                        <h3>{session.task}</h3>
                        {session.action && <p className="session-action"><b>第一步</b>{session.action}</p>}
                        {session.artifact && <p className="session-artifact">“{session.artifact}”</p>}
                      </div>
                      <div className="session-score">
                        <span>{session.before} → {session.after}</span>
                        <small>{session.started ? "已开始" : "需要再缩小"}</small>
                      </div>
                      <button className="delete-session" onClick={() => deleteSession(session.id)} aria-label={`删除记录：${session.task}`} title="删除这条记录">×</button>
                    </article>
                  ))}
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
