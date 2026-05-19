import UIKit
import SwiftUI
import Combine

// MARK: - Protocol

/// Any screen that can present alerts must conform to this.
protocol Drawable {
    func draw()
    func clear()
}

protocol DataLoadable {
    associatedtype Item
    func load() async -> [Item]
}

// MARK: - Classes

class ViewController: UIViewController {

    private var cancellables = Set<AnyCancellable>()

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
    }

    private func setupUI() {
        view.backgroundColor = .systemBackground
    }
}

// MARK: - SwiftUI Views

struct ContentView: View {
    @State private var text = ""

    var body: some View {
        VStack {
            Text(text)
            Button("Tap") { text = "Hello" }
        }
    }
}

struct ProfileView: View {
    let username: String

    var body: some View {
        Text("Profile: \(username)")
    }
}

// MARK: - Enums

enum Theme {
    case light
    case dark
    case system

    var displayName: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .system: return "System"
        }
    }
}

enum NetworkError: Error {
    case notFound
    case unauthorized
    case serverError(Int)
}
