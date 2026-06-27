import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pocketbridge_mobile/pocket_api.dart';
import 'package:pocketbridge_mobile/pocket_models.dart';

void main() {
  test('checkHealth calls health endpoint without pair-code auth', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.toString(), 'http://mac.local:3000/health');
        expect(request.headers.containsKey('X-PocketBridge-Pair-Code'), false);
        return http.Response(
          jsonEncode({'ok': true, 'service': 'pocketbridge', 'version': 1}),
          200,
        );
      }),
    );

    await api.checkHealth();
  });

  test('checkHealth rejects unhealthy contract responses', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((_) async {
        return http.Response(
          jsonEncode({'ok': false, 'service': 'not-pocketbridge'}),
          200,
        );
      }),
    );

    await expectLater(
      api.checkHealth(),
      throwsA(
        isA<FormatException>().having(
          (error) => error.message,
          'message',
          'Health response must be a JSON object with ok=true',
        ),
      ),
    );
  });

  test('checkHealth rejects malformed health response bodies', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((_) async {
        return http.Response('<html>not pocketbridge</html>', 200);
      }),
    );

    await expectLater(
      api.checkHealth(),
      throwsA(
        isA<FormatException>().having(
          (error) => error.message,
          'message',
          'Health response must be a JSON object with ok=true',
        ),
      ),
    );
  });

  test('checkHealth surfaces non-2xx health errors', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((_) async {
        return http.Response(
          jsonEncode({
            'error': {'message': 'Server not ready'},
          }),
          503,
        );
      }),
    );

    await expectLater(
      api.checkHealth(),
      throwsA(
        isA<PocketApiException>()
            .having((error) => error.message, 'message', 'Server not ready')
            .having((error) => error.statusCode, 'statusCode', 503),
      ),
    );
  });

  test('fetchPairingFromServer accepts host and port manual input', () async {
    await _withPairingServer(
      handle: (request, origin) async {
        await _writeJson(request, 200, _pairingPayload(origin));
      },
      run: (origin, requests) async {
        final pairing = await PocketBridgeApi.fetchPairingFromServer(
          origin.replaceFirst('http://', ''),
        );

        expect(requests.single.path, '/api/pairing');
        expect(pairing.serverBaseUrl, origin);
        expect(pairing.wsUrl, 'ws://${Uri.parse(origin).authority}/ws');
      },
    );
  });

  test(
    'fetchPairingFromServer replaces arbitrary paths with pairing API',
    () async {
      await _withPairingServer(
        handle: (request, origin) async {
          await _writeJson(request, 200, _pairingPayload(origin));
        },
        run: (origin, requests) async {
          final pairing = await PocketBridgeApi.fetchPairingFromServer(
            '$origin/mobile.html',
          );

          expect(requests.single.path, '/api/pairing');
          expect(pairing.pairCode, '123456');
        },
      );
    },
  );

  test('fetchPairingFromServer surfaces pairing endpoint errors', () async {
    await _withPairingServer(
      handle: (request, _) async {
        await _writeJson(request, 503, {
          'error': {'message': 'Pairing unavailable'},
        });
      },
      run: (origin, _) async {
        await expectLater(
          PocketBridgeApi.fetchPairingFromServer(origin),
          throwsA(
            isA<PocketApiException>()
                .having(
                  (error) => error.message,
                  'message',
                  'Pairing unavailable',
                )
                .having((error) => error.statusCode, 'statusCode', 503),
          ),
        );
      },
    );
  });

  test(
    'uploadText sends pair-code header and canonical request body',
    () async {
      final api = PocketBridgeApi(
        _pairing(),
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(
            request.url.toString(),
            'http://mac.local:3000/api/items/text',
          );
          expect(request.headers['X-PocketBridge-Pair-Code'], '123456');
          expect(request.headers['Content-Type'], contains('application/json'));

          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['title'], 'Idea');
          expect(body['text'], 'Capture this');
          expect(body['origin'], 'mobile');
          expect(body['sourceDevice'], 'PocketBridge Android');
          expect(body['tags'], ['mobile']);

          return http.Response(jsonEncode({'item': _textItemJson()}), 201);
        }),
      );

      final item = await api.uploadText(
        title: 'Idea',
        text: 'Capture this',
        sourceDevice: 'PocketBridge Android',
      );

      expect(item.id, 'itm_1782547200000_a9f4c21b');
    },
  );

  test(
    'uploadFile streams multipart content when a read stream is available',
    () async {
      final progress = <int>[];
      final api = PocketBridgeApi(
        _pairing(),
        client: MockClient.streaming((request, bodyStream) async {
          expect(request.method, 'POST');
          expect(
            request.url.toString(),
            'http://mac.local:3000/api/items/upload',
          );
          expect(request.headers['X-PocketBridge-Pair-Code'], '123456');

          final body = utf8.decode(await bodyStream.toBytes());
          expect(body, contains('name="origin"'));
          expect(body, contains('mobile'));
          expect(body, contains('name="sourceDevice"'));
          expect(body, contains('PocketBridge Android'));
          expect(body, contains('filename="note.txt"'));
          expect(body, contains('hello'));

          return http.StreamedResponse(
            Stream.value(utf8.encode(jsonEncode({'item': _fileItemJson()}))),
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final item = await api.uploadFile(
        file: PlatformFile(
          name: 'note.txt',
          size: 5,
          readStream: Stream.value(utf8.encode('hello')),
        ),
        sourceDevice: 'PocketBridge Android',
        onProgress: (sentBytes, _) => progress.add(sentBytes),
      );

      expect(
        item.downloadUrl,
        '/api/items/itm_1782547200000_b7e2c31a/download',
      );
      expect(progress.first, 0);
      expect(progress.last, 5);
    },
  );

  test(
    'uploadFile reports progress for path-based files before response',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pocketbridge-upload-test-',
      );
      final file = File('${directory.path}/path-note.txt');
      await file.writeAsString('hello');
      final progress = <int>[];

      try {
        final api = PocketBridgeApi(
          _pairing(),
          client: MockClient.streaming((request, bodyStream) async {
            final body = utf8.decode(await bodyStream.toBytes());
            expect(body, contains('filename="path-note.txt"'));
            expect(body, contains('hello'));
            expect(progress, contains(5));

            return http.StreamedResponse(
              Stream.value(utf8.encode(jsonEncode({'item': _fileItemJson()}))),
              201,
              headers: {'content-type': 'application/json'},
            );
          }),
        );

        await api.uploadFile(
          file: PlatformFile(name: 'path-note.txt', size: 5, path: file.path),
          sourceDevice: 'PocketBridge Android',
          onProgress: (sentBytes, _) => progress.add(sentBytes),
        );

        expect(progress.first, 0);
        expect(progress.last, 5);
      } finally {
        await directory.delete(recursive: true);
      }
    },
  );

  test('listItems calls the unfiltered inbox endpoint with auth', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.toString(), 'http://mac.local:3000/api/items');
        expect(request.headers['X-PocketBridge-Pair-Code'], '123456');
        return http.Response(
          jsonEncode({
            'items': [_textItemJson(), _fileItemJson()],
          }),
          200,
        );
      }),
    );

    final items = await api.listItems();

    expect(items.map((item) => item.id), [
      'itm_1782547200000_a9f4c21b',
      'itm_1782547200000_b7e2c31a',
    ]);
  });

  test('listSharedItems calls the shared-to-mobile filter with auth', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((request) async {
        expect(request.method, 'GET');
        expect(
          request.url.toString(),
          'http://mac.local:3000/api/items?sharedToMobile=true',
        );
        expect(request.headers['X-PocketBridge-Pair-Code'], '123456');
        return http.Response(
          jsonEncode({
            'items': [_fileItemJson()],
          }),
          200,
        );
      }),
    );

    final items = await api.listSharedItems();

    expect(items.single.sharedToMobile, isTrue);
  });

  test('download preserves filename from Content-Disposition', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((request) async {
        expect(
          request.url.toString(),
          'http://mac.local:3000/api/items/itm_1782547200000_b7e2c31a/download',
        );
        expect(request.headers['X-PocketBridge-Pair-Code'], '123456');
        return http.Response.bytes(
          [1, 2, 3],
          200,
          headers: {
            'content-disposition': 'attachment; filename="Report.pdf"',
            'content-type': 'application/pdf',
          },
        );
      }),
    );

    final downloaded = await api.download(PocketItem.fromJson(_fileItemJson()));

    expect(downloaded.filename, 'Report.pdf');
    expect(downloaded.contentType, 'application/pdf');
    expect(downloaded.bytes, [1, 2, 3]);
  });

  test('download prefers UTF-8 filename star from Content-Disposition', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((request) async {
        expect(
          request.url.toString(),
          'http://mac.local:3000/api/items/itm_1782547200000_b7e2c31a/download',
        );
        return http.Response.bytes(
          [4, 5, 6],
          200,
          headers: {
            'content-disposition':
                'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'%E6%8A%A5%E5%91%8A%202026.pdf',
            'content-type': 'application/pdf',
          },
        );
      }),
    );

    final downloaded = await api.download(PocketItem.fromJson(_fileItemJson()));

    expect(downloaded.filename, '报告 2026.pdf');
    expect(downloaded.bytes, [4, 5, 6]);
  });

  test('download unescapes quoted Content-Disposition filename', () async {
    final api = PocketBridgeApi(
      _pairing(),
      client: MockClient((_) async {
        return http.Response.bytes(
          [7],
          200,
          headers: {
            'content-disposition':
                r'attachment; filename="report \"final\".pdf"',
          },
        );
      }),
    );

    final downloaded = await api.download(PocketItem.fromJson(_fileItemJson()));

    expect(downloaded.filename, 'report "final".pdf');
  });

  test(
    'download falls back when Content-Disposition filename is empty',
    () async {
      final api = PocketBridgeApi(
        _pairing(),
        client: MockClient((_) async {
          return http.Response.bytes(
            [8],
            200,
            headers: {'content-disposition': 'attachment; filename=""'},
          );
        }),
      );

      final downloaded = await api.download(
        PocketItem.fromJson(_fileItemJson()),
      );

      expect(downloaded.filename, 'note.txt');
    },
  );

  test('downloadToDirectory streams bytes to a unique local file', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pocketbridge-download-test-',
    );
    await File('${directory.path}/Report.pdf').writeAsString('existing');
    final progress = <int>[];

    try {
      final api = PocketBridgeApi(
        _pairing(),
        client: MockClient.streaming((request, _) async {
          expect(
            request.url.toString(),
            'http://mac.local:3000/api/items/itm_1782547200000_b7e2c31a/download',
          );
          expect(request.headers['X-PocketBridge-Pair-Code'], '123456');

          return http.StreamedResponse(
            Stream.fromIterable([
              [1, 2],
              [3],
            ]),
            200,
            contentLength: 3,
            headers: {
              'content-disposition': 'attachment; filename="Report.pdf"',
              'content-type': 'application/pdf',
            },
          );
        }),
      );

      final saved = await api.downloadToDirectory(
        PocketItem.fromJson(_fileItemJson()),
        directory,
        onProgress: (receivedBytes, _) => progress.add(receivedBytes),
      );

      expect(saved.filename, 'Report (1).pdf');
      expect(saved.bytesWritten, 3);
      expect(saved.contentType, 'application/pdf');
      expect(await File(saved.path).readAsBytes(), [1, 2, 3]);
      expect(
        await File('${directory.path}/Report.pdf').readAsString(),
        'existing',
      );
      expect(progress, [0, 2, 3]);
    } finally {
      await directory.delete(recursive: true);
    }
  });

  test('downloadToDirectory rejects dot-only filenames from headers', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pocketbridge-download-test-',
    );

    try {
      final api = PocketBridgeApi(
        _pairing(),
        client: MockClient.streaming((_, _) async {
          return http.StreamedResponse(
            Stream.value([9]),
            200,
            contentLength: 1,
            headers: {'content-disposition': 'attachment; filename=".."'},
          );
        }),
      );

      final saved = await api.downloadToDirectory(
        PocketItem.fromJson(_fileItemJson()),
        directory,
      );

      expect(saved.filename, 'pocketbridge-download');
      expect(saved.path, '${directory.path}/pocketbridge-download');
      expect(await File(saved.path).readAsBytes(), [9]);
    } finally {
      await directory.delete(recursive: true);
    }
  });

  test('websocketUri includes pair code and mobile client query params', () {
    final uri = PocketBridgeApi(_pairing()).websocketUri();

    expect(
      uri.toString(),
      'ws://mac.local:3000/ws?pairCode=123456&client=mobile',
    );
  });
}

Future<void> _withPairingServer({
  required Future<void> Function(HttpRequest request, String origin) handle,
  required Future<void> Function(String origin, List<Uri> requests) run,
}) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final origin =
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}';
  final requests = <Uri>[];
  Object? serverError;

  final subscription = server.listen((request) async {
    requests.add(request.uri);
    try {
      await handle(request, origin);
    } catch (error) {
      serverError = error;
      request.response.statusCode = 500;
      await request.response.close();
    }
  });

  try {
    await run(origin, requests);
    if (serverError != null) throw serverError!;
  } finally {
    await subscription.cancel();
    await server.close(force: true);
  }
}

Future<void> _writeJson(HttpRequest request, int status, Object body) async {
  request.response.statusCode = status;
  request.response.headers.contentType = ContentType.json;
  request.response.write(jsonEncode(body));
  await request.response.close();
}

Map<String, dynamic> _pairingPayload(String origin) {
  return {
    'protocol': 'pocketbridge',
    'version': 1,
    'serverBaseUrl': origin,
    'wsUrl': 'ws://${Uri.parse(origin).authority}/ws',
    'pairCode': '123456',
    'deviceName': 'LAN Test Mac',
    'expiresAt': '2026-06-27T12:30:00.000Z',
    'capabilities': ['upload', 'download', 'websocket'],
  };
}

PairingInfo _pairing() {
  return PairingInfo(
    serverBaseUrl: 'http://mac.local:3000',
    wsUrl: 'ws://mac.local:3000/ws',
    pairCode: '123456',
    deviceName: 'Pinkmans-Mac',
    expiresAt: DateTime.parse('2026-06-27T12:30:00.000Z'),
    capabilities: const ['upload', 'download', 'websocket'],
  );
}

Map<String, dynamic> _textItemJson() {
  return {
    'id': 'itm_1782547200000_a9f4c21b',
    'kind': 'text',
    'title': 'Idea',
    'origin': 'mobile',
    'sourceDevice': 'PocketBridge Android',
    'text': 'Capture this',
    'tags': ['mobile'],
    'sharedToMobile': false,
    'status': 'inbox',
    'createdAt': '2026-06-27T12:00:00.000Z',
    'updatedAt': '2026-06-27T12:00:00.000Z',
  };
}

Map<String, dynamic> _fileItemJson() {
  return {
    'id': 'itm_1782547200000_b7e2c31a',
    'kind': 'file',
    'title': 'note.txt',
    'origin': 'mac',
    'sourceDevice': 'Pinkmans-Mac',
    'mimeType': 'text/plain',
    'sizeBytes': 5,
    'originalFilename': 'note.txt',
    'storageRelPath': 'inbox/2026-06-27/itm_1782547200000_b7e2c31a/original',
    'tags': ['demo'],
    'sharedToMobile': true,
    'status': 'inbox',
    'createdAt': '2026-06-27T12:00:00.000Z',
    'updatedAt': '2026-06-27T12:00:00.000Z',
    'downloadUrl': '/api/items/itm_1782547200000_b7e2c31a/download',
  };
}
