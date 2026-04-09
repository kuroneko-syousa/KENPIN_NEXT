"""
Model registry.

Maps frontend model keys (no extension) to the actual weight file names
that Ultralytics YOLO expects.  All validation against untrusted input
should go through MODEL_MAP.get() so unknown keys are rejected before
they can be used as file paths.
"""

MODEL_MAP: dict[str, str] = {
    # YOLOv5 (Ultralytics)
    "yolov5n": "yolov5n.pt",
    "yolov5s": "yolov5s.pt",
    "yolov5m": "yolov5m.pt",
    "yolov5l": "yolov5l.pt",
    "yolov5x": "yolov5x.pt",
    # YOLOv8 (Ultralytics)
    "yolov8n": "yolov8n.pt",
    "yolov8s": "yolov8s.pt",
    "yolov8m": "yolov8m.pt",
    "yolov8l": "yolov8l.pt",
    "yolov8x": "yolov8x.pt",
    # YOLOv9 (WongKinYiu)
    "yolov9c": "yolov9c.pt",
    "yolov9e": "yolov9e.pt",
    # YOLOv10 (THU-MIG)
    "yolov10n": "yolov10n.pt",
    "yolov10s": "yolov10s.pt",
    "yolov10m": "yolov10m.pt",
    "yolov10l": "yolov10l.pt",
    "yolov10x": "yolov10x.pt",
    # YOLO11 (Ultralytics)
    "yolo11n": "yolo11n.pt",
    "yolo11s": "yolo11s.pt",
    "yolo11m": "yolo11m.pt",
    "yolo11l": "yolo11l.pt",
    "yolo11x": "yolo11x.pt",
    # RT-DETR (Baidu)
    "rtdetr-l": "rtdetr-l.pt",
    "rtdetr-x": "rtdetr-x.pt",
}
