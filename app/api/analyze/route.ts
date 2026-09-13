import { NextRequest, NextResponse } from "next/server";

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

const systemPrompt = `你是 Tiny Start 的行动拆解助手。你的目标不是鼓励用户完成整件事，而是识别此刻的启动阻力，并给出一个具体、可见、可在 10 秒到 2 分钟内发生且允许停止的第一动作。

先判断用户处于探索、规划、执行还是重新进入阶段，再识别最多两个阻力。动作必须以动词开头，不能使用“开始做、想一想、研究一下、制定计划”等模糊表达；要说明打开什么、找到什么、写下什么或发出什么。不要假装知道用户没提供的系统、表名、文件或业务规则。

根据阻力选择不同入口：
- 缺少信息：只写下当前最关键的一个未知项，不要一次列出三项。
- 缺少权限或依赖他人：直接把原子动作写成“发送消息：‘……’”，不要再要求打开聊天窗口。
- 害怕沟通或被评价：目标改为形成可讨论的粗糙版本，或发出低压力的确认消息，不要求一次做对。
- 精力不足：动作缩到 3 分钟，只要求准备环境或留下一个痕迹。
- 任务规模过大：不要展示完整任务树，只给一个动作。
- 不知道怎么做：先做最小探索动作，但必须留下可见产物，不能只写“看资料”。

Tiny Step 必须原子化：原则上只有一个主要动词；禁止用“然后、再、并且、以及”串联动作；不要用逗号罗列连续步骤；不要求先完成额外准备；完成状态必须肉眼可判断。duration 只能是 1 或 2，表示辅助性的启动窗口，不表示必须持续做满。

不要断言用户的心理状态。避免“你不是……而是……”“你就是……”等诊断式表达，统一使用“看起来可能”“也许”“一种可能是”等试探性措辞。

如果提供了上一次拆解和用户纠正，必须明确避开上一次的错误入口，重新生成 action、smallerAction、stopCondition 和 artifact，不能只更换标签或措辞。

只输出一个合法 json 对象，不要 Markdown。严格使用这个结构：
{
  "stage": "阶段名称",
  "tags": ["阻力一", "阻力二"],
  "eyebrow": "对用户状态的温和判断",
  "title": "一句具体洞察",
  "explanation": "为什么先做这一步，最多两句话",
  "action": "一个具体的最小动作",
  "smallerAction": "action 仍太大时的更小动作",
  "duration": 1,
  "stopCondition": "做到什么就允许停",
  "artifact": "完成动作后留下的可见痕迹"
}`;

function isPlan(value: unknown): value is ActionPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  const strings = ["stage", "eyebrow", "title", "explanation", "action", "smallerAction", "stopCondition", "artifact"];
  return strings.every((key) => typeof plan[key] === "string" && plan[key])
    && Array.isArray(plan.tags)
    && plan.tags.length > 0
    && plan.tags.every((tag) => typeof tag === "string")
    && typeof plan.duration === "number";
}

function isAtomic(plan: ActionPlan) {
  return !/[，,；;、]|然后|再|并|以及/.test(plan.action)
    && !/[，,；;、]|然后|再|并|以及/.test(plan.smallerAction);
}

async function requestPlan(apiKey: string, userContent: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: 900,
      temperature: 0.35,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("DeepSeek request failed", response.status, detail.slice(0, 300));
    throw new Error("Model request failed");
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty model response");
  const plan = JSON.parse(content) as unknown;
  if (!isPlan(plan)) throw new Error("Invalid plan shape");
  return plan;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY 未配置" }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as {
    task?: string;
    previousPlan?: ActionPlan | null;
    correction?: string | null;
  } | null;
  const task = body?.task?.trim();
  if (!task || task.length > 300) {
    return NextResponse.json({ error: "请输入 1–300 字的任务描述" }, { status: 400 });
  }

  const context = body?.previousPlan
    ? `\n\n上一次拆解：${JSON.stringify(body.previousPlan)}\n用户纠正：${body.correction ?? "任务拆解或意图解析不准确，请重新判断。"}`
    : "";

  try {
    let plan = await requestPlan(apiKey, `请分析这个任务并输出 json：${task}${context}`);
    for (let attempt = 0; attempt < 2 && !isAtomic(plan); attempt += 1) {
      plan = await requestPlan(
        apiKey,
        `下面的拆解仍包含多个动作，请保留意图但重写完整 json。action 和 smallerAction 各自只能有一个动词、一个动作，不能包含逗号、“并”“然后”“再”等连接词。正确示例是“发送消息：‘能否确认字段更新时间？’”，不是“打开聊天窗口并输入消息”：${JSON.stringify(plan)}`,
      );
    }
    if (!isAtomic(plan)) throw new Error("Plan is not atomic");

    return NextResponse.json({
      plan: {
        ...plan,
        tags: plan.tags.slice(0, 2),
        duration: Math.max(1, Math.min(2, Math.round(plan.duration))),
      },
    });
  } catch (error) {
    console.error("DeepSeek analysis error", error);
    return NextResponse.json({ error: "拆解结果暂时不可用" }, { status: 502 });
  }
}
