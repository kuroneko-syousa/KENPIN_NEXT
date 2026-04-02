"use client";

import {
  imageDatabases,
  teamUsers,
  type WorkspacePipeline,
  type WorkflowStepStatus,
} from "@/lib/dashboard-data";
import { useMemo, useState } from "react";

type WorkspaceFormState = {
  name: string;
  target: string;
  selectedModel: string;
  imageFolder: string;
  datasetFolder: string;
  databaseId: string;
  databaseType: string;
};

type WorkspacesWorkspaceProps = {
  currentUserEmail: string;
  currentUserName: string;
  initialWorkspaces: WorkspacePipeline[];
};

type PageStep = "model" | "folder";

type TargetOption = {
  id: string;
  label: string;
  description: string;
};

type DatabaseTypeOption = {
  id: string;
  label: string;
  helper: string;
};

type RegisteredMountTarget = {
  id: string;
  databaseId: string;
  name: string;
  type: string;
  mountPath: string;
};

const APP_TEMP_OUTPUT_ROOT = "C:\\Users\\kuroneko\\Desktop\\KENPIN_NEXT\\storage\\workspace-temp";
const MODEL_OPTIONAL_VALUE = "__unset_model__";

const targetOptions: TargetOption[] = [
  {
    id: "object-detection",
    label: "物体検出",
    description: "部品や製品、欠品対象などの位置と種類を検出します。",
  },
  {
    id: "anomaly-detection",
    label: "異常検知",
    description: "傷、欠け、汚れ、変色などの異常を検出します。",
  },
  {
    id: "segmentation",
    label: "セグメンテーション",
    description: "領域単位で対象を切り分けて形状や面積を扱います。",
  },
  {
    id: "ocr-inspection",
    label: "OCR・文字検査",
    description: "ラベル、印字、賞味期限、シリアルなどの文字検査を行います。",
  },
  {
    id: "pose-keypoint",
    label: "姿勢推定・キーポイント",
    description: "位置関係や向き、組付け姿勢をキーポイントで確認します。",
  },
];

const modelSuggestions: Record<string, string[]> = {
  "object-detection": [
    "YOLOv8m-det (仮設定)",
    "YOLO11m-det (仮設定)",
    "RT-DETR-R50 (仮設定)",
  ],
  "anomaly-detection": [
    "PatchCore + ResNet50 (仮設定)",
    "FastFlow (仮設定)",
    "PaDiM (仮設定)",
  ],
  segmentation: [
    "YOLOv8m-seg (仮設定)",
    "YOLO11m-seg (仮設定)",
    "Mask R-CNN R50 (仮設定)",
  ],
  "ocr-inspection": [
    "PaddleOCR + DBNet (仮設定)",
    "CRNN + Detector (仮設定)",
    "YOLO11n-det + OCR (仮設定)",
  ],
  "pose-keypoint": [
    "YOLO11m-pose (仮設定)",
    "YOLOv8m-pose (仮設定)",
    "HRNet-W32 (仮設定)",
  ],
};

const databaseTypeOptions: DatabaseTypeOption[] = [
  {
    id: "local-mounted",
    label: "ローカルタイプ",
    helper: "ローカルで登録済みの画像DB接続先を選択します。",
  },
  {
    id: "nas-mounted",
    label: "NAS",
    helper: "NAS で登録済みの画像DB接続先を選択します。",
  },
  {
    id: "cloud-mounted",
    label: "クラウド",
    helper: "クラウドで登録済みの画像DB接続先を選択します。",
  },
];

const registeredMountTargets: RegisteredMountTarget[] = [
  {
    id: "mount-asset-hub-main",
    databaseId: "asset-hub-main",
    name: "Asset Hub Main",
    type: "cloud-mounted",
    mountPath: "Z:\\mounted\\asset-hub-main",
  },
  {
    id: "mount-anime-reference-vault",
    databaseId: "anime-reference-vault",
    name: "Anime Reference Vault",
    type: "nas-mounted",
    mountPath: "\\\\NAS-SERVER\\vision\\anime-reference-vault",
  },
  {
    id: "mount-archive-cold-storage",
    databaseId: "archive-cold-storage",
    name: "Archive Cold Storage",
    type: "local-mounted",
    mountPath: "D:\\mounted\\archive-cold-storage",
  },
];

const pageSteps: Array<{ id: PageStep; title: string; summary: string }> = [
  {
    id: "model",
    title: "基本設定",
    summary: "ワークスペース名、手法、モデル候補を設定します。",
  },
  {
    id: "folder",
    title: "接続設定",
    summary: "DBタイプと登録済みマウント対象を選択します。",
  },
];

function slugifyWorkspaceName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "new-workspace";
}

function getOutputFolderPath(name: string) {
  return `${APP_TEMP_OUTPUT_ROOT}\\${slugifyWorkspaceName(name)}`;
}

function getModelsForTarget(targetId: string) {
  return modelSuggestions[targetId] ?? modelSuggestions["object-detection"];
}

function getTargetsByType(type: string) {
  return registeredMountTargets.filter((target) => target.type === type);
}

function getDefaultDatabaseType() {
  return databaseTypeOptions[0].id;
}

function getDefaultMountTarget(type: string) {
  return getTargetsByType(type)[0] ?? null;
}

function createInitialForm(): WorkspaceFormState {
  const defaultType = getDefaultDatabaseType();
  const defaultTarget = getDefaultMountTarget(defaultType);

  return {
    name: "",
    target: targetOptions[0].id,
    selectedModel: "",
    imageFolder: defaultTarget?.mountPath ?? "",
    datasetFolder: getOutputFolderPath("new-workspace"),
    databaseId: defaultTarget?.databaseId ?? "",
    databaseType: defaultType,
  };
}

function normalizeTarget(rawTarget: string) {
  if (targetOptions.some((option) => option.id === rawTarget)) return rawTarget;
  return "object-detection";
}

function getDatabaseTypeFromDatabaseId(databaseId: string) {
  return registeredMountTargets.find((target) => target.databaseId === databaseId)?.type ?? getDefaultDatabaseType();
}

function toEditableForm(workspace: WorkspacePipeline | null): WorkspaceFormState {
  if (!workspace) return createInitialForm();

  const databaseType = getDatabaseTypeFromDatabaseId(workspace.databaseId);
  const mountTarget = registeredMountTargets.find((target) => target.databaseId === workspace.databaseId);

  return {
    name: workspace.name,
    target: normalizeTarget(workspace.target),
    selectedModel: workspace.selectedModel,
    imageFolder: mountTarget?.mountPath ?? workspace.imageFolder,
    datasetFolder: getOutputFolderPath(workspace.name),
    databaseId: workspace.databaseId,
    databaseType,
  };
}

function statusClass(status: WorkflowStepStatus) {
  if (status === "completed") return "status ready";
  if (status === "running") return "status training";
  return "status draft";
}

function statusLabel(status: WorkflowStepStatus) {
  if (status === "completed") return "完了";
  if (status === "running") return "入力中";
  return "未着手";
}

function getStepStatus(stepId: PageStep, form: WorkspaceFormState): WorkflowStepStatus {
  const basicReady = form.name.trim() !== "" && form.target !== "";
  const connectionReady = form.databaseType !== "" && form.databaseId !== "";

  if (stepId === "model") return basicReady ? "completed" : "running";
  if (!basicReady) return "pending";
  return connectionReady ? "completed" : "running";
}

function createWorkspaceFromForm(
  form: WorkspaceFormState,
  ownerId: string,
  ownerName: string,
  ownerEmail: string,
): WorkspacePipeline {
  return {
    id: `workspace-${Date.now()}`,
    name: form.name || "新しいワークスペース",
    ownerId,
    ownerName,
    ownerEmail,
    target: form.target,
    selectedModel: form.selectedModel,
    imageFolder: form.imageFolder,
    datasetFolder: getOutputFolderPath(form.name || "new-workspace"),
    databaseId: form.databaseId,
    databaseType: form.databaseType,
    steps: [],
  };
}

export function WorkspacesWorkspace({
  currentUserEmail,
  currentUserName,
  initialWorkspaces,
}: WorkspacesWorkspaceProps) {
  const [workspaces, setWorkspaces] = useState<WorkspacePipeline[]>(initialWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaces[0]?.id ?? "");
  const [activeStepId, setActiveStepId] = useState<PageStep>("model");
  const [isCreating, setIsCreating] = useState(false);
  const [draftForm, setDraftForm] = useState<WorkspaceFormState>(createInitialForm());
  const [createFieldIndex, setCreateFieldIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const currentUser = useMemo(() => {
    return (
      teamUsers.find((user) => user.email === currentUserEmail) ?? {
        id: `session-${currentUserEmail}`,
        name: currentUserName,
        email: currentUserEmail,
        role: "User",
        team: "Personal",
      }
    );
  }, [currentUserEmail, currentUserName]);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null;

  const effectiveForm = isCreating ? draftForm : toEditableForm(selectedWorkspace);
  const suggestedModels = getModelsForTarget(effectiveForm.target);
  const selectedTarget = targetOptions.find((option) => option.id === effectiveForm.target) ?? targetOptions[0];
  const mountTargets = getTargetsByType(effectiveForm.databaseType);
  const selectedMountTarget =
    mountTargets.find((target) => target.databaseId === effectiveForm.databaseId) ?? mountTargets[0] ?? null;
  const selectedMountType =
    databaseTypeOptions.find((option) => option.id === effectiveForm.databaseType) ?? databaseTypeOptions[0];
  const selectedDatabase =
    imageDatabases.find((database) => database.id === effectiveForm.databaseId) ?? null;

  const stepCards = pageSteps.map((step) => ({
    ...step,
    status: getStepStatus(step.id, effectiveForm),
  }));

  const activeStep = stepCards.find((step) => step.id === activeStepId) ?? stepCards[0];

  const wizardFields: Record<PageStep, Array<{ key: keyof WorkspaceFormState; label: string }>> = {
    model: [
      { key: "name", label: "ワークスペース名" },
      { key: "target", label: "ターゲット選択" },
      { key: "selectedModel", label: "モデル選択" },
    ],
    folder: [
      { key: "databaseType", label: "画像DB接続タイプ" },
      { key: "databaseId", label: "マウント対象" },
    ],
  };

  const activeFields = wizardFields[activeStep.id];
  const activeField = activeFields[Math.min(createFieldIndex, activeFields.length - 1)];

  const updateDraft = (field: keyof WorkspaceFormState, value: string) => {
    setDraftForm((current) => {
      if (field === "name") {
        return {
          ...current,
          name: value,
          datasetFolder: getOutputFolderPath(value || "new-workspace"),
        };
      }

      if (field === "target") {
        return {
          ...current,
          target: value,
          selectedModel: "",
        };
      }

      if (field === "databaseType") {
        const nextTarget = getDefaultMountTarget(value);
        return {
          ...current,
          databaseType: value,
          databaseId: nextTarget?.databaseId ?? "",
          imageFolder: nextTarget?.mountPath ?? "",
        };
      }

      if (field === "databaseId") {
        const nextTarget = registeredMountTargets.find((target) => target.databaseId === value);
        return {
          ...current,
          databaseId: value,
          imageFolder: nextTarget?.mountPath ?? "",
        };
      }

      return { ...current, [field]: value };
    });
  };

  const updateWorkspace = (field: keyof WorkspaceFormState, value: string) => {
    if (!selectedWorkspace) return;

    setWorkspaces((current) =>
      current.map((workspace) => {
        if (workspace.id !== selectedWorkspace.id || workspace.ownerEmail !== currentUserEmail) {
          return workspace;
        }

        if (field === "name") {
          return {
            ...workspace,
            name: value,
            datasetFolder: getOutputFolderPath(value || "new-workspace"),
          };
        }

        if (field === "target") {
          return {
            ...workspace,
            target: value,
            selectedModel: "",
          };
        }

        if (field === "databaseType") {
          const nextTarget = getDefaultMountTarget(value);
          return {
            ...workspace,
            databaseId: nextTarget?.databaseId ?? workspace.databaseId,
            imageFolder: nextTarget?.mountPath ?? workspace.imageFolder,
          };
        }

        if (field === "databaseId") {
          const nextTarget = registeredMountTargets.find((target) => target.databaseId === value);
          return {
            ...workspace,
            databaseId: value,
            imageFolder: nextTarget?.mountPath ?? workspace.imageFolder,
          };
        }

        return { ...workspace, [field]: value };
      }),
    );
  };

  const handleFieldChange = (rawValue: string) => {
    const value = rawValue === MODEL_OPTIONAL_VALUE ? "" : rawValue;
    if (isCreating) {
      updateDraft(activeField.key, value);
    } else {
      updateWorkspace(activeField.key, value);
    }
  };

  const beginCreateWorkspace = () => {
    setIsCreating(true);
    setDraftForm(createInitialForm());
    setActiveStepId("model");
    setCreateFieldIndex(0);
  };

  const selectWorkspace = (workspaceId: string) => {
    setIsCreating(false);
    setSelectedWorkspaceId(workspaceId);
    setActiveStepId("model");
    setCreateFieldIndex(0);
  };

  const canMoveToFolder = effectiveForm.name.trim() !== "" && effectiveForm.target !== "";
  const canCreateWorkspace = canMoveToFolder && effectiveForm.databaseType !== "" && effectiveForm.databaseId !== "";

  const goNextField = () => {
    if (createFieldIndex < activeFields.length - 1) {
      setCreateFieldIndex((current) => current + 1);
      return;
    }

    if (activeStepId === "model" && canMoveToFolder) {
      setActiveStepId("folder");
      setCreateFieldIndex(0);
    }
  };

  const goPreviousField = () => {
    if (createFieldIndex > 0) {
      setCreateFieldIndex((current) => current - 1);
      return;
    }

    if (activeStepId === "folder") {
      setActiveStepId("model");
      setCreateFieldIndex(wizardFields.model.length - 1);
    }
  };

  const commitDraftWorkspace = async () => {
    if (!canCreateWorkspace) return;

    setIsSaving(true);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: draftForm.name,
          target: draftForm.target,
          selectedModel: draftForm.selectedModel,
          imageFolder: draftForm.imageFolder,
          datasetFolder: getOutputFolderPath(draftForm.name || "new-workspace"),
          databaseId: draftForm.databaseId,
          databaseType: draftForm.databaseType,
        }),
      });

      if (!response.ok) {
        throw new Error("Workspace save failed");
      }

      const nextWorkspace = (await response.json()) as WorkspacePipeline;

      setWorkspaces((current) => [nextWorkspace, ...current]);
      setSelectedWorkspaceId(nextWorkspace.id);
      setIsCreating(false);
      setActiveStepId("model");
      setCreateFieldIndex(0);
      setDraftForm(createInitialForm());
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = () => {
    if (activeField.key === "name") {
      return (
        <input
          value={effectiveForm.name}
          onChange={(event) => handleFieldChange(event.target.value)}
          placeholder="例: Retail YOLO Project"
        />
      );
    }

    if (activeField.key === "target") {
      return (
        <select value={effectiveForm.target} onChange={(event) => handleFieldChange(event.target.value)}>
          {targetOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (activeField.key === "selectedModel") {
      return (
        <select
          value={effectiveForm.selectedModel || MODEL_OPTIONAL_VALUE}
          onChange={(event) => handleFieldChange(event.target.value)}
        >
          <option value={MODEL_OPTIONAL_VALUE}>未選択（候補はプルダウン内のみ表示）</option>
          {suggestedModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      );
    }

    if (activeField.key === "databaseType") {
      return (
        <select
          value={effectiveForm.databaseType}
          onChange={(event) => handleFieldChange(event.target.value)}
        >
          {databaseTypeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (activeField.key === "databaseId") {
      return (
        <select
          value={effectiveForm.databaseId}
          onChange={(event) => handleFieldChange(event.target.value)}
        >
          {mountTargets.length === 0 ? (
            <option value="">登録済みの接続先がありません</option>
          ) : (
            mountTargets.map((target) => (
              <option key={target.id} value={target.databaseId}>
                {target.name}
              </option>
            ))
          )}
        </select>
      );
    }

    return null;
  };

  return (
    <div className="workspace-content">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Workspace Manager</p>
          <h2>ワークスペース一覧と作成フロー</h2>
          <p className="muted">
            この画面では、ワークスペース一覧管理と、作成に必要な 2 工程だけを順に設定できます。
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-chip">
            <span>ログインユーザー</span>
            <strong>{currentUser.name}</strong>
          </div>
          <div className="stat-chip">
            <span>ワークスペース数</span>
            <strong>{workspaces.length}</strong>
          </div>
          <div className="stat-chip">
            <span>現在の状態</span>
            <strong>{isCreating ? "作成中" : "一覧表示"}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Workspace List</p>
            <h3>ワークスペース一覧</h3>
          </div>
          <button type="button" onClick={beginCreateWorkspace}>
            新規作成
          </button>
        </div>

        {workspaces.length > 0 ? (
          <div className="selection-list">
            {workspaces.map((workspace) => {
              const targetLabel =
                targetOptions.find((option) => option.id === normalizeTarget(workspace.target))?.label ??
                workspace.target;

              return (
                <button
                  key={workspace.id}
                  type="button"
                  className={
                    !isCreating && selectedWorkspace?.id === workspace.id
                      ? "selection-card workspace-selection-card active"
                      : "selection-card workspace-selection-card"
                  }
                  onClick={() => selectWorkspace(workspace.id)}
                >
                  <strong>{workspace.name}</strong>
                  <span>手法: {targetLabel} / モデル: {workspace.selectedModel || "未選択"}</span>
                  <span>
                    接続先: {imageDatabases.find((database) => database.id === workspace.databaseId)?.name ?? "未設定"}
                  </span>
                  <span>
                    マウント先: {workspace.imageFolder || "未設定"} / 仮保存先: {workspace.datasetFolder || "未設定"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>ワークスペースがまだありません</strong>
            <span>「新規作成」を押すと下部に作成フローが表示されます。</span>
          </div>
        )}
      </section>

      {isCreating ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h3>ワークスペース作成フロー</h3>
            </div>
          </div>

          <div className="workflow-tabs" role="tablist" aria-label="作成フロー工程">
            {stepCards.map((step, index) => (
              <button
                key={step.id}
                type="button"
                role="tab"
                aria-selected={activeStep.id === step.id}
                className={activeStep.id === step.id ? "workflow-tab active" : "workflow-tab"}
                onClick={() => {
                  if (step.id === "folder" && !canMoveToFolder) return;
                  setActiveStepId(step.id);
                  setCreateFieldIndex(0);
                }}
              >
                <span className="workflow-tab-index">{index + 1}</span>
                <span>{step.title}</span>
              </button>
            ))}
          </div>

          <div className="workflow-list">
            <div className="workflow-card">
              <div className="workflow-index">
                {stepCards.findIndex((step) => step.id === activeStep.id) + 1}
              </div>
              <div className="workflow-main">
                <div className="panel-heading">
                  <div>
                    <strong>{activeStep.title}</strong>
                    <p className="muted workflow-summary">{activeStep.summary}</p>
                  </div>
                  <span className={statusClass(activeStep.status)}>{statusLabel(activeStep.status)}</span>
                </div>

                <div className="workflow-paths">
                  <span>
                    ワークスペース名: <code>{effectiveForm.name || "未入力"}</code>
                  </span>
                  <span>
                    ターゲット: <code>{selectedTarget.label}</code>
                  </span>
                  <span>
                    モデル選択: <code>{effectiveForm.selectedModel || "未選択"}</code>
                  </span>
                  <span>
                    DB接続タイプ: <code>{selectedMountType.label}</code>
                  </span>
                  <span>
                    マウント対象: <code>{selectedDatabase?.name ?? "未選択"}</code>
                  </span>
                  <span>
                    マウント先: <code>{selectedMountTarget?.mountPath ?? "未設定"}</code>
                  </span>
                </div>

                <div className="wizard-card">
                  <p className="eyebrow">Current Input</p>
                  <label className="wizard-field">
                    <span>{activeField.label}</span>
                    {renderField()}
                  </label>

                  {activeField.key === "target" ? (
                    <p className="muted">{selectedTarget.description}</p>
                  ) : null}

                  {activeField.key === "selectedModel" ? (
                    <p className="muted">
                      候補はターゲットに応じた仮設定です。選択は任意で、プルダウン内だけに表示しています。
                    </p>
                  ) : null}

                  {activeField.key === "databaseType" ? (
                    <p className="muted">{selectedMountType.helper}</p>
                  ) : null}

                  {activeField.key === "databaseId" ? (
                    <p className="muted">
                      画像DB設定ページで登録済みの接続先から、選んだタイプに合うものだけを表示しています。
                    </p>
                  ) : null}

                  <div className="wizard-progress">
                    <span>
                      {activeStep.id === "model" ? "工程1" : "工程2"} / {createFieldIndex + 1} 項目目
                    </span>
                    <strong>{activeField.label}</strong>
                  </div>

                  <div className="workflow-actions">
                    <button
                      type="button"
                      onClick={goPreviousField}
                      disabled={activeStep.id === "model" && createFieldIndex === 0}
                    >
                      戻る
                    </button>

                    {activeStep.id === "folder" && createFieldIndex === activeFields.length - 1 ? (
                      <button type="button" onClick={commitDraftWorkspace} disabled={!canCreateWorkspace || isSaving}>
                        {isSaving ? "保存中..." : "ワークスペースを作成"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={goNextField}
                        disabled={
                          activeStep.id === "model" &&
                          createFieldIndex === activeFields.length - 1 &&
                          !canMoveToFolder
                        }
                      >
                        次へ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
