import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pocketbridge_mobile/pocket_api.dart';
import 'package:pocketbridge_mobile/pocket_models.dart';

void main() {
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
      );

      expect(
        item.downloadUrl,
        '/api/items/itm_1782547200000_b7e2c31a/download',
      );
    },
  );

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

  test('websocketUri includes pair code and mobile client query params', () {
    final uri = PocketBridgeApi(_pairing()).websocketUri();

    expect(
      uri.toString(),
      'ws://mac.local:3000/ws?pairCode=123456&client=mobile',
    );
  });
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
