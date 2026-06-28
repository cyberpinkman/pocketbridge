import SwiftUI
import WebKit

struct QRCodeView: NSViewRepresentable {
  let svg: String

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.suppressesIncrementalRendering = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.setValue(false, forKey: "drawsBackground")
    return webView
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    let html = """
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html, body { margin: 0; width: 100%; height: 100%; background: transparent; }
          body { display: grid; place-items: center; }
          svg { width: 152px; height: 152px; }
        </style>
      </head>
      <body>\(svg)</body>
    </html>
    """
    webView.loadHTMLString(html, baseURL: nil)
  }
}
