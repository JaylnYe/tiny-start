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

const systemPrompt = `你是 Tiny Start 的行动拆解助手。你的目标不是鼓励用户完成整件事，而是识别此刻的启动阻力，并给出一个具体、可见、可在 3–10 分钟内完成且允许停止的第一动作。

先判断用户处于探索、规划、执行还是重新进入阶段，再识别最多两个阻力。动作必须以动词开头，不能使用“开始做、想一想、研究一下、制定计划”等模糊表达；要说明打开什么、找到什么、写下什么或发出什么。不要假装知道用户没提供的系统、表名、文件或业务规则。信息不足时，把“列出待确认问题”作为产物，而不是追问后让用户无法行动。

只输出一个合法 json 对象，不要 Markdown。严格使用这个结构：
{
  "stage": "阶段名称",
  "tags": ["阻力一", "阻力二"],
  "eyebrow": "对用户状态的温和判断",
  "title": "一句具体洞察",
  "explanation": "为什么先做这一步，最多两句话",
  "action": "一个具体的最小动作",
  "smallerAction": "action 仍太大时的更小动作",
  "duration": 5,
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
          { role: "user", content: `请分析这个任务并输出 json：${task}${context}` },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        max_tokens: 900,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("DeepSeek request failed", response.status, detail.slice(0, 300));
      return NextResponse.json({ error: "AI 暂时没有响应" }, { status: 502 });
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty model response");
    const plan = JSON.parse(content) as unknown;
    if (!isPlan(plan)) throw new Error("Invalid plan shape");

    return NextResponse.json({
      plan: {
        ...plan,
        tags: plan.tags.slice(0, 2),
        duration: Math.max(3, Math.min(10, Math.round(plan.duration))),
      },
    });
  } catch (error) {
    console.error("DeepSeek analysis error", error);
    return NextResponse.json({ error: "拆解结果暂时不可用" }, { status: 502 });
  }
}
