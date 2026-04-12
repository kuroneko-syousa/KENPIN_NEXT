import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const YOLO_ENV_PATH =
  process.env.YOLO_ENV_PATH ?? path.join(process.cwd(), "backend", ".venv");

type JobPhase = "queued" | "running" | "done" | "error" | "stopped";
type BackendJobStatus = "queued" | "running" | "completed" | "failed" | "stopped";

interface BackendJobDetail {
  status: BackendJobStatus;
  progress?: number;
  queue_position?: number | null;
  error?: string | null;
  log_lines?: string[];
  log_total_lines?: number;
}

interface JsonLogPayload {
  epoch?: number;
  total_epoch?: number;
}

interface TrainingJob {
  fastapiJobId: string;
  logs: Array<{ seq: number; text: string }>;
  nextLogSeq: number;
  phase: JobPhase;
  progress: number;
  epoch: number;
  totalEpochs: number;
  queuePosition: number | null;
  listeners: Set<(event: string, data: object) => void>;
  pollTimer: ReturnType<typeof setInterval> | null;
  lastLogTotal: number;
}

const jobs = new Map<string, TrainingJob>();

function parseJsonLog(line: string): JsonLogPayload | null {
  if (!line.startsWith("JSON_LOG:")) return null;
  try {
    return JSON.parse(line.slice("JSON_LOG:".length)) as JsonLogPayload;
  } catch {
    return null;
  }
}

function parseEpochLine(line: string): { epoch: number; total: number } | null {
  const m = line.match(/(?:^|\s)Epoch\s+(\d+)\s*\/\s*(\d+)(?:\s|$)/i);
  if (!m) return null;
  const epoch = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(epoch) || !Number.isFinite(total) || total <= 0) return null;
  return { epoch, total };
}

function broadcast(job: TrainingJob, event: string, data: object) {
  for (const fn of job.listeners) {
    try {
      fn(event, data);
    } catch {
      // disconnected listener
    }
  }
}

function pushJobLog(job: TrainingJob, text: string) {
  const entry = { seq: job.nextLogSeq++, text };
  job.logs.push(entry);
  broadcast(job, "log", entry);
}

function stopPolling(job: TrainingJob) {
  if (job.pollTimer !== null) {
    clearInterval(job.pollTimer);
    job.pollTimer = null;
  }
}

function startPolling(job: TrainingJob) {
  job.pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/jobs/${job.fastapiJobId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const status = (await res.json()) as BackendJobDetail;

      const logs = status.log_lines ?? [];
      const totalLines =
        typeof status.log_total_lines === "number" ? status.log_total_lines : logs.length;

      let newlyArrived: string[] = [];
      if (totalLines < job.lastLogTotal) {
        newlyArrived = logs;
      } else if (totalLines > job.lastLogTotal) {
        const delta = totalLines - job.lastLogTotal;
        newlyArrived = delta >= logs.length ? logs : logs.slice(-delta);
      }

      for (const text of newlyArrived) {
        pushJobLog(job, text);

        const jsonLog = parseJsonLog(text);
        if (jsonLog?.epoch && jsonLog?.total_epoch) {
          job.epoch = jsonLog.epoch;
          job.totalEpochs = jsonLog.total_epoch;
          job.progress = Math.round((jsonLog.epoch / jsonLog.total_epoch) * 100);
          broadcast(job, "progress", {
            epoch: job.epoch,
            totalEpochs: job.totalEpochs,
            progress: job.progress,
          });
          continue;
        }

        const epochLine = parseEpochLine(text);
        if (epochLine) {
          job.epoch = epochLine.epoch;
          job.totalEpochs = epochLine.total;
          job.progress = Math.round((job.epoch / job.totalEpochs) * 100);
          broadcast(job, "progress", {
            epoch: job.epoch,
            totalEpochs: job.totalEpochs,
            progress: job.progress,
          });
        }
      }
      job.lastLogTotal = totalLines;

      if (
        typeof status.progress === "number" &&
        Number.isFinite(status.progress) &&
        status.progress !== job.progress
      ) {
        job.progress = status.progress;
        broadcast(job, "progress", {
          epoch: job.epoch,
          totalEpochs: job.totalEpochs,
          progress: job.progress,
        });
      }

      if (status.status === "queued") {
        job.phase = "queued";
        job.queuePosition =
          typeof status.queue_position === "number" && Number.isFinite(status.queue_position)
            ? status.queue_position
            : null;
        broadcast(job, "queued", { queuePosition: job.queuePosition });
      } else if (status.status === "running" && job.phase !== "running") {
        job.phase = "running";
        job.queuePosition = null;
        pushJobLog(job, "[INFO] Queue released. Training started.");
      }

      if (status.status === "completed") {
        stopPolling(job);
        job.phase = "done";
        job.progress = 100;
        const msg = "[INFO] Training completed successfully.";
        pushJobLog(job, msg);
        broadcast(job, "progress", {
          epoch: job.totalEpochs,
          totalEpochs: job.totalEpochs,
          progress: 100,
        });
        broadcast(job, "done", { success: true, stopped: false });
      } else if (status.status === "stopped") {
        stopPolling(job);
        job.phase = "stopped";
        const msg = "[INFO] Training stopped by user.";
        pushJobLog(job, msg);
        broadcast(job, "done", { success: false, stopped: true });
      } else if (status.status === "failed") {
        stopPolling(job);
        job.phase = "error";
        const msg = `[ERROR] Training failed: ${status.error ?? "unknown error"}`;
        pushJobLog(job, msg);
        broadcast(job, "done", { success: false, stopped: false });
      }
    } catch {
      // ignore polling error, keep trying
    }
  }, 1000);
}

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
    device?: string;
    display_name?: string;
    params?: {
      epochs?: string;
      batch?: string;
      imgSize?: string;
      patience?: string;
      optimizer?: string;
      lr0?: string;
      lrf?: string;
    };
  };

  const model = (body.model || "yolov8n")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/\.pt$/i, "");
  const rawDisplayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const displayName = rawDisplayName.slice(0, 200) || null;
  const VALID_DEVICES = new Set(["auto", "cpu", "cuda"]);
  const device = VALID_DEVICES.has((body.device ?? "").toLowerCase())
    ? (body.device as string).toLowerCase()
    : "auto";
  const p = body.params ?? {};
  const epochs = Math.max(1, Math.min(3000, parseInt(p.epochs || "100", 10)));
  const batch = Math.max(1, Math.min(512, parseInt(p.batch || "16", 10)));
  const imgsz = Math.max(32, Math.min(4096, parseInt(p.imgSize || "640", 10)));
  const patience = Math.max(0, Math.min(500, parseInt(p.patience || "50", 10)));
  const optimizer = ["auto", "SGD", "Adam", "AdamW", "NAdam", "RAdam", "RMSProp"].includes(
    p.optimizer || ""
  )
    ? (p.optimizer || "auto")
    : "auto";
  const lr0 = Math.max(0.000001, Math.min(1, parseFloat(p.lr0 || "0.01")));
  const lrf = Math.max(0.000001, Math.min(1, parseFloat(p.lrf || "0.01")));

  const datasetDir = path.join(process.cwd(), "tmp", "workspaces", id, "dataset");
  const datasetYaml = path.join(datasetDir, "dataset.yaml");
  if (!fs.existsSync(datasetYaml) || !fs.existsSync(datasetDir)) {
    return NextResponse.json(
      {
        error:
          "学習データが準備されていません。先に「学習データを準備」を実行してください。",
      },
      { status: 400 }
    );
  }

  let fastapiJobId: string;
  try {
    // Generate workspace path structure: backend/workspaces/{user_id}/{workspace_id}/
    const userId = workspace.ownerId; // Workspace owner is the user
    const workspacePath = path.join(process.cwd(), "backend", "workspaces", userId, id);

    const res = await fetch(`${BACKEND_URL}/jobs/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: id,
        requested_by: session.user.email,
        user_id: userId,
        workspace_path: workspacePath,
        dataset_id: id,
        model,
        yolo_version: "8.0.0",
        env_path: path.resolve(YOLO_ENV_PATH),
        dataset_source_path: path.resolve(datasetDir),
        epochs,
        imgsz,
        batch,
        patience,
        optimizer,
        lr0,
        lrf,
        device,
        name: "train",
        display_name: displayName,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ detail: res.statusText }))) as {
        detail?: string;
      };
      const errorMsg = res.status === 409 
        ? `このワークスペースで既に学習が実行中です。${err.detail || ""}`
        : err.detail ?? "Backend error";
      return NextResponse.json(
        { error: errorMsg },
        { status: res.status }
      );
    }
    const data = (await res.json()) as {
      job_id: string;
      status?: BackendJobStatus;
      queue_position?: number | null;
    };
    fastapiJobId = data.job_id;

    const initialStatus = data.status ?? "queued";
    const initialQueuePosition =
      typeof data.queue_position === "number" && Number.isFinite(data.queue_position)
        ? data.queue_position
        : null;

    const jobId = crypto.randomUUID();
    const job: TrainingJob = {
      fastapiJobId,
      logs: [
        {
          seq: 1,
          text:
            initialStatus === "queued"
              ? `[INFO] Training reserved (FastAPI job_id: ${fastapiJobId})`
              : `[INFO] Training started (FastAPI job_id: ${fastapiJobId})`,
        },
        { seq: 2, text: `[INFO] env_path: ${path.resolve(YOLO_ENV_PATH)}` },
      ],
      nextLogSeq: 3,
      phase: initialStatus === "queued" ? "queued" : "running",
      progress: 0,
      epoch: 0,
      totalEpochs: epochs,
      queuePosition: initialStatus === "queued" ? initialQueuePosition : null,
      listeners: new Set(),
      pollTimer: null,
      lastLogTotal: 0,
    };
    jobs.set(jobId, job);
    startPolling(job);

    return NextResponse.json({
      jobId,
      fastapiJobId,
      model,
      epochs,
      backendStatus: initialStatus,
      queuePosition: initialQueuePosition,
    });
  } catch {
    return NextResponse.json(
      {
        error: `バックエンドに接続できません (${BACKEND_URL})。バックエンドが起動しているか確認してください。`,
      },
      { status: 503 }
    );
  }
}

export async function GET(
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: object, id?: number) => {
        try {
          const idLine = typeof id === "number" ? `id: ${id}\n` : "";
          controller.enqueue(
            encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // controller closed
        }
      };

      const lastEventIdRaw = request.headers.get("last-event-id");
      const lastEventId = lastEventIdRaw ? Number(lastEventIdRaw) : 0;
      const replayAfter = Number.isFinite(lastEventId) ? lastEventId : 0;
      let lastSentLogSeq = replayAfter;

      // Snapshot replay logs to avoid race with live append while iterating.
      const replayLogs = job.logs.filter((log) => log.seq > replayAfter);

      for (const log of replayLogs) {
        send("log", { text: log.text, seq: log.seq }, log.seq);
        lastSentLogSeq = Math.max(lastSentLogSeq, log.seq);
      }

      if (job.phase === "done" || job.phase === "error" || job.phase === "stopped") {
        send("progress", {
          epoch: job.epoch,
          totalEpochs: job.totalEpochs,
          progress: job.progress,
        });
        send("done", { success: job.phase === "done", stopped: job.phase === "stopped" });
        controller.close();
        return;
      }

      if (job.phase === "queued") {
        send("queued", { queuePosition: job.queuePosition });
      }

      if (job.epoch > 0) {
        send("progress", {
          epoch: job.epoch,
          totalEpochs: job.totalEpochs,
          progress: job.progress,
        });
      }

      const listener = (event: string, data: object) => {
        if (event === "log") {
          const seq = (data as { seq?: number }).seq;
          if (typeof seq === "number") {
            if (seq <= lastSentLogSeq) return;
            lastSentLogSeq = seq;
            send(event, data, seq);
            return;
          }
        }
        send(event, data);
        if (event === "done") {
          job.listeners.delete(listener);
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      };
      job.listeners.add(listener);

      request.signal?.addEventListener("abort", () => {
        job.listeners.delete(listener);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

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

  stopPolling(job);

  try {
    await fetch(`${BACKEND_URL}/jobs/${job.fastapiJobId}/stop`, {
      method: "POST",
    });
  } catch {
    // best effort
  }

  job.phase = "stopped";
  pushJobLog(job, "[INFO] Training stopped by user.");
  broadcast(job, "done", { success: false, stopped: true, exitCode: -1 });

  return NextResponse.json({ ok: true });
}
