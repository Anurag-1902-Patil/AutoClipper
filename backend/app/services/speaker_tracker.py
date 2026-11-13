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
        Detects dual-speaker podcast wide shots (e.g. host on left, guest on right)
        and explicitly avoids centering on the dead middle / microphone.

        Returns:
          - normalized_center_x: float between 0.18 and 0.82 (or None)
          - recommendation: 'auto_face', 'blur_bg', or 'center'
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return 0.5, "blur_bg"

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        # Jump to start
        cap.set(cv2.CAP_PROP_POS_MSEC, start_time * 1000.0)

        step_frames = max(1, int(video_fps / sample_fps))
        max_frames_to_check = int(duration * sample_fps)

        detected_centers: List[float] = []
        multi_speaker_frames = 0
        total_valid_frames = 0

        for _ in range(max_frames_to_check):
            ret, frame = cap.read()
            if not ret:
                break

            total_valid_frames += 1
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
                frame_centers = []
                for (fx, fy, fw, fh) in faces:
                    norm_cx = (fx + fw / 2.0) / (w * scale)
                    frame_centers.append(norm_cx)

                # Check if this frame has speakers on both left and right (podcast 2-shot)
                has_left = any(cx < 0.42 for cx in frame_centers)
                has_right = any(cx > 0.58 for cx in frame_centers)
                if has_left and has_right:
                    multi_speaker_frames += 1

                # Pick the largest face (dominant speaker in this frame)
                largest_face = max(faces, key=lambda f: f[2] * f[3])
                lfx, lfy, lfw, lfh = largest_face
                largest_norm_x = (lfx + lfw / 2.0) / (w * scale)
                detected_centers.append(largest_norm_x)

            for _ in range(step_frames - 1):
                cap.grab()

        cap.release()

        if not detected_centers:
            # No face found (slides, gameplay, b-roll) -> blur_bg is safest
            return 0.5, "blur_bg"

        # Check for dual-speaker podcast scenario
        left_cluster = [x for x in detected_centers if x < 0.42]
        right_cluster = [x for x in detected_centers if x > 0.58]
        dead_center_cluster = [x for x in detected_centers if 0.42 <= x <= 0.58]

        is_dual_speaker = (
            (len(left_cluster) >= 2 and len(right_cluster) >= 2) or
            (total_valid_frames > 4 and multi_speaker_frames / total_valid_frames >= 0.25)
        )

        if is_dual_speaker:
            # In a 2-person wide shot, centering at 0.5 crops out BOTH people and shows only the microphone!
            # If both people are on screen, blurred-background fill shows both completely!
            # If cropping, we MUST pick one person (left or right), NEVER the empty center.
            if len(left_cluster) >= len(right_cluster):
                chosen_x = float(np.median(left_cluster))
            else:
                chosen_x = float(np.median(right_cluster))
            clamped_x = max(0.20, min(0.80, chosen_x))
            # Recommend blur_bg so both speakers are visible without cutoff
            return clamped_x, "blur_bg"

        # Single dominant speaker
        median_x = float(np.median(detected_centers))
        clamped_x = max(0.18, min(0.82, median_x))
        return clamped_x, "auto_face"

tracker = SpeakerTracker()
