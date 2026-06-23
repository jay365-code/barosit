import AVFoundation
import Vision
import Combine

/// 내장 웹캠으로 상반신을 캡처하고 Vision 인체 포즈로 앉은 자세를 실시간 평가한다.
/// macOS 전용(AVCaptureSession + AppKit 기준). ContentView는 아래 두 @Published만 관찰한다.
nonisolated final class CameraManager: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    @Published var postureMessage: String = "카메라를 시작하는 중..."
    @Published var isGoodPosture: Bool = true

    // MARK: - 내부 상태
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.barosit.camera.session")
    private let videoQueue = DispatchQueue(label: "com.barosit.camera.video")
    private let poseRequest = VNDetectHumanBodyPoseRequest()

    /// 깜빡임 방지용 디바운스: 같은 상태가 연속 N프레임 유지돼야 실제로 뒤집는다.
    private var pendingGood: Bool = true
    private var stableCount: Int = 0
    private let stableThreshold: Int = 6 // ≈ 카메라 30fps 처리 기준 0.2~0.4초

    // MARK: - 휴리스틱 임계값
    /// 코~어깨중심 수직거리 / 어깨너비. 이 값보다 작으면 거북목/숙임으로 판단.
    private let forwardHeadRatio: CGFloat = 0.55
    /// 어깨 좌우 높이차 / 어깨너비. 이 값보다 크면 한쪽으로 기운 것으로 판단.
    private let shoulderTiltRatio: CGFloat = 0.20
    /// 관절 신뢰도 하한.
    private let minConfidence: VNConfidence = 0.3

    override init() {
        super.init()
        start()
    }

    // MARK: - 세션 시작/권한
    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAndRun()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard let self else { return }
                if granted {
                    self.configureAndRun()
                } else {
                    self.publish(message: "카메라 권한이 필요합니다", good: true)
                }
            }
        case .denied, .restricted:
            publish(message: "카메라 접근이 차단되어 있습니다.\n시스템 설정 > 개인정보 보호에서 허용해 주세요.", good: true)
        @unknown default:
            publish(message: "카메라를 사용할 수 없습니다", good: true)
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            self?.session.stopRunning()
        }
    }

    private func configureAndRun() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.sessionPreset = .medium

            guard
                let device = AVCaptureDevice.default(for: .video),
                let input = try? AVCaptureDeviceInput(device: device),
                self.session.canAddInput(input)
            else {
                self.session.commitConfiguration()
                self.publish(message: "사용 가능한 카메라를 찾지 못했습니다", good: true)
                return
            }
            self.session.addInput(input)

            let output = AVCaptureVideoDataOutput()
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: self.videoQueue)
            if self.session.canAddOutput(output) {
                self.session.addOutput(output)
            }

            self.session.commitConfiguration()
            self.session.startRunning()
            self.publish(message: "자세를 분석하는 중...", good: true)
        }
    }

    // MARK: - 프레임 처리
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        do {
            try handler.perform([poseRequest])
            guard let observation = poseRequest.results?.first else {
                debounce(good: true, message: "사람이 보이지 않습니다")
                return
            }
            evaluate(observation)
        } catch {
            // 일시적 처리 실패는 무시(다음 프레임에서 회복)
        }
    }

    /// 어깨/머리 기하로 좋은 자세 여부를 판정한다.
    private func evaluate(_ observation: VNHumanBodyPoseObservation) {
        func point(_ joint: VNHumanBodyPoseObservation.JointName) -> CGPoint? {
            guard let p = try? observation.recognizedPoint(joint), p.confidence >= minConfidence else { return nil }
            // Vision 좌표는 좌하단 원점, y가 위로 증가.
            return CGPoint(x: p.location.x, y: p.location.y)
        }

        guard
            let leftShoulder = point(.leftShoulder),
            let rightShoulder = point(.rightShoulder)
        else {
            debounce(good: true, message: "어깨가 화면에 보이게 앉아 주세요")
            return
        }

        let shoulderWidth = hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y)
        guard shoulderWidth > 0.01 else {
            debounce(good: true, message: "카메라와의 거리를 조절해 주세요")
            return
        }

        // 1) 어깨 좌우 기울기
        let tilt = abs(leftShoulder.y - rightShoulder.y) / shoulderWidth
        if tilt > shoulderTiltRatio {
            debounce(good: false, message: "어깨가 한쪽으로 기울었어요.\n양 어깨 높이를 맞춰보세요.")
            return
        }

        // 2) 거북목/숙임: 코(없으면 목)와 어깨중심의 수직거리
        let shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2
        if let head = point(.nose) ?? point(.neck) {
            let verticalGap = head.y - shoulderMidY // 머리가 어깨보다 위면 양수
            let ratio = verticalGap / shoulderWidth
            if ratio < forwardHeadRatio {
                debounce(good: false, message: "고개가 앞으로 나왔어요.\n턱을 당기고 허리를 펴보세요.")
                return
            }
        }

        debounce(good: true, message: "좋은 자세를 유지하고 있어요 👍")
    }

    // MARK: - 디바운스 & 게시
    /// 동일 상태가 stableThreshold번 연속될 때만 실제 published 값을 갱신해 깜빡임을 막는다.
    private func debounce(good: Bool, message: String) {
        if good == pendingGood {
            stableCount += 1
        } else {
            pendingGood = good
            stableCount = 1
        }
        if stableCount >= stableThreshold {
            publish(message: message, good: good)
        }
    }

    private func publish(message: String, good: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.postureMessage = message
            self.isGoodPosture = good
        }
    }
}
