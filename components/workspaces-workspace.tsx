/**
 * ワークスペース管理ページ
 * 
 * 機能:
 * - ワークスペース一覧表示
 * - 紹介イユッザーで新規ワークスペースを作成
 * - 2ステップウィザード：基本会計画→DB接続設定
 * - ワークスペースを保存、報告 、削除可能
 */
"use client";

import {
  type WorkspacePipeline,
  type WorkflowStepStatus,
} from "@/lib/dashboard-data";
import type { ImageDatabaseConnectionRecord } from "@/lib/image-database";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  labelKey: string;
  descriptionKey: string;
};

type DatabaseTypeOption = {
  id: string;
  labelKey: string;
  helperKey: string;
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
    labelKey: "ws_target_object_detection",
    descriptionKey: "ws_target_object_detection_desc",
  },
  {
    id: "anomaly-detection",
    labelKey: "ws_target_anomaly_detection",
    descriptionKey: "ws_target_anomaly_detection_desc",
  },
  {
    id: "segmentation",
    labelKey: "ws_target_segmentation",
    descriptionKey: "ws_target_segmentation_desc",
  },
  {
    id: "ocr-inspection",
    labelKey: "ws_target_ocr_inspection",
    descriptionKey: "ws_target_ocr_inspection_desc",
  },
  {
    id: "pose-keypoint",
    labelKey: "ws_target_pose_keypoint",
    descriptionKey: "ws_target_pose_keypoint_desc",
  },
];

const modelTypeOptions: Record<string, Array<{ id: string; label: string; descriptionKey: string }>> = {
  "object-detection": [
    { id: "yolo", label: "YOLO", descriptionKey: "ws_model_yolo_desc" },
    { id: "rt-detr", label: "RT-DETR", descriptionKey: "ws_model_rtdetr_desc" },
    { id: "faster-rcnn", label: "Faster R-CNN", descriptionKey: "ws_model_fasterrcnn_desc" },
  ],
  "anomaly-detection": [
    { id: "patchcore", label: "PatchCore", descriptionKey: "ws_model_patchcore_desc" },
    { id: "fastflow", label: "FastFlow", descriptionKey: "ws_model_fastflow_desc" },
    { id: "padim", label: "PaDiM", descriptionKey: "ws_model_padim_desc" },
  ],
  "segmentation": [
    { id: "yolo-seg", label: "YOLO-seg", descriptionKey: "ws_model_yoloseg_desc" },
    { id: "mask-rcnn", label: "Mask R-CNN", descriptionKey: "ws_model_maskrcnn_desc" },
    { id: "sam", label: "SAM", descriptionKey: "ws_model_sam_desc" },
  ],
  "ocr-inspection": [
    { id: "paddleocr", label: "PaddleOCR", descriptionKey: "ws_model_paddleocr_desc" },
    { id: "crnn", label: "CRNN + Detector", descriptionKey: "ws_model_crnn_desc" },
    { id: "yolo-ocr", label: "YOLO + OCR", descriptionKey: "ws_model_yoloocr_desc" },
  ],
  "pose-keypoint": [
    { id: "yolo-pose", label: "YOLO-pose", descriptionKey: "ws_model_yolopose_desc" },
    { id: "hrnet", label: "HRNet", descriptionKey: "ws_model_hrnet_desc" },
    { id: "openpose", label: "OpenPose", descriptionKey: "ws_model_openpose_desc" },
  ],
};

const databaseTypeOptions: DatabaseTypeOption[] = [
  {
    id: "local-mounted",
    labelKey: "ws_db_local",
    helperKey: "ws_db_local_helper",
  },
  {
    id: "nas-mounted",
    labelKey: "ws_db_nas",
    helperKey: "ws_db_nas_helper",
  },
  {
    id: "cloud-mounted",
    labelKey: "ws_db_cloud",
    helperKey: "ws_db_cloud_helper",
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

const pageSteps: Array<{ id: PageStep; titleKey: string; summaryKey: string }> = [
  {
    id: "model",
    titleKey: "ws_step_model_title",
    summaryKey: "ws_step_model_summary",
  },
  {
    id: "folder",
    titleKey: "ws_step_folder_title",
    summaryKey: "ws_step_folder_summary",
  },
];

function slugifyWorkspaceName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "new-workspace";
}

function getOutputFolderPath(name: string) {
  return `${APP_TEMP_OUTPUT_ROOT}\\${slugifyWorkspaceName(name)}`;
}

function getModelTypesForTarget(targetId: string) {
  return modelTypeOptions[targetId] ?? modelTypeOptions["object-detection"];
}

function getTargetsByType(type: string, targets: RegisteredMountTarget[] = registeredMountTargets) {
  return targets.filter((target) => target.type === type);
}

function getDefaultDatabaseType() {
  return databaseTypeOptions[0].id;
}

function getDefaultMountTarget(type: string, targets: RegisteredMountTarget[] = registeredMountTargets) {
  return getTargetsByType(type, targets)[0] ?? null;
}

function createInitialForm(targets: RegisteredMountTarget[] = registeredMountTargets): WorkspaceFormState {
  const defaultType = getDefaultDatabaseType();
  const defaultTarget = getDefaultMountTarget(defaultType, targets);

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

function getDatabaseTypeFromDatabaseId(
  databaseId: string,
  targets: RegisteredMountTarget[] = registeredMountTargets,
) {
  return targets.find((target) => target.databaseId === databaseId)?.type ?? getDefaultDatabaseType();
}

function toEditableForm(
  workspace: WorkspacePipeline | null,
  targets: RegisteredMountTarget[] = registeredMountTargets,
): WorkspaceFormState {
  if (!workspace) return createInitialForm(targets);

  const databaseType = workspace.databaseType || getDatabaseTypeFromDatabaseId(workspace.databaseId, targets);
  const mountTarget = targets.find((target) => target.databaseId === workspace.databaseId);

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

function statusLabel(status: WorkflowStepStatus, t: ReturnType<typeof useT>) {
  if (status === "completed") return t.ws_status_completed;
  if (status === "running") return t.ws_status_running;
  return t.ws_status_pending;
}

function getStepStatus(stepId: PageStep, form: WorkspaceFormState): WorkflowStepStatus {
  const basicReady = form.name.trim() !== "" && form.target !== "";
  const connectionReady = form.databaseType !== "" && form.databaseId !== "";

  if (stepId === "model") return basicReady ? "completed" : "running";
  if (!basicReady) return "pending";
  return connectionReady ? "completed" : "running";
}

export function WorkspacesWorkspace({
  currentUserEmail,
  currentUserName,
  initialWorkspaces,
}: WorkspacesWorkspaceProps) {
  const t = useT();
  const [registeredConnections, setRegisteredConnections] = useState<ImageDatabaseConnectionRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspacePipeline[]>(initialWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaces[0]?.id ?? "");
  const [activeStepId, setActiveStepId] = useState<PageStep>("model");
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState<WorkspaceFormState>(createInitialForm(registeredMountTargets));
  const [createFieldIndex, setCreateFieldIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadConnections = async () => {
      try {
        const response = await fetch("/api/image-databases", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as ImageDatabaseConnectionRecord[];
        if (!isCancelled) {
          setRegisteredConnections(data);
        }
      } catch {
        // 接続取得失敗時は静的候補をそのまま利用
      }
    };

    loadConnections();

    return () => {
      isCancelled = true;
    };
  }, []);

  const currentUser = useMemo(() => ({
    id: `session-${currentUserEmail}`,
    name: currentUserName,
    email: currentUserEmail,
    role: "User",
    team: "Personal",
  }), [currentUserEmail, currentUserName]);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null;

  const dynamicMountTargets: RegisteredMountTarget[] = useMemo(() => {
    return registeredConnections.map((connection) => ({
      id: `mount-${connection.id}`,
      databaseId: connection.id,
      name: connection.name,
      type:
        connection.connectionType === "nas"
          ? "nas-mounted"
          : connection.connectionType === "cloud"
            ? "cloud-mounted"
            : "local-mounted",
      mountPath: connection.mountPath,
    }));
  }, [registeredConnections]);

  const allMountTargets = dynamicMountTargets.length > 0 ? dynamicMountTargets : registeredMountTargets;

  const isFormMode = isCreating || isEditing;
  const effectiveForm = isFormMode ? draftForm : toEditableForm(selectedWorkspace, allMountTargets);
  const selectedTarget = targetOptions.find((option) => option.id === effectiveForm.target) ?? targetOptions[0];
  const mountTargets = allMountTargets.filter((target) => target.type === effectiveForm.databaseType);
  const selectedMountTarget =
    mountTargets.find((target) => target.databaseId === effectiveForm.databaseId) ?? mountTargets[0] ?? null;
  const selectedMountType =
    databaseTypeOptions.find((option) => option.id === effectiveForm.databaseType) ?? databaseTypeOptions[0];
  const selectedDatabaseName = selectedMountTarget?.name ?? t.ws_not_selected;
  const selectedModelTypeLabel =
    getModelTypesForTarget(effectiveForm.target).find((opt) => opt.id === effectiveForm.selectedModel)?.label ??
    (effectiveForm.selectedModel || t.ws_not_selected);

  const stepCards = pageSteps.map((step) => ({
    id: step.id,
    title: t[step.titleKey as keyof typeof t] as string,
    summary: t[step.summaryKey as keyof typeof t] as string,
    status: getStepStatus(step.id, effectiveForm),
  }));

  const activeStep = stepCards.find((step) => step.id === activeStepId) ?? stepCards[0];

  const wizardFields: Record<PageStep, Array<{ key: keyof WorkspaceFormState; label: string }>> = {
    model: [
      { key: "name", label: t.ws_field_name },
      { key: "target", label: t.ws_field_target },
      { key: "selectedModel", label: t.ws_field_model },
    ],
    folder: [
      { key: "databaseType", label: t.ws_field_resource_type },
      { key: "databaseId", label: t.ws_field_target_folder },
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
        const nextTarget = allMountTargets.find((target) => target.type === value) ?? null;
        return {
          ...current,
          databaseType: value,
          databaseId: nextTarget?.databaseId ?? "",
          imageFolder: nextTarget?.mountPath ?? "",
        };
      }

      if (field === "databaseId") {
        const nextTarget = allMountTargets.find((target) => target.databaseId === value);
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
          const nextTarget = allMountTargets.find((target) => target.type === value) ?? null;
          return {
            ...workspace,
            databaseType: value,
            databaseId: nextTarget?.databaseId ?? workspace.databaseId,
            imageFolder: nextTarget?.mountPath ?? workspace.imageFolder,
          };
        }

        if (field === "databaseId") {
          const nextTarget = allMountTargets.find((target) => target.databaseId === value);
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
    if (isFormMode) {
      updateDraft(activeField.key, value);
    } else {
      updateWorkspace(activeField.key, value);
    }
  };

  const beginCreateWorkspace = () => {
    setIsCreating(true);
    setDraftForm(createInitialForm(allMountTargets));
    setActiveStepId("model");
    setCreateFieldIndex(0);
    // 作成カードが見えるように自動スクロール
    setTimeout(() => {
      const createSection = document.querySelector('.panel:has(.workflow-tabs)');
      if (createSection) {
        createSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const cancelCreateWorkspace = () => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsCreating(false);
      setIsEditing(false);
      setIsAnimatingOut(false);
      setDraftForm(createInitialForm(allMountTargets));
      setActiveStepId("model");
      setCreateFieldIndex(0);
    }, 300); // アニメーション時間に合わせる
  };

  const beginEditWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (workspace) {
      setIsEditing(true);
      setSelectedWorkspaceId(workspaceId);
      setDraftForm(toEditableForm(workspace, allMountTargets));
      setActiveStepId("model");
      setCreateFieldIndex(0);
      // 編集カードが見えるように自動スクロール
      setTimeout(() => {
        const editSection = document.querySelector('.panel:has(.workflow-tabs)');
        if (editSection) {
          editSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    if (!confirm(t.ws_delete_confirm)) return;

    setDeletingWorkspaceId(workspaceId);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Workspace delete failed");
      }

      // アニメーション後に削除
      setTimeout(() => {
        setWorkspaces((current) => current.filter(w => w.id !== workspaceId));
        if (selectedWorkspaceId === workspaceId) {
          setSelectedWorkspaceId(workspaces.find(w => w.id !== workspaceId)?.id ?? "");
        }
        setDeletingWorkspaceId(null);
      }, 500); // fade-out アニメーション時間
    } catch (error) {
      alert(t.ws_delete_failed);
      setDeletingWorkspaceId(null);
    }
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
      const selectedTargetAtSave = allMountTargets.find(
        (target) => target.databaseId === draftForm.databaseId,
      );

      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: draftForm.name,
          target: draftForm.target,
          selectedModel: draftForm.selectedModel,
          imageFolder: selectedTargetAtSave?.mountPath ?? draftForm.imageFolder,
          datasetFolder: getOutputFolderPath(draftForm.name || "new-workspace"),
          databaseId: draftForm.databaseId,
          databaseType: selectedTargetAtSave?.type ?? draftForm.databaseType,
        }),
      });

      if (!response.ok) {
        throw new Error("Workspace save failed");
      }

      const nextWorkspace = (await response.json()) as WorkspacePipeline;

      setWorkspaces((current) => [nextWorkspace, ...current]);
      setSelectedWorkspaceId(nextWorkspace.id);
      setIsAnimatingOut(true);
      setTimeout(() => {
        setIsCreating(false);
        setIsAnimatingOut(false);
        setActiveStepId("model");
        setCreateFieldIndex(0);
        setDraftForm(createInitialForm(allMountTargets));
      }, 300);
    } finally {
      setIsSaving(false);
    }
  };

  const commitEditWorkspace = async () => {
    if (!canCreateWorkspace || !selectedWorkspaceId) return;

    setIsSaving(true);
    const editingWorkspaceId = selectedWorkspaceId;

    try {
      const selectedTargetAtSave = allMountTargets.find(
        (target) => target.databaseId === draftForm.databaseId,
      );

      const response = await fetch(`/api/workspaces/${editingWorkspaceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: draftForm.name,
          target: draftForm.target,
          selectedModel: draftForm.selectedModel,
          imageFolder: selectedTargetAtSave?.mountPath ?? draftForm.imageFolder,
          datasetFolder: getOutputFolderPath(draftForm.name || "new-workspace"),
          databaseId: draftForm.databaseId,
          databaseType: selectedTargetAtSave?.type ?? draftForm.databaseType,
        }),
      });

      if (!response.ok) {
        throw new Error("Workspace update failed");
      }

      const updatedWorkspace = (await response.json()) as WorkspacePipeline;

      setWorkspaces((current) => current.map((w) => (w.id === updatedWorkspace.id ? updatedWorkspace : w)));
      setSelectedWorkspaceId(updatedWorkspace.id);
      setIsAnimatingOut(true);
      setTimeout(() => {
        setIsEditing(false);
        setIsAnimatingOut(false);
        setActiveStepId("model");
        setCreateFieldIndex(0);
        setDraftForm(createInitialForm(allMountTargets));
      }, 300);
    } catch (error) {
      alert(t.ws_update_failed);
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
          placeholder={t.ws_name_placeholder}
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
      const modelTypes = getModelTypesForTarget(effectiveForm.target);
      return (
        <select
          value={effectiveForm.selectedModel}
          onChange={(event) => handleFieldChange(event.target.value)}
        >
          <option value="">{t.ws_select_please}</option>
          {modelTypes.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
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
              {t[option.labelKey as keyof typeof t] as string}
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
            <option value="">{t.ws_no_registered_connection}</option>
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
          <p className="eyebrow">{t.ws_mgr_eyebrow}</p>
          <h2>{t.ws_mgr_h2}</h2>
          <p className="muted">
            {t.ws_mgr_desc}
          </p>
        </div>


      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t.ws_list_eyebrow}</p>
            <h3>{t.ws_list_h3}</h3>
          </div>
          <button type="button" onClick={beginCreateWorkspace}>
            {t.ws_new}
          </button>
        </div>

        {workspaces.length > 0 ? (
          <div className="selection-list">
            {workspaces.map((workspace) => {
              const targetLabel =
                t[(targetOptions.find((option) => option.id === normalizeTarget(workspace.target))?.labelKey ?? "ws_not_selected") as keyof typeof t] ??
                workspace.target;
              const modelTypeLabel =
                getModelTypesForTarget(workspace.target).find((opt) => opt.id === workspace.selectedModel)?.label ??
                (workspace.selectedModel || null);

              return (
                <div
                  key={workspace.id}
                  className={
                    (!isCreating && !isEditing && selectedWorkspace?.id === workspace.id
                      ? "selection-card workspace-selection-card active"
                      : "selection-card workspace-selection-card") +
                    (deletingWorkspaceId === workspace.id ? " fade-out" : "")
                  }
                  onClick={() => selectWorkspace(workspace.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>{workspace.name}</strong>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#f7f8fc' }}>
                        <div><strong>{t.ws_method}:</strong> {targetLabel}{modelTypeLabel ? ` / ${modelTypeLabel}` : ""}</div>
                        <div><strong>{t.ws_resource_access}:</strong> {(() => { const mt = allMountTargets.find((target) => target.databaseId === workspace.databaseId); const name = mt?.name ?? workspace.databaseId ?? t.ws_not_set; const path = workspace.imageFolder; return path ? `${name} (${path})` : name; })()}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <Link
                        href={`/dashboard/workspaces/${workspace.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'inline-block',
                          fontSize: '0.8rem',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #ffd783 0%, #ff9a59 100%)',
                          color: '#0f1728',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.ws_open_studio}
                      </Link>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          beginEditWorkspace(workspace.id);
                        }}
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                      >
                        {t.edit}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWorkspace(workspace.id);
                        }}
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: '#ef4444' }}
                      >
                        {t.delete}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>{t.ws_empty_title}</strong>
            <span>{t.ws_empty_desc}</span>
          </div>
        )}
      </section>

      {(isCreating || isEditing) || isAnimatingOut ? (
        <section className={`panel ${isAnimatingOut ? 'slide-out-down' : 'slide-in-up'}`}>
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="eyebrow">{t.ws_pipeline_eyebrow}</p>
              <h3>{isEditing ? t.ws_edit_h3 : t.ws_create_h3}</h3>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={cancelCreateWorkspace}
              style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
            >
              {t.cancel}
            </button>
          </div>

          <div className="workflow-tabs" role="tablist" aria-label={t.ws_flow_aria}>
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
                  <span className={statusClass(activeStep.status)}>{statusLabel(activeStep.status, t)}</span>
                </div>

                <div className="workflow-paths">
                  <span className={activeField.key === "name" ? "active" : ""}>
                    {t.ws_field_name}: <code>{effectiveForm.name || t.ws_not_entered}</code>
                  </span>
                  <span className={activeField.key === "target" ? "active" : ""}>
                    {t.ws_field_target}: <code>{t[selectedTarget.labelKey as keyof typeof t] as string}</code>
                  </span>
                  <span className={activeField.key === "selectedModel" ? "active" : ""}>
                    {t.ws_field_model}: <code>{selectedModelTypeLabel}</code>
                  </span>
                  <span className={activeField.key === "databaseType" ? "active" : ""}>
                    {t.ws_field_resource_type}: <code>{t[selectedMountType.labelKey as keyof typeof t] as string}</code>
                  </span>
                  <span className={activeField.key === "databaseId" ? "active" : ""}>
                    {t.ws_field_target_folder}: <code>{selectedDatabaseName}</code>
                  </span>
                </div>

                <div className="wizard-card">
                  <p className="eyebrow">{t.ws_current_input}</p>
                  <label className="wizard-field">
                    <span>{activeField.label}</span>
                    {renderField()}
                  </label>

                  {activeField.key === "target" ? (
                    <p className="muted">{t[selectedTarget.descriptionKey as keyof typeof t] as string}</p>
                  ) : null}

                  {activeField.key === "selectedModel" ? (
                    <p className="muted">
                      {(t[(getModelTypesForTarget(effectiveForm.target).find((opt) => opt.id === effectiveForm.selectedModel)?.descriptionKey ?? "ws_model_fallback_desc") as keyof typeof t] as string)
                        ?? t.ws_model_fallback_desc}
                    </p>
                  ) : null}

                  {activeField.key === "databaseType" ? (
                    <p className="muted">{t[selectedMountType.helperKey as keyof typeof t] as string}</p>
                  ) : null}

                  {activeField.key === "databaseId" ? (
                    <p className="muted">
                      {t.ws_database_hint}
                    </p>
                  ) : null}

                  <div className="workflow-actions">
                    <button
                      type="button"
                      onClick={goPreviousField}
                      disabled={activeStep.id === "model" && createFieldIndex === 0}
                    >
                      {t.ws_back}
                    </button>

                    {activeStep.id === "folder" && createFieldIndex === activeFields.length - 1 ? (
                      <button type="button" onClick={isEditing ? commitEditWorkspace : commitDraftWorkspace} disabled={!canCreateWorkspace || isSaving}>
                        {isSaving ? t.idb_saving : isEditing ? t.ws_update : t.ws_create}
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
                        {t.ws_next}
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
