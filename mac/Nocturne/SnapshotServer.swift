import Foundation
import Network

/// Hands the latest snapshot to the widget. The widget runs in its own
/// sandbox, so it asks the app over the loopback address instead of sharing
/// files (which would need an Apple-issued app group).
final class SnapshotServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "nocturne.snapshot")
    private var payload = Data("null".utf8)

    func update(_ data: Data) {
        queue.async { self.payload = data }
    }

    func start() {
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Snapshot.port)!)
        guard let listener = try? NWListener(using: params) else { return }
        listener.newConnectionHandler = { [weak self] connection in self?.serve(connection) }
        listener.start(queue: queue)
        self.listener = listener
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] _, _, _, _ in
            guard let self else { connection.cancel(); return }
            let body = self.payload
            let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
            var out = Data(head.utf8)
            out.append(body)
            connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
        }
    }
}
