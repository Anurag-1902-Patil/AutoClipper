import cv2
import numpy as np
from pathlib import Path
from typing import Optional, Tuple, List

class SpeakerTracker:
    def __init__(self):
        # Built-in OpenCV Haar Cascade
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        self.face_cascade = cv2.CascadeClassifier(cascade_path)

    def analyze_speaker_framing(
        self,
        video_path: Path,
        start_time: float,
        duration: float,
        sample_fps: float = 2.0
    ) -> Tuple[Optional[float], str]:
        """
        Samples video frames during the clip interval to locate the active speaker.
        Returns:
          - normalized_center_x: float between 0.0 and 1.0 (or None if no face detected)
          - recommendation: 'auto_face', 'center', or 'blur_bg'
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return None, "center"

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        orig_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920.0
        orig_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080.0

        # Jump to start
        cap.set(cv2.CAP_PROP_POS_MSEC, start_time * 1000.0)

        step_frames = max(1, int(video_fps / sample_fps))
        max_frames_to_check = int(duration * sample_fps)

        detected_centers: List[float] = []

        for _ in range(max_frames_to_check):
            ret, frame = cap.read()
            if not ret:
                break

            # Fast downscale for face detection
            h, w = frame.shape[:2]
            scale = 480.0 / max(h, w)
            small = cv2.resize(frame, (int(w * scale), int(h * scale)))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

            faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=4,
                minSize=(30, 30)
            )

            if len(faces) > 0:
                # Pick largest face (dominant speaker in frame)
                largest_face = max(faces, key=lambda f: f[2] * f[3])
                fx, fy, fw, fh = largest_face
                center_x_small = fx + (fw / 2.0)
                norm_x = center_x_small / (w * scale)
                detected_centers.append(norm_x)

            # Skip forward to next sample
            for _ in range(step_frames - 1):
                cap.grab()

        cap.release()

        if not detected_centers:
            # Fall back to center crop or blurred background
            return 0.5, "blur_bg"

        # Apply smoothing / median to remove outlier false detections
        median_x = float(np.median(detected_centers))
        # Clamp between 0.15 and 0.85 to keep within crop margins
        clamped_x = max(0.18, min(0.82, median_x))
        return clamped_x, "auto_face"

tracker = SpeakerTracker()
