import SwiftUI

struct ContentView: View {
    // 실시간 카메라 매니저 관찰
    @StateObject private var cameraManager = CameraManager()
    @State private var warningCount: Int = 0
    
    var body: some View {
        VStack(spacing: 20) {
            HStack {
                Text("🪑 BaroSit")
                    .font(.title2)
                    .fontWeight(.bold)
                Spacer()
                
                // 실시간 웹캠 분석 상태 표시
                HStack(spacing: 6) {
                    Circle()
                        .fill(cameraManager.isGoodPosture ? Color.green : Color.red)
                        .frame(width: 10, height: 10)
                    Text(cameraManager.isGoodPosture ? "정상" : "자세 교정 필요")
                        .font(.caption)
                        .fontWeight(.semibold)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(cameraManager.isGoodPosture ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
                .cornerRadius(20)
            }
            
            Divider()
            
            // 실시간 상태 알림판
            VStack {
                Image(systemName: cameraManager.isGoodPosture ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    .resizable()
                    .frame(width: 50, height: 50)
                    .foregroundColor(cameraManager.isGoodPosture ? .green : .red)
                
                Text(cameraManager.postureMessage)
                    .font(.body)
                    .fontWeight(.medium)
                    .multilineTextAlignment(.center)
                    .padding()
                    .frame(height: 70)
            }
            .frame(maxWidth: .infinity)
            .background(Color(NSColor.windowBackgroundColor))
            .cornerRadius(12)
            
            // 통계
            HStack {
                Text("나쁜 자세 감지 횟수:")
                    .foregroundColor(.secondary)
                Text("\(warningCount)회")
                    .fontWeight(.bold)
                    .foregroundColor(warningCount > 0 ? .red : .primary)
            }
            .font(.callout)
        }
        .padding()
        .frame(width: 320, height: 260)
        // 상태가 나빠질 때마다 카운트 올려주는 트리거
        .onChange(of: cameraManager.isGoodPosture) { _, newValue in
            if !newValue {
                warningCount += 1
            }
        }
    }
}
