import { spawn, ChildProcess, execSync } from "child_process";
import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs";

/* ─── Python 実行ファイル解決 ─── */
let _resolvedPython: string | null = null;

function resolvePython(): string {
  if (_resolvedPython) return _resolvedPython;

  // 1. 環境変数で明示指定されている場合はそれを優先
  if (process.env.PYTHON_PATH) {
    _resolvedPython = process.env.PYTHON_PATH;
    return _resolvedPython;
  }

  // 2. py ランチャー経由で ultralytics が使えるバージョンを探す
  const candidates = ["3.13", "3.12", "3.11", "3.10", "3.9", "3.8", "3.7"];
  for (const ver of candidates) {
    try {
      const exe = execSync(`py -${ver} -c "import sys; print(sys.executable)"`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      try {
        execSync(`"${exe}" -c "import ultralytics"`, {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["ignore", "ignore", "ignore"],
        });
        _resolvedPython = exe;
        return _resolvedPython;
      } catch {
        // ultralyticsなし → 次を試す
      }
    } catch {
      // py -x.x が存在しない → 次を試す
    }
  }

  // 3. フォールバック: PATH上の python
  _resolvedPython = "python";
  return _resolvedPython;
}

/* ─── ジョブストア（プロセス再起動でリセット） ─── */
interface TrainingJob {
  process: ChildProcess | null;
  logs: string[];
  phase: "running" | "done" | "error";
  progress: number;
  epoch: number;
  totalEpochs: number;
  listeners: Set<(event: string, data: object) => void>;
}

const jobs = new Map<string, TrainingJob>();

function broadcast(job: TrainingJob, event: string, data: object) {
  for (const fn of job.listeners) {
    try { fn(event, data); } catch { /* 切断済みリスナーは無視 */ }
  }
}

/* ─── POST: 学習開始 ─── */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: { owner: true },
  });
  if (!workspace || workspace.owner.email !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    model?: string;
    params?: {
      epochs?: string;
      batch?: string;
      imgSize?: string;
      patience?: string;
      optimizer?: string;
      lr0?: string;
      lrf?: string;
      momentum?: string;
      weightDecay?: string;
    };
  };

  const model = (body.model || "yolov8n").replace(/[^a-zA-Z0-9._-]/g, "");
  const p = body.params ?? {};
  const epochs = Math.max(1, Math.min(3000, parseInt(p.epochs || "100", 10)));
  const batch = Math.max(1, Math.min(512, parseInt(p.batch || "16", 10)));
  const imgSize = Math.max(32, Math.min(4096, parseInt(p.imgSize || "640", 10)));
  const patience = Math.max(0, Math.min(500, parseInt(p.patience || "100", 10)));
  const optimizer = ["auto", "SGD", "Adam", "AdamW", "NAdam", "RAdam", "RMSProp"].includes(p.optimizer || "")
    ? (p.optimizer || "auto")
    : "auto";
  const lr0 = Math.max(0.000001, Math.min(1, parseFloat(p.lr0 || "0.01")));
  const lrf = Math.max(0.000001, Math.min(1, parseFloat(p.lrf || "0.01")));

  // dataset.yaml が存在するか確認（prepare-training で生成済みのもの）
  const datasetYaml = path.join(process.cwd(), "tmp", "workspaces", id, "dataset.yaml");
  if (!fs.existsSync(datasetYaml)) {
    return NextResponse.json(
      { error: "学習データが準備されていません。先に「学習データを準備」を実行してください。" },
      { status: 400 }
    );
  }

  const jobId = crypto.randomUUID();
  const outputDir = path.join(process.cwd(), "tmp", "workspaces", id, "runs");
  fs.mkdirSync(outputDir, { recursive: true });

  const job: TrainingJob = {
    process: null,
    logs: [],
    phase: "running",
    progress: 0,
    epoch: 0,
    totalEpochs: epochs,
    listeners: new Set(),
  };
  jobs.set(jobId, job);

  const args = [
    "-m", "ultralytics", "train",
    `model=${model}.pt`,
    `data=${datasetYaml.replace(/\\/g, "/")}`,
    `epochs=${epochs}`,
    `batch=${batch}`,
    `imgsz=${imgSize}`,
    `patience=${patience}`,
    `optimizer=${optimizer}`,
    `lr0=${lr0}`,
    `lrf=${lrf}`,
    `project=${outputDir.replace(/\\/g, "/")}`,
    `name=train`,
    `exist_ok=True`,
  ];

  const proc = spawn(resolvePython(), args, {
    cwd: process.cwd(),
    env: { ...process.env },
    windowsHide: true,
  });
  job.process = proc;

  // エポック進捗パターン: "  1/100   ..."
  const epochRegex = /^\s*(\d+)\/(\d+)\s+/;

  const handleLine = (text: string) => {
    const trimmed = text.trimEnd();
    if (!trimmed) return;
    job.logs.push(trimmed);
    broadcast(job, "log", { text: trimmed });

    const m = epochRegex.exec(trimmed);
    if (m) {
      const currentEpoch = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      const pct = Math.round((currentEpoch / total) * 100);
      job.epoch = currentEpoch;
      job.totalEpochs = total;
      job.progress = pct;
      broadcast(job, "progress", { epoch: currentEpoch, totalEpochs: total, progress: pct });
    }
  };

  let stdoutBuf = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString("utf-8");
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() ?? "";
    lines.forEach(handleLine);
  });

  let stderrBuf = "";
  proc.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString("utf-8");
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() ?? "";
    lines.forEach(handleLine);
  });

  proc.on("close", (code) => {
    if (stdoutBuf.trim()) handleLine(stdoutBuf);
    if (stderrBuf.trim()) handleLine(stderrBuf);
    const success = code === 0;
    job.phase = success ? "done" : "error";
    if (success) job.progress = 100;
    broadcast(job, "done", { success, exitCode: code });
  });

  proc.on("error", (err) => {
    job.phase = "error";
    const pythonExe = resolvePython();
    const msg = (err as NodeJS.ErrnoException).code === "ENOENT"
      ? `[ERROR] Python が見つかりません (${pythonExe})。.env.local で PYTHON_PATH に ultralytics がインストールされた Python 実行ファイルのパスを指定してください。\n例: PYTHON_PATH=C:\\Users\\...\\Python38\\python.exe`
      : `[ERROR] ${err.message}`;
    job.logs.push(msg);
    broadcast(job, "log", { text: msg });
    broadcast(job, "done", { success: false, exitCode: -1 });
  });

  return NextResponse.json({ jobId, model, epochs });
}

/* ─── GET: SSE ストリーム ─── */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  void ctx.params; // 未使用だが型を満たすために保持
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return new Response("Missing jobId", { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return new Response("Job not found", { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch { /* コントローラー閉じ済み */ }
      };

      // 既存ログを一括送信
      for (const log of job.logs) {
        send("log", { text: log });
      }

      // 既に終了していればすぐに done を送って閉じる
      if (job.phase !== "running") {
        send("progress", { epoch: job.epoch, totalEpochs: job.totalEpochs, progress: job.progress });
        send("done", { success: job.phase === "done" });
        controller.close();
        return;
      }

      // 現在の進捗を送信
      if (job.epoch > 0) {
        send("progress", { epoch: job.epoch, totalEpochs: job.totalEpochs, progress: job.progress });
      }

      // 以降のイベントをリアルタイムで送信
      const listener = (event: string, data: object) => {
        send(event, data);
        if (event === "done") {
          job.listeners.delete(listener);
          try { controller.close(); } catch { /* ignore */ }
        }
      };
      job.listeners.add(listener);

      // クライアント切断時のクリーンアップ
      request.signal?.addEventListener("abort", () => {
        job.listeners.delete(listener);
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/* ─── DELETE: 学習中断 ─── */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  void ctx.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return new Response("Missing jobId", { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return new Response("Job not found", { status: 404 });

  job.process?.kill("SIGTERM");
  job.phase = "error";
  broadcast(job, "log", { text: "[INFO] ユーザーにより学習を中断しました。" });
  broadcast(job, "done", { success: false, exitCode: -1 });

  return NextResponse.json({ ok: true });
}
