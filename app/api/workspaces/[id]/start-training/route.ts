import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/* --- Job store (reset on process restart) --- */
interface TrainingJob {
  fastapiJobId: string;
  logs: string[];
  phase: "running" | "done" | "error";
  progress: number;
  epoch: number;
  totalEpochs: number;
  listeners: Set<(event: string, data: object) => void>;
  pollTimer: ReturnType<typeof setInterval> | null;
  lastLogCount: number;
}

const jobs = new Map<string, TrainingJob>();

function broadcast(job: TrainingJob, event: string, data: object) {
  for (const fn of job.listeners) {
    try { fn(event, data); } catch { /* disconnected listener */ }
  }
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
      const res = await fetch(`${BACKEND_URL}/train/status/${job.fastapiJobId}`);
      if (!res.ok) return;
      const status = await res.json() as {
        status: string;
        logs?: string[];
        progress?: number;
        epoch?: number;
        total_epochs?: number;
        error?: string;
      };

      // Forward new log lines
      const logs = status.logs ?? [];
      for (let i = job.lastLogCount; i < logs.length; i++) {
        const text = logs[i];
        job.logs.push(text);
        broadcast(job, "log", { text });
      }
      job.lastLogCount = logs.length;

      // Update epoch progress
      if (
        status.epoch !== undefined &&
        status.total_epochs !== undefined &&
        status.epoch !== job.epoch
      ) {
        job.epoch = status.epoch;
        job.totalEpochs = status.total_epochs;
        job.progress = status.progress ?? job.progress;
        broadcast(job, "progress", {
          epoch: status.epoch,
          totalEpochs: status.total_epochs,
          progress: job.progress,
        });
      }

      if (status.status === "done") {
        stopPolling(job);
        job.phase = "done";
        job.progress = 100;
        const msg = "[INFO] Training completed successfully.";
        job.logs.push(msg);
        broadcast(job, "log", { text: msg });
        broadcast(job, "progress", { epoch: job.totalEpochs, totalEpochs: job.totalEpochs, progress: 100 });
        broadcast(job, "done", { success: true });
      } else if (status.status === "failed") {
        stopPolling(job);
        job.phase = "error";
        const msg = `[ERROR] Training failed: ${status.error ?? "unknown error"}`;
        job.logs.push(msg);
        broadcast(job, "log", { text: msg });
        broadcast(job, "done", { success: false });
      }
    } catch {
      // ignore polling error, keep trying
    }
  }, 2000);
}

/* --- POST: Start training --- */
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

  const model = (body.model || "yolov8n").replace(/[^a-zA-Z0-9._-]/g, "");
  const VALID_DEVICES = new Set(["auto", "cpu", "cuda"]);
  const device = VALID_DEVICES.has((body.device ?? "").toLowerCase()) ? (body.device as string).toLowerCase() : "auto";
  const p = body.params ?? {};
  const epochs = Math.max(1, Math.min(3000, parseInt(p.epochs || "100", 10)));
  const batch = Math.max(1, Math.min(512, parseInt(p.batch || "16", 10)));
  const imgsz = Math.max(32, Math.min(4096, parseInt(p.imgSize || "640", 10)));
  const patience = Math.max(0, Math.min(500, parseInt(p.patience || "50", 10)));
  const optimizer = ["auto", "SGD", "Adam", "AdamW", "NAdam", "RAdam", "RMSProp"].includes(p.optimizer || "")
    ? (p.optimizer || "auto")
    : "auto";
  const lr0 = Math.max(0.000001, Math.min(1, parseFloat(p.lr0 || "0.01")));
  const lrf = Math.max(0.000001, Math.min(1, parseFloat(p.lrf || "0.01")));

  const datasetYaml = path.join(process.cwd(), "tmp", "workspaces", id, "dataset", "dataset.yaml");
  if (!fs.existsSync(datasetYaml)) {
    return NextResponse.json(
      { error: "\u5b66\u7fd2\u30c7\u30fc\u30bf\u304c\u6e96\u5099\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002\u5148\u306b\u300c\u5b66\u7fd2\u30c7\u30fc\u30bf\u3092\u6e96\u5099\u300d\u3092\u5b9f\u884c\u3057\u3066\u304f\u3060\u3055\u3044\u3002" },
      { status: 400 }
    );
  }

  // Send training job to FastAPI backend
  let fastapiJobId: string;
  try {
    const res = await fetch(`${BACKEND_URL}/train/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data_yaml: datasetYaml.replace(/\\/g, "/"),
        model: model.endsWith(".pt") ? model : `${model}.pt`,
        epochs,
        imgsz,
        batch,
        patience,
        optimizer,
        lr0,
        lrf,
        device,
        name: "train",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return NextResponse.json(
        { error: (err as { detail?: string }).detail ?? "Backend error" },
        { status: res.status }
      );
    }
    const data = await res.json() as { job_id: string };
    fastapiJobId = data.job_id;
  } catch {
    return NextResponse.json(
      { error: `\u30d0\u30c3\u30af\u30a8\u30f3\u30c9\u306b\u63a5\u7d9a\u3067\u304d\u307e\u305b\u3093 (${BACKEND_URL})\u3002\u30d0\u30c3\u30af\u30a8\u30f3\u30c9\u304c\u8d77\u52d5\u3057\u3066\u3044\u308b\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002` },
      { status: 503 }
    );
  }

  const jobId = crypto.randomUUID();
  const job: TrainingJob = {
    fastapiJobId,
    logs: [`[INFO] Training job started (FastAPI job_id: ${fastapiJobId})`],
    phase: "running",
    progress: 0,
    epoch: 0,
    totalEpochs: epochs,
    listeners: new Set(),
    pollTimer: null,
    lastLogCount: 0,
  };
  jobs.set(jobId, job);
  startPolling(job);

  return NextResponse.json({ jobId, fastapiJobId, model, epochs });
}

/* --- GET: SSE stream --- */
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
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            encoder.encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n")
          );
        } catch { /* controller closed */ }
      };

      // Send existing logs at once
      for (const log of job.logs) {
        send("log", { text: log });
      }

      // If already finished, send done immediately and close
      if (job.phase !== "running") {
        send("progress", { epoch: job.epoch, totalEpochs: job.totalEpochs, progress: job.progress });
        send("done", { success: job.phase === "done" });
        controller.close();
        return;
      }

      // Send current progress
      if (job.epoch > 0) {
        send("progress", { epoch: job.epoch, totalEpochs: job.totalEpochs, progress: job.progress });
      }

      // Stream subsequent events in real-time
      const listener = (event: string, data: object) => {
        send(event, data);
        if (event === "done") {
          job.listeners.delete(listener);
          try { controller.close(); } catch { /* ignore */ }
        }
      };
      job.listeners.add(listener);

      // Cleanup on client disconnect
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

/* --- DELETE: Stop training --- */
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
  job.phase = "error";
  broadcast(job, "log", { text: "[INFO] Training stopped by user." });
  broadcast(job, "done", { success: false, exitCode: -1 });

  return NextResponse.json({ ok: true });
}